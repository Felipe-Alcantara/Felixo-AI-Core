'use strict'

/**
 * Reprodução real (não simulada) do ciclo de instalação automática de CLIs:
 * instala de verdade pelo npm do próprio projeto, num `userData` isolado (nunca
 * o perfil real), e prova quatro coisas, uma por rodada:
 *
 * 1. A primeira abertura instala a CLI.
 * 2. Um segundo "startup", na mesma versão do app, não reinstala nada.
 * 3. Um "upgrade" (a versão do app muda) não reinstala uma CLI gerenciada cujo
 *    binário continua no disco e cujo registro de sucesso está de pé.
 * 4. Um "upgrade" com o binário apagado (remoção ou corrupção externa) detecta
 *    a ausência e reinstala.
 *
 * Roda o MESMO módulo de produção (`registerCliAutoInstallHandlers`), sem
 * mockar a detecção nem o instalador, com o npm de `node_modules/npm` (o mesmo
 * mecanismo do app empacotado, que usa `resources/npm-runtime`). A instalação
 * faz chamadas reais ao registry do npm.
 *
 * VEREDITO E CÓDIGO DE SAÍDA. O script existe para rodar no CI, onde "falhou"
 * tem dois donos muito diferentes: o ciclo do Felixo regrediu, ou o registry do
 * npm / a rede do runner tropeçou. Misturar os dois faz o time ignorar o
 * vermelho. Por isso cada execução termina com um veredito:
 *
 *   0  ok                   as 4 rodadas se comportaram como esperado
 *   1  regressao            o ciclo reinstalou quando não devia (rodadas 2 e 3)
 *                           ou não reinstalou quando devia (rodada 4)
 *   2  infra                a instalação falhou com assinatura de rede passageira
 *                           (mesma regra do retry do app); NÃO é regressão, rode de novo
 *   3  falha-de-instalacao  a instalação falhou SEM sinal de rede: pacote
 *                           publicado quebrado, dependência nativa ou defeito do Felixo
 *   4  erro-do-runner       o ambiente isolado não estava limpo, a instalação
 *                           automática estava desligada ou o script quebrou
 *
 * A classificação sai do resultado CRU do instalador (`output`, `timedOut`,
 * `errorCode`), não de texto de status que a interface mostra.
 *
 * Uso:
 *   node scripts/cli-auto-install-real-repro.cjs [--cli gemini]
 *        [--report relatorio.json] [--summary resumo.md] [--control-regressao]
 *
 * `--control-regressao` é o controle negativo: apaga o binário ANTES da rodada
 * 2, então ela reinstala e o runner PRECISA terminar com o veredito
 * `regressao` (código 1). Serve para provar, no CI, que o vermelho é visível.
 */

const childProcess = require('node:child_process')
const fs = require('node:fs')
const Module = require('node:module')
const os = require('node:os')
const path = require('node:path')
const { performance } = require('node:perf_hooks')

/**
 * De onde vem o código de produção que o ciclo executa. Por padrão é a pasta `electron/` do
 * código-fonte; com `--packaged` o runner se reexecuta DENTRO do executável do app instalado e
 * esta variável aponta a `electron/` de dentro do `app.asar` (ver `launchPackaged`).
 */
const EXIT = Object.freeze({
  OK: 0,
  REGRESSAO: 1,
  INFRA: 2,
  FALHA_DE_INSTALACAO: 3,
  ERRO_DO_RUNNER: 4,
})

const ELECTRON_DIR = process.env.FELIXO_REPRO_ELECTRON_DIR || path.join(__dirname, '..', 'electron')

/**
 * Carrega um módulo de produção. Um app instalado mais antigo que este runner pode não ter o módulo:
 * isso é diferença de versão, não regressão do ciclo. Sem este tratamento o `require` derruba o filho
 * com código 1, que o workflow leria como "REGRESSÃO"; aqui sai como erro do runner (4).
 */
function daProducao(...partes) {
  try {
    return require(path.join(ELECTRON_DIR, ...partes))
  } catch (error) {
    if (!process.env.FELIXO_REPRO_ELECTRON_DIR || error.code !== 'MODULE_NOT_FOUND') throw error
    console.error(
      `[repro] o app instalado não tem um módulo que o runner usa (${partes.join('/')}); ele é mais antigo que este runner? ${error.message.split('\n')[0]}`,
    )
    process.exit(EXIT.ERRO_DO_RUNNER)
  }
}

const { isTransientNetworkFailure } = daProducao('core', 'install-retry.cjs')
const { getManagedCliLayout, MANAGED_ROOT_ENV_KEY } = daProducao('core', 'managed-cli-paths.cjs')
const { getOfficialAiCli } = daProducao('core', 'official-cli-catalog.cjs')
const { hasManagedBinary, redactDiagnosticText } = daProducao('services', 'cli-diagnostics.cjs')
const { installManagedPackage, resolveLatestManagedPackage } = daProducao('services', 'managed-cli-installer.cjs')

const VEREDITOS = Object.freeze({
  OK: 'ok',
  REGRESSAO: 'regressao',
  INFRA: 'infra',
  FALHA_DE_INSTALACAO: 'falha-de-instalacao',
  ERRO_DO_RUNNER: 'erro-do-runner',
})

/** Do mais grave (o que o time precisa ler primeiro) ao menos grave. */
const PRECEDENCIA = [
  VEREDITOS.REGRESSAO,
  VEREDITOS.ERRO_DO_RUNNER,
  VEREDITOS.FALHA_DE_INSTALACAO,
  VEREDITOS.INFRA,
]

const CODIGO_POR_VEREDITO = Object.freeze({
  [VEREDITOS.OK]: EXIT.OK,
  [VEREDITOS.REGRESSAO]: EXIT.REGRESSAO,
  [VEREDITOS.INFRA]: EXIT.INFRA,
  [VEREDITOS.FALHA_DE_INSTALACAO]: EXIT.FALHA_DE_INSTALACAO,
  [VEREDITOS.ERRO_DO_RUNNER]: EXIT.ERRO_DO_RUNNER,
})

const RODADAS = Object.freeze([
  {
    chave: 'primeira-abertura',
    titulo: 'Rodada 1: primeira abertura (instala de verdade)',
    appVersion: '1.0.0',
    esperado: 'instala',
  },
  {
    chave: 'segunda-abertura',
    titulo: 'Rodada 2: segunda abertura, MESMA versão (não deve reinstalar)',
    appVersion: '1.0.0',
    esperado: 'nao-reinstala',
  },
  {
    chave: 'upgrade-binario-intacto',
    titulo: 'Rodada 3: "upgrade" (versão do app muda, binário intacto, não deve reinstalar)',
    appVersion: '2.0.0',
    esperado: 'nao-reinstala',
  },
  {
    chave: 'upgrade-binario-apagado',
    titulo: 'Rodada 4: "upgrade" com o binário apagado (deve reinstalar)',
    appVersion: '2.0.0',
    esperado: 'reinstala',
  },
])

/** Quanto da saída do npm entra no relatório de uma falha. */
const SAIDA_DA_FALHA_MAX = 1500

/**
 * O ciclo testa a instalação gerenciada pelo app. A atualização do npm global
 * DO SISTEMA é outro recurso e mexeria no ambiente de quem roda o script, por
 * isso nunca entra aqui.
 */
const SEM_NPM_DO_SISTEMA = Object.freeze({
  resolveGlobalRoot: async () => null,
  readInstall: () => null,
  install: async () => {
    throw new Error('o ciclo de reprodução não toca no npm global do sistema')
  },
})

const AJUDA = `Uso: node scripts/cli-auto-install-real-repro.cjs [opções]

  --cli <id>            CLI oficial a instalar de verdade (padrão: gemini)
  --report <arquivo>    grava o relatório em JSON
  --summary <arquivo>   grava o resumo em Markdown (no CI, vai para o resumo da run)
  --control-regressao   controle negativo: provoca a regressão de propósito; o
                        veredito esperado é "regressao" (código 1)
  --packaged <exe>      roda o ciclo DENTRO do app instalado (o executável do
                        Felixo AI Core, p.ex. o instalado pelo NSIS ou o da pasta
                        win-unpacked): o código e o npm são os do pacote
  --control-npm         só com --packaged; controle negativo: troca de propósito o
                        npm esperado por um fora do pacote; o veredito esperado é
                        "regressao" (código 1)
  --help                esta ajuda

Códigos de saída: 0 ok · 1 regressão do ciclo · 2 infra (rede/registry) ·
3 falha de instalação sem sinal de rede · 4 erro do runner.`

// ---------------------------------------------------------------------------
// Argumentos

/**
 * @param {string[]} argv
 * @returns {{ cli: string, report: string | null, summary: string | null, controlRegression: boolean, packaged: string | null, controlNpm: boolean, help: boolean }}
 */
function parseArgs(argv) {
  const args = {
    cli: 'gemini',
    report: null,
    summary: null,
    controlRegression: false,
    packaged: null,
    controlNpm: false,
    help: false,
  }
  const valorDe = (indice, nome) => {
    const valor = argv[indice + 1]
    if (valor === undefined || valor.startsWith('--')) throw new Error(`${nome} precisa de um valor`)
    return valor
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--cli') args.cli = valorDe(i++, arg)
    else if (arg === '--report') args.report = valorDe(i++, arg)
    else if (arg === '--summary') args.summary = valorDe(i++, arg)
    else if (arg === '--control-regressao') args.controlRegression = true
    else if (arg === '--packaged') args.packaged = valorDe(i++, arg)
    else if (arg === '--control-npm') args.controlNpm = true
    else if (arg === '--help' || arg === '-h') args.help = true
    else throw new Error(`opção desconhecida: ${arg}`)
  }

  return args
}

// ---------------------------------------------------------------------------
// O app instalado
//
// O runner de código-fonte usa o `node_modules/npm` do projeto: mesmo mecanismo, outro caminho. No
// app instalado o instalador das CLIs usa o npm de `resources/npm-runtime` (via
// `process.resourcesPath`) e o próprio executável como Node. Para provar isso o runner se
// reexecuta DENTRO do executável (`ELECTRON_RUN_AS_NODE`, o mesmo modo em que o app instala as
// CLIs) carregando o código de dentro do `app.asar`, e o julgamento confere qual npm e qual Node a
// instalação usou.

/** Mesma comparação de caminho do sistema: no Windows não distingue maiúscula nem separador. */
function samePath(a, b, platform = process.platform) {
  if (!a || !b) return false
  const sistema = platform === 'win32' ? path.win32 : path.posix
  const normalizar = (caminho) => {
    const resolvido = sistema.resolve(String(caminho))
    return platform === 'win32' ? resolvido.toLowerCase() : resolvido
  }
  return normalizar(a) === normalizar(b)
}

/**
 * Onde estão os recursos do app e o que a instalação precisa usar. Sem adivinhar: se o executável ou
 * o `app.asar` (ou a pasta `app`, do win-unpacked de depuração) não existem, é erro.
 *
 * @param {string} executavel
 * @param {{ exists?: (candidato: string) => boolean }} [options]
 */
function planPackagedLaunch(executavel, { exists = fs.existsSync } = {}) {
  const exe = path.resolve(executavel)
  if (!exists(exe)) throw new Error(`o executável do app não existe: ${path.basename(exe)}`)

  // Windows e Linux: `resources/` ao lado do executável. macOS: `Contents/Resources`.
  const candidatos = [path.join(path.dirname(exe), 'resources'), path.resolve(path.dirname(exe), '..', 'Resources')]
  for (const resourcesPath of candidatos) {
    for (const pasta of ['app.asar', 'app']) {
      if (!exists(path.join(resourcesPath, pasta))) continue
      return {
        executavel: exe,
        nodeExecutable: exe,
        resourcesPath,
        electronDir: path.join(resourcesPath, pasta, 'electron'),
        npmCliPath: path.join(resourcesPath, 'npm-runtime', 'npm', 'bin', 'npm-cli.js'),
      }
    }
  }
  throw new Error(`não achei app.asar nem a pasta app em resources/ ao lado de ${path.basename(exe)}`)
}

/** Ambiente do filho: modo Node ligado, código do app apontado, sem o que faria o processo sem janela procurar a tela. */
function buildPackagedChildEnv(baseEnv, electronDir) {
  const env = { ...baseEnv, ELECTRON_RUN_AS_NODE: '1', FELIXO_REPRO_ELECTRON_DIR: electronDir }
  delete env.ELECTRON_NO_ATTACH_CONSOLE
  delete env.ELECTRON_FORCE_WINDOW_MENU_BAR
  return env
}

function withoutPackagedFlag(argv) {
  const indice = argv.indexOf('--packaged')
  return indice === -1 ? [...argv] : [...argv.slice(0, indice), ...argv.slice(indice + 2)]
}

/** Este processo é o filho que roda dentro do executável do app instalado? */
function isPackagedChild(env = process.env) {
  return Boolean(env.FELIXO_REPRO_ELECTRON_DIR)
}

/**
 * Reexecuta este mesmo script dentro do executável do app instalado e devolve o código de saída do
 * filho (o veredito passa direto). Um filho que não termina com código é erro do runner, nunca sucesso.
 *
 * @param {string[]} argv
 * @param {object} [options]
 */
function launchPackaged(
  argv,
  { spawnSync = childProcess.spawnSync, exists = fs.existsSync, env = process.env, script = __filename } = {},
) {
  const args = parseArgs(argv)
  let plano
  try {
    plano = planPackagedLaunch(args.packaged, { exists })
  } catch (error) {
    console.error(`[repro] ${error.message}`)
    return EXIT.ERRO_DO_RUNNER
  }

  console.log(`[repro] ciclo dentro do app instalado: ${path.basename(plano.executavel)}`)
  const resultado = spawnSync(plano.nodeExecutable, [script, ...withoutPackagedFlag(argv)], {
    env: buildPackagedChildEnv(env, plano.electronDir),
    stdio: 'inherit',
    windowsHide: true,
  })
  if (resultado.error || typeof resultado.status !== 'number') {
    console.error(
      `[repro] o app instalado não terminou o ciclo com um código de saída: ${resultado.error?.message ?? resultado.signal ?? 'sem status'}`,
    )
    return EXIT.ERRO_DO_RUNNER
  }
  return resultado.status
}

function readVersion(arquivo) {
  try {
    return JSON.parse(fs.readFileSync(arquivo, 'utf8')).version ?? null
  } catch {
    return null
  }
}

/** Forma curta de um caminho para o relatório: de `resources` em diante, ou os 3 últimos trechos. Nunca o caminho absoluto. */
function shortPath(caminho) {
  const partes = String(caminho ?? '').split(/[\\/]+/).filter(Boolean)
  const indice = partes.lastIndexOf('resources')
  return (indice >= 0 ? partes.slice(indice) : partes.slice(-3)).join('/')
}

// ---------------------------------------------------------------------------
// Instrumentos: o que o ciclo observa sem mudar o que o app faz

/**
 * Embrulha o instalador para guardar o resultado CRU de cada chamada. É daqui
 * que sai a distinção entre "regrediu" e "a rede caiu": cada tentativa registra
 * se a falha tem assinatura de rede passageira (a mesma regra do retry do app).
 *
 * @param {Function} installPackage
 * @param {() => number} now
 */
function createInstallRecorder(installPackage, now = () => performance.now()) {
  let atual = []

  return {
    startRound() {
      atual = []
    },
    endRound() {
      return atual
    },
    async installPackage(options) {
      const inicio = now()
      let resultado
      try {
        resultado = await installPackage(options)
      } catch (error) {
        atual.push({
          pacote: options.npmPackage,
          ok: false,
          redeTransitoria: false,
          duracaoMs: Math.round(now() - inicio),
          npmCliPath: options.npmCliPath,
          nodeExecutable: options.nodeExecutable,
          saida: tail(`o instalador lançou: ${error?.message ?? error}`),
        })
        throw error
      }

      const ok = resultado?.ok === true
      atual.push({
        pacote: options.npmPackage,
        ok,
        redeTransitoria: !ok && isTransientNetworkFailure(resultado),
        prazoVencido: resultado?.timedOut === true || undefined,
        duracaoMs: Math.round(now() - inicio),
        // O npm e o Node que o app escolheu: no app instalado é o que prova o caminho do pacote.
        npmCliPath: options.npmCliPath,
        nodeExecutable: options.nodeExecutable,
        ...(ok ? {} : { saida: tail(resultado?.output || resultado?.message || '') }),
      })
      return resultado
    },
  }
}

/**
 * Fixa o alvo (`latest`) na primeira consulta e o reutiliza nas rodadas
 * seguintes. As rodadas 2 e 3 provam "não reinstala NESTA versão"; se o
 * registry publicasse uma versão nova no meio do script (o `nightly` do Gemini
 * sai todo dia), o app reinstalaria corretamente e o runner acusaria uma
 * regressão que não existe. Uma consulta que falhou também fica fixada: todas
 * as rodadas usam o mesmo alvo de fallback.
 *
 * @param {Function} resolveLatestPackage
 */
function createLatestPinner(resolveLatestPackage) {
  const fixados = new Map()

  return {
    async resolve(options) {
      if (!fixados.has(options.npmPackage)) {
        fixados.set(options.npmPackage, await resolveLatestPackage(options))
      }
      return fixados.get(options.npmPackage)
    },
    describe() {
      const [pacote, resultado] = [...fixados.entries()][0] ?? []
      if (!pacote) return null
      return resultado?.ok && resultado.version
        ? { pacote, versao: resultado.version, origem: 'registry' }
        : { pacote, versao: null, origem: 'manifesto-de-fallback' }
    },
  }
}

/**
 * A saída do npm traz o código do erro no COMEÇO (`npm error code E404`) e o
 * caminho do log completo no FIM; o meio é pilha de chamadas. Cortar só o fim
 * perderia o código justo quando a saída é longa, então o corte guarda os dois
 * pontas.
 */
function tail(texto, limite = SAIDA_DA_FALHA_MAX) {
  // Redação linha a linha: `redactDiagnosticText` termina com um `slice` que
  // mantém só o COMEÇO do texto, e aplicada à saída inteira jogaria fora o fim
  // antes de o corte abaixo poder guardá-lo. Os padrões de segredo (URL,
  // `_authToken=`, sequência longa) não atravessam linhas.
  const limpo = String(texto ?? '')
    .trim()
    .split(/\r?\n/)
    .map((linha) => redactDiagnosticText(linha, { homeDir: os.homedir() }))
    .join('\n')
  if (limpo.length <= limite) return limpo
  const inicio = Math.floor(limite * 0.4)
  const omitidos = limpo.length - limite
  return `${limpo.slice(0, inicio)}\n[… ${omitidos} caracteres omitidos …]\n${limpo.slice(-(limite - inicio))}`
}

/**
 * `cli-auto-install.cjs` faz `require('electron')` no topo. Fora do Electron
 * esse pacote é só uma string, sem `ipcMain`; o require acontece com um stub no
 * lugar (o mesmo truque dos testes do módulo) e com o catálogo restrito a UMA
 * CLI: o catálogo real instala codex, claude e gemini juntos, e cada rodada real
 * leva minutos. Nada disto vaza: o catálogo volta ao normal e o módulo sai do
 * cache logo depois do require, então o resto do processo (e dos testes) nunca
 * enxerga a versão filtrada.
 *
 * @param {string} onlyCliId
 */
function loadCliAutoInstall(onlyCliId) {
  const originalLoad = Module._load
  const catalogPath = require.resolve(path.join(ELECTRON_DIR, 'core', 'official-cli-catalog.cjs'))
  const autoInstallPath = require.resolve(path.join(ELECTRON_DIR, 'services', 'cli-auto-install.cjs'))
  const catalogModule = require(catalogPath)
  const originalList = catalogModule.listOfficialAiClis

  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'electron') {
      return { ipcMain: { handle: () => {} } }
    }
    return originalLoad.call(this, request, parent, isMain)
  }
  catalogModule.listOfficialAiClis = () => originalList().filter((cli) => cli.id === onlyCliId)
  delete require.cache[autoInstallPath]

  try {
    return require(autoInstallPath)
  } finally {
    Module._load = originalLoad
    catalogModule.listOfficialAiClis = originalList
    delete require.cache[autoInstallPath]
  }
}

function deleteManagedBinary(layout, cli, fileSystem) {
  const candidatos = new Set([cli.command, ...(cli.windowsAliases ?? []), `${cli.command}.cmd`, `${cli.command}.exe`])
  for (const candidato of candidatos) {
    fileSystem.rmSync(path.join(layout.packagesBin, candidato), { force: true })
  }
}

// ---------------------------------------------------------------------------
// O ciclo

/**
 * Roda as 4 rodadas e devolve o que foi observado, sem julgar.
 *
 * @param {object} options
 * @param {string} options.cliId
 * @param {string} options.userData - Pasta de estado descartável.
 * @param {boolean} [options.controlRegression]
 * @param {Function} [options.installPackage] - Injetável (padrão: o instalador real).
 * @param {Function} [options.resolveLatestPackage] - Injetável (padrão: o registry real).
 * @param {{ npmCliPath: string, nodeExecutable: string } | null} [options.runtimeEsperado] - No app instalado: o npm e o Node que a instalação precisa usar.
 * @param {Function} [options.detect] - Injetável; sem ele, a detecção real.
 * @param {Function} [options.verifyInstallation]
 * @param {object} [options.networkRetry] - Espera e quantidade do retry de rede do app.
 * @param {typeof fs} [options.fileSystem]
 * @param {(linha: string) => void} [options.log]
 * @param {() => number} [options.now]
 */
async function runCycle({
  cliId,
  userData,
  controlRegression = false,
  installPackage = installManagedPackage,
  resolveLatestPackage = resolveLatestManagedPackage,
  runtimeEsperado = null,
  detect,
  verifyInstallation,
  networkRetry,
  fileSystem = fs,
  platformName = process.platform,
  arch = process.arch,
  log = () => {},
  now = () => performance.now(),
}) {
  const cli = getOfficialAiCli(cliId)
  const layout = getManagedCliLayout({ userData })
  const appPaths = { userData, config: path.join(userData, 'config') }
  const recorder = createInstallRecorder(installPackage, now)
  const latest = createLatestPinner(resolveLatestPackage)
  const { registerCliAutoInstallHandlers } = loadCliAutoInstall(cliId)
  const rodadas = []

  for (const [indice, spec] of RODADAS.entries()) {
    // A rodada 4 é, por desenho, a que perde o binário. O controle faz o mesmo
    // com a rodada 2, que então reinstala: o runner precisa acusar isso.
    if (spec.esperado === 'reinstala' || (controlRegression && indice === 1)) {
      deleteManagedBinary(layout, cli, fileSystem)
    }

    log(`\n=== ${spec.titulo} ===`)
    recorder.startRound()
    const service = registerCliAutoInstallHandlers(() => null, {
      appPaths,
      appVersion: spec.appVersion,
      isPackaged: true,
      platformName,
      arch,
      systemCli: SEM_NPM_DO_SISTEMA,
      installPackage: recorder.installPackage,
      resolveLatestPackage: latest.resolve,
      ...(detect ? { detect } : {}),
      ...(verifyInstallation ? { verifyInstallation } : {}),
      ...(networkRetry ? { networkRetry } : {}),
    })

    const inicio = now()
    const status = await service.run('startup')
    service.stop()

    const rodada = {
      chave: spec.chave,
      titulo: spec.titulo,
      appVersion: spec.appVersion,
      esperado: spec.esperado,
      executada: true,
      estado: status.state,
      mensagem: status.message,
      duracaoMs: Math.round(now() - inicio),
      binarioPresente: hasManagedBinary({ layout, cli, fileSystem }),
      instalacoes: recorder.endRound(),
    }
    rodadas.push(rodada)
    log(
      `estado: ${rodada.estado} | ${rodada.mensagem}\n` +
        `chamadas ao instalador: ${rodada.instalacoes.length} | binário no disco: ${rodada.binarioPresente} | duração: ${rodada.duracaoMs}ms`,
    )

    // Sem a primeira instalação as rodadas seguintes não provam nada.
    if (indice === 0 && !(rodada.estado === 'done' && rodada.binarioPresente)) break
  }

  return { cli: cliId, alvo: latest.describe(), rodadas, ...(runtimeEsperado ? { runtimeEsperado } : {}) }
}

// ---------------------------------------------------------------------------
// O julgamento

function falhasDe(rodada) {
  return rodada.instalacoes.filter((instalacao) => !instalacao.ok)
}

/** Todas as tentativas que falharam tinham assinatura de rede passageira? */
function falhouPorRede(rodada) {
  const falhas = falhasDe(rodada)
  return falhas.length > 0 && falhas.every((falha) => falha.redeTransitoria)
}

/**
 * Compara o que foi observado com o que cada rodada devia mostrar.
 *
 * @param {{ rodadas: Array<object> }} ciclo
 * @returns {{ veredito: string, codigoDeSaida: number, problemas: Array<{ tipo: string, rodada: number, detalhe: string }> }}
 */
function evaluateCycle(ciclo) {
  const problemas = judgeRuntime(ciclo)
  const porChave = (chave) => ciclo.rodadas.find((rodada) => rodada.chave === chave)
  const numero = (chave) => RODADAS.findIndex((spec) => spec.chave === chave) + 1

  const primeira = porChave('primeira-abertura')
  if (!primeira || primeira.estado !== 'done' || !primeira.binarioPresente) {
    const n = 1
    if (primeira && falhasDe(primeira).length > 0) {
      problemas.push({
        tipo: falhouPorRede(primeira) ? VEREDITOS.INFRA : VEREDITOS.FALHA_DE_INSTALACAO,
        rodada: n,
        detalhe: falhouPorRede(primeira)
          ? 'a instalação falhou com assinatura de rede passageira (mesmo depois das repetições do app)'
          : 'a instalação falhou sem sinal de rede',
      })
    } else {
      problemas.push({
        tipo: VEREDITOS.ERRO_DO_RUNNER,
        rodada: n,
        detalhe:
          `a primeira abertura terminou em "${primeira?.estado ?? 'sem rodada'}" sem tentar instalar: ` +
          'o ambiente isolado não estava limpo (a CLI foi achada fora dele) ou a instalação automática estava desligada',
      })
    }
    return concluir(problemas)
  }

  for (const chave of ['segunda-abertura', 'upgrade-binario-intacto']) {
    const rodada = porChave(chave)
    if (!rodada) continue
    const n = numero(chave)
    if (rodada.estado === 'error' && rodada.instalacoes.length === 0) {
      problemas.push({
        tipo: VEREDITOS.ERRO_DO_RUNNER,
        rodada: n,
        detalhe: `a rodada terminou em erro sem chegar ao instalador: ${rodada.mensagem}`,
      })
    } else if (rodada.instalacoes.length > 0 || rodada.estado !== 'idle') {
      problemas.push({
        tipo: VEREDITOS.REGRESSAO,
        rodada: n,
        detalhe:
          `o ciclo reinstalou uma CLI que já estava presente (estado "${rodada.estado}", ` +
          `${rodada.instalacoes.length} chamada(s) ao instalador)`,
      })
    }
  }

  const quarta = porChave('upgrade-binario-apagado')
  if (quarta) {
    const n = numero('upgrade-binario-apagado')
    if (quarta.instalacoes.length === 0) {
      problemas.push({
        tipo: quarta.estado === 'error' ? VEREDITOS.ERRO_DO_RUNNER : VEREDITOS.REGRESSAO,
        rodada: n,
        detalhe:
          quarta.estado === 'error'
            ? `a rodada terminou em erro sem chegar ao instalador: ${quarta.mensagem}`
            : `o binário apagado não foi reinstalado (estado "${quarta.estado}", nenhuma chamada ao instalador)`,
      })
    } else if (quarta.estado !== 'done' || !quarta.binarioPresente) {
      problemas.push({
        tipo: falhouPorRede(quarta) ? VEREDITOS.INFRA : VEREDITOS.FALHA_DE_INSTALACAO,
        rodada: n,
        detalhe: falhouPorRede(quarta)
          ? 'a reinstalação falhou com assinatura de rede passageira (mesmo depois das repetições do app)'
          : `a reinstalação não deixou o binário no disco (estado "${quarta.estado}")`,
      })
    }
  }

  return concluir(problemas)
}

/**
 * No app instalado, toda instalação precisa ter usado o npm de `resources/npm-runtime` e o próprio
 * executável como Node. É regressão do Felixo (não infra): se o npm do `node_modules` de dentro do
 * asar passar na frente, o app instalado quebra em máquinas sem esse caminho. Sem `runtimeEsperado`
 * (código-fonte) nada é julgado. Um problema por rodada, no máximo.
 */
function judgeRuntime(ciclo) {
  const esperado = ciclo.runtimeEsperado
  if (!esperado) return []

  const problemas = []
  for (const [indice, rodada] of ciclo.rodadas.entries()) {
    for (const instalacao of rodada.instalacoes ?? []) {
      let detalhe = null
      if (!instalacao.npmCliPath) {
        detalhe = 'a instalação não informou qual npm usou: não dá para provar que é o do pacote (resources/npm-runtime)'
      } else if (!samePath(instalacao.npmCliPath, esperado.npmCliPath)) {
        detalhe =
          `a instalação usou o npm "${shortPath(instalacao.npmCliPath)}" e não o do pacote (resources/npm-runtime): ` +
          'o app instalado não está resolvendo o npm empacotado'
      } else if (!samePath(instalacao.nodeExecutable, esperado.nodeExecutable)) {
        detalhe =
          `a instalação usou "${path.basename(String(instalacao.nodeExecutable ?? 'nenhum'))}" como Node e não o executável do app instalado ` +
          `("${path.basename(esperado.nodeExecutable)}")`
      }
      if (detalhe) {
        problemas.push({ tipo: VEREDITOS.REGRESSAO, rodada: indice + 1, detalhe })
        break
      }
    }
  }
  return problemas
}

function concluir(problemas) {
  const veredito = PRECEDENCIA.find((tipo) => problemas.some((problema) => problema.tipo === tipo)) ?? VEREDITOS.OK
  return { veredito, codigoDeSaida: CODIGO_POR_VEREDITO[veredito], problemas }
}

// ---------------------------------------------------------------------------
// Relatório

const FRASE_DO_VEREDITO = Object.freeze({
  [VEREDITOS.OK]: 'OK: o ciclo se comportou como esperado nas 4 rodadas.',
  [VEREDITOS.REGRESSAO]:
    'REGRESSÃO DO CICLO: o Felixo reinstalou quando não devia, ou não reinstalou quando devia. É defeito do Felixo, não da rede.',
  [VEREDITOS.INFRA]:
    'INFRA (rede ou registry do npm): a instalação falhou com assinatura de rede passageira. NÃO é regressão do Felixo; rode de novo.',
  [VEREDITOS.FALHA_DE_INSTALACAO]:
    'FALHA DE INSTALAÇÃO sem sinal de rede: pacote publicado quebrado, dependência nativa ou defeito do Felixo. Leia a saída do npm no relatório.',
  [VEREDITOS.ERRO_DO_RUNNER]:
    'ERRO DO RUNNER: o ambiente da reprodução não estava como o script espera. O resultado não prova nada sobre o ciclo.',
})

/**
 * @param {object} options
 * @param {{ cli: string, alvo: object | null, rodadas: Array<object> }} options.ciclo
 * @param {ReturnType<typeof evaluateCycle>} options.avaliacao
 * @param {boolean} options.controlRegression
 * @param {number} options.duracaoTotalMs
 * @param {string} [options.erroDoRunner]
 * @param {{ executavel: string, versaoDoApp: string | null, npmVersao: string | null, npmRelativo: string } | null} [options.empacotado]
 * @param {boolean} [options.controlNpm]
 */
function buildReport({ ciclo, avaliacao, controlRegression, duracaoTotalMs, erroDoRunner, empacotado = null, controlNpm = false }) {
  const executadas = new Map(ciclo.rodadas.map((rodada) => [rodada.chave, rodada]))
  return {
    cli: ciclo.cli,
    ambiente: { plataforma: process.platform, arquitetura: process.arch, node: process.version },
    controleDeRegressao: controlRegression,
    ...(empacotado ? { empacotado, controleDoNpm: controlNpm } : {}),
    alvo: ciclo.alvo,
    veredito: avaliacao.veredito,
    codigoDeSaida: avaliacao.codigoDeSaida,
    explicacao: FRASE_DO_VEREDITO[avaliacao.veredito],
    problemas: avaliacao.problemas,
    ...(erroDoRunner ? { erroDoRunner: tail(erroDoRunner) } : {}),
    duracaoTotalMs,
    rodadas: RODADAS.map(
      (spec) => executadas.get(spec.chave) ?? { chave: spec.chave, titulo: spec.titulo, esperado: spec.esperado, executada: false },
    ),
  }
}

const ESPERADO_EM_TEXTO = Object.freeze({
  instala: 'instala',
  'nao-reinstala': 'não reinstala',
  reinstala: 'reinstala',
})

function celula(texto) {
  return String(texto ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')
}

/** Resumo para a página da run no GitHub: o veredito primeiro, a tabela depois. */
function formatSummary(relatorio) {
  const linhas = [
    `### Ciclo de instalação: ${relatorio.cli} (${relatorio.ambiente.plataforma})`,
    '',
    `**${relatorio.explicacao}**`,
    '',
  ]

  if (relatorio.controleDeRegressao) {
    linhas.push(
      '> Execução de CONTROLE: a regressão foi provocada de propósito. O veredito esperado é `regressao`; ' +
        'qualquer outro significa que o runner não enxerga o defeito.',
      '',
    )
  }

  if (relatorio.empacotado) {
    const app = relatorio.empacotado
    linhas.push(
      `App instalado: \`${app.executavel}\`${app.versaoDoApp ? ` (${app.versaoDoApp})` : ''}; o ciclo rodou dentro dele, com ` +
        `npm ${app.npmVersao ?? '?'} em \`${app.npmRelativo}\`.`,
      '',
    )
  }

  if (relatorio.controleDoNpm) {
    linhas.push(
      '> Execução de CONTROLE do caminho do npm: o npm esperado foi trocado de propósito por um fora do pacote. ' +
        'O veredito esperado é `regressao`; qualquer outro significa que o runner não enxerga um npm que não é o do pacote.',
      '',
    )
  }

  if (relatorio.alvo) {
    const alvo = relatorio.alvo
    linhas.push(`Alvo: \`${alvo.pacote}${alvo.versao ? `@${alvo.versao}` : ''}\` (${alvo.origem.replace(/-/g, ' ')}).`, '')
  }

  if (relatorio.problemas.length > 0) {
    linhas.push('Problemas:', ...relatorio.problemas.map((p) => `- Rodada ${p.rodada} (${p.tipo}): ${celula(p.detalhe)}`), '')
  }

  linhas.push('| Rodada | Esperado | Resultado | Chamadas ao instalador | Binário | Duração |', '| --- | --- | --- | --- | --- | --- |')
  relatorio.rodadas.forEach((rodada, indice) => {
    if (!rodada.executada) {
      linhas.push(`| ${indice + 1} | ${ESPERADO_EM_TEXTO[rodada.esperado]} | não executada | | | |`)
      return
    }
    linhas.push(
      `| ${indice + 1} | ${ESPERADO_EM_TEXTO[rodada.esperado]} | ${celula(rodada.estado)} | ${rodada.instalacoes.length} | ` +
        `${rodada.binarioPresente ? 'presente' : 'ausente'} | ${(rodada.duracaoMs / 1000).toFixed(1)} s |`,
    )
  })

  const comFalha = relatorio.rodadas
    .map((rodada, indice) => ({ rodada, numero: indice + 1, falhas: (rodada.instalacoes ?? []).filter((i) => !i.ok) }))
    .filter((item) => item.falhas.length > 0)
  if (comFalha.length > 0) {
    linhas.push('', 'Saída do npm quando a instalação falhou:')
    for (const { numero, falhas } of comFalha) {
      const ultima = falhas[falhas.length - 1]
      const todasRede = falhas.every((falha) => falha.redeTransitoria)
      const algumaRede = falhas.some((falha) => falha.redeTransitoria)
      const rede = todasRede ? 'todas com assinatura de rede' : algumaRede ? 'algumas com assinatura de rede' : 'nenhuma com assinatura de rede'
      linhas.push(
        '',
        `Rodada ${numero}, \`${ultima.pacote}\`: ${falhas.length} tentativa(s) falharam (${rede}). Saída da última:`,
        '```text',
        ultima.saida || '(sem saída)',
        '```',
      )
    }
  }

  linhas.push('', `Duração total: ${(relatorio.duracaoTotalMs / 1000).toFixed(1)} s.`)
  return `${linhas.join('\n')}\n`
}

// ---------------------------------------------------------------------------
// Execução

/**
 * Esta máquina (ou o runner) pode ter CLIs oficiais instaladas de verdade, e
 * `createCliEnv` monta os candidatos de PATH a partir de `process.env.APPDATA`/
 * `LOCALAPPDATA` e da userData resolvida por `getAppPaths()`, NÃO da userData
 * isolada que o ciclo passa ao serviço (ela só diz onde o app grava o PRÓPRIO
 * estado). Sem isolar isso a primeira rodada nunca instalava nada: a detecção
 * achava a CLI já instalada, e as 4 rodadas terminavam `idle` sem provar coisa
 * alguma. Não é defeito de produção (numa máquina real só existe UM ambiente);
 * é o que uma reprodução "limpa" dentro do mesmo processo precisa fechar.
 * HOME/APPDATA/LOCALAPPDATA e `FELIXO_USER_DATA_DIR` (que `getAppPaths` já
 * respeita) passam a apontar para fora do que existe. Vale só para este
 * processo; o ambiente real da pessoa não é alterado.
 */
function isolateEnvironmentForThisProcessOnly(fakeHome, userData, env = process.env, cli = null) {
  const roaming = path.join(fakeHome, 'AppData', 'Roaming')
  const local = path.join(fakeHome, 'AppData', 'Local')
  fs.mkdirSync(roaming, { recursive: true })
  fs.mkdirSync(local, { recursive: true })

  env.HOME = fakeHome
  env.USERPROFILE = fakeHome
  env.APPDATA = roaming
  env.LOCALAPPDATA = local
  env.FELIXO_USER_DATA_DIR = userData
  // Quem exporta estas duas desviaria a pasta gerenciada ou desligaria o serviço.
  delete env[MANAGED_ROOT_ENV_KEY]
  delete env.FELIXO_AUTO_INSTALL_CLIS

  const pathKey = process.platform === 'win32' ? 'Path' : 'PATH'
  const atual = env[pathKey] ?? env.PATH ?? ''
  const nomes = executableNamesOf(cli)
  const filtrado = atual
    .split(path.delimiter)
    .filter((entrada) => !/felixo-ai-core[\\/]clis|[\\/]npm$/i.test(entrada))
    // Qualquer pasta que já tenha o executável da CLI sob teste também sai: a detecção
    // resolve o PRIMEIRO caminho do PATH, então um atalho de fora (medido em 22/10/2026:
    // o `codex.cmd` do Openia, que quebrava) passava na frente da pasta gerenciada e a
    // reprodução acabava medindo a máquina, não o ciclo.
    .filter((entrada) => !hasAnyExecutable(entrada, nomes))
    .join(path.delimiter)
  env[pathKey] = filtrado
  env.PATH = filtrado
}

function executableNamesOf(cli) {
  if (!cli?.command) return []
  return [...new Set([cli.command, ...(cli.windowsAliases ?? []), `${cli.command}.cmd`, `${cli.command}.exe`, `${cli.command}.ps1`])]
}

function hasAnyExecutable(directory, names) {
  if (!directory || names.length === 0) return false
  return names.some((name) => {
    try {
      return fs.existsSync(path.join(directory, name))
    } catch {
      return false
    }
  })
}

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-cli-repro-'))
}

/**
 * @param {string[]} argv
 * @returns {Promise<number>} Código de saída.
 */
async function main(argv = process.argv.slice(2)) {
  let args
  try {
    args = parseArgs(argv)
  } catch (error) {
    console.error(`[repro] ${error.message}\n\n${AJUDA}`)
    return EXIT.ERRO_DO_RUNNER
  }

  if (args.help) {
    console.log(AJUDA)
    return EXIT.OK
  }

  if (args.controlNpm && !args.packaged && !isPackagedChild()) {
    console.error(`[repro] --control-npm só vale com --packaged: o controle é sobre o npm do app instalado.\n\n${AJUDA}`)
    return EXIT.ERRO_DO_RUNNER
  }

  // Pai: reexecuta este script dentro do app instalado. Filho: segue abaixo, com o código do app.
  if (args.packaged && !isPackagedChild()) return launchPackaged(argv)

  let runtimeEsperado = null
  let empacotado = null
  if (isPackagedChild()) {
    if (!process.resourcesPath) {
      console.error('[repro] FELIXO_REPRO_ELECTRON_DIR está definido, mas este processo não é o executável do app (sem resourcesPath).')
      return EXIT.ERRO_DO_RUNNER
    }
    const npmDoPacote = path.join(process.resourcesPath, 'npm-runtime', 'npm', 'bin', 'npm-cli.js')
    runtimeEsperado = {
      // O controle espera um npm que não existe no pacote: a instalação (que usa o do pacote) tem de ser acusada.
      npmCliPath: args.controlNpm ? path.join(process.resourcesPath, 'npm-fora-do-pacote', 'npm', 'bin', 'npm-cli.js') : npmDoPacote,
      nodeExecutable: process.execPath,
    }
    empacotado = {
      executavel: path.basename(process.execPath),
      versaoDoApp: readVersion(path.join(ELECTRON_DIR, '..', 'package.json')),
      npmVersao: readVersion(path.join(path.dirname(path.dirname(npmDoPacote)), 'package.json')),
      npmRelativo: shortPath(npmDoPacote),
    }
  }

  const cli = getOfficialAiCli(args.cli)
  if (!cli || cli.autoInstall === false) {
    console.error(`[repro] a CLI "${args.cli}" não é instalada pela instalação automática do app.`)
    return EXIT.ERRO_DO_RUNNER
  }

  console.log(`[repro] CLI: ${args.cli} | plataforma: ${process.platform} | node: ${process.version}`)
  const userData = makeTempDir()
  const fakeHome = makeTempDir()
  isolateEnvironmentForThisProcessOnly(fakeHome, userData, process.env, cli)
  console.log('[repro] userData e HOME/APPDATA isolados em pastas descartáveis')

  const inicio = performance.now()
  let relatorio
  try {
    const ciclo = await runCycle({
      cliId: args.cli,
      userData,
      controlRegression: args.controlRegression,
      runtimeEsperado,
      log: (linha) => console.log(linha),
    })
    relatorio = buildReport({
      ciclo,
      avaliacao: evaluateCycle(ciclo),
      controlRegression: args.controlRegression,
      duracaoTotalMs: Math.round(performance.now() - inicio),
      empacotado,
      controlNpm: args.controlNpm,
    })
  } catch (error) {
    console.error('[repro] erro:', error.stack || error.message)
    const avaliacao = concluir([
      { tipo: VEREDITOS.ERRO_DO_RUNNER, rodada: 0, detalhe: `o script quebrou: ${error.message}` },
    ])
    relatorio = buildReport({
      ciclo: { cli: args.cli, alvo: null, rodadas: [] },
      avaliacao,
      controlRegression: args.controlRegression,
      duracaoTotalMs: Math.round(performance.now() - inicio),
      erroDoRunner: error.stack || error.message,
      empacotado,
      controlNpm: args.controlNpm,
    })
  } finally {
    fs.rmSync(userData, { recursive: true, force: true })
    fs.rmSync(fakeHome, { recursive: true, force: true })
  }

  if (args.report) fs.writeFileSync(args.report, `${JSON.stringify(relatorio, null, 2)}\n`)
  if (args.summary) fs.writeFileSync(args.summary, formatSummary(relatorio))

  console.log(`\nVEREDITO: ${relatorio.veredito} (código ${relatorio.codigoDeSaida})\n${relatorio.explicacao}`)
  for (const problema of relatorio.problemas) {
    console.log(`- rodada ${problema.rodada} (${problema.tipo}): ${problema.detalhe}`)
  }
  return relatorio.codigoDeSaida
}

if (require.main === module) {
  main().then(
    (codigo) => {
      process.exitCode = codigo
    },
    (error) => {
      console.error('[repro] erro:', error.stack || error.message)
      process.exitCode = EXIT.ERRO_DO_RUNNER
    },
  )
}

module.exports = {
  EXIT,
  RODADAS,
  VEREDITOS,
  buildPackagedChildEnv,
  buildReport,
  createInstallRecorder,
  createLatestPinner,
  evaluateCycle,
  formatSummary,
  isolateEnvironmentForThisProcessOnly,
  launchPackaged,
  loadCliAutoInstall,
  main,
  parseArgs,
  planPackagedLaunch,
  runCycle,
  samePath,
}

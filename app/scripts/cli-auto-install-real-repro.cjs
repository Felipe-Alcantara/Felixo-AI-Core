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

const fs = require('node:fs')
const Module = require('node:module')
const os = require('node:os')
const path = require('node:path')
const { performance } = require('node:perf_hooks')

const { isTransientNetworkFailure } = require('../electron/core/install-retry.cjs')
const { getManagedCliLayout, MANAGED_ROOT_ENV_KEY } = require('../electron/core/managed-cli-paths.cjs')
const { getOfficialAiCli } = require('../electron/core/official-cli-catalog.cjs')
const { hasManagedBinary, redactDiagnosticText } = require('../electron/services/cli-diagnostics.cjs')
const {
  installManagedPackage,
  resolveLatestManagedPackage,
} = require('../electron/services/managed-cli-installer.cjs')

const EXIT = Object.freeze({
  OK: 0,
  REGRESSAO: 1,
  INFRA: 2,
  FALHA_DE_INSTALACAO: 3,
  ERRO_DO_RUNNER: 4,
})

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
  --help                esta ajuda

Códigos de saída: 0 ok · 1 regressão do ciclo · 2 infra (rede/registry) ·
3 falha de instalação sem sinal de rede · 4 erro do runner.`

// ---------------------------------------------------------------------------
// Argumentos

/**
 * @param {string[]} argv
 * @returns {{ cli: string, report: string | null, summary: string | null, controlRegression: boolean, help: boolean }}
 */
function parseArgs(argv) {
  const args = { cli: 'gemini', report: null, summary: null, controlRegression: false, help: false }
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
    else if (arg === '--help' || arg === '-h') args.help = true
    else throw new Error(`opção desconhecida: ${arg}`)
  }

  return args
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

function tail(texto, limite = SAIDA_DA_FALHA_MAX) {
  const limpo = redactDiagnosticText(String(texto ?? '').trim(), { homeDir: os.homedir() })
  return limpo.length > limite ? `…${limpo.slice(-limite)}` : limpo
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
  const catalogPath = require.resolve('../electron/core/official-cli-catalog.cjs')
  const autoInstallPath = require.resolve('../electron/services/cli-auto-install.cjs')
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

  return { cli: cliId, alvo: latest.describe(), rodadas }
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
  const problemas = []
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
 */
function buildReport({ ciclo, avaliacao, controlRegression, duracaoTotalMs, erroDoRunner }) {
  const executadas = new Map(ciclo.rodadas.map((rodada) => [rodada.chave, rodada]))
  return {
    cli: ciclo.cli,
    ambiente: { plataforma: process.platform, arquitetura: process.arch, node: process.version },
    controleDeRegressao: controlRegression,
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

  const falhas = relatorio.rodadas.flatMap((rodada) => (rodada.instalacoes ?? []).filter((i) => !i.ok).map((i) => ({ rodada, i })))
  if (falhas.length > 0) {
    linhas.push('', 'Saída do npm nas tentativas que falharam:')
    for (const { rodada, i } of falhas) {
      linhas.push(
        '',
        `Rodada ${RODADAS.findIndex((spec) => spec.chave === rodada.chave) + 1}, ${i.pacote}` +
          `${i.redeTransitoria ? ' (assinatura de rede)' : ''}:`,
        '```text',
        i.saida || '(sem saída)',
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
function isolateEnvironmentForThisProcessOnly(fakeHome, userData, env = process.env) {
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
  const filtrado = atual
    .split(path.delimiter)
    .filter((entrada) => !/felixo-ai-core[\\/]clis|[\\/]npm$/i.test(entrada))
    .join(path.delimiter)
  env[pathKey] = filtrado
  env.PATH = filtrado
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

  const cli = getOfficialAiCli(args.cli)
  if (!cli || cli.autoInstall === false) {
    console.error(`[repro] a CLI "${args.cli}" não é instalada pela instalação automática do app.`)
    return EXIT.ERRO_DO_RUNNER
  }

  console.log(`[repro] CLI: ${args.cli} | plataforma: ${process.platform} | node: ${process.version}`)
  const userData = makeTempDir()
  const fakeHome = makeTempDir()
  isolateEnvironmentForThisProcessOnly(fakeHome, userData)
  console.log('[repro] userData e HOME/APPDATA isolados em pastas descartáveis')

  const inicio = performance.now()
  let relatorio
  try {
    const ciclo = await runCycle({
      cliId: args.cli,
      userData,
      controlRegression: args.controlRegression,
      log: (linha) => console.log(linha),
    })
    relatorio = buildReport({
      ciclo,
      avaliacao: evaluateCycle(ciclo),
      controlRegression: args.controlRegression,
      duracaoTotalMs: Math.round(performance.now() - inicio),
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
  buildReport,
  createInstallRecorder,
  createLatestPinner,
  evaluateCycle,
  formatSummary,
  isolateEnvironmentForThisProcessOnly,
  loadCliAutoInstall,
  main,
  parseArgs,
  runCycle,
}

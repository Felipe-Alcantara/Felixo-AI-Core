'use strict'

/**
 * Validação do Openia no Felixo EMPACOTADO, num Windows limpo — os cinco itens
 * que a validação de 21/09/2026 não conseguiu provar por ter rodado numa
 * máquina não limpa (launcher legado no PATH, Python e Felixo já instalados):
 *
 *   1. instalador NSIS real (instalar com o app fechado, atalhos, desinstalar);
 *   2. aliases `.cmd`/`.ps1` do Openia e um caminho com espaço no nome do usuário;
 *   3. exportação de um canvas com terminal Openia, varrida atrás da chave;
 *   4. cancelamento da instalação consentida, interrupção no meio e repetição;
 *   5. detecção quando o único Openia é o launcher legado dependente de clone.
 *
 * Feito para o runner `windows-latest` do GitHub Actions (workflow
 * `openia-windows-limpo.yml`), que é descartável: com Python, sem Felixo e sem
 * Openia — o cenário "com Python e sem Openia" que a task aceita. Decisão do
 * Felipe em 07/10/2026 (esta máquina não serve como Windows limpo).
 *
 * A chave vem de `OPENIA_TEST_KEY` (secret do workflow). Ela só existe em
 * memória: o relatório guarda booleanos e contagens, e é conferido contra o
 * valor antes de ser gravado. Sem a variável, usa uma chave-sentinela fictícia
 * — a varredura de vazamento continua valendo, só o chat real fica de fora.
 *
 * Uso: node scripts/openia-windows-limpo.cjs --installer <Felixo-...-win-x64.exe> --out <pasta>
 */

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const crypto = require('node:crypto')
const { spawnSync, execFileSync } = require('node:child_process')

const APP_DIR = path.resolve(__dirname, '..')
const FELIXO_CLI = path.join(APP_DIR, 'electron', 'cli', 'felixo.cjs')
const OPENIA_REPO = 'https://github.com/Felipe-Alcantara/Openia'
const PRODUTO = 'Felixo AI Core'
const TEMPO_APP_MS = 120_000
const TEMPO_INSTALACAO_MS = 10 * 60_000
/** Teto de gasto que esta validação se impõe (a chave de teste não tem limite próprio). */
const TETO_CUSTO_USD = 0.05

/** Desliga o que só o app empacotado faz ao abrir — o mesmo de `packaged-canvas-smoke.cjs`. */
const AMBIENTE_DO_APP = Object.freeze({
  FELIXO_AUTO_INSTALL_CLIS: '0',
  FELIXO_DISABLE_AUTO_UPDATE: '1',
})

// ---------------------------------------------------------------------------
// Funções puras (cobertas por `openia-windows-limpo.test.cjs`)
// ---------------------------------------------------------------------------

/** Troca toda ocorrência do segredo (e do seu sufixo, que basta para identificá-lo). */
function redigirSegredo(texto, segredo) {
  let resultado = String(texto ?? '')
  if (!segredo) return resultado
  for (const trecho of trechosDoSegredo(segredo)) {
    resultado = resultado.split(trecho).join('<CHAVE>')
  }
  return resultado
}

/** O segredo inteiro e os últimos 24 caracteres: um vazamento parcial também conta. */
function trechosDoSegredo(segredo) {
  const valor = String(segredo)
  return valor.length > 32 ? [valor, valor.slice(-24)] : [valor]
}

function contemSegredo(texto, segredo) {
  if (!segredo) return false
  const conteudo = String(texto ?? '')
  return trechosDoSegredo(segredo).some((trecho) => conteudo.includes(trecho))
}

/**
 * Varre arquivos atrás do segredo. Lê como `latin1` para achar o valor ASCII
 * também dentro de binários (SQLite, caches) sem quebrar na decodificação, e
 * em UTF-16LE para pegar o que o Windows grava em UTF-16.
 *
 * @returns {{ arquivos: number, comSegredo: string[], ignorados: number }}
 */
function varrerSegredo(raizes, segredo, { limiteBytes = 64 * 1024 * 1024 } = {}) {
  const comSegredo = []
  let arquivos = 0
  let ignorados = 0
  const utf16 = trechosDoSegredo(segredo).map((trecho) => Buffer.from(trecho, 'utf16le'))
  const ascii = trechosDoSegredo(segredo).map((trecho) => Buffer.from(trecho, 'latin1'))

  const visitar = (alvo) => {
    let stat
    try {
      stat = fs.lstatSync(alvo)
    } catch {
      return
    }
    if (stat.isSymbolicLink()) return
    if (stat.isDirectory()) {
      let filhos = []
      try {
        filhos = fs.readdirSync(alvo)
      } catch {
        ignorados += 1
        return
      }
      for (const filho of filhos) visitar(path.join(alvo, filho))
      return
    }
    if (!stat.isFile()) return
    if (stat.size > limiteBytes) {
      ignorados += 1
      return
    }
    arquivos += 1
    let conteudo
    try {
      conteudo = fs.readFileSync(alvo)
    } catch {
      ignorados += 1
      return
    }
    if ([...ascii, ...utf16].some((agulha) => conteudo.includes(agulha))) comSegredo.push(alvo)
  }

  for (const raiz of raizes) if (raiz) visitar(raiz)
  return { arquivos, comSegredo, ignorados }
}

/** Primeira versão `x.y.z` de uma saída de CLI. */
function extrairVersao(texto) {
  return /\b(\d+\.\d+\.\d+)\b/.exec(String(texto ?? ''))?.[1] ?? null
}

/** Caminho para o relatório: a pasta pessoal vira `~` (o nome do usuário não é dado de teste). */
function caminhoParaRelatorio(caminho, home = os.homedir()) {
  if (!caminho) return null
  const valor = String(caminho)
  return home && valor.toLowerCase().startsWith(home.toLowerCase())
    ? `~${valor.slice(home.length)}`
    : valor
}

// ---------------------------------------------------------------------------
// Execução
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const opcoes = { installer: '', out: path.join(APP_DIR, 'release', 'openia-windows-limpo') }
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--installer') opcoes.installer = argv[++i]
    else if (argv[i] === '--out') opcoes.out = argv[++i]
    else throw new Error(`Argumento desconhecido: ${argv[i]}. Uso: --installer <exe> [--out <pasta>]`)
  }
  if (!opcoes.installer) throw new Error('--installer é obrigatório.')
  return opcoes
}

function rodar(comando, args, opcoes = {}) {
  const resultado = spawnSync(comando, args, {
    encoding: 'utf8',
    windowsHide: true,
    timeout: opcoes.timeout ?? 120_000,
    env: opcoes.env ?? process.env,
    cwd: opcoes.cwd,
    shell: false,
  })
  return {
    codigo: resultado.status,
    saida: `${resultado.stdout ?? ''}`,
    erro: `${resultado.stderr ?? ''}${resultado.error ? ` ${resultado.error.message}` : ''}`,
  }
}

/** PowerShell com saída JSON: o jeito estável de ler registro, atalhos e processos. */
function powershellJson(script, opcoes = {}) {
  const r = rodar('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], opcoes)
  const texto = r.saida.trim()
  if (!texto) return null
  try {
    return JSON.parse(texto)
  } catch {
    return { erroDeParse: texto.slice(0, 500) }
  }
}

function comoLista(valor) {
  if (valor === null || valor === undefined) return []
  return Array.isArray(valor) ? valor : [valor]
}

const esperar = (ms) => new Promise((resolver) => setTimeout(resolver, ms))

/** Pasta de saída da rodada, onde as capturas de falha são gravadas. */
let pastaDeEvidencias = null

function runCli(args, env = process.env) {
  return execFileSync(process.execPath, [FELIXO_CLI, 'devtools', ...args], {
    cwd: APP_DIR,
    encoding: 'utf8',
    env,
  })
}

/**
 * Abre o app INSTALADO (não a fonte) por `felixo devtools launch --packaged`,
 * com perfil isolado e o PATH escolhido para o cenário, e entrega a página.
 * Os arquivos do perfil são varridos antes de fechar — o `quit` apaga o perfil.
 */
async function comApp(executavel, { path: pathDoApp } = {}, acao) {
  const { connect, readState } = require('../electron/cli/felixo-devtools.cjs')
  const env = { ...process.env, ...AMBIENTE_DO_APP, ...(pathDoApp ? { PATH: pathDoApp } : {}) }
  runCli(['launch', '--visible', '--timeout', String(TEMPO_APP_MS), '--packaged', executavel], env)
  const estado = readState()
  const { browser, page } = await connect(estado)
  try {
    await page.waitForFunction(() => Boolean(window.felixo?.cli?.listOfficial), null, { timeout: TEMPO_APP_MS })
    return await acao(page, estado)
  } catch (error) {
    // A tela no momento da falha vira evidência (o campo da chave é de senha).
    if (pastaDeEvidencias) {
      await page.screenshot({ path: path.join(pastaDeEvidencias, `falha-${Date.now()}.png`) }).catch(() => {})
    }
    throw error
  } finally {
    try {
      await browser.close()
    } catch {
      // A sessão pode já ter caído; o quit abaixo ainda limpa o processo.
    }
    try {
      runCli(['quit'])
    } catch (error) {
      console.warn(`[openia-limpo] falha ao encerrar o app: ${error.message}`)
    }
  }
}

async function catalogoOpenia(page) {
  const lista = await page.evaluate(() => window.felixo.cli.listOfficial())
  const itens = Array.isArray(lista) ? lista : lista?.clis ?? lista?.items ?? []
  return itens.find((item) => item.id === 'openia') ?? null
}

function resumoDaDeteccao(item) {
  if (!item) return { encontrado: false }
  return {
    detectado: Boolean(item.detected),
    versao: item.version ?? null,
    caminho: caminhoParaRelatorio(item.path),
    alias: item.path ? path.extname(item.path) || '(sem extensão)' : null,
    exigeConfirmacao: Boolean(item.installRequiresConfirmation),
    motivo: item.reason ?? item.detectionReason ?? null,
  }
}

/** Pacotes do Python que o `py` escolhe, incluindo o site do usuário. */
function pipFreeze() {
  const r = rodar('py', ['-m', 'pip', 'freeze', '--all'])
  return new Set(r.saida.split(/\r?\n/).map((linha) => linha.trim()).filter(Boolean))
}

function diferencaDePacotes(antes, depois) {
  return [...depois].filter((pacote) => !antes.has(pacote)).sort()
}

/** Saída de comando para o relatório: sem escapes ANSI e sem o caminho do perfil. */
function higienizarSaida(texto, home = os.homedir()) {
  let resultado = String(texto ?? '').replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '')
  if (home) resultado = resultado.split(home).join('~')
  return resultado.trim()
}

function pipMostra(pacote) {
  const r = rodar('py', ['-m', 'pip', 'show', pacote])
  return { instalado: r.codigo === 0, versao: /^Version:\s*(.+)$/m.exec(r.saida)?.[1]?.trim() ?? null }
}

async function custoDaChave(chave) {
  if (!chave || chave.startsWith('sk-or-v1-sentinela')) return null
  try {
    const resposta = await fetch('https://openrouter.ai/api/v1/key', { headers: { Authorization: `Bearer ${chave}` } })
    if (!resposta.ok) return { erroHttp: resposta.status }
    const dados = (await resposta.json())?.data ?? {}
    return { uso: dados.usage ?? null, limite: dados.limit ?? null }
  } catch (error) {
    return { erro: error.message }
  }
}

async function main(argv = process.argv.slice(2)) {
  const opcoes = parseArgs(argv)
  fs.mkdirSync(opcoes.out, { recursive: true })
  pastaDeEvidencias = opcoes.out
  const chave = process.env.OPENIA_TEST_KEY?.trim() || `sk-or-v1-sentinela${crypto.randomBytes(24).toString('hex')}`
  const chaveReal = Boolean(process.env.OPENIA_TEST_KEY?.trim())
  const pathOriginal = process.env.PATH
  const relatorio = {
    schemaVersion: 1,
    geradoEm: new Date().toISOString(),
    runner: {
      sistema: `${os.type()} ${os.release()}`,
      usuarioTemEspaco: /\s/.test(os.userInfo().username),
      chave: chaveReal ? 'real (secret do workflow)' : 'sentinela fictícia',
    },
    instalador: path.basename(opcoes.installer),
    itens: {},
    custo: {},
    resultado: 'falhou',
  }
  const itens = relatorio.itens
  const falhas = []

  async function etapa(nome, fn) {
    const inicio = Date.now()
    try {
      const dados = await fn()
      itens[nome] = { ok: dados?.ok !== false, ...dados, duracaoMs: Date.now() - inicio }
    } catch (error) {
      itens[nome] = { ok: false, erro: redigirSegredo(error?.stack ?? error?.message ?? String(error), chave).slice(0, 2_000), duracaoMs: Date.now() - inicio }
    }
    if (!itens[nome].ok) falhas.push(nome)
    console.log(`[openia-limpo] ${nome}: ${itens[nome].ok ? 'ok' : 'FALHOU'}`)
  }

  relatorio.custo.antes = await custoDaChave(chave)

  // 0 — Linha de base: prova que o runner é limpo para o que a task pede.
  await etapa('0-linha-de-base', async () => {
    const where = rodar('where', ['openia'])
    const py = rodar('py', ['--version'])
    return {
      openiaNoPath: where.codigo === 0,
      py: extrairVersao(`${py.saida}${py.erro}`),
      openiaPip: pipMostra('openia'),
      felixoInstalado: comoLista(powershellJson("Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*' -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -like 'Felixo AI Core*' } | Select-Object DisplayName | ConvertTo-Json")).length > 0,
      ok: where.codigo !== 0 && py.codigo === 0,
    }
  })

  // 1 — Instalador NSIS real, com o app fechado.
  let instalacao = null
  await etapa('1-instalador-nsis', async () => {
    const abertos = comoLista(powershellJson(`Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -like '${PRODUTO}*' } | Select-Object Id | ConvertTo-Json`))
    const r = rodar(opcoes.installer, ['/S'], { timeout: TEMPO_INSTALACAO_MS })
    const registro = comoLista(powershellJson("Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*' | Where-Object { $_.DisplayName -like 'Felixo AI Core*' } | Select-Object DisplayName, DisplayVersion, Publisher, InstallLocation, UninstallString | ConvertTo-Json"))[0] ?? null
    const desinstalador = registro?.UninstallString ? /"([^"]+)"/.exec(registro.UninstallString)?.[1] ?? registro.UninstallString.split(' /')[0] : null
    // O NSIS do electron-builder não grava InstallLocation (medido no run
    // 37579811264): a pasta do app é a do desinstalador, que mora nela.
    const pasta = registro?.InstallLocation || (desinstalador ? path.dirname(desinstalador) : null)
    const executavel = pasta ? path.join(pasta, `${PRODUTO}.exe`) : null
    const atalhos = comoLista(powershellJson(
      "$sh = New-Object -ComObject WScript.Shell; " +
      "@([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs')) | " +
      "ForEach-Object { Get-ChildItem -Path $_ -Filter 'Felixo AI Core*.lnk' -Recurse -ErrorAction SilentlyContinue } | " +
      "ForEach-Object { [pscustomobject]@{ arquivo = $_.FullName; alvo = $sh.CreateShortcut($_.FullName).TargetPath } } | ConvertTo-Json",
    ))
    instalacao = { pasta, executavel, desinstalador, versao: registro?.DisplayVersion ?? null }
    relatorio.versaoApp = registro?.DisplayVersion ?? null
    const atalhosValidos = atalhos.filter((a) => executavel && path.resolve(a.alvo).toLowerCase() === path.resolve(executavel).toLowerCase())
    return {
      appAbertoAntes: abertos.length > 0,
      codigoSaida: r.codigo,
      registro: registro ? {
        nome: registro.DisplayName,
        versao: registro.DisplayVersion,
        editor: registro.Publisher,
        gravaInstallLocation: Boolean(registro.InstallLocation),
        pasta: caminhoParaRelatorio(pasta),
      } : null,
      executavelExiste: Boolean(executavel && fs.existsSync(executavel)),
      desinstaladorExiste: Boolean(desinstalador && fs.existsSync(desinstalador)),
      atalhos: atalhos.map((a) => ({ arquivo: caminhoParaRelatorio(a.arquivo), apontaParaOApp: atalhosValidos.includes(a) })),
      atalhoNaAreaDeTrabalho: atalhosValidos.some((a) => /desktop/i.test(a.arquivo)),
      atalhoNoMenuIniciar: atalhosValidos.some((a) => /start menu/i.test(a.arquivo)),
      ok: abertos.length === 0 && r.codigo === 0 && Boolean(executavel && fs.existsSync(executavel)) && atalhosValidos.length > 0,
    }
  })
  if (!instalacao?.executavel || !fs.existsSync(instalacao.executavel)) {
    return finalizar(relatorio, falhas, opcoes, chave)
  }
  const exe = instalacao.executavel

  // 5 — Só o launcher legado (dependente de clone), ANTES do Openia do pip.
  await etapa('5-launcher-legado', async () => {
    const clone = path.join('C:\\', 'openia legado', 'Openia')
    fs.mkdirSync(path.dirname(clone), { recursive: true })
    const git = rodar('git', ['clone', '--depth', '1', OPENIA_REPO, clone], { timeout: 180_000 })
    if (git.codigo !== 0) throw new Error(`git clone falhou: ${git.erro.slice(0, 300)}`)
    // O instalador do próprio Openia: copia o openia.cmd para %LOCALAPPDATA%\openia e põe no PATH do usuário.
    const instalador = rodar('cmd.exe', ['/d', '/c', path.join(clone, 'scripts', 'cmd', 'install-openia-cmd.cmd')], { timeout: 120_000 })
    const pastaLegado = path.join(process.env.LOCALAPPDATA, 'openia')
    const typerAntes = pipMostra('typer')

    // Primeiro, o launcher legado sozinho, fora do app: o que a detecção do
    // Felixo vai receber de `openia --version` num clone recém-baixado. Na
    // rodada 37580071358 o app leu a versão "0.27.3-py3" — que não é do
    // Openia e parece nome de wheel do pip —, então a saída e os pacotes
    // instalados antes e depois entram no relatório (higienizados).
    const pacotesAntesDireto = pipFreeze()
    const inicioDireto = Date.now()
    const direto = rodar('cmd.exe', ['/d', '/c', path.join(pastaLegado, 'openia.cmd'), '--version'], { timeout: 300_000 })
    const msDireto = Date.now() - inicioDireto
    const pacotesDepoisDireto = pipFreeze()
    const execucaoDireta = {
      codigo: direto.codigo,
      ms: msDireto,
      versaoLida: extrairVersao(`${direto.saida}${direto.erro}`),
      saida: higienizarSaida(`${direto.saida}\n${direto.erro}`).slice(0, 1_200),
      pacotesInstaladosPeloVersion: diferencaDePacotes(pacotesAntesDireto, pacotesDepoisDireto),
    }
    // Volta ao estado de clone recém-baixado, para a detecção do app também
    // começar do zero.
    const instaladosPeloDireto = execucaoDireta.pacotesInstaladosPeloVersion.map((pacote) => pacote.split('==')[0])
    if (instaladosPeloDireto.length > 0) rodar('py', ['-m', 'pip', 'uninstall', '-y', ...instaladosPeloDireto], { timeout: 180_000 })

    const pacotesAntesApp = pipFreeze()
    const comClone = await comApp(exe, { path: `${pastaLegado};${pathOriginal}` }, async (page) => {
      const inicio = Date.now()
      const item = await catalogoOpenia(page)
      const msDeteccao = Date.now() - inicio
      const interfaces = await page.evaluate(() => window.felixo.openia.listInterfaces())
      // Sem o clone: o launcher continua no PATH, mas aponta para uma pasta que não existe mais.
      fs.renameSync(clone, `${clone}-movido`)
      const inicioSem = Date.now()
      const semClone = await catalogoOpenia(page)
      const msSem = Date.now() - inicioSem
      fs.renameSync(`${clone}-movido`, clone)
      return {
        comClone: { ...resumoDaDeteccao(item), msDeteccao, contratoListJson: { ok: Boolean(interfaces?.ok), interfaces: interfaces?.interfaces?.length ?? 0 } },
        semClone: { ...resumoDaDeteccao(semClone), msDeteccao: msSem },
      }
    })
    const typerDepois = pipMostra('typer')
    const pacotesDepoisApp = pipFreeze()
    // Com as dependências já presentes, o que sobra é o custo do próprio launcher.
    const inicioSegunda = Date.now()
    const segunda = rodar('cmd.exe', ['/d', '/c', path.join(pastaLegado, 'openia.cmd'), '--version'], { timeout: 120_000 })
    execucaoDireta.segundaChamada = { codigo: segunda.codigo, ms: Date.now() - inicioSegunda, versaoLida: extrairVersao(`${segunda.saida}${segunda.erro}`) }
    // Desfaz: o launcher legado não pode contaminar as etapas seguintes.
    fs.rmSync(pastaLegado, { recursive: true, force: true })
    return {
      instaladorLegado: { codigo: instalador.codigo },
      execucaoDireta,
      ...comClone,
      efeitoColateral: {
        typerAntes: typerAntes.instalado,
        typerDepois: typerDepois.instalado,
        pacotesInstaladosPelaDeteccaoDoApp: diferencaDePacotes(pacotesAntesApp, pacotesDepoisApp),
      },
      ok: instalador.codigo === 0 && comClone.semClone.detectado === false,
    }
  })

  // 4 e 2 — Instalação consentida: recusar, interromper no meio, repetir.
  let caminhoOpenia = null
  await etapa('4-cancelamento-e-repeticao', async () => {
    return comApp(exe, { path: pathOriginal }, async (page) => {
      const antes = resumoDaDeteccao(await catalogoOpenia(page))
      // Recusar o consentimento = o "Cancelar" do diálogo da UI, que só então chama o IPC.
      const recusa = await page.evaluate(() => window.felixo.cli.installOfficial({ id: 'openia', confirmed: false }))
      const depoisDaRecusa = pipMostra('openia')

      // Interromper no meio: o pip é encerrado (como fechar o app durante a instalação).
      await page.evaluate(() => {
        window.__felixoInstalacao = undefined
        window.felixo.cli.installOfficial({ id: 'openia', confirmed: true })
          .then((resultado) => { window.__felixoInstalacao = resultado })
          .catch((error) => { window.__felixoInstalacao = { ok: false, message: String(error) } })
      })
      let interrompidos = []
      const limite = Date.now() + 120_000
      while (Date.now() < limite && interrompidos.length === 0) {
        // Só o py/python do pip: na primeira rodada o filtro por linha de
        // comando casou também o powershell.exe desta própria consulta.
        const pips = comoLista(powershellJson("Get-CimInstance Win32_Process | Where-Object { @('py.exe','python.exe') -contains $_.Name -and $_.CommandLine -match 'pip' -and $_.CommandLine -match 'Openia' } | Select-Object ProcessId, Name | ConvertTo-Json"))
        if (pips.length > 0) {
          await esperar(1_500)
          for (const pip of pips) rodar('taskkill', ['/T', '/F', '/PID', String(pip.ProcessId)])
          interrompidos = pips.map((pip) => pip.Name)
        } else {
          await esperar(200)
        }
      }
      await page.waitForFunction(() => window.__felixoInstalacao !== undefined, null, { timeout: TEMPO_INSTALACAO_MS })
      const interrompida = await page.evaluate(() => window.__felixoInstalacao)
      const depoisDaInterrupcao = pipMostra('openia')

      const repetida = await page.evaluate(() => window.felixo.cli.installOfficial({ id: 'openia', confirmed: true }))
      const depois = resumoDaDeteccao(await catalogoOpenia(page))
      caminhoOpenia = repetida?.cli?.path ?? null
      return {
        antes,
        recusa: { ok: Boolean(recusa?.ok), exigiuConfirmacao: Boolean(recusa?.requiresConfirmation), pipDepois: depoisDaRecusa },
        interrupcao: {
          processosEncerrados: interrompidos,
          resultado: { ok: Boolean(interrompida?.ok), mensagem: redigirSegredo(interrompida?.message ?? '', chave).slice(0, 300) },
          pipDepois: depoisDaInterrupcao,
        },
        repeticao: {
          ok: Boolean(repetida?.ok),
          retentouComBreakSystemPackages: Boolean(repetida?.retriedWithBreakSystemPackages),
          mensagem: redigirSegredo(repetida?.message ?? '', chave).slice(0, 300),
        },
        depois,
        ok: antes.detectado === false && recusa?.requiresConfirmation === true && !depoisDaRecusa.instalado &&
          interrompidos.length > 0 && repetida?.ok === true && depois.detectado === true,
      }
    })
  })

  // 3 — Canvas com terminal Openia, chave configurada pela UI, exportação varrida.
  await etapa('3-exportacao-do-canvas', async () => {
    return comApp(exe, { path: pathOriginal }, async (page, estado) => {
      const grupo = page.locator('[role="group"][aria-label="Configurar novo agente"]')
      const escolher = async (nome, opcao) => {
        await grupo.getByRole('combobox', { name: nome, exact: true }).click()
        await page.getByRole('option').filter({ hasText: opcao }).first().click()
      }
      const gatilho = page.getByRole('button', { name: 'Configurar novo agente' })
      await gatilho.waitFor({ state: 'visible', timeout: TEMPO_APP_MS })
      if ((await gatilho.getAttribute('aria-expanded')) !== 'true') await gatilho.click()
      await grupo.waitFor({ state: 'visible', timeout: TEMPO_APP_MS })
      await escolher('Agente', /Openia/)
      await page.waitForFunction(() => {
        const select = document.querySelector('[aria-label="Interface Openia"]')
        return select && !select.hasAttribute('disabled') && select.getAttribute('aria-disabled') !== 'true'
      }, null, { timeout: TEMPO_APP_MS })

      // A chave entra pelo campo de senha e pelo botão Salvar, como a pessoa faz.
      await grupo.locator('input[type="password"][id$="-openia-key"]').fill(chave)
      await grupo.getByRole('button', { name: 'Salvar', exact: true }).click()
      await page.waitForFunction(
        () => document.body.innerText.includes('Chave do login do sistema configurada no armazenamento do Openia.'),
        null,
        { timeout: 60_000 },
      )
      const statusDaChave = await page.evaluate(() => window.felixo.openia.keyStatus())

      await escolher('Interface Openia', /\bllm\b/i)
      let modeloEscolhido = null
      try {
        await grupo.getByRole('combobox', { name: 'Modelo Openia', exact: true }).click()
        const busca = page.getByPlaceholder(/Buscar modelo/)
        if (await busca.count()) await busca.fill('gpt-4o-mini')
        const opcao = page.getByRole('option').filter({ hasText: /gpt-4o-mini/i }).first()
        modeloEscolhido = (await opcao.textContent({ timeout: 15_000 }))?.trim().slice(0, 80) ?? null
        await opcao.click({ timeout: 15_000 })
      } catch {
        modeloEscolhido = null
        // Fecha só a lista de modelos; se o Esc fechar o painel inteiro, ele é reaberto abaixo.
        await page.keyboard.press('Escape')
      }
      // Na primeira rodada (run 37580071358) o Esc acima fechou o painel e o
      // "Abrir agente" sumiu junto: reabre sem perder a configuração escolhida.
      if ((await gatilho.getAttribute('aria-expanded')) !== 'true') await gatilho.click()
      await grupo.waitFor({ state: 'visible', timeout: TEMPO_APP_MS })

      await page.evaluate(() => {
        window.__felixoSaida = ''
        window.felixo.pty.onData((evento) => { window.__felixoSaida += String(evento?.data ?? '') })
      })
      await grupo.getByRole('button', { name: 'Abrir agente' }).click()
      await page.waitForFunction(() => document.querySelectorAll('.react-flow__node').length > 0, null, { timeout: TEMPO_APP_MS })
      await page.waitForFunction(() => window.__felixoSaida.length > 0, null, { timeout: TEMPO_APP_MS })

      // Chat real, de melhor esforço: o critério da task é o não-vazamento.
      let chat = { tentado: false }
      if (chaveReal && modeloEscolhido !== null) {
        chat = { tentado: true, respondeuPong: false }
        try {
          await esperar(8_000)
          const node = page.locator('.react-flow__node').first()
          await node.getByRole('button', { name: 'Expandir terminal' }).click()
          const xterm = page.locator('.xterm-helper-textarea').last()
          await xterm.waitFor({ state: 'attached', timeout: 30_000 })
          await xterm.focus()
          await page.keyboard.type('Responda apenas com a palavra pong, sem mais nada.')
          await page.keyboard.press('Enter')
          await page.waitForFunction(() => /\bpong\b/i.test(window.__felixoSaida.slice(-4_000)), null, { timeout: 120_000 })
          chat.respondeuPong = true
        } catch (error) {
          chat.erro = redigirSegredo(error.message, chave).slice(0, 300)
        }
      }

      const textoDaTela = await page.evaluate(() => document.body.innerText)
      const saidaDoTerminal = await page.evaluate(() => window.__felixoSaida)
      const exportacao = await page.evaluate(async () => {
        const nodes = await window.felixo.canvas.list()
        const edges = await window.felixo.canvas.listEdges()
        return window.felixo.canvas.exportBundle({ nodes: nodes.nodes ?? [], edges: edges.edges ?? [] })
      })
      if (!exportacao?.ok) throw new Error(`exportação falhou: ${exportacao?.message}`)
      // Mesmo formato do arquivo que o botão Exportar grava (useCanvasTransfer).
      const textoExportado = JSON.stringify(exportacao.bundle, null, 2)
      const vazouNaExportacao = contemSegredo(textoExportado, chave)
      const arquivoExportado = path.join(opcoes.out, 'canvas-exportado.fxcanvas')
      fs.writeFileSync(arquivoExportado, vazouNaExportacao ? redigirSegredo(textoExportado, chave) : textoExportado, 'utf8')
      const nodesOpenia = exportacao.bundle.nodes.filter((node) => JSON.stringify(node).toLowerCase().includes('openia'))

      // Onde a chave aparece no disco. O único lugar esperado é o keys.json do próprio Openia.
      const pacoteOpenia = rodar('py', ['-c', 'import openia, os; print(os.path.dirname(openia.__file__))']).saida.trim()
      const varredura = varrerSegredo([
        estado.userData,
        path.join(process.env.APPDATA, PRODUTO),
        path.join(process.env.APPDATA, 'felixo-ai-core'),
        path.join(os.tmpdir(), 'felixo-ai-core'),
        path.join(process.env.APPDATA, 'io.datasette.llm'),
        pacoteOpenia,
        opcoes.out,
      ], chave)
      const forasDoEsperado = varredura.comSegredo.filter((arquivo) => path.basename(arquivo).toLowerCase() !== 'keys.json' || !arquivo.toLowerCase().startsWith(pacoteOpenia.toLowerCase()))

      // Desfaz: a chave sai do Openia antes de fechar o app.
      try {
        fs.rmSync(path.join(pacoteOpenia, 'keys.json'), { force: true })
      } catch {
        // O relatório abaixo diz se a chave continuou configurada.
      }
      const statusDepois = await page.evaluate(() => window.felixo.openia.keyStatus())

      return {
        chaveConfigurada: Boolean(statusDaChave?.configured ?? statusDaChave?.ok),
        modeloEscolhido,
        chat,
        nodesExportados: exportacao.bundle.nodes.length,
        nodesOpenia: nodesOpenia.length,
        vazouNaExportacao,
        vazouNaTela: contemSegredo(textoDaTela, chave),
        vazouNoTerminal: contemSegredo(saidaDoTerminal, chave),
        varredura: {
          arquivos: varredura.arquivos,
          ignorados: varredura.ignorados,
          comChave: varredura.comSegredo.map((arquivo) => caminhoParaRelatorio(arquivo)),
          foraDoEsperado: forasDoEsperado.map((arquivo) => caminhoParaRelatorio(arquivo)),
        },
        chaveRemovidaNoFim: !(statusDepois?.configured === true),
        ok: nodesOpenia.length > 0 && !vazouNaExportacao && !contemSegredo(textoDaTela, chave) && forasDoEsperado.length === 0,
      }
    })
  })

  // 2 — Aliases .cmd e .ps1, em pasta com espaço: detecção, contrato e terminal pelo app.
  await etapa('2-aliases-cmd-ps1', async () => {
    if (!caminhoOpenia || !fs.existsSync(caminhoOpenia)) throw new Error('openia.exe do pip não foi localizado')
    const real = path.join(path.dirname(caminhoOpenia), 'openia-real.exe')
    fs.renameSync(caminhoOpenia, real)
    const resultados = {}
    try {
      const raiz = path.join('C:\\', 'Felixo Aliases')
      const variantes = {
        cmd: { pasta: path.join(raiz, 'so cmd'), arquivo: 'openia.cmd', conteudo: `@echo off\r\n"${real}" %*\r\n` },
        ps1: { pasta: path.join(raiz, 'so ps1'), arquivo: 'openia.ps1', conteudo: `& "${real}" @args\r\nexit $LASTEXITCODE\r\n` },
      }
      for (const [nome, variante] of Object.entries(variantes)) {
        fs.mkdirSync(variante.pasta, { recursive: true })
        fs.writeFileSync(path.join(variante.pasta, variante.arquivo), variante.conteudo, 'utf8')
        resultados[nome] = await comApp(exe, { path: `${variante.pasta};${pathOriginal}` }, async (page) => {
          const deteccao = resumoDaDeteccao(await catalogoOpenia(page))
          const interfaces = await page.evaluate(() => window.felixo.openia.listInterfaces())
          const sessao = `alias-${Date.now()}`
          const terminal = await page.evaluate(async (sessionId) => {
            let texto = ''
            let saiu = null
            const pararDados = window.felixo.pty.onData((evento) => {
              if (evento?.sessionId === sessionId) texto += String(evento.data ?? '')
            })
            const pararSaida = window.felixo.pty.onExit?.((evento) => {
              if (evento?.sessionId === sessionId) saiu = evento.exitCode ?? evento.code ?? null
            })
            const spawn = await window.felixo.pty.spawn({ sessionId, command: 'openia', args: ['--version'], cols: 120, rows: 30 })
            const limite = Date.now() + 30_000
            while (Date.now() < limite && !/\d+\.\d+\.\d+/.test(texto.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, ''))) {
              await new Promise((r) => setTimeout(r, 250))
            }
            pararDados?.()
            pararSaida?.()
            await window.felixo.pty.kill({ sessionId })
            return { spawnOk: Boolean(spawn?.ok), spawnMensagem: spawn?.message ?? null, saiu, texto }
          }, sessao)
          const textoLimpo = higienizarSaida(terminal.texto)
          return {
            deteccao,
            contratoListJson: { ok: Boolean(interfaces?.ok), interfaces: interfaces?.interfaces?.length ?? 0, mensagem: interfaces?.message ?? null },
            terminal: {
              spawnOk: terminal.spawnOk,
              spawnMensagem: terminal.spawnMensagem,
              codigoSaida: terminal.saiu,
              bytes: terminal.texto.length,
              finalDaSaida: textoLimpo.slice(-400),
            },
            terminalVersao: extrairVersao(textoLimpo),
          }
        })
        fs.rmSync(variante.pasta, { recursive: true, force: true })
      }
    } finally {
      fs.renameSync(real, caminhoOpenia)
    }
    const passou = (r, ext) => r?.deteccao?.detectado && r.deteccao.alias === ext && r.contratoListJson.ok && r.contratoListJson.interfaces > 0 && Boolean(r.terminalVersao)
    return { ...resultados, ok: passou(resultados.cmd, '.cmd') && passou(resultados.ps1, '.ps1') }
  })

  // 2b — Usuário real com espaço no nome: instala o pacote e o Openia como ele.
  await etapa('2b-usuario-com-espaco', async () => validarUsuarioComEspaco(opcoes))

  // 1 (fim) — Desinstalação pelo desinstalador do NSIS.
  await etapa('1b-desinstalacao', async () => {
    if (!instalacao.desinstalador || !fs.existsSync(instalacao.desinstalador)) throw new Error('desinstalador não encontrado')
    rodar(instalacao.desinstalador, ['/S'], { timeout: TEMPO_INSTALACAO_MS })
    // O desinstalador do NSIS se copia para a pasta temporária e segue de lá:
    // a chamada volta antes do fim. Espera o registro sumir.
    const limite = Date.now() + 180_000
    let registro = []
    do {
      await esperar(2_000)
      registro = comoLista(powershellJson("Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*' -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -like 'Felixo AI Core*' } | Select-Object DisplayName | ConvertTo-Json"))
    } while (registro.length > 0 && Date.now() < limite)
    const atalhos = comoLista(powershellJson("@([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs')) | ForEach-Object { Get-ChildItem -Path $_ -Filter 'Felixo AI Core*.lnk' -Recurse -ErrorAction SilentlyContinue } | Select-Object FullName | ConvertTo-Json"))
    const sobrou = instalacao.pasta && fs.existsSync(instalacao.pasta) ? fs.readdirSync(instalacao.pasta) : []
    return {
      registroRemovido: registro.length === 0,
      atalhosRemovidos: atalhos.length === 0,
      executavelRemovido: !fs.existsSync(exe),
      arquivosQueSobraram: sobrou.length,
      ok: registro.length === 0 && atalhos.length === 0 && !fs.existsSync(exe),
    }
  })

  relatorio.custo.depois = await custoDaChave(chave)
  if (relatorio.custo.antes?.uso != null && relatorio.custo.depois?.uso != null) {
    relatorio.custo.gastoUsd = Math.round((relatorio.custo.depois.uso - relatorio.custo.antes.uso) * 1e6) / 1e6
    relatorio.custo.dentroDoTeto = relatorio.custo.gastoUsd <= TETO_CUSTO_USD
  }
  return finalizar(relatorio, falhas, opcoes, chave)
}

/**
 * Instala o pacote e o Openia como um usuário local "Felixo Teste" — nome com
 * espaço, como "Felipe Martins" — e roda a detecção do app instalado no modo
 * Node do próprio Electron, com o perfil real desse usuário.
 */
function validarUsuarioComEspaco(opcoes) {
  const compartilhada = path.join('C:\\', 'felixo-validacao')
  fs.mkdirSync(compartilhada, { recursive: true })
  rodar('icacls', [compartilhada, '/grant', '*S-1-1-0:(OI)(CI)M'])
  const instalador = path.join(compartilhada, path.basename(opcoes.installer))
  fs.copyFileSync(opcoes.installer, instalador)
  const saidaJson = path.join(compartilhada, 'usuario-com-espaco.json')
  fs.rmSync(saidaJson, { force: true })

  fs.writeFileSync(path.join(compartilhada, 'detectar.cjs'), [
    "'use strict'",
    "const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path')",
    'const [asar, saida] = process.argv.slice(2)',
    "const { detectCli, SUPPORTED_CLIS } = require(path.join(asar, 'electron', 'core', 'cli-detector.cjs'))",
    "const { createCliEnv } = require(path.join(asar, 'electron', 'services', 'cli-process-manager.cjs'))",
    "const spawn = require(path.join(asar, 'node_modules', 'cross-spawn'))",
    ';(async () => {',
    '  const env = createCliEnv()',
    "  const r = await detectCli(SUPPORTED_CLIS.find((c) => c.command === 'openia'), env)",
    "  const contrato = r.path ? spawn.sync(r.path, ['list', '--json'], { env, encoding: 'utf8' }) : null",
    '  let interfaces = 0',
    '  try { interfaces = JSON.parse(contrato.stdout).interfaces.length } catch {}',
    '  const home = os.homedir()',
    '  fs.writeFileSync(saida, JSON.stringify({',
    '    homeTemEspaco: /\\s/.test(home),',
    '    detectado: r.detected, versao: r.version,',
    "    caminhoDentroDoPerfil: Boolean(r.path && r.path.toLowerCase().startsWith(home.toLowerCase())),",
    "    caminho: r.path ? '~' + r.path.slice(home.length) : null,",
    '    contratoOk: contrato?.status === 0, interfaces,',
    '  }))',
    '})()',
    '',
  ].join('\n'))

  fs.writeFileSync(path.join(compartilhada, 'como-usuario.ps1'), [
    "$ErrorActionPreference = 'Stop'",
    '$log = Join-Path $PSScriptRoot "usuario-com-espaco.log"',
    'try {',
    // O processo herda o ambiente de quem o abriu: as pastas do perfil vêm do token deste usuário.
    "  $env:APPDATA = [Environment]::GetFolderPath('ApplicationData')",
    "  $env:LOCALAPPDATA = [Environment]::GetFolderPath('LocalApplicationData')",
    "  $env:USERPROFILE = [Environment]::GetFolderPath('UserProfile')",
    '  $env:HOMEPATH = $env:USERPROFILE.Substring(2)',
    '  $env:USERNAME = [Environment]::UserName',
    "  $env:TEMP = Join-Path $env:LOCALAPPDATA 'Temp'; $env:TMP = $env:TEMP",
    '  New-Item -ItemType Directory -Force -Path $env:TEMP | Out-Null',
    `  Start-Process -FilePath "${instalador}" -ArgumentList '/S' -Wait`,
    "  $reg = Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*' | Where-Object { $_.DisplayName -like 'Felixo AI Core*' } | Select-Object -First 1",
    "  if (-not $reg) { throw 'instalador nao registrou o app para este usuario' }",
    "  & py -m pip install --user --upgrade 'https://github.com/Felipe-Alcantara/Openia/archive/d248538.zip' *>> $log",
    // Sem InstallLocation no registro (NSIS do electron-builder): a pasta é a do desinstalador.
    "  $pasta = $reg.InstallLocation; if (-not $pasta) { $pasta = Split-Path -Parent ($reg.UninstallString -replace '^\"([^\"]+)\".*$', '$1') }",
    "  $exe = Join-Path $pasta 'Felixo AI Core.exe'",
    "  $asar = Join-Path $pasta 'resources\\app.asar'",
    "  $env:ELECTRON_RUN_AS_NODE = '1'",
    `  & $exe (Join-Path $PSScriptRoot 'detectar.cjs') $asar "${saidaJson}" *>> $log`,
    `  Start-Process -FilePath (Join-Path $pasta 'Uninstall Felixo AI Core.exe') -ArgumentList '/S' -Wait`,
    '} catch { $_ | Out-String | Add-Content $log; exit 1 }',
    '',
  ].join('\r\n'))

  const senha = `Fx!${crypto.randomBytes(12).toString('base64url')}a1`
  const usuario = 'Felixo Teste'
  const r = rodar('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', [
    "$ErrorActionPreference = 'Stop'",
    '$s = ConvertTo-SecureString $env:FELIXO_SENHA_TESTE -AsPlainText -Force',
    `if (-not (Get-LocalUser -Name '${usuario}' -ErrorAction SilentlyContinue)) { New-LocalUser -Name '${usuario}' -Password $s -PasswordNeverExpires | Out-Null }`,
    `$c = New-Object System.Management.Automation.PSCredential('${usuario}', $s)`,
    `$p = Start-Process -FilePath powershell.exe -Credential $c -LoadUserProfile -WorkingDirectory '${compartilhada}' -ArgumentList '-NoLogo','-NoProfile','-ExecutionPolicy','Bypass','-File','${path.join(compartilhada, 'como-usuario.ps1')}' -Wait -PassThru`,
    'exit $p.ExitCode',
  ].join('; ')], { timeout: 20 * 60_000, env: { ...process.env, FELIXO_SENHA_TESTE: senha } })

  const resultado = fs.existsSync(saidaJson) ? JSON.parse(fs.readFileSync(saidaJson, 'utf8')) : null
  const log = fs.existsSync(path.join(compartilhada, 'usuario-com-espaco.log'))
    ? fs.readFileSync(path.join(compartilhada, 'usuario-com-espaco.log'), 'utf8').slice(-1_500)
    : ''
  rodar('powershell.exe', ['-NoLogo', '-NoProfile', '-Command', `Remove-LocalUser -Name '${usuario}' -ErrorAction SilentlyContinue`])
  return {
    usuario,
    codigoSaida: r.codigo,
    resultado,
    // Na rodada 37580071358 o PowerShell saiu em 1 s sem log: sem o stderr
    // dele não dava para saber se falhou ao criar o usuário ou ao abrir o processo.
    ...(resultado ? {} : {
      log: higienizarSaida(log).replace(/[A-Za-z]:\\Users\\[^\\\s]+/g, 'C:\\Users\\<usuario>'),
      powershell: higienizarSaida(`${r.saida}\n${r.erro}`).replace(/[A-Za-z]:\\Users\\[^\\\s]+/g, 'C:\\Users\\<usuario>').slice(-1_200),
    }),
    ok: Boolean(resultado?.homeTemEspaco && resultado.detectado && resultado.caminhoDentroDoPerfil && resultado.contratoOk),
  }
}

function finalizar(relatorio, falhas, opcoes, chave) {
  relatorio.falhas = falhas
  relatorio.resultado = falhas.length === 0 ? 'passou' : 'falhou'
  let texto = JSON.stringify(relatorio, null, 2)
  // Última trava: o relatório vira artefato público do workflow.
  if (contemSegredo(texto, chave)) {
    relatorio.chaveRedigidaNoRelatorio = true
    texto = redigirSegredo(JSON.stringify(relatorio, null, 2), chave)
  }
  fs.writeFileSync(path.join(opcoes.out, 'openia-windows-limpo.json'), `${texto}\n`, 'utf8')
  console.log(texto)
  return falhas.length === 0 ? 0 : 1
}

module.exports = {
  caminhoParaRelatorio,
  contemSegredo,
  extrairVersao,
  redigirSegredo,
  varrerSegredo,
}

if (require.main === module) {
  main()
    .then((codigo) => {
      process.exitCode = codigo
    })
    .catch((error) => {
      const chave = process.env.OPENIA_TEST_KEY?.trim()
      console.error(`[openia-limpo] ${redigirSegredo(error?.stack ?? error, chave)}`)
      process.exitCode = 1
    })
}

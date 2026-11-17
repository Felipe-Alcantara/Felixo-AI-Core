'use strict'

/**
 * Validação do Openia no Felixo EMPACOTADO, num macOS descartável. É a metade
 * macOS da task "Agentes — validar Openia empacotado em macOS e Windows": a de
 * 21/09/2026 só rodou no Windows. Decisão do Felipe em 17/11/2026: o runner
 * `macos-latest` do GitHub Actions substitui o Mac físico (workflow
 * `openia-macos-limpo.yml`), no molde de `openia-windows-limpo.cjs`.
 *
 * O que prova, sem clone do repositório:
 *   0. linha de base (sem Openia, sem Felixo, Python do sistema, `pip list --user`);
 *   1. instalação do `.dmg` real (montar, copiar o .app, desmontar);
 *   2. instalação consentida do Openia via `python3 -m pip install --user`:
 *      recusar, interromper no meio e repetir; se o pip responder
 *      `externally-managed-environment` (Homebrew), o retry com
 *      `--break-system-packages`; e o ponto que só existe no macOS: o `openia`
 *      aparece em `~/Library/Python/<versão>/bin` (`getPythonUserScriptPaths`);
 *   3. chave só pelo campo do app (`key set-stdin` por baixo), terminal Openia,
 *      exportação do canvas e varredura do perfil, logs e exportação atrás do
 *      valor — o único acerto aceitável é o `keys.json` do próprio Openia;
 *   4. desfazer: `keys.json` apagado, app removido e pacotes do pip comparados
 *      com a linha de base.
 *
 * Fora de propósito (só existem no Windows): NSIS, aliases .cmd/.ps1, usuário
 * com espaço e launcher legado. Não prova Gatekeeper nem assinatura do .dmg.
 *
 * A chave vem de `OPENIA_TEST_KEY` (secret). Sem ela usa uma sentinela fictícia:
 * a varredura continua valendo, só o chat real fica de fora. O relatório guarda
 * booleanos e contagens e é conferido contra o valor antes de ser gravado.
 *
 * Uso: node scripts/openia-macos-limpo.cjs --installer <Felixo-...-mac-<arch>.dmg> --out <pasta>
 */

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const crypto = require('node:crypto')
const { spawnSync, execFileSync } = require('node:child_process')
const {
  caminhoParaRelatorio,
  contemSegredo,
  custoDaChave,
  extrairVersao,
  higienizarSaida,
  redigirSegredo,
  varrerSegredo,
} = require('./openia-windows-limpo.cjs')

const APP_DIR = path.resolve(__dirname, '..')
const FELIXO_CLI = path.join(APP_DIR, 'electron', 'cli', 'felixo.cjs')
// O mesmo pino do botão "Instalar" do app, lido do catálogo.
const OPENIA_PACOTE = require('../electron/core/official-cli-catalog.cjs').getOfficialAiCli('openia').install.args.at(-1)
const PRODUTO = 'Felixo AI Core'
const TEMPO_APP_MS = 120_000
const TEMPO_INSTALACAO_MS = 10 * 60_000
/** Teto de gasto que esta validação se impõe (a chave de teste pode não ter limite próprio). */
const TETO_CUSTO_USD = 0.05
const AMBIENTE_DO_APP = Object.freeze({ FELIXO_AUTO_INSTALL_CLIS: '0', FELIXO_DISABLE_AUTO_UPDATE: '1' })

// ---------------------------------------------------------------------------
// Funções puras (cobertas por `openia-macos-limpo.test.cjs`)
// ---------------------------------------------------------------------------

/** Linhas `nome==versão` de `pip list --format=freeze`, sem vazias. */
function parsearFreeze(texto) {
  return new Set(String(texto ?? '').split(/\r?\n/).map((linha) => linha.trim()).filter(Boolean))
}

/** O que o `depois` tem a mais que o `antes`, ordenado. */
function pacotesNovos(antes, depois) {
  return [...depois].filter((pacote) => !antes.has(pacote)).sort()
}

/** Nomes (sem versão) dos pacotes de uma lista `nome==versão`. */
function nomesDosPacotes(pacotes) {
  return pacotes.map((pacote) => pacote.split('==')[0]).filter(Boolean)
}

/** O caminho está em `~/Library/Python/<x.y>/bin/`, onde o `pip --user` grava os scripts no macOS? */
function dentroDeLibraryPython(caminho, home = os.homedir()) {
  if (!caminho || !home) return false
  const base = path.posix.join(String(home).split(path.sep).join('/'), 'Library', 'Python')
  return new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/\\d+\\.\\d+/bin/[^/]+$`).test(String(caminho).split(path.sep).join('/'))
}

/** A mensagem do pip é a do PEP 668 (ambiente gerenciado pelo sistema)? */
function ehPep668(texto) {
  return /externally-managed-environment/i.test(String(texto ?? ''))
}

// ---------------------------------------------------------------------------
// Execução
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const opcoes = { installer: '', out: path.join(APP_DIR, 'release', 'openia-macos-limpo') }
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--installer') opcoes.installer = argv[++i]
    else if (argv[i] === '--out') opcoes.out = argv[++i]
    else throw new Error(`Argumento desconhecido: ${argv[i]}. Uso: --installer <dmg> [--out <pasta>]`)
  }
  if (!opcoes.installer) throw new Error('--installer é obrigatório.')
  return opcoes
}

function rodar(comando, args, opcoes = {}) {
  const resultado = spawnSync(comando, args, {
    encoding: 'utf8',
    timeout: opcoes.timeout ?? 120_000,
    env: opcoes.env ?? process.env,
    cwd: opcoes.cwd,
    input: opcoes.input,
    shell: false,
  })
  return {
    codigo: resultado.status,
    saida: `${resultado.stdout ?? ''}`,
    erro: `${resultado.stderr ?? ''}${resultado.error ? ` ${resultado.error.message}` : ''}`,
  }
}

const esperar = (ms) => new Promise((resolver) => setTimeout(resolver, ms))
const pip = (args, opcoes) => rodar('python3', ['-m', 'pip', ...args], opcoes)
const pacotesDoUsuario = () => parsearFreeze(pip(['list', '--user', '--format=freeze']).saida)

function pipMostra(pacote) {
  const r = pip(['show', pacote])
  return { instalado: r.codigo === 0, versao: /^Version:\s*(.+)$/m.exec(r.saida)?.[1]?.trim() ?? null }
}

let pastaDeEvidencias = null

function runCli(args, env = process.env) {
  return execFileSync(process.execPath, [FELIXO_CLI, 'devtools', ...args], { cwd: APP_DIR, encoding: 'utf8', env })
}

/** Abre o app INSTALADO por `felixo devtools launch --packaged` (perfil isolado) e entrega a página. */
async function comApp(executavel, acao) {
  const { connect, readState } = require('../electron/cli/felixo-devtools.cjs')
  runCli(['launch', '--visible', '--timeout', String(TEMPO_APP_MS), '--packaged', executavel], { ...process.env, ...AMBIENTE_DO_APP })
  const estado = readState()
  const { browser, page } = await connect(estado)
  try {
    await page.waitForFunction(() => Boolean(window.felixo?.cli?.listOfficial), null, { timeout: TEMPO_APP_MS })
    return await acao(page, estado)
  } catch (error) {
    if (pastaDeEvidencias) await page.screenshot({ path: path.join(pastaDeEvidencias, `falha-${Date.now()}.png`) }).catch(() => {})
    throw error
  } finally {
    await browser.close().catch(() => {})
    try {
      runCli(['quit'])
    } catch (error) {
      console.warn(`[openia-mac] falha ao encerrar o app: ${error.message}`)
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
    dentroDeLibraryPython: dentroDeLibraryPython(item.path),
    exigeConfirmacao: Boolean(item.installRequiresConfirmation),
    motivo: item.reason ?? item.detectionReason ?? null,
  }
}

/** Monta o .dmg, copia o .app para uma pasta de teste e desmonta. Devolve o executável. */
function instalarDmg(dmg, destino) {
  const montagem = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-dmg-'))
  const anexar = rodar('hdiutil', ['attach', '-nobrowse', '-readonly', '-mountpoint', montagem, dmg], { timeout: 180_000 })
  if (anexar.codigo !== 0) throw new Error(`hdiutil attach falhou: ${anexar.erro.slice(0, 300)}`)
  try {
    const appNome = fs.readdirSync(montagem).find((nome) => nome.endsWith('.app'))
    if (!appNome) throw new Error('nenhum .app dentro do .dmg')
    fs.mkdirSync(destino, { recursive: true })
    const copiar = rodar('ditto', [path.join(montagem, appNome), path.join(destino, appNome)], { timeout: 180_000 })
    if (copiar.codigo !== 0) throw new Error(`ditto falhou: ${copiar.erro.slice(0, 300)}`)
    const app = path.join(destino, appNome)
    const pastaBin = path.join(app, 'Contents', 'MacOS')
    const binario = fs.existsSync(path.join(pastaBin, PRODUTO)) ? PRODUTO : fs.readdirSync(pastaBin)[0]
    return { app, executavel: path.join(pastaBin, binario) }
  } finally {
    rodar('hdiutil', ['detach', montagem, '-force'])
    fs.rmSync(montagem, { recursive: true, force: true })
  }
}

async function main(argv = process.argv.slice(2)) {
  if (process.platform !== 'darwin') throw new Error('Este roteiro só roda no macOS.')
  const opcoes = parseArgs(argv)
  fs.mkdirSync(opcoes.out, { recursive: true })
  pastaDeEvidencias = opcoes.out
  const chaveReal = Boolean(process.env.OPENIA_TEST_KEY?.trim())
  const chave = process.env.OPENIA_TEST_KEY?.trim() || `sk-or-v1-sentinela${crypto.randomBytes(24).toString('hex')}`
  const home = os.homedir()
  const relatorio = {
    schemaVersion: 1,
    geradoEm: new Date().toISOString(),
    runner: { sistema: `${os.type()} ${os.release()} ${process.arch}`, chave: chaveReal ? 'real (secret do workflow)' : 'sentinela fictícia' },
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
    console.log(`[openia-mac] ${nome}: ${itens[nome].ok ? 'ok' : 'FALHOU'}`)
  }

  relatorio.custo.antes = await custoDaChave(chave)

  // 0 — Linha de base: o runner é "com Python e sem Openia", e o pip --user é fotografado para o desfazer.
  let baseline = new Set()
  await etapa('0-linha-de-base', async () => {
    baseline = pacotesDoUsuario()
    const which = rodar('which', ['openia'])
    const py = rodar('python3', ['--version'])
    const info = rodar('python3', ['-c', "import sys, sysconfig, os; print(sysconfig.get_path('scripts', 'posix_user')); print(os.path.exists(os.path.join(sysconfig.get_path('stdlib'), 'EXTERNALLY-MANAGED')))"])
    const [scriptsDoUsuario, gerenciado] = info.saida.trim().split('\n')
    return {
      openiaNoPath: which.codigo === 0,
      python3: extrairVersao(`${py.saida}${py.erro}`),
      pythonGerenciadoPeloSistema: gerenciado === 'True',
      pastaDeScriptsDoPipUser: caminhoParaRelatorio(scriptsDoUsuario, home),
      openiaPip: pipMostra('openia'),
      felixoInstalado: fs.existsSync('/Applications/Felixo AI Core.app'),
      pacotesNoPipUser: baseline.size,
      ok: which.codigo !== 0 && py.codigo === 0 && !pipMostra('openia').instalado,
    }
  })

  // 1 — .dmg real: montar, copiar o .app, desmontar.
  const pastaApp = path.join(home, 'Felixo Teste')
  let instalacao = null
  await etapa('1-dmg', async () => {
    instalacao = instalarDmg(opcoes.installer, pastaApp)
    const quarentena = rodar('xattr', ['-p', 'com.apple.quarantine', instalacao.app])
    const plist = rodar('plutil', ['-extract', 'CFBundleShortVersionString', 'raw', '-o', '-', path.join(instalacao.app, 'Contents', 'Info.plist')])
    relatorio.versaoApp = plist.saida.trim() || null
    return {
      versao: relatorio.versaoApp,
      executavelExiste: fs.existsSync(instalacao.executavel),
      comQuarentena: quarentena.codigo === 0,
      ok: fs.existsSync(instalacao.executavel),
    }
  })
  if (!instalacao?.executavel) return finalizar(relatorio, falhas, opcoes, chave)
  const exe = instalacao.executavel

  // 2 — Instalação consentida: recusar, interromper no meio, repetir; achar o openia em ~/Library/Python.
  await etapa('2-instalacao-consentida', async () => {
    return comApp(exe, async (page) => {
      const antes = resumoDaDeteccao(await catalogoOpenia(page))
      const recusa = await page.evaluate(() => window.felixo.cli.installOfficial({ id: 'openia', confirmed: false }))
      const depoisDaRecusa = pipMostra('openia')

      await page.evaluate(() => {
        window.__felixoInstalacao = undefined
        window.felixo.cli.installOfficial({ id: 'openia', confirmed: true })
          .then((resultado) => { window.__felixoInstalacao = resultado })
          .catch((error) => { window.__felixoInstalacao = { ok: false, message: String(error) } })
      })
      // Interromper no meio: o pip é encerrado, como fechar o app durante a instalação.
      let interrompidos = []
      const limite = Date.now() + 120_000
      while (Date.now() < limite && interrompidos.length === 0) {
        const pids = rodar('pgrep', ['-f', 'pip.* install .*Openia']).saida.split('\n').map((l) => l.trim()).filter(Boolean)
        if (pids.length > 0) {
          await esperar(1_500)
          for (const pid of pids) {
            rodar('pkill', ['-9', '-P', pid])
            rodar('kill', ['-9', pid])
          }
          interrompidos = pids
        } else {
          await esperar(200)
        }
      }
      await page.waitForFunction(() => window.__felixoInstalacao !== undefined, null, { timeout: TEMPO_INSTALACAO_MS })
      const interrompida = await page.evaluate(() => window.__felixoInstalacao)
      const depoisDaInterrupcao = pipMostra('openia')

      const repetida = await page.evaluate(() => window.felixo.cli.installOfficial({ id: 'openia', confirmed: true }))
      const depois = resumoDaDeteccao(await catalogoOpenia(page))
      return {
        antes,
        recusa: { ok: Boolean(recusa?.ok), exigiuConfirmacao: Boolean(recusa?.requiresConfirmation), pipDepois: depoisDaRecusa },
        interrupcao: {
          // Pode ser 0 se o pip terminou antes do primeiro sinal: o roteiro não força a corrida.
          processosEncerrados: interrompidos.length,
          resultado: { ok: Boolean(interrompida?.ok), mensagem: redigirSegredo(interrompida?.message ?? '', chave).slice(0, 300) },
          pipDepois: depoisDaInterrupcao,
        },
        repeticao: {
          ok: Boolean(repetida?.ok),
          retentouComBreakSystemPackages: Boolean(repetida?.retriedWithBreakSystemPackages),
          mensagem: redigirSegredo(repetida?.message ?? '', chave).slice(0, 300),
        },
        depois,
        openiaPip: pipMostra('openia'),
        ok: antes.detectado === false && recusa?.requiresConfirmation === true && !depoisDaRecusa.instalado &&
          repetida?.ok === true && depois.detectado === true && depois.dentroDeLibraryPython === true,
      }
    })
  })

  // 3 — Canvas com terminal Openia, chave pelo campo do app, exportação e disco varridos.
  await etapa('3-chave-chat-e-exportacao', async () => {
    return comApp(exe, async (page, estado) => {
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
        await page.keyboard.press('Escape')
      }
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
          await page.locator('.react-flow__node').first().getByRole('button', { name: 'Expandir terminal' }).click()
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
      // O bloco só chega ao banco pelo autosave; exportar antes saía com 0 blocos.
      const limiteDoAutosave = Date.now() + 60_000
      let blocosSalvos = 0
      while (Date.now() < limiteDoAutosave) {
        blocosSalvos = await page.evaluate(async () => (await window.felixo.canvas.list())?.nodes?.length ?? 0)
        if (blocosSalvos > 0) break
        await esperar(500)
      }
      if (blocosSalvos === 0) throw new Error('o bloco do terminal Openia não foi gravado no canvas em 60 s')
      const exportacao = await page.evaluate(async () => {
        const nodes = await window.felixo.canvas.list()
        const edges = await window.felixo.canvas.listEdges()
        return window.felixo.canvas.exportBundle({ nodes: nodes.nodes ?? [], edges: edges.edges ?? [] })
      })
      if (!exportacao?.ok) throw new Error(`exportação falhou: ${exportacao?.message}`)
      const textoExportado = JSON.stringify(exportacao.bundle, null, 2)
      const vazouNaExportacao = contemSegredo(textoExportado, chave)
      fs.writeFileSync(path.join(opcoes.out, 'canvas-exportado.fxcanvas'), vazouNaExportacao ? redigirSegredo(textoExportado, chave) : textoExportado, 'utf8')
      const nodesOpenia = exportacao.bundle.nodes.filter((node) => JSON.stringify(node).toLowerCase().includes('openia'))

      // Onde a chave aparece no disco: o único lugar esperado é o keys.json do próprio Openia.
      const pacoteOpenia = rodar('python3', ['-c', 'import openia, os; print(os.path.dirname(openia.__file__))']).saida.trim()
      const apoio = path.join(home, 'Library', 'Application Support')
      const varredura = varrerSegredo([
        estado.userData,
        path.join(apoio, PRODUTO),
        path.join(apoio, 'felixo-ai-core'),
        path.join(home, 'Library', 'Logs', PRODUTO),
        path.join(os.tmpdir(), 'felixo-ai-core'),
        path.join(apoio, 'io.datasette.llm'),
        pacoteOpenia,
        opcoes.out,
      ], chave)
      const forasDoEsperado = varredura.comSegredo.filter((arquivo) => path.basename(arquivo) !== 'keys.json' || !pacoteOpenia || !arquivo.startsWith(pacoteOpenia))

      // Desfaz: a chave sai do Openia antes de fechar o app.
      if (pacoteOpenia) fs.rmSync(path.join(pacoteOpenia, 'keys.json'), { force: true })
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
          comChave: varredura.comSegredo.map((arquivo) => caminhoParaRelatorio(arquivo, home)),
          foraDoEsperado: forasDoEsperado.map((arquivo) => caminhoParaRelatorio(arquivo, home)),
        },
        chaveRemovidaNoFim: !(statusDepois?.configured === true),
        ok: nodesOpenia.length > 0 && !vazouNaExportacao && !contemSegredo(textoDaTela, chave) && forasDoEsperado.length === 0 &&
          (!chat.tentado || chat.respondeuPong === true),
      }
    })
  })

  // 4 — Desfazer: app removido e pip --user de volta à linha de base.
  await etapa('4-desfazer', async () => {
    fs.rmSync(pastaApp, { recursive: true, force: true })
    const novos = pacotesNovos(baseline, pacotesDoUsuario())
    const nomes = nomesDosPacotes(novos)
    let usouBreakSystemPackages = false
    if (nomes.length > 0) {
      let r = pip(['uninstall', '-y', ...nomes], { timeout: 180_000 })
      if (r.codigo !== 0 && ehPep668(`${r.saida}${r.erro}`)) {
        usouBreakSystemPackages = true
        r = pip(['uninstall', '-y', '--break-system-packages', ...nomes], { timeout: 180_000 })
      }
    }
    const sobraram = pacotesNovos(baseline, pacotesDoUsuario())
    return {
      pacotesAdicionadosPeloPip: novos,
      desinstalouComBreakSystemPackages: usouBreakSystemPackages,
      pacotesQueSobraram: sobraram,
      appRemovido: !fs.existsSync(pastaApp),
      ok: sobraram.length === 0 && !fs.existsSync(pastaApp),
    }
  })

  relatorio.custo.depois = await custoDaChave(chave)
  if (relatorio.custo.antes?.uso != null && relatorio.custo.depois?.uso != null) {
    relatorio.custo.gastoUsd = Math.round((relatorio.custo.depois.uso - relatorio.custo.antes.uso) * 1e6) / 1e6
    relatorio.custo.dentroDoTeto = relatorio.custo.gastoUsd <= TETO_CUSTO_USD
  }
  return finalizar(relatorio, falhas, opcoes, chave)
}

function finalizar(relatorio, falhas, opcoes, chave) {
  relatorio.falhas = falhas
  relatorio.resultado = falhas.length === 0 ? 'passou' : 'falhou'
  let texto = JSON.stringify(relatorio, null, 2)
  // Última trava: o relatório vira artefato do workflow.
  if (contemSegredo(texto, chave)) {
    relatorio.chaveRedigidaNoRelatorio = true
    texto = redigirSegredo(JSON.stringify(relatorio, null, 2), chave)
  }
  texto = higienizarSaida(texto)
  fs.writeFileSync(path.join(opcoes.out, 'openia-macos-limpo.json'), `${texto}\n`, 'utf8')
  console.log(texto)
  return falhas.length === 0 ? 0 : 1
}

module.exports = {
  dentroDeLibraryPython,
  ehPep668,
  nomesDosPacotes,
  pacotesNovos,
  parsearFreeze,
}

if (require.main === module) {
  main()
    .then((codigo) => {
      process.exitCode = codigo
    })
    .catch((error) => {
      console.error(`[openia-mac] ${redigirSegredo(error?.stack ?? error, process.env.OPENIA_TEST_KEY?.trim())}`)
      process.exitCode = 1
    })
}

'use strict'

/**
 * Validação dos links no app EMPACOTADO: um clique num link abre o navegador
 * de verdade, uma vez, com o endereço intacto.
 *
 * Nasceu da task "validar abertura de links no app empacotado nos três SOs"
 * (29/09/2026). O smoke da CI (sessão D, `canvas-smoke-links.cjs`) prova o
 * menu no app de desenvolvimento, com `window.open` trocado por um gravador;
 * este script prova o resto do caminho no binário instalado:
 *
 *   gesto → menu → "Abrir no navegador" → processo principal (política de
 *   novo) → `shell.openExternal` → sistema → navegador → servidor local
 *
 * O servidor é deste script, em 127.0.0.1, numa porta livre: nada sai da
 * máquina, e cada endereço tem um caminho único, então a contagem de pedidos
 * que chegam é a contagem de aberturas. Não roda no release (decisão do
 * Felipe: "só desta vez"); fica aqui como ferramenta, para repetir à mão ou
 * num workflow temporário.
 *
 * Modos de navegador (`--navegador`):
 *   - `real`: o navegador padrão do sistema (o do runner, na CI).
 *   - `curl` (Linux): um `xdg-open` falso no PATH faz o pedido com `curl` e
 *     grava os argumentos. Para rodar numa máquina de trabalho sem abrir o
 *     navegador logado de ninguém.
 *   - `ausente` (Linux): um `xdg-open` que falha, como um sistema sem
 *     navegador padrão. Prova o aviso "Não foi possível abrir no navegador":
 *     no Linux quem roda o `xdg-open` é o app (`linux-xdg-open.cjs`), porque o
 *     do Electron não espera a saída dele e nunca vê a falha.
 *
 * Uso: node scripts/packaged-links-check.cjs --release-dir release
 *        [--artifact caminho] [--navegador real|curl|ausente]
 *        [--report arquivo.json] [--capturas pasta] [--timeout ms]
 */

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const http = require('node:http')
const crypto = require('node:crypto')
const { execFileSync } = require('node:child_process')

const { prepareArtifact, resolveReleaseArtifact, sanitizeDiagnostic } = require('./release-smoke.cjs')

const APP_DIR = path.resolve(__dirname, '..')
const FELIXO_CLI = path.join(APP_DIR, 'electron', 'cli', 'felixo.cjs')
const { connect, readState } = require('../electron/cli/felixo-devtools.cjs')

const NOTE_ID = 'links-empacotado-nota'
const TERMINAL_ID = 'links-empacotado-terminal'
const WEBPAGE_ID = 'links-empacotado-pagina'
const MODIFICADOR = process.platform === 'darwin' ? 'Meta' : 'Control'
/** Depois do primeiro pedido, quanto esperar para ter certeza de que não vem outro. */
const JANELA_DE_REPETICAO_MS = 4_000

function parseArgs(argv) {
  const options = {
    releaseDir: 'release',
    artifact: '',
    navegador: 'real',
    report: '',
    capturas: '',
    timeoutMs: 45_000,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    const next = () => {
      const proximo = argv[index + 1]
      if (proximo === undefined) throw new Error(`${value} precisa de um valor.`)
      index += 1
      return proximo
    }
    if (value === '--release-dir') options.releaseDir = next()
    else if (value === '--artifact') options.artifact = next()
    else if (value === '--navegador') options.navegador = next()
    else if (value === '--report') options.report = next()
    else if (value === '--capturas') options.capturas = next()
    else if (value === '--timeout') options.timeoutMs = Number.parseInt(next(), 10)
    else throw new Error(`Opção desconhecida: ${value}`)
  }
  if (!['real', 'curl', 'ausente'].includes(options.navegador)) {
    throw new Error('--navegador aceita real, curl ou ausente.')
  }
  if (options.navegador !== 'real' && process.platform !== 'linux') {
    throw new Error(`--navegador ${options.navegador} troca o xdg-open: só existe no Linux.`)
  }
  if (!Number.isInteger(options.timeoutMs) || options.timeoutMs <= 0) {
    throw new Error('--timeout precisa ser um número inteiro de milissegundos.')
  }
  return options
}

/**
 * Os casos. `caminho` é o que vai no link (sob o prefixo único da rodada);
 * `esperado` é o que o servidor precisa receber, já decodificado (o fragmento
 * nunca vai ao servidor, e cada navegador codifica diferente o que não é
 * ASCII, então a comparação é depois de decodificar).
 */
function casosDaRodada(marcadorDeInjecao) {
  return [
    { id: 'markdown-simples', origem: 'markdown', caminho: '/simples', esperado: '/simples' },
    {
      id: 'terminal-porta-e-consulta',
      origem: 'terminal',
      caminho: '/consulta?a=1&b=dois#fragmento',
      esperado: '/consulta?a=1&b=dois',
    },
    {
      id: 'terminal-unicode',
      origem: 'terminal',
      caminho: '/ação/café?q=ünï',
      esperado: '/ação/café?q=ünï',
    },
    {
      id: 'terminal-pontuacao-em-volta',
      origem: 'terminal',
      caminho: '/pontuacao',
      // O texto da tela embrulha o link em parênteses e ponto final; o
      // detector de links do terminal não pode levá-los junto.
      texto: (url) => `(veja ${url}).`,
      esperado: '/pontuacao',
    },
    {
      id: 'markdown-injecao-de-shell',
      origem: 'markdown',
      // Se algum elo do caminho passasse o endereço por um shell, estes
      // pedaços criariam os arquivos-marcador. A URL tem de chegar inteira ao
      // servidor, e nenhum marcador pode existir depois.
      // `${IFS}` é o espaço do shell: a URL não pode ter espaço literal.
      caminho: injecao(marcadorDeInjecao),
      esperado: injecao(marcadorDeInjecao),
    },
    { id: 'pagina-web-botao', origem: 'botao-pagina-web', caminho: '/pagina', esperado: '/pagina' },
  ]
}

function injecao(marcador) {
  const touch = (letra) => `touch\${IFS}${marcador}-${letra}`
  return `/injecao?a=$(${touch('a')})&b=;${touch('b')};&c=|${touch('c')}`
}

const RECUSADOS = [
  { id: 'markdown-file', rotulo: 'arquivo local', href: 'file:///etc/hosts' },
]

// --- servidor local -----------------------------------------------------------

/** Servidor que conta os pedidos sob o prefixo da rodada (o resto é ignorado). */
async function subirServidor(prefixo) {
  const pedidos = []
  const server = http.createServer((request, response) => {
    const url = request.url ?? ''
    if (url.startsWith(prefixo)) {
      pedidos.push({
        caminho: url.slice(prefixo.length),
        agente: String(request.headers['user-agent'] ?? '').slice(0, 160),
        em: Date.now(),
      })
    }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', connection: 'close' })
    response.end('<!doctype html><meta charset="utf-8"><title>Felixo: link aberto</title><p>O Felixo AI Core abriu este link.</p>')
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()
  return {
    base: `http://127.0.0.1:${port}${prefixo}`,
    pedidos,
    fechar: () =>
      new Promise((resolve) => {
        server.close(resolve)
        server.closeAllConnections()
      }),
  }
}

/**
 * O pedido veio do app, e não do navegador? O bloco Página Web do canvas
 * carrega uma página do mesmo servidor, e o `<webview>` se identifica com
 * `Electron/` (o app não troca o user-agent). Esses pedidos não contam como
 * abertura.
 */
function pedidoDoApp(pedido) {
  return /\bElectron\//.test(pedido.agente)
}

/**
 * O veredito de um caso: dos pedidos que chegaram desde o clique, os do
 * navegador (os do app ficam de fora) têm de ser exatamente um, no caminho
 * esperado.
 *
 * @param {{ caminho: string, agente: string }[]} pedidos
 * @param {string} esperado
 */
function julgarCaso(pedidos, esperado) {
  const doNavegador = pedidos.filter((pedido) => !pedidoDoApp(pedido))
  const noCaminho = doNavegador.filter((pedido) => decodificar(pedido.caminho) === decodificar(esperado))
  return { ok: doNavegador.length === 1 && noCaminho.length === 1, doNavegador, noCaminho }
}

function decodificar(texto) {
  try {
    return decodeURIComponent(texto)
  } catch {
    return texto
  }
}

// --- navegador falso (Linux) -----------------------------------------------------

/** Pasta com um `xdg-open` falso, para pôr na frente do PATH do app. */
function prepararXdgOpenFalso(modo, raiz) {
  const pasta = path.join(raiz, 'xdg-open-falso')
  fs.mkdirSync(pasta, { recursive: true })
  const log = path.join(raiz, 'xdg-open.log')
  const corpo =
    modo === 'curl'
      ? `#!/bin/sh\nprintf '%s\\n' "$#" "$@" >> '${log}'\nexec curl -s -o /dev/null --max-time 10 "$1"\n`
      : `#!/bin/sh\nprintf 'ausente %s\\n' "$@" >> '${log}'\nexit 3\n`
  const arquivo = path.join(pasta, 'xdg-open')
  fs.writeFileSync(arquivo, corpo, { mode: 0o755 })
  return { pasta, log }
}

// --- sessão do app empacotado --------------------------------------------------------

function felixoDevtools(args, env) {
  execFileSync(process.execPath, [FELIXO_CLI, 'devtools', ...args], { cwd: APP_DIR, env, stdio: 'inherit' })
}

async function esperarAte(descricao, condicao, timeoutMs, intervaloMs = 200) {
  const limite = Date.now() + timeoutMs
  while (Date.now() < limite) {
    if (await condicao()) return
    await pausa(intervaloMs)
  }
  throw new Error(`${descricao}: não aconteceu em ${timeoutMs} ms`)
}

const pausa = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function prepararCanvas(page, { base, marcador, timeoutMs }) {
  const linhasMarkdown = [
    ...casosDaRodada(marcador)
      .filter((caso) => caso.origem === 'markdown')
      .map((caso) => `- [${caso.id}](${base}${caso.caminho})`),
    ...RECUSADOS.map((caso) => `- ${caso.rotulo}: [${caso.id}](${caso.href})`),
  ].join('\n')
  const nodes = [
    {
      id: NOTE_ID,
      type: 'note',
      position: { x: 0, y: 0 },
      width: 460,
      height: 260,
      data: { label: 'Links do app empacotado', text: linhasMarkdown },
    },
    {
      id: TERMINAL_ID,
      type: 'terminal',
      position: { x: 0, y: 320 },
      width: 560,
      height: 360,
      data: { label: 'Terminal dos links', command: 'codex', args: [], cwd: '', launchMode: 'agent' },
    },
    {
      id: WEBPAGE_ID,
      type: 'webpage',
      position: { x: 620, y: 0 },
      width: 520,
      height: 380,
      data: { label: 'Página dos links', url: `${base}/pagina` },
    },
  ]
  const result = await page.evaluate(async (fixture) => {
    const bridge = window.felixo.canvas
    const cleared = await bridge.clear()
    if (!cleared?.ok) return { ok: false, message: cleared?.message }
    for (const node of fixture) {
      const saved = await bridge.save(node)
      if (!saved?.ok) return { ok: false, message: saved?.message ?? node.id }
    }
    return { ok: true }
  }, nodes)
  if (!result.ok) throw new Error(`O canvas de teste não foi gravado: ${result.message}`)
  await page.reload()
  await page.waitForFunction(() => document.querySelector('[data-felixo-hydrated="true"]') !== null, null, { timeout: 60_000 })
  await esperarAte(
    'os blocos de teste montarem',
    () => page.evaluate((ids) => ids.every((id) => document.querySelector(`.react-flow__node[data-id="${id}"]`)), [NOTE_ID, TERMINAL_ID, WEBPAGE_ID]),
    timeoutMs,
  )
}

/** A gaveta do terminal ocupa a lateral: com ela aberta, a nota centralizada cai embaixo da barra. */
async function fecharGavetaDoTerminal(page) {
  const fechar = page.getByRole('button', { name: 'Fechar terminal' })
  if (await fechar.isVisible().catch(() => false)) {
    await fechar.click()
    await pausa(400)
  }
}

async function focar(page, titulo) {
  const item = page.locator(`button[title="${titulo}"]`).first()
  if (!(await item.isVisible())) {
    const abrir = page.getByRole('button', { name: 'Abrir elementos' })
    if (await abrir.isVisible()) await abrir.click()
  }
  await item.click()
  await pausa(500)
}

/** Escolhe "Abrir no navegador" e devolve o resumo do menu e o instante do clique. */
async function escolherAbrirNoNavegador(page, timeoutMs) {
  const menu = page.locator('[data-felixo-link-chooser]')
  await menu.waitFor({ state: 'visible', timeout: timeoutMs })
  const resumo = (await menu.textContent()) ?? ''
  const item = menu.locator('[data-link-choice="abrir-no-navegador"]')
  await item.waitFor({ state: 'visible', timeout: timeoutMs })
  const clicadoEm = Date.now()
  await item.click()
  await menu.waitFor({ state: 'detached', timeout: timeoutMs })
  return { resumo, clicadoEm }
}

/**
 * Clica no link da nota pelo nome (o id do caso). O `href` renderizado é a
 * forma que a política serializa, não o texto escrito no Markdown.
 */
async function abrirLinkDaNota(page, nome, timeoutMs) {
  await fecharGavetaDoTerminal(page)
  await focar(page, 'Links do app empacotado')
  const nota = page.locator(`.react-flow__node[data-id="${NOTE_ID}"]`)
  const visualizar = nota.getByRole('button', { name: 'Visualizar nota' })
  if (await visualizar.isVisible().catch(() => false)) await visualizar.click()
  const link = nota.getByRole('link', { name: nome, exact: true })
  await link.waitFor({ state: 'visible', timeout: timeoutMs })
  await link.click()
}

async function abrirTerminal(page, timeoutMs) {
  await focar(page, 'Terminal dos links')
  const xterm = page.locator('.xterm-helper-textarea').last()
  await xterm.waitFor({ state: 'attached', timeout: timeoutMs })
  await esperarAte('o prompt da CLI roteirizada', () => terminalContem(page, 'Nenhum processo externo'), timeoutMs)
  return xterm
}

function terminalContem(page, trecho) {
  return page.evaluate((procurado) =>
    [...document.querySelectorAll('.xterm-rows')].some((rows) =>
      (rows.textContent ?? '').replace(/\u00a0/g, ' ').includes(procurado)), trecho)
}

/** Centro do trecho `texto` na última ocorrência dele no xterm da gaveta, depois que a tela parou. */
async function posicaoNoTerminal(page, texto, timeoutMs) {
  const ler = () => page.evaluate((procurado) => {
    const rows = [...document.querySelectorAll('.xterm-rows')].at(-1)
    if (!rows) return null
    for (const row of [...rows.children].reverse()) {
      const nodes = []
      const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT)
      let full = ''
      while (walker.nextNode()) {
        nodes.push({ node: walker.currentNode, start: full.length })
        full += walker.currentNode.textContent.replace(/\u00a0/g, ' ')
      }
      const at = full.indexOf(procurado)
      if (at < 0) continue
      const locate = (offset) => {
        const entry = nodes.findLast((item) => item.start <= offset)
        return [entry.node, offset - entry.start]
      }
      const range = document.createRange()
      range.setStart(...locate(at))
      range.setEnd(...locate(at + Math.min(procurado.length, 30) - 1))
      const rect = range.getBoundingClientRect()
      return { x: rect.left + Math.min(rect.width / 2, 40), y: rect.top + rect.height / 2 }
    }
    return null
  }, texto)
  const limite = Date.now() + timeoutMs
  let antes = await ler()
  while (Date.now() < limite) {
    await pausa(250)
    const depois = await ler()
    if (antes && depois && antes.x === depois.x && antes.y === depois.y) return depois
    antes = depois
  }
  throw new Error(`"${texto.slice(0, 60)}" não parou num lugar do terminal`)
}

async function digitar(page, xterm, linha) {
  await xterm.focus()
  await page.keyboard.press('Control+C')
  await page.keyboard.type(linha)
  await page.keyboard.press('Enter')
}

async function abrirLinkDoTerminal(page, xterm, textoNaTela, inicioDoLink, timeoutMs) {
  await digitar(page, xterm, textoNaTela)
  await esperarAte('o link aparecer no terminal', () => terminalContem(page, inicioDoLink), timeoutMs)
  const ponto = await posicaoNoTerminal(page, inicioDoLink, timeoutMs)
  // O mouse sai de cima do terminal antes: o detector de links do xterm só
  // procura link quando o ponteiro muda de célula.
  await page.mouse.move(2, 2)
  await page.mouse.move(ponto.x - 3, ponto.y)
  await page.mouse.move(ponto.x, ponto.y)
  await esperarAte('a dica do link no terminal', () =>
    page.evaluate(() => ([...document.querySelectorAll('.xterm')].at(-1)?.getAttribute('title') ?? '').includes('escolher onde abrir')), timeoutMs)
  await page.keyboard.down(MODIFICADOR)
  await page.mouse.click(ponto.x, ponto.y)
  await page.keyboard.up(MODIFICADOR)
}

// --- rodada ------------------------------------------------------------------------------

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv)
  const releaseDir = path.resolve(options.releaseDir)
  const report = {
    schemaVersion: 1,
    platform: process.platform,
    arch: process.arch,
    navegador: options.navegador,
    iniciadoEm: new Date().toISOString(),
    artefato: null,
    versaoDoApp: null,
    casos: [],
    recusados: [],
    injecao: null,
    terminalRespondeDepois: null,
    avisoDeFalha: null,
    result: 'failed',
    erro: null,
  }
  const reportPath = path.resolve(options.report || path.join(releaseDir, `packaged-links-${process.platform}.json`))
  const capturas = path.resolve(options.capturas || path.join(releaseDir, `packaged-links-capturas-${process.platform}`))
  fs.mkdirSync(capturas, { recursive: true })

  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-links-empacotado-'))
  const nonce = crypto.randomBytes(6).toString('hex')
  const prefixo = `/felixo-links/${nonce}`
  const marcador = path.join(raiz, `injecao-${nonce}`).replace(/\\/g, '/')
  const servidor = await subirServidor(prefixo)
  let sessaoAberta = false
  let browser = null
  const env = {
    ...process.env,
    FELIXO_DEVTOOLS_MOCK_PTY: '0',
    FELIXO_DEVTOOLS_FAKE_CLI_PTY: '1',
  }
  delete env.FELIXO_DEVTOOLS_SHELL_OPEN
  let xdgFalso = null
  if (options.navegador !== 'real') {
    xdgFalso = prepararXdgOpenFalso(options.navegador, raiz)
    env.PATH = `${xdgFalso.pasta}${path.delimiter}${env.PATH ?? ''}`
  }

  const capturar = async (page, nome) => {
    await page.screenshot({ path: path.join(capturas, `${nome}.png`) }).catch(() => {})
  }

  try {
    const artifactPath = resolveReleaseArtifact({ releaseDir, explicitArtifact: options.artifact })
    report.artefato = path.basename(artifactPath)
    const prepared = prepareArtifact({ artifactPath, temporaryRoot: raiz })

    felixoDevtools(['launch', '--packaged', prepared.executable, '--timeout', String(Math.max(options.timeoutMs, 60_000))], env)
    sessaoAberta = true
    const conexao = await connect(readState())
    browser = conexao.browser
    const page = conexao.page
    await page.waitForFunction(() => document.querySelector('[data-felixo-hydrated="true"]') !== null, null, { timeout: 60_000 })
    report.versaoDoApp = await page.evaluate(() => window.felixo?.getVersion?.() ?? null)

    await prepararCanvas(page, { base: servidor.base, marcador, timeoutMs: options.timeoutMs })
    // A carga da página no bloco chega antes dos casos, para não cair dentro
    // da janela de nenhum deles.
    await esperarAte(
      'o bloco Página Web carregar a página do servidor',
      () => servidor.pedidos.some((pedido) => pedidoDoApp(pedido) && pedido.caminho === '/pagina'),
      options.timeoutMs,
    )
    await capturar(page, '00-canvas')

    const casos = casosDaRodada(marcador)
    let xterm = null
    for (const caso of options.navegador === 'ausente' ? casos.slice(0, 1) : casos) {
      const url = `${servidor.base}${caso.caminho}`
      let antes = servidor.pedidos.length
      let inicio = Date.now()
      if (caso.origem === 'markdown') {
        await abrirLinkDaNota(page, caso.id, options.timeoutMs)
      } else if (caso.origem === 'terminal') {
        xterm = xterm ?? (await abrirTerminal(page, options.timeoutMs))
        const texto = caso.texto ? caso.texto(url) : url
        await abrirLinkDoTerminal(page, xterm, texto, url.split('#')[0].slice(0, 60), options.timeoutMs)
      } else {
        await fecharGavetaDoTerminal(page)
        await focar(page, 'Página dos links')
        // Depois do foco: remontar o bloco recarrega o `<webview>` (pedido do app).
        antes = servidor.pedidos.length
        inicio = Date.now()
        await page.locator(`.react-flow__node[data-id="${WEBPAGE_ID}"]`).getByRole('button', { name: 'Abrir esta página no navegador' }).click()
      }

      const registro = { id: caso.id, origem: caso.origem, esperado: caso.esperado, resumoDoMenu: null, pedidos: [], latenciaMs: null, ok: false }
      if (caso.origem !== 'botao-pagina-web') {
        const escolha = await escolherAbrirNoNavegador(page, options.timeoutMs)
        registro.resumoDoMenu = escolha.resumo.slice(0, 300)
        inicio = escolha.clicadoEm
      }
      await capturar(page, `${String(report.casos.length + 1).padStart(2, '0')}-${caso.id}`)

      if (options.navegador === 'ausente') {
        report.avisoDeFalha = await conferirAvisoDeFalha(page, url, options.timeoutMs)
        await capturar(page, 'aviso-de-falha')
        report.casos.push(registro)
        break
      }

      const doNavegadorDesde = () => servidor.pedidos.slice(antes).filter((pedido) => !pedidoDoApp(pedido))
      await esperarAte(`o navegador pedir ${caso.id}`, () => doNavegadorDesde().length > 0, options.timeoutMs, 100)
      // Do clique à chegada do pedido no servidor (o instante é o do servidor).
      registro.latenciaMs = doNavegadorDesde()[0].em - inicio
      await pausa(JANELA_DE_REPETICAO_MS)
      registro.pedidos = servidor.pedidos.slice(antes).map((pedido) => ({ caminho: pedido.caminho, agente: pedido.agente }))
      registro.ok = julgarCaso(registro.pedidos, caso.esperado).ok
      report.casos.push(registro)
    }

    if (options.navegador !== 'ausente') {
      // Os recusados: o menu diz o motivo e só oferece copiar; nada chega ao servidor.
      for (const caso of RECUSADOS) {
        const antes = servidor.pedidos.length
        // O recusado não é `<a>`: o botão ao lado dele pede o menu.
        await fecharGavetaDoTerminal(page)
        await focar(page, 'Links do app empacotado')
        await page.locator(`.react-flow__node[data-id="${NOTE_ID}"] [data-refused-link] + button[aria-label="Por que este link não abre"]`).first().click()
        const menu = page.locator('[data-felixo-link-chooser]')
        await menu.waitFor({ state: 'visible', timeout: options.timeoutMs })
        const escolhas = await menu.locator('[data-link-choice]').evaluateAll((items) => items.map((item) => item.getAttribute('data-link-choice')))
        await page.keyboard.press('Escape')
        await pausa(1_000)
        report.recusados.push({ id: caso.id, escolhas, pedidos: servidor.pedidos.length - antes, ok: escolhas.join(',') === 'copiar-link' && servidor.pedidos.length === antes })
      }

      const marcadores = ['a', 'b', 'c'].map((letra) => `${marcador}-${letra}`)
      report.injecao = { marcadoresCriados: marcadores.filter((arquivo) => fs.existsSync(arquivo)).length }
      // Uma duplicata atrasada do último caso só aparece aqui: no total, o
      // navegador pediu exatamente uma vez por caso.
      report.pedidosDoNavegador = servidor.pedidos.filter((pedido) => !pedidoDoApp(pedido)).length

      // Abrir links não travou o terminal: ele ainda ecoa o que se digita. A
      // gaveta fechou para os casos da nota: abre de novo.
      xterm = await abrirTerminal(page, options.timeoutMs)
      await digitar(page, xterm, `ainda-responde-${nonce}`)
      report.terminalRespondeDepois = await esperarAte(
        'o terminal ecoar o que se digitou',
        () => terminalContem(page, `ainda-responde-${nonce}`),
        options.timeoutMs,
      ).then(() => true, () => false)
      await capturar(page, '99-terminal-depois')
    }

    const falhas = [
      ...report.casos.filter((caso) => !caso.ok && options.navegador !== 'ausente').map((caso) => `caso ${caso.id}`),
      ...report.recusados.filter((caso) => !caso.ok).map((caso) => `recusado ${caso.id}`),
      ...(report.injecao?.marcadoresCriados ? ['injeção de shell criou marcador'] : []),
      ...(options.navegador !== 'ausente' && report.terminalRespondeDepois !== true ? ['terminal parou de responder'] : []),
      ...(options.navegador !== 'ausente' && report.pedidosDoNavegador !== report.casos.length
        ? [`o navegador fez ${report.pedidosDoNavegador} pedidos para ${report.casos.length} casos`]
        : []),
      ...(options.navegador === 'ausente' && !report.avisoDeFalha?.ok ? ['aviso de falha'] : []),
    ]
    report.result = falhas.length ? 'failed' : 'passed'
    if (falhas.length) report.erro = `Falhou: ${falhas.join('; ')}`
  } catch (error) {
    report.result = 'failed'
    report.erro = sanitizeDiagnostic(error)
  } finally {
    await browser?.close().catch(() => {})
    if (sessaoAberta) {
      try {
        felixoDevtools(['quit'], env)
      } catch (error) {
        report.erroAoEncerrar = sanitizeDiagnostic(error)
      }
    }
    await servidor.fechar()
    if (xdgFalso && fs.existsSync(xdgFalso.log)) {
      report.xdgOpen = fs.readFileSync(xdgFalso.log, 'utf8').split('\n').filter(Boolean).slice(0, 60)
    }
    // Todos os pedidos da rodada, inclusive o da Página Web carregando no bloco.
    report.pedidosNoServidor = servidor.pedidos.length
    report.terminadoEm = new Date().toISOString()
    fs.mkdirSync(path.dirname(reportPath), { recursive: true })
    try {
      fs.rmSync(raiz, { recursive: true, force: true, maxRetries: 3 })
    } catch (error) {
      // Um arquivo preso (antivírus, o app ainda fechando) não muda o veredito.
      report.erroAoLimpar = sanitizeDiagnostic(error)
    }
    fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`)
  }

  console.log(`[packaged-links] ${report.result}: ${reportPath}`)
  if (report.result !== 'passed') {
    console.error(`[packaged-links] ${report.erro}`)
    process.exitCode = 1
  }
  return report
}

/**
 * Com o `xdg-open` que falha: o aviso aparece como `alert`, com o endereço,
 * sem tirar o foco do link da nota; "Copiar link" fecha o aviso e devolve o
 * foco ao link. (A área de transferência do sistema não é lida: o smoke da
 * CI confere o que é copiado.)
 */
async function conferirAvisoDeFalha(page, url, timeoutMs) {
  const aviso = page.locator('[data-felixo-link-open-failure]')
  await aviso.waitFor({ state: 'visible', timeout: timeoutMs })
  const texto = (await aviso.textContent()) ?? ''
  const papel = await aviso.getAttribute('role')
  const focoNoLink = () => page.evaluate((id) => Boolean(document.activeElement?.closest?.(`.react-flow__node[data-id="${id}"] a`)), NOTE_ID)
  const focoFicou = await focoNoLink()
  await aviso.getByRole('button', { name: 'Copiar link' }).click()
  const fechou = await aviso.waitFor({ state: 'detached', timeout: timeoutMs }).then(() => true, () => false)
  const focoVoltou = await focoNoLink()
  return {
    ok: papel === 'alert' && texto.includes('Não foi possível abrir no navegador') && texto.includes(url.slice(0, 40)) && focoFicou && fechou && focoVoltou,
    texto: texto.slice(0, 300),
    papel,
    focoFicou,
    fechouAoCopiar: fechou,
    focoVoltou,
  }
}

module.exports = { casosDaRodada, decodificar, julgarCaso, parseArgs, pedidoDoApp }

if (require.main === module) {
  main().catch((error) => {
    process.exitCode = 1
    process.stderr.write(`${sanitizeDiagnostic(error)}\n`)
  })
}

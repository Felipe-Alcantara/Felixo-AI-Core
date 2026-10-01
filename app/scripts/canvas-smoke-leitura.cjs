'use strict'

/**
 * Sessão F do smoke do canvas: a Leitura do terminal (Markdown da tela) de
 * ponta a ponta, no app de verdade.
 *
 * Os terminais rodam sobre a CLI roteirizada do processo principal, que toca
 * as gravações reais de `src/features/canvas/terminal/__fixtures__/terminal-output`
 * (gatilho `__felixo_smoke_gravacao_<nome>__`): o caminho é o de produção —
 * PTY, IPC, xterm e a Leitura lendo o buffer —, sem nenhuma CLI real.
 *
 * - F1 Claude: aba Leitura com título, listas, código, tabela, citação e link;
 *   o xterm fica por baixo, inert e aria-hidden, sem mudar de tamanho.
 * - F2 a escolha fica no bloco (readingMode) e volta depois do reload.
 * - F3 copiar leva o texto da tela; setas trocam de aba e o Terminal digita.
 * - F4 prévia formatada no cartão, sem link nem botão dentro do botão.
 * - F5 Codex (tabela em colunas, citação) e rolagem que não rouba a posição.
 * - F6 programa sem perfil (Openia): a saída como veio, com o aviso.
 * - F7 tema, tamanho de janela e movimento reduzido: capturas e nada vaza
 *   para os lados.
 *
 * As gravações têm 100×50: a janela é ampliada e a gaveta maximizada para o
 * xterm ter pelo menos esse tamanho, senão a tela da CLI sairia embaralhada.
 *
 * O `canvas-smoke.cjs` sobe esta sessão num perfil isolado novo, com
 * `FELIXO_DEVTOOLS_MOCK_PTY=0`, `FELIXO_DEVTOOLS_FAKE_CLI_PTY=1` e
 * `FELIXO_DEVTOOLS_TERMINAL_RECORDINGS` apontando para as gravações.
 */

const fs = require('node:fs')
const path = require('node:path')

const RECORDINGS_DIR = path.resolve(__dirname, '..', 'src', 'features', 'canvas', 'terminal', '__fixtures__', 'terminal-output')
const TERMINALS = [
  // Tela cheia (sem histórico): o modo do Claude com `tui: fullscreen`.
  { id: 'leitura-claude', title: 'Leitura Claude', command: 'claude', recording: 'claude-telacheia' },
  { id: 'leitura-codex', title: 'Leitura Codex', command: 'codex', recording: 'codex-retomada' },
  { id: 'leitura-openia', title: 'Leitura Openia', command: 'openia', recording: 'openia-lista' },
]
/** Cabe a gravação (100×50) no xterm da gaveta maximizada. */
const VIEWPORT = { width: 1600, height: 1100 }
const NARROW_VIEWPORT = { width: 1180, height: 1100 }
const READING = '[data-felixo-terminal-reading]'
const TAB = (name) => `[data-felixo-terminal-tab="${name}"]`

function falhar(passo, mensagem, detalhe) {
  const extra = detalhe === undefined ? '' : ` ${JSON.stringify(detalhe)}`
  throw new Error(`[canvas-smoke:leitura] ${passo}: ${mensagem}${extra}`)
}

function exigir(condicao, passo, mensagem, detalhe) {
  if (!condicao) falhar(passo, mensagem, detalhe)
}

function criarSessaoDaLeitura(deps) {
  const { page, checarMontagem } = deps
  const timeout = deps.timeoutMs
  const log = deps.log ?? ((message) => console.log(`[canvas-smoke:leitura] ${message}`))
  const outputDir = deps.outputDir ?? path.resolve(__dirname, '..', 'build', 'canvas-reading-smoke', process.platform)
  const pausa = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  const capturas = []

  async function esperar(passo, descricao, predicate, arg) {
    try {
      await page.waitForFunction(predicate, arg, { timeout })
    } catch (error) {
      falhar(passo, `${descricao} não aconteceu em ${timeout} ms (${error.message.split('\n')[0]})`)
    }
  }

  async function instalarGravador() {
    await page.evaluate(() => {
      window.__leituraSmoke = { copied: [] }
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: async (text) => window.__leituraSmoke.copied.push(String(text)) },
      })
    })
  }

  async function prepararCanvas(passo) {
    const nodes = TERMINALS.map((terminal, index) => ({
      id: terminal.id,
      type: 'terminal',
      position: { x: index * 560, y: 0 },
      width: 520,
      height: 360,
      data: { label: terminal.title, command: terminal.command, args: [], cwd: '', launchMode: 'agent' },
    }))
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
    exigir(result.ok, passo, 'o canvas da Leitura não foi gravado', result)
    await page.setViewportSize(VIEWPORT)
    await page.reload()
    await checarMontagem(page)
    await instalarGravador()
    await esperar(passo, 'os terminais montarem', (ids) => ids.every((id) =>
      document.querySelector(`.react-flow__node[data-id="${id}"]`)), TERMINALS.map((terminal) => terminal.id))
  }

  /** Abre a gaveta do terminal pela lista "Elementos" (o item de terminal abre a gaveta). */
  async function abrirGaveta(passo, terminal) {
    const item = page.locator(`button[title="${terminal.title}"]`).first()
    if (!(await item.isVisible())) {
      const abrir = page.getByRole('button', { name: 'Abrir elementos' })
      if (await abrir.isVisible()) await abrir.click()
    }
    await item.click()
    await page.locator('[data-canvas-terminal-drawer]').waitFor({ state: 'visible', timeout })
      .catch(() => falhar(passo, `a gaveta de ${terminal.title} não abriu`))
    await pausa(300)
  }

  async function fecharGaveta() {
    await page.getByRole('button', { name: 'Fechar terminal' }).click()
    await page.locator('[data-canvas-terminal-drawer]').waitFor({ state: 'detached', timeout }).catch(() => {})
  }

  async function maximizar(passo) {
    const botao = page.getByRole('button', { name: 'Maximizar terminal' })
    if (await botao.isVisible()) await botao.click()
    await pausa(400)
    const tamanho = await tamanhoDoXterm()
    exigir(tamanho.cols >= 100 && tamanho.rows >= 50, passo, 'o xterm ficou menor que a gravação (100×50)', tamanho)
  }

  /** Colunas e linhas do xterm da gaveta, pelo DOM do renderizador. */
  function tamanhoDoXterm() {
    return page.evaluate(() => {
      const screen = document.querySelector('#canvas-terminal-output .xterm-screen')
      const rows = document.querySelectorAll('#canvas-terminal-output .xterm-rows > div')
      const measure = document.querySelector('#canvas-terminal-output .xterm-char-measure-element')
      const charWidth = measure ? measure.getBoundingClientRect().width / Math.max(1, measure.textContent.length) : 0
      return {
        rows: rows.length,
        cols: screen && charWidth ? Math.floor(screen.getBoundingClientRect().width / charWidth) : 0,
      }
    })
  }

  function terminalContem(procurado) {
    return [...document.querySelectorAll('#canvas-terminal-output .xterm-rows')].some((rows) =>
      (rows.textContent ?? '').replace(/ /g, ' ').includes(procurado))
  }

  async function tocarGravacao(passo, terminal, marcaNaTela) {
    // Na primeira abertura, o banner diz que a CLI roteirizada subiu. Depois de
    // um reload o xterm é novo e o PTY é reanexado sem repetir o banner: aí só
    // se dá um tempo para a reanexação.
    await page.waitForFunction(terminalContem, 'Nenhum processo externo', { timeout: 5000 }).catch(() => pausa(1000))
    const xterm = page.locator('#canvas-terminal-output .xterm-helper-textarea')
    await xterm.focus()
    await page.keyboard.type(`__felixo_smoke_gravacao_${terminal.recording}__`)
    await page.keyboard.press('Enter')
    await esperar(passo, `a gravação ${terminal.recording} chegar na tela`, terminalContem, marcaNaTela)
    // O último pedaço da gravação, e o aviso de saída ao Leitura (uma vez por quadro).
    await pausa(800)
  }

  async function selecionarAba(passo, nome) {
    await page.locator(TAB(nome)).click()
    await esperar(passo, `a aba ${nome} ficar selecionada`, (selector) =>
      document.querySelector(selector)?.getAttribute('aria-selected') === 'true', TAB(nome))
  }

  /** O que a Leitura mostra: estrutura, falas e o estado do xterm por baixo. */
  function lerLeitura() {
    return page.evaluate((selector) => {
      const panel = document.querySelector(selector)
      const mount = document.getElementById('canvas-terminal-output')
      if (!panel) return null
      return {
        visible: !panel.hidden && panel.getBoundingClientRect().height > 0,
        roles: [...panel.querySelectorAll('article[data-reading-role]')].map((article) => article.getAttribute('data-reading-role')),
        headings: [...panel.querySelectorAll('h1,h2,h3,h4')].map((heading) => heading.textContent.trim()),
        lists: { ul: panel.querySelectorAll('ul').length, ol: panel.querySelectorAll('ol').length },
        code: [...panel.querySelectorAll('pre code')].map((code) => code.textContent),
        tableHeaders: [...panel.querySelectorAll('th')].map((cell) => cell.textContent.trim()),
        quotes: [...panel.querySelectorAll('blockquote')].map((quote) => quote.textContent.trim()),
        links: [...panel.querySelectorAll('a[href]')].map((link) => link.getAttribute('href')),
        text: panel.textContent ?? '',
        raw: panel.querySelectorAll('article').length > 0 && [...panel.querySelectorAll('article')].every((article) =>
          (article.textContent ?? '').includes('a formatação não conferiu')),
        focusInside: panel.contains(document.activeElement),
        overflowX: panel.scrollWidth - panel.clientWidth,
        xtermInert: mount?.hasAttribute('inert') === true,
        xtermHidden: mount?.getAttribute('aria-hidden') === 'true',
        scripts: panel.querySelectorAll('script, iframe, img').length,
      }
    }, READING)
  }

  async function esperarLeitura(passo, descricao, predicate) {
    const limite = Date.now() + timeout
    let leitura = await lerLeitura()
    while (!(leitura && predicate(leitura)) && Date.now() < limite) {
      await pausa(200)
      leitura = await lerLeitura()
    }
    exigir(leitura && predicate(leitura), passo, descricao, leitura)
    return leitura
  }

  async function capturar(nome) {
    fs.mkdirSync(outputDir, { recursive: true })
    const arquivo = path.join(outputDir, `${nome}.png`)
    await page.screenshot({ path: arquivo, scale: 'css', animations: 'disabled' })
    capturas.push(path.relative(path.resolve(__dirname, '..'), arquivo))
  }

  // --- passos ---------------------------------------------------------------

  async function claudeNaLeitura() {
    const passo = 'F1 Claude na Leitura'
    const terminal = TERMINALS[0]
    await abrirGaveta(passo, terminal)
    await maximizar(passo)
    exigir(
      (await page.locator(TAB('terminal')).getAttribute('aria-selected')) === 'true',
      passo,
      'o padrão do bloco não é o Terminal',
    )
    await tocarGravacao(passo, terminal, 'Documentação de exemplo')
    const antes = await tamanhoDoXterm()

    await selecionarAba(passo, 'leitura')
    const leitura = await esperarLeitura(passo, 'a Leitura não mostrou a resposta estruturada', (estado) =>
      estado.visible && estado.headings.includes('Resumo') && estado.tableHeaders.length >= 2)
    exigir(JSON.stringify(leitura.roles) === JSON.stringify(['pessoa', 'agente']), passo, 'falas fora do esperado', leitura.roles)
    exigir(leitura.lists.ul >= 1 && leitura.lists.ol >= 1, passo, 'listas não viraram ul/ol', leitura.lists)
    exigir(leitura.code.some((code) => code.includes('def soma(a, b):')), passo, 'o código não virou bloco de código', leitura.code)
    exigir(leitura.tableHeaders.join('|') === 'Nome|Valor', passo, 'a tabela não tem o cabeçalho', leitura.tableHeaders)
    exigir(leitura.quotes.length === 1, passo, 'a citação não virou blockquote', leitura.quotes)
    exigir(leitura.links.includes('https://example.com/docs'), passo, 'o link não passou pela política', leitura.links)
    exigir(!/tokens|auto mode|Claude Code v/.test(leitura.text), passo, 'o rodapé/logotipo da CLI entrou na Leitura')
    exigir(leitura.scripts === 0, passo, 'a Leitura tem elemento ativo', leitura)
    exigir(leitura.focusInside, passo, 'o foco não foi para a Leitura')
    exigir(leitura.xtermInert && leitura.xtermHidden, passo, 'o xterm por baixo não ficou inert e aria-hidden', leitura)
    exigir(leitura.overflowX <= 1, passo, 'a Leitura vaza para os lados', leitura.overflowX)
    const depois = await tamanhoDoXterm()
    exigir(antes.cols === depois.cols && antes.rows === depois.rows, passo, 'trocar de aba mudou o tamanho do terminal', { antes, depois })
    await capturar('f1-claude-leitura-1600')
    log(`${passo}: ok (${depois.cols}×${depois.rows})`)
  }

  async function escolhaPersistida() {
    const passo = 'F2 escolha no bloco'
    const gravado = await page.evaluate(async (id) => {
      const listed = await window.felixo.canvas.list()
      return listed?.nodes?.find((node) => node.id === id)?.data?.readingMode
    }, TERMINALS[0].id)
    exigir(gravado === true, passo, 'readingMode não foi gravado no bloco', gravado)
    const outro = await page.evaluate(async (id) => {
      const listed = await window.felixo.canvas.list()
      return listed?.nodes?.find((node) => node.id === id)?.data?.readingMode
    }, TERMINALS[1].id)
    exigir(outro === undefined, passo, 'a escolha vazou para outro bloco', outro)

    await page.reload()
    await checarMontagem(page)
    await instalarGravador()
    await abrirGaveta(passo, TERMINALS[0])
    exigir(
      (await page.locator(TAB('leitura')).getAttribute('aria-selected')) === 'true',
      passo,
      'depois do reload, o bloco não abriu na Leitura',
    )
    log(`${passo}: ok`)
  }

  async function copiarEAbas() {
    const passo = 'F3 copiar e abas pelo teclado'
    // Depois do reload o xterm é outro: toca a gravação de novo pelo Terminal.
    await selecionarAba(passo, 'terminal')
    await maximizar(passo)
    await tocarGravacao(passo, TERMINALS[0], 'Documentação de exemplo')
    await selecionarAba(passo, 'leitura')
    await esperarLeitura(passo, 'a Leitura não voltou', (estado) => estado.visible && estado.headings.includes('Resumo'))

    await page.getByRole('button', { name: 'Copiar texto da Leitura' }).click()
    const copiado = await page.evaluate(() => window.__leituraSmoke.copied.at(-1) ?? '')
    exigir(copiado.includes('def soma(a, b):') && copiado.includes('│ Nome │ Valor │'), passo,
      'copiar não levou o texto da tela (código e tabela como no terminal)', copiado.slice(0, 400))

    await page.locator(TAB('leitura')).focus()
    await page.keyboard.press('ArrowLeft')
    await esperar(passo, 'a seta voltar ao Terminal com o foco no xterm', () =>
      document.querySelector('[data-felixo-terminal-tab="terminal"]')?.getAttribute('aria-selected') === 'true' &&
      document.activeElement?.classList.contains('xterm-helper-textarea') === true)
    const inertNoTerminal = await page.evaluate(() => document.getElementById('canvas-terminal-output')?.hasAttribute('inert'))
    exigir(inertNoTerminal === false, passo, 'o xterm continuou inert no Terminal')
    await page.keyboard.type('eco da leitura')
    await esperar(passo, 'o texto digitado chegar ao terminal', terminalContem, 'eco da leitura')
    await page.keyboard.press('Control+C')
    // Volta à Leitura: o cartão (F4) só mostra a prévia formatada com ela ligada.
    await selecionarAba(passo, 'leitura')
    log(`${passo}: ok`)
  }

  async function previaNoCartao() {
    const passo = 'F4 prévia no cartão'
    await fecharGaveta()
    const previa = page.locator(`.react-flow__node[data-id="${TERMINALS[0].id}"] [data-felixo-reading-preview]`)
    await previa.waitFor({ state: 'visible', timeout }).catch(() => falhar(passo, 'a prévia formatada não apareceu no cartão'))
    const estado = await previa.evaluate((element) => ({
      text: element.textContent ?? '',
      interactive: element.querySelectorAll('a, button, input, [role="button"]').length,
    }))
    exigir(/Documentação de exemplo|Nome · Valor/.test(estado.text), passo, 'a prévia não mostra o fim da resposta', estado)
    exigir(estado.interactive === 0, passo, 'a prévia tem controle dentro do botão do cartão', estado)
    log(`${passo}: ok`)
  }

  async function codexERolagem() {
    const passo = 'F5 Codex e rolagem'
    const terminal = TERMINALS[1]
    await abrirGaveta(passo, terminal)
    await maximizar(passo)
    await tocarGravacao(passo, terminal, 'Documentação (https://example.com/docs)')
    await selecionarAba(passo, 'leitura')
    const leitura = await esperarLeitura(passo, 'a Leitura do Codex não mostrou a resposta', (estado) =>
      estado.headings.includes('Resumo') && estado.tableHeaders.join('|') === 'Nome|Valor')
    exigir(leitura.quotes.some((quote) => quote.includes('Uma citação curta.')), passo, 'a citação do Codex não virou blockquote', leitura.quotes)
    exigir(!/Ask Codex|GPT-6|Tip:/.test(leitura.text), passo, 'a caixa de digitação ou o rodapé do Codex entraram', leitura.text.slice(-300))

    // Saída em streaming (60 linhas) até a Leitura rolar.
    const stream = () => page.evaluate((sessionId) =>
      window.felixo.pty.write({ sessionId, data: '__felixo_smoke_stream__\r' }), `canvas:${terminal.id}`)
    const rolagem = () => page.locator(READING).evaluate((element) => ({
      top: element.scrollTop,
      max: element.scrollHeight - element.clientHeight,
    }))
    await stream()
    await esperarLeitura(passo, 'a saída em streaming não chegou à Leitura', (estado) => estado.text.includes('linha 60 de 60'))
    await pausa(400)
    // Quem estava no fim acompanha o fim.
    let posicao = await rolagem()
    exigir(posicao.max > 0, passo, 'a Leitura não rolou com 60 linhas novas', posicao)
    exigir(posicao.max - posicao.top <= 24, passo, 'quem estava no fim não acompanhou a saída nova', posicao)

    // Rolada para o topo, a Leitura não pula para o fim com saída nova.
    await page.locator(READING).evaluate((element) => { element.scrollTop = 0 })
    await pausa(200)
    await stream()
    await pausa(4000)
    posicao = await rolagem()
    exigir(posicao.top === 0, passo, 'a saída nova roubou a posição de quem estava lendo o começo', posicao)
    log(`${passo}: ok`)
  }

  async function programaSemPerfil() {
    const passo = 'F6 programa sem perfil'
    await fecharGaveta()
    const terminal = TERMINALS[2]
    await abrirGaveta(passo, terminal)
    await maximizar(passo)
    await tocarGravacao(passo, terminal, "Use 'openia run <chave>'")
    await selecionarAba(passo, 'leitura')
    const leitura = await esperarLeitura(passo, 'a Leitura do Openia não mostrou a saída', (estado) =>
      estado.code.some((code) => code.includes('Interfaces de IA suportadas')))
    exigir(leitura.text.includes('não tem leitura formatada'), passo, 'falta o aviso de programa sem leitura formatada')
    exigir(JSON.stringify(leitura.roles) === JSON.stringify(['saida']), passo, 'a saída não ficou numa fala só', leitura.roles)
    log(`${passo}: ok`)
  }

  async function temaTamanhoEMovimento() {
    const passo = 'F7 tema, tamanho e movimento reduzido'
    await fecharGaveta()
    for (const theme of ['dark', 'high_contrast']) {
      for (const viewport of [VIEWPORT, NARROW_VIEWPORT]) {
        await page.evaluate((value) => window.localStorage.setItem('felixo-ai-core.theme', value), theme)
        await page.setViewportSize(viewport)
        await page.emulateMedia({ reducedMotion: 'reduce' })
        await page.reload()
        await checarMontagem(page)
        await esperar(passo, `o tema ${theme}`, (expected) => document.documentElement.dataset.theme === expected, theme)
        await abrirGaveta(passo, TERMINALS[0])
        // Reaberto na Leitura (a escolha do bloco); o xterm novo recebe a gravação pelo Terminal.
        await selecionarAba(passo, 'terminal')
        await maximizar(passo)
        await tocarGravacao(passo, TERMINALS[0], 'Documentação de exemplo')
        await selecionarAba(passo, 'leitura')
        const leitura = await esperarLeitura(passo, `a Leitura em ${theme} ${viewport.width}px`, (estado) =>
          estado.visible && estado.headings.includes('Resumo'))
        exigir(leitura.overflowX <= 1, passo, `a Leitura vaza para os lados em ${theme} ${viewport.width}px`, leitura.overflowX)
        const animando = await page.locator(READING).evaluate((element) =>
          [element, ...element.querySelectorAll('*')].filter((node) => {
            const style = getComputedStyle(node)
            return style.animationName !== 'none' && Number.parseFloat(style.animationDuration) > 0.01
          }).length)
        exigir(animando === 0, passo, `há animação na Leitura com movimento reduzido (${theme})`, animando)
        await capturar(`f7-${theme}-${viewport.width}x${viewport.height}-reduced-motion`)
        await fecharGaveta()
      }
    }
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.evaluate(() => window.localStorage.setItem('felixo-ai-core.theme', 'dark'))
    log(`${passo}: ok (${capturas.length} capturas em ${path.relative(process.cwd(), outputDir) || outputDir})`)
  }

  return {
    async executar() {
      exigir(fs.existsSync(path.join(RECORDINGS_DIR, 'claude-resposta.json')), 'F0', 'gravações não encontradas', RECORDINGS_DIR)
      await prepararCanvas('F0 canvas')
      await claudeNaLeitura()
      await escolhaPersistida()
      await copiarEAbas()
      await previaNoCartao()
      await codexERolagem()
      await programaSemPerfil()
      await temaTamanhoEMovimento()
      return { capturas }
    },
  }
}

module.exports = { RECORDINGS_DIR, criarSessaoDaLeitura }

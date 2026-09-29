'use strict'

/**
 * Sessão D do smoke do canvas: a escolha de destino dos links, de ponta a
 * ponta, no app de verdade.
 *
 * Nenhum link abre direto. O gesto de cada superfície abre o menu único
 * (`[data-felixo-link-chooser]`), que mostra o destino e pergunta: navegador,
 * Página Web ou copiar. A sessão prova isso com mouse, teclado, clique
 * direito, toque e streaming em cada superfície:
 *
 * - nota em Markdown;
 * - terminal com a CLI roteirizada do processo principal, com URL em texto,
 *   hyperlink OSC 8 e saída em streaming;
 * - bloco Página Web, com uma página servida por este processo em 127.0.0.1;
 * - pedido de agente (`abrir-pagina`) com o cartão de confirmação.
 *
 * Nada sai da máquina: `window.open` e a área de transferência são trocados
 * por gravadores dentro da página, e o botão do cartão que abriria o
 * navegador do sistema não é clicado (o processo principal tem teste
 * unitário próprio). Todo endereço que vira bloco Página Web no teste é da
 * página local; os de `example.com` só aparecem no menu, que fecha sem abrir.
 *
 * O `canvas-smoke.cjs` sobe esta sessão num perfil isolado novo, com
 * `FELIXO_DEVTOOLS_MOCK_PTY=0` (xterm e store reais) e
 * `FELIXO_DEVTOOLS_FAKE_CLI_PTY=1` (nenhuma CLI real roda).
 */

const http = require('node:http')
const path = require('node:path')

const NOTE_ID = 'links-note'
const NOTE_TITLE = 'Nota de links'
const TERMINAL_ID = 'links-terminal'
const TERMINAL_TITLE = 'Terminal de links'
const WEBPAGE_ID = 'links-webpage'
/** O mesmo texto do `<title>` da página local: o bloco adota o título da página. */
const WEBPAGE_TITLE = 'Página do smoke'
const MENU = '[data-felixo-link-chooser]'
const TERMINAL_URL = 'https://example.com/terminal'
const OSC8_DESTINATION = 'https://example.com/destino-real'
const INSIDE_PAGE_URL = 'https://example.com/de-dentro'
/** Modificador do "clique para abrir link" de cada sistema. */
const LINK_MODIFIER = process.platform === 'darwin' ? 'Meta' : 'Control'

function falhar(passo, mensagem, detalhe) {
  const extra = detalhe === undefined ? '' : ` ${JSON.stringify(detalhe)}`
  throw new Error(`[canvas-smoke:links] ${passo}: ${mensagem}${extra}`)
}

function exigir(condicao, passo, mensagem, detalhe) {
  if (!condicao) falhar(passo, mensagem, detalhe)
}

/** A página que o bloco Página Web carrega: um link que cobre a tela inteira. */
function paginaLocal() {
  return `<!doctype html><meta charset="utf-8"><title>${WEBPAGE_TITLE}</title>
<style>html,body{margin:0;height:100%}a{position:fixed;inset:0;display:grid;place-items:center;font:20px sans-serif}</style>
<a href="${INSIDE_PAGE_URL}">link de dentro da página</a>`
}

/** Sobe o servidor da página local numa porta livre de 127.0.0.1. */
async function subirPaginaLocal() {
  const server = http.createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    response.end(paginaLocal())
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()
  return { url: `http://127.0.0.1:${port}/`, fechar: () => new Promise((resolve) => server.close(resolve)) }
}

/**
 * @param {{
 *   page: import('playwright').Page,
 *   checarMontagem: (page: import('playwright').Page) => Promise<void>,
 *   estadoDaSessao: () => { userData?: string, realProfile?: boolean } | null,
 *   timeoutMs: number,
 *   log?: (message: string) => void,
 * }} deps
 */
function criarSessaoDeLinks(deps) {
  const { page, checarMontagem, estadoDaSessao } = deps
  const timeout = deps.timeoutMs
  const log = deps.log ?? ((message) => console.log(`[canvas-smoke:links] ${message}`))
  const pausa = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  // Definidos quando a página local sobe (porta livre): é o que pode virar bloco.
  let DOCS_URL = ''
  let REQUEST_URL = ''

  async function esperar(passo, descricao, predicate, arg) {
    try {
      await page.waitForFunction(predicate, arg, { timeout })
    } catch (error) {
      falhar(passo, `${descricao} não aconteceu em ${timeout} ms (${error.message.split('\n')[0]})`)
    }
  }

  // --- gravadores: nada sai da máquina -------------------------------------

  /** Troca `window.open` e a área de transferência por gravadores na página. */
  async function instalarGravadores() {
    await page.evaluate(() => {
      window.__linksSmoke = { opened: [], copied: [] }
      window.open = (url) => {
        window.__linksSmoke.opened.push(String(url))
        return null
      }
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async (text) => {
            window.__linksSmoke.copied.push(String(text))
          },
        },
      })
    })
  }

  const gravado = () => page.evaluate(() => ({ ...window.__linksSmoke }))
  async function limparGravadores() {
    await page.evaluate(() => {
      window.__linksSmoke.opened = []
      window.__linksSmoke.copied = []
    })
  }

  // --- menu ----------------------------------------------------------------

  /** O que o menu mostra: o resumo do destino e as escolhas, na ordem. */
  function lerMenu() {
    return page.evaluate((selector) => {
      const menu = document.querySelector(selector)
      if (!menu) return null
      const items = [...menu.querySelectorAll('[data-link-choice]')]
      const rect = menu.getBoundingClientRect()
      return {
        summary: menu.querySelector('[id]')?.textContent ?? '',
        choices: items.map((item) => item.getAttribute('data-link-choice')),
        labels: items.map((item) => item.textContent?.trim()),
        focusedChoice: document.activeElement?.getAttribute('data-link-choice') ?? null,
        rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
        inViewport:
          rect.left >= 0 && rect.top >= 0 && rect.right <= window.innerWidth && rect.bottom <= window.innerHeight,
      }
    }, MENU)
  }

  async function esperarMenu(passo, descricao) {
    await esperar(passo, `${descricao}: o menu de destino abrir`, (selector) => {
      const menu = document.querySelector(selector)
      // Visível e com o primeiro item focado: o foco sai de quem abriu.
      return Boolean(menu) && getComputedStyle(menu).visibility !== 'hidden' &&
        menu.contains(document.activeElement)
    }, MENU)
    return lerMenu()
  }

  async function esperarMenuFechado(passo, descricao) {
    await esperar(passo, `${descricao}: o menu fechar`, (selector) => document.querySelector(selector) === null, MENU)
  }

  async function escolher(choice) {
    await page.locator(`${MENU} [data-link-choice="${choice}"]`).click()
  }

  /**
   * Blocos Página Web gravados. Pelo canvas persistido, não pelo DOM: o React
   * Flow tira da árvore o bloco que sai da tela quando a câmera centraliza o
   * novo, e a contagem pelo DOM não mudaria.
   */
  const contarPaginasWeb = () =>
    page.evaluate(async () => {
      const listed = await window.felixo.canvas.list()
      return (listed?.nodes ?? []).filter((node) => node.type === 'webpage').length
    })

  async function esperarPaginasWeb(passo, descricao, esperado) {
    const limite = Date.now() + timeout
    let atual = await contarPaginasWeb()
    while (atual !== esperado && Date.now() < limite) {
      await pausa(200)
      atual = await contarPaginasWeb()
    }
    exigir(atual === esperado, passo, `${descricao}: esperado ${esperado} blocos Página Web gravados`, { atual })
  }

  // --- canvas --------------------------------------------------------------

  async function prepararCanvas(passo, paginaUrl) {
    const nodes = [
      {
        id: NOTE_ID,
        type: 'note',
        position: { x: 0, y: 0 },
        width: 420,
        height: 220,
        data: {
          label: 'Nota de links',
          text: [
            `Docs: [documentação](${DOCS_URL})`,
            '',
            'Arquivo: [hosts](file:///etc/hosts)',
            '',
            'E-mail: [time](mailto:time@example.com)',
          ].join('\n'),
        },
      },
      {
        id: TERMINAL_ID,
        type: 'terminal',
        position: { x: 0, y: 300 },
        width: 520,
        height: 360,
        data: { label: 'Terminal de links', command: 'codex', args: [], cwd: '', launchMode: 'agent' },
      },
      {
        id: WEBPAGE_ID,
        type: 'webpage',
        position: { x: 600, y: 0 },
        width: 560,
        height: 420,
        data: { label: 'Página do smoke', url: paginaUrl },
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
    exigir(result.ok, passo, 'o canvas de links não foi gravado', result)
    await page.reload()
    await checarMontagem(page)
    await instalarGravadores()
    await esperar(passo, 'os três blocos montarem', (ids) => ids.every((id) =>
      document.querySelector(`.react-flow__node[data-id="${id}"]`)), [NOTE_ID, TERMINAL_ID, WEBPAGE_ID])
  }

  /**
   * Centraliza o bloco pela lista "Elementos", que usa a área segura do
   * canvas: "Enquadrar" deixa blocos embaixo da barra lateral numa janela de
   * 1280×800. Num terminal, o item também abre a gaveta.
   */
  async function focar(titulo) {
    const item = page.locator(`button[title="${titulo}"]`).first()
    if (!(await item.isVisible())) {
      const abrir = page.getByRole('button', { name: 'Abrir elementos' })
      if (await abrir.isVisible()) await abrir.click()
    }
    await item.click()
    // A câmera anda em 240 ms.
    await pausa(450)
  }

  // --- passos: Markdown ----------------------------------------------------

  const linkDaNota = () => page.locator(`.react-flow__node[data-id="${NOTE_ID}"] a[href="${DOCS_URL}"]`)

  async function mostrarNotaRenderizada(passo) {
    await focar(NOTE_TITLE)
    await page.locator(`.react-flow__node[data-id="${NOTE_ID}"]`).getByRole('button', { name: 'Visualizar nota' }).click()
    await linkDaNota().waitFor({ state: 'visible', timeout }).catch(() => falhar(passo, 'o link da nota não apareceu'))
  }

  async function markdownComMouse() {
    const passo = 'L1 Markdown: clique'
    await mostrarNotaRenderizada(passo)
    await limparGravadores()

    await linkDaNota().click()
    const menu = await esperarMenu(passo, 'clique no link')
    exigir(menu.summary.includes('127.0.0.1') && menu.summary.includes(DOCS_URL), passo, 'o menu não mostra o destino', menu)
    exigir(
      JSON.stringify(menu.choices) === JSON.stringify(['abrir-no-navegador', 'abrir-como-pagina-web', 'copiar-link']),
      passo,
      'escolhas fora da ordem esperada',
      menu,
    )
    exigir(menu.focusedChoice === 'abrir-no-navegador', passo, 'o foco não foi para o primeiro item', menu)
    exigir(menu.inViewport, passo, 'o menu saiu da janela', menu.rect)

    await page.keyboard.press('Escape')
    await esperarMenuFechado(passo, 'Esc')
    const focoVoltou = await page.evaluate((url) => document.activeElement?.getAttribute('href') === url, DOCS_URL)
    exigir(focoVoltou, passo, 'Esc não devolveu o foco ao link')
    exigir((await gravado()).opened.length === 0, passo, 'o clique abriu uma janela sem escolha', await gravado())
  }

  async function markdownComTeclado() {
    const passo = 'L2 Markdown: teclado'
    await linkDaNota().focus()
    await page.keyboard.press('Enter')
    const menu = await esperarMenu(passo, 'Enter no link')
    const link = await linkDaNota().boundingBox()
    // Pelo teclado, o menu nasce embaixo do link (ou em cima, sem espaço), não num canto.
    exigir(menu.rect.top >= link.y + link.height - 1 || menu.rect.bottom <= link.y + 1, passo, 'o menu cobriu o link', { menu: menu.rect, link })

    const focoApos = async (tecla) => {
      await page.keyboard.press(tecla)
      return page.evaluate(() => document.activeElement?.getAttribute('data-link-choice'))
    }
    exigir((await focoApos('ArrowDown')) === 'abrir-como-pagina-web', passo, 'ArrowDown não foi ao segundo item')
    exigir((await focoApos('End')) === 'copiar-link', passo, 'End não foi ao último item')
    exigir((await focoApos('ArrowDown')) === 'abrir-no-navegador', passo, 'ArrowDown no fim não voltou ao começo')
    exigir((await focoApos('ArrowUp')) === 'copiar-link', passo, 'ArrowUp no começo não foi ao fim')
    exigir((await focoApos('Home')) === 'abrir-no-navegador', passo, 'Home não foi ao primeiro item')

    await page.keyboard.press('Tab')
    await esperarMenuFechado(passo, 'Tab')
    exigir(
      await page.evaluate((url) => document.activeElement?.getAttribute('href') === url, DOCS_URL),
      passo,
      'Tab não devolveu o foco ao link',
    )
  }

  async function markdownEscolhas() {
    const passo = 'L3 Markdown: escolhas'
    await mostrarNotaRenderizadaSeFechada()
    await limparGravadores()

    await linkDaNota().click()
    await esperarMenu(passo, 'copiar')
    await escolher('copiar-link')
    await esperarMenuFechado(passo, 'copiar')
    await esperar(passo, 'o aviso "Link copiado"', () =>
      [...document.querySelectorAll('[role="status"]')].some((node) => node.textContent === 'Link copiado'))
    let registro = await gravado()
    exigir(JSON.stringify(registro.copied) === JSON.stringify([DOCS_URL]), passo, 'copiar não copiou o destino', registro)
    exigir(registro.opened.length === 0, passo, 'copiar abriu uma janela', registro)

    await linkDaNota().click()
    await esperarMenu(passo, 'navegador')
    await escolher('abrir-no-navegador')
    await esperarMenuFechado(passo, 'navegador')
    registro = await gravado()
    exigir(JSON.stringify(registro.opened) === JSON.stringify([DOCS_URL]), passo, 'o navegador não recebeu o destino', registro)

    const antes = await contarPaginasWeb()
    await mostrarNotaRenderizadaSeFechada()
    await linkDaNota().click()
    await esperarMenu(passo, 'Página Web')
    await escolher('abrir-como-pagina-web')
    await esperarMenuFechado(passo, 'Página Web')
    await esperarPaginasWeb(passo, 'o bloco Página Web do link', antes + 1)
    await esperar(passo, 'o foco ir para o bloco novo', () =>
      document.activeElement?.classList.contains('react-flow__node-webpage') === true)
  }

  async function markdownRecusadoEEmail() {
    const passo = 'L4 Markdown: recusado e e-mail'
    await mostrarNotaRenderizadaSeFechada()
    const recusado = page.locator(`.react-flow__node[data-id="${NOTE_ID}"] [data-refused-link]`)
    exigir((await recusado.getAttribute('title'))?.startsWith('Link recusado: endereços file:'), passo, 'a dica do link recusado não diz o motivo')
    await recusado.click()
    let menu = await esperarMenu(passo, 'link recusado')
    exigir(menu.summary.includes('Link recusado'), passo, 'o menu não diz que recusou', menu)
    // No menu a frase começa a linha, com maiúscula; na dica, vem depois de "Link recusado:".
    exigir(menu.summary.includes('Endereços file: não abrem pelo app, só http, https e mailto.'), passo, 'o menu não diz o motivo', menu)
    exigir(JSON.stringify(menu.choices) === JSON.stringify(['copiar-link']), passo, 'link recusado ofereceu abrir', menu)
    await page.keyboard.press('Escape')
    await esperarMenuFechado(passo, 'Esc no recusado')

    await page.locator(`.react-flow__node[data-id="${NOTE_ID}"] a[href^="mailto:"]`).click()
    menu = await esperarMenu(passo, 'e-mail')
    exigir(JSON.stringify(menu.labels) === JSON.stringify(['Abrir no app de e-mail', 'Copiar endereço']), passo, 'o e-mail ofereceu Página Web ou rótulo errado', menu)
    await page.keyboard.press('Escape')
    await esperarMenuFechado(passo, 'Esc no e-mail')
  }

  async function mostrarNotaRenderizadaSeFechada() {
    await focar(NOTE_TITLE)
    if (!(await linkDaNota().isVisible())) {
      await page.locator(`.react-flow__node[data-id="${NOTE_ID}"]`).getByRole('button', { name: 'Visualizar nota' }).click()
      await linkDaNota().waitFor({ state: 'visible', timeout })
    }
  }

  async function markdownCliqueDireitoEToque() {
    const passo = 'L5 Markdown: clique direito e toque'
    await mostrarNotaRenderizadaSeFechada()
    await linkDaNota().click({ button: 'right' })
    await esperarMenu(passo, 'clique direito')
    // Só o menu do link: o do bloco (cor, etc.) não abre junto.
    const menus = await page.evaluate(() => document.querySelectorAll('[role="menu"]').length)
    exigir(menus === 1, passo, 'o clique direito abriu outro menu junto', { menus })
    await page.keyboard.press('Escape')
    await esperarMenuFechado(passo, 'Esc')

    const box = await linkDaNota().boundingBox()
    await tocar(box.x + box.width / 2, box.y + box.height / 2)
    const menu = await esperarMenu(passo, 'toque no link')
    exigir(menu.choices.length === 3, passo, 'o toque abriu um menu incompleto', menu)
    await page.keyboard.press('Escape')
    await esperarMenuFechado(passo, 'Esc depois do toque')
  }

  /** Toque de um dedo, pelo CDP: o Chromium sintetiza o clique a partir dele. */
  async function tocar(x, y) {
    const cdp = await page.context().newCDPSession(page)
    try {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    } finally {
      await cdp.detach().catch(() => {})
    }
  }

  // --- passos: terminal ----------------------------------------------------

  /**
   * O texto visível do terminal. O renderizador DOM do xterm desenha espaço
   * como NBSP em alguns trechos (o de um hyperlink OSC 8, por exemplo), e a
   * busca compara com espaço comum.
   */
  function terminalContem(procurado) {
    return [...document.querySelectorAll('.xterm-rows')].some((rows) =>
      (rows.textContent ?? '').replace(/\u00a0/g, ' ').includes(procurado))
  }

  async function abrirTerminal(passo) {
    // O item de um terminal na lista abre a gaveta com o xterm de verdade.
    await focar(TERMINAL_TITLE)
    const xterm = page.locator('.xterm-helper-textarea').last()
    await xterm.waitFor({ state: 'attached', timeout }).catch(() => falhar(passo, 'o terminal não abriu'))
    await esperar(passo, 'o prompt da CLI roteirizada', terminalContem, 'Nenhum processo externo')
    return xterm
  }

  async function digitar(xterm, linha) {
    await xterm.focus()
    await page.keyboard.press('Control+C')
    await page.keyboard.type(linha)
    await page.keyboard.press('Enter')
  }

  /** Centro do trecho `texto` na tela do xterm (renderizador DOM), ou `null`. */
  function posicaoNoTerminal(texto) {
    return page.evaluate((procurado) => {
      const rows = [...document.querySelectorAll('.xterm-rows')].at(-1)
      if (!rows) return null
      for (const row of rows.children) {
        const nodes = []
        const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT)
        let full = ''
        while (walker.nextNode()) {
          nodes.push({ node: walker.currentNode, start: full.length })
          // NBSP vira espaço: um para um, os deslocamentos continuam valendo.
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
        range.setEnd(...locate(at + procurado.length - 1))
        const rect = range.getBoundingClientRect()
        return { x: rect.left + Math.min(rect.width / 2, 40), y: rect.top + rect.height / 2 }
      }
      return null
    }, texto)
  }

  async function esperarNoTerminal(passo, texto) {
    await esperar(passo, `"${texto}" aparecer no terminal`, terminalContem, texto)
    const ponto = await posicaoNoTerminal(texto)
    exigir(ponto, passo, `"${texto}" não tem posição na tela`)
    return ponto
  }

  const dicaDoTerminal = () =>
    page.evaluate(() => [...document.querySelectorAll('.xterm')].at(-1)?.getAttribute('title') ?? '')

  async function passarPorCima(passo, ponto, esperado) {
    await page.mouse.move(ponto.x - 3, ponto.y)
    await page.mouse.move(ponto.x, ponto.y)
    await esperar(passo, `a dica do link (${esperado})`, (trecho) =>
      ([...document.querySelectorAll('.xterm')].at(-1)?.getAttribute('title') ?? '').includes(trecho), esperado)
  }

  async function modificadorClique(ponto) {
    await page.keyboard.down(LINK_MODIFIER)
    await page.mouse.click(ponto.x, ponto.y)
    await page.keyboard.up(LINK_MODIFIER)
  }

  async function terminalTexto() {
    const passo = 'L6 terminal: URL em texto'
    const xterm = await abrirTerminal(passo)
    await limparGravadores()
    await digitar(xterm, TERMINAL_URL)
    const ponto = await esperarNoTerminal(passo, TERMINAL_URL)

    await passarPorCima(passo, ponto, 'escolher onde abrir')
    await page.mouse.click(ponto.x, ponto.y)
    await pausa(300)
    exigir((await lerMenu()) === null, passo, 'clique simples abriu o menu (é do terminal)')

    await modificadorClique(ponto)
    let menu = await esperarMenu(passo, `${LINK_MODIFIER}+clique`)
    exigir(menu.summary.includes(TERMINAL_URL), passo, 'o menu não mostra o destino', menu)
    exigir(menu.choices.includes('abrir-como-pagina-web'), passo, 'o terminal no canvas não ofereceu Página Web', menu)
    await page.keyboard.press('Escape')
    await esperarMenuFechado(passo, 'Esc')
    exigir(
      await page.evaluate(() => document.activeElement?.classList.contains('xterm-helper-textarea') === true),
      passo,
      'Esc não devolveu o foco à entrada do terminal',
    )

    await passarPorCima(passo, ponto, 'escolher onde abrir')
    await page.mouse.click(ponto.x, ponto.y, { button: 'right' })
    menu = await esperarMenu(passo, 'clique direito')
    exigir(menu.summary.includes(TERMINAL_URL), passo, 'o clique direito mostrou outro destino', menu)
    await page.keyboard.press('Escape')
    await esperarMenuFechado(passo, 'Esc do clique direito')

    // Pela tecla de menu: o link sob o ponteiro, sem clique nenhum. Shift+F10
    // não serve aqui: no terminal o F10 é da CLI, e o xterm o entrega a ela.
    await passarPorCima(passo, ponto, 'escolher onde abrir')
    await xterm.focus()
    await page.keyboard.press('ContextMenu')
    menu = await esperarMenu(passo, 'tecla de menu')
    exigir(menu.summary.includes(TERMINAL_URL), passo, 'a tecla de menu mostrou outro destino', menu)
    await page.keyboard.press('Escape')
    await esperarMenuFechado(passo, 'Esc da tecla de menu')

    exigir((await gravado()).opened.length === 0, passo, 'algum gesto abriu o navegador sem escolha', await gravado())
    return { xterm, ponto }
  }

  async function terminalOsc8(xterm) {
    const passo = 'L7 terminal: hyperlink OSC 8'
    await digitar(xterm, '__felixo_smoke_osc8__')
    const disfarce = await esperarNoTerminal(passo, 'banco.example')

    // A dica e o menu mostram o destino, não o texto da tela.
    await passarPorCima(passo, disfarce, OSC8_DESTINATION)
    await modificadorClique(disfarce)
    let menu = await esperarMenu(passo, 'OSC 8')
    exigir(menu.summary.includes(OSC8_DESTINATION), passo, 'o menu mostrou o texto em vez do destino', menu)
    exigir(!menu.summary.includes('banco.example'), passo, 'o menu repetiu o disfarce', menu)
    await page.keyboard.press('Escape')
    await esperarMenuFechado(passo, 'Esc')

    const arquivo = await esperarNoTerminal(passo, 'hosts do sistema')
    await passarPorCima(passo, arquivo, 'Link recusado: endereços file:')
    await modificadorClique(arquivo)
    menu = await esperarMenu(passo, 'OSC 8 file:')
    exigir(menu.summary.includes('Endereços file: não abrem pelo app, só http e https.'), passo, 'o menu não explicou a recusa', menu)
    exigir(JSON.stringify(menu.choices) === JSON.stringify(['copiar-link']), passo, 'o file: ofereceu abrir', menu)
    await page.keyboard.press('Escape')
    await esperarMenuFechado(passo, 'Esc do file:')
  }

  async function terminalStreaming(xterm, ponto) {
    const passo = 'L8 terminal: streaming com o menu aberto'
    await limparGravadores()
    // O link pode ter rolado com a saída do OSC 8: acha de novo.
    const atual = (await posicaoNoTerminal(TERMINAL_URL)) ?? ponto
    await passarPorCima(passo, atual, 'escolher onde abrir')
    await modificadorClique(atual)
    await esperarMenu(passo, 'antes do streaming')

    // A saída chega com o menu aberto (e o foco nele): a tela rola por baixo.
    await page.evaluate((sessionId) =>
      window.felixo.pty.write({ sessionId, data: '__felixo_smoke_stream__\r' }), `canvas:${TERMINAL_ID}`)
    await esperar(passo, 'o fim do streaming', terminalContem, 'linha 60 de 60')

    const menu = await lerMenu()
    exigir(menu !== null, passo, 'o streaming fechou o menu')
    exigir(menu.summary.includes(TERMINAL_URL), passo, 'o destino do menu mudou com a saída', menu)
    await escolher('copiar-link')
    await esperarMenuFechado(passo, 'copiar')
    const registro = await gravado()
    exigir(JSON.stringify(registro.copied) === JSON.stringify([`${TERMINAL_URL}`]), passo, 'copiou outro endereço depois do streaming', registro)
    // Clicar no menu (um portal fora da gaveta) não é clicar fora: a gaveta
    // fica aberta e o foco volta à entrada do terminal.
    await esperar(passo, 'o foco voltar à entrada do terminal, com a gaveta aberta', () =>
      document.activeElement?.classList.contains('xterm-helper-textarea') === true)
    await xterm.focus()
  }

  async function terminalToque(xterm) {
    const passo = 'L9 terminal: toque'
    await digitar(xterm, TERMINAL_URL)
    await pausa(200)
    const ponto = await esperarNoTerminal(passo, TERMINAL_URL)
    await tocar(ponto.x, ponto.y)
    const menu = await esperarMenu(passo, 'toque no link do terminal')
    exigir(menu.summary.includes(TERMINAL_URL), passo, 'o toque abriu o menu de outro link', menu)
    await page.keyboard.press('Escape')
    await esperarMenuFechado(passo, 'Esc depois do toque')
    await page.getByRole('button', { name: 'Fechar terminal' }).click()
  }

  // --- passos: Página Web ---------------------------------------------------

  const blocoWeb = () => page.locator(`.react-flow__node[data-id="${WEBPAGE_ID}"]`)

  async function paginaWebMenuDeLink(paginaUrl) {
    const passo = 'L10 Página Web: link dentro da página'
    await focar(WEBPAGE_TITLE)
    await esperar(passo, 'a página local carregar no webview', (params) => {
      const webview = document.querySelector(`.react-flow__node[data-id="${params.id}"] webview`)
      try {
        return webview?.getURL?.() === params.url
      } catch {
        return false
      }
    }, { id: WEBPAGE_ID, url: paginaUrl })

    const box = await blocoWeb().locator('webview').boundingBox()
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' })
    const menu = await esperarMenu(passo, 'clique direito num link da página')
    exigir(menu.summary.includes(INSIDE_PAGE_URL), passo, 'o menu não mostra o link da página', menu)
    exigir(
      JSON.stringify(menu.choices) === JSON.stringify(['abrir-no-navegador', 'abrir-como-pagina-web', 'copiar-link']),
      passo,
      'escolhas erradas para um link da página',
      menu,
    )
    await page.keyboard.press('Escape')
    await esperarMenuFechado(passo, 'Esc')
  }

  async function paginaWebBarraEBotao(paginaUrl) {
    const passo = 'L11 Página Web: barra e botão do navegador'
    const barra = blocoWeb().getByRole('textbox', { name: 'Endereço da página' })
    await barra.fill('file:///etc/passwd')
    await barra.press('Enter')
    await esperar(passo, 'a barra explicar a recusa', (id) =>
      document.querySelector(`.react-flow__node[data-id="${id}"] [role="alert"]`)?.textContent ===
        'Endereço não aberto: endereços file: não abrem pelo app, só http e https.', WEBPAGE_ID)
    exigir((await barra.getAttribute('aria-invalid')) === 'true', passo, 'a barra não ficou marcada como inválida')
    await barra.fill(paginaUrl)
    await esperar(passo, 'o aviso sumir ao corrigir', (id) =>
      document.querySelector(`.react-flow__node[data-id="${id}"] [role="alert"]`) === null, WEBPAGE_ID)

    await limparGravadores()
    await blocoWeb().getByRole('button', { name: 'Abrir esta página no navegador' }).click()
    const registro = await gravado()
    exigir(JSON.stringify(registro.opened) === JSON.stringify([paginaUrl]), passo, 'o botão não mandou a página atual', registro)
  }

  // --- passos: pedido de agente --------------------------------------------

  function pedidosDoPerfil() {
    const estado = estadoDaSessao()
    if (!estado?.userData || estado.realProfile) {
      throw new Error('[canvas-smoke:links] gravar pedidos de agente só é permitido num perfil isolado do felixo devtools.')
    }
    const { criarRepositorioDePedidos } = require('../electron/services/fetch-all/agent-requests.cjs')
    return criarRepositorioDePedidos({ pasta: path.join(estado.userData, 'agent-requests') })
  }

  const cartao = () => page.locator('[data-felixo-agent-browser-request]')

  async function pedidoDeAgente() {
    const passo = 'L12 pedido de agente'
    const pedidos = pedidosDoPerfil()
    await limparGravadores()
    await mostrarNotaRenderizadaSeFechada()
    await linkDaNota().focus()

    const primeiro = pedidos.registrar('abrir-pagina', { url: REQUEST_URL, modo: 'embutido', origem: 'canvas-smoke' })
    await cartao().waitFor({ state: 'visible', timeout }).catch(() => falhar(passo, 'o cartão do pedido não apareceu'))
    const texto = (await cartao().textContent()) ?? ''
    exigir(texto.includes('127.0.0.1') && texto.includes(REQUEST_URL), passo, 'o cartão não mostra o destino', { texto })
    exigir(texto.includes('O agente sugeriu a Página Web.'), passo, 'o cartão não mostra a sugestão', { texto })
    // Chegar não é abrir, nem roubar o foco de quem está digitando.
    exigir(
      await page.evaluate((url) => document.activeElement?.getAttribute('href') === url, DOCS_URL),
      passo,
      'o cartão roubou o foco',
    )
    exigir(pedidos.ler(primeiro.id).estado === 'pendente', passo, 'o pedido abriu sozinho', pedidos.ler(primeiro.id))

    await cartao().getByRole('button', { name: 'Recusar', exact: true }).click()
    await esperar(passo, 'o cartão sumir depois de recusar', () =>
      document.querySelector('[data-felixo-agent-browser-request]') === null)
    exigir(pedidos.ler(primeiro.id).estado === 'recusado', passo, 'recusar não resolveu o pedido', pedidos.ler(primeiro.id))

    const antes = await contarPaginasWeb()
    const segundo = pedidos.registrar('abrir-pagina', { url: REQUEST_URL, origem: 'canvas-smoke' })
    // Um de cada vez: a fila anda pela hora do pedido, e dois gravados no
    // mesmo milissegundo empatam.
    await esperar(passo, 'o segundo pedido no cartão', (id) =>
      document.querySelector('[data-felixo-agent-browser-request]')?.getAttribute('data-felixo-agent-browser-request') === id, segundo.id)
    await pausa(20)
    const terceiro = pedidos.registrar('abrir-pagina', { url: `${REQUEST_URL}-2`, origem: 'canvas-smoke' })
    await esperar(passo, 'o cartão com fila', () =>
      document.querySelector('[data-felixo-agent-browser-request]')?.textContent?.includes('+1 na fila') === true)
    await cartao().getByRole('button', { name: 'Abrir como Página Web' }).click()
    await esperarPaginasWeb(passo, 'o bloco do pedido', antes + 1)
    const aceito = pedidos.ler(segundo.id)
    exigir(aceito.estado === 'aceito' && aceito.resultado?.modo === 'embutido' && aceito.resultado?.modoPedido === 'externo',
      passo, 'a escolha da pessoa não ficou gravada', aceito)

    await esperar(passo, 'o próximo pedido no cartão', (id) =>
      document.querySelector('[data-felixo-agent-browser-request]')?.getAttribute('data-felixo-agent-browser-request') === id, terceiro.id)
    await cartao().getByRole('button', { name: 'Recusar', exact: true }).click()
    await esperar(passo, 'a fila esvaziar', () => document.querySelector('[data-felixo-agent-browser-request]') === null)
    exigir(pedidos.ler(terceiro.id).estado === 'recusado', passo, 'o último pedido não foi recusado', pedidos.ler(terceiro.id))
    exigir((await gravado()).opened.length === 0, passo, 'o cartão abriu o navegador sem clique', await gravado())
  }

  async function executar() {
    const pagina = await subirPaginaLocal()
    DOCS_URL = `${pagina.url}docs`
    REQUEST_URL = `${pagina.url}pedido`
    try {
      await prepararCanvas('L0 canvas', pagina.url)
      await markdownComMouse()
      await markdownComTeclado()
      await markdownEscolhas()
      await markdownRecusadoEEmail()
      await markdownCliqueDireitoEToque()
      const { xterm, ponto } = await terminalTexto()
      await terminalOsc8(xterm)
      await terminalStreaming(xterm, ponto)
      await terminalToque(xterm)
      await paginaWebMenuDeLink(pagina.url)
      await paginaWebBarraEBotao(pagina.url)
      await pedidoDeAgente()
      log('L0–L12 ok: Markdown, terminal (texto, OSC 8, streaming, toque), Página Web e pedido de agente')
    } finally {
      await pagina.fechar()
    }
  }

  return { executar }
}

module.exports = { criarSessaoDeLinks }

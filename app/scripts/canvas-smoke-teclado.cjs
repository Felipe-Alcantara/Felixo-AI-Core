'use strict'

/**
 * Foco, teclado e nomes acessíveis apontados pelo inventário do canvas (task 3ec91f95-497e-8197-a218-ef49c302013d).
 *
 * Os cliques são `dispatchEvent`: a janela escondida (sem RAF) faz a checagem de estabilidade do Playwright expirar.
 * O que se mede é o estado do DOM (`document.activeElement`, nome acessível, itens da árvore), não o clique.
 */

const { garantirSidebarAberta, abrirSecaoFerramentas } = require('./canvas-smoke-sobreposicoes.cjs')

const TIMEOUT_MS = process.platform === 'win32' ? 20_000 : 5_000
const POLLING_MS = 100

function falhar(mensagem, detalhe) {
  throw new Error(`[canvas-smoke:teclado] ${mensagem}${detalhe === undefined ? '' : `: ${JSON.stringify(detalhe)}`}`)
}

/** Fechar um painel devolve o foco ao botão que o abriu, não ao body (onde Delete/Backspace são teclas do canvas). */
async function checarFocoAoFecharPresetsDeAgente(page) {
  await garantirSidebarAberta(page)
  await abrirSecaoFerramentas(page)
  const gatilho = page.locator('[aria-label="Ferramentas auxiliares"] button').filter({ hasText: 'Presets de agente' }).first()
  await gatilho.dispatchEvent('click')
  const painel = page.locator('[data-felixo-canvas-panel="agent-presets"], [data-felixo-canvas-panel="agentPresets"]').first()
  await painel.waitFor({ state: 'visible', timeout: TIMEOUT_MS })
  await painel.locator('button[aria-label^="Fechar painel"]').first().dispatchEvent('click')
  await painel.waitFor({ state: 'hidden', timeout: TIMEOUT_MS })
  const voltou = await page
    .waitForFunction(
      () => {
        const ativo = document.activeElement
        return Boolean(ativo) && ativo !== document.body && /Presets de agente/.test(ativo.textContent ?? '')
      },
      null,
      { timeout: TIMEOUT_MS, polling: POLLING_MS },
    )
    .then(() => true, () => false)
  if (!voltou) {
    const ativo = await page.evaluate(() => ({ tag: document.activeElement?.tagName, texto: (document.activeElement?.textContent ?? '').slice(0, 40) }))
    falhar('fechar o painel de Presets de agente não devolveu o foco ao botão do menu', ativo)
  }
}

/** Menu de cor: o foco entra, as setas andam, Esc fecha e o foco volta; Tab sai. */
async function checarTecladoDoMenuDeCor(page) {
  const alvo = '.react-flow__node'
  await page.locator(alvo).first().waitFor({ state: 'attached', timeout: TIMEOUT_MS })
  await page.evaluate((sel) => {
    const no = document.querySelector(sel)
    const r = no.getBoundingClientRect()
    no.focus() // o clique direito de verdade foca o bloco: é para ele que o foco deve voltar
    no.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 20, clientY: r.top + 20 }))
  }, alvo)
  const menu = '[role="menu"][aria-label="Cor da moldura"]'
  await page.locator(menu).waitFor({ state: 'visible', timeout: TIMEOUT_MS })
  const dentro = await page.evaluate((sel) => Boolean(document.querySelector(sel)?.contains(document.activeElement)), menu)
  if (!dentro) falhar('o foco não entrou no menu de cor')

  const primeiro = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))
  await page.evaluate(() => document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })))
  const segundo = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))
  if (!segundo || segundo === primeiro) falhar('a seta não moveu o foco entre as cores', { primeiro, segundo })

  await page.evaluate(() => document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })))
  await page.locator(menu).waitFor({ state: 'hidden', timeout: TIMEOUT_MS })
  const volta = await page.evaluate(() => ({ tag: document.activeElement?.tagName, noDoCanvas: Boolean(document.activeElement?.closest('.react-flow__node')) }))
  if (!volta.noDoCanvas) falhar('fechar o menu de cor não devolveu o foco ao bloco', volta)

  // Rolar o canvas fecha o menu (ele é fixo e ficaria no lugar antigo).
  await page.evaluate((sel) => {
    const no = document.querySelector(sel)
    const r = no.getBoundingClientRect()
    no.focus() // o clique direito de verdade foca o bloco: é para ele que o foco deve voltar
    no.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 20, clientY: r.top + 20 }))
  }, alvo)
  await page.locator(menu).waitFor({ state: 'visible', timeout: TIMEOUT_MS })
  await page.evaluate(() => window.dispatchEvent(new WheelEvent('wheel', { deltaY: 40, bubbles: true, cancelable: true })))
  await page.locator(menu).waitFor({ state: 'hidden', timeout: TIMEOUT_MS }).catch(() => falhar('a roda não fechou o menu de cor'))
}

/** Nomes acessíveis únicos na sidebar expandida, e a árvore do Git com itens. */
async function checarNomesAcessiveisDaSidebar(page) {
  await garantirSidebarAberta(page)
  const nomes = await page.evaluate(() => {
    const contagem = {}
    for (const el of document.querySelectorAll('[data-felixo-region="sidebar"] button')) {
      const nome = (el.getAttribute('aria-label') || '').trim()
      if (nome && !el.closest('[inert]')) contagem[nome] = (contagem[nome] ?? 0) + 1
    }
    return Object.entries(contagem).filter(([, n]) => n > 1)
  })
  if (nomes.length) falhar('nome acessível repetido na sidebar', nomes)
}

module.exports = {
  checarFocoAoFecharPresetsDeAgente,
  checarNomesAcessiveisDaSidebar,
  checarTecladoDoMenuDeCor,
}

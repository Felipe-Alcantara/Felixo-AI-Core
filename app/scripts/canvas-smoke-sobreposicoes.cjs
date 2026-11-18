'use strict'

/**
 * Riscos de sobreposição do inventário do canvas (`src/features/canvas/inventory/data/`),
 * medidos no renderer pela task 3ec91f95-497e-8112-82f9-fd1b86e3ec7d.
 *
 * Cada `checar…` monta o cenário (viewport, bloco, painel ou menu aberto), mede os
 * retângulos e o que o clique alcança (`elementFromPoint`) e devolve as medidas e os
 * problemas. Os asserts são relacionais, como em `canvas-smoke-onboarding-geometry.cjs`:
 * nenhuma coordenada fixa. Um defeito já sabido fica em `DEFEITOS_CONHECIDOS`, com a task:
 * o gate não quebra por ele, mas um caso novo quebra. Quem corrigir o defeito tira a entrada.
 *
 * Os cliques são `dispatchEvent`: a janela escondida (sem RAF) faz a checagem de
 * estabilidade do Playwright expirar. O que se mede é a superfície aberta, não o clique.
 *
 * Fora daqui, como lacuna no inventário: os avisos de hardware e o card de instalação das CLIs
 * (só aparecem com estado de máquina que esta sessão não tem: Modo Performance sugerido com CPU
 * fraca, recuperação de GPU, instalação em curso ou falha); o aviso "link não abriu" junto do tour
 * e do NoticeToast; Git com a gaveta do terminal; o QA Logger; as teclas durante a sobreposição de
 * operação; o pedido de navegador do agente; o bloco de terminal mínimo; e o popover do Excalidraw.
 */

const { SUBPIXEL, intersects } = require('./canvas-smoke-onboarding-geometry.cjs')
const { registrarPerguntaNoPerfil } = require('./canvas-smoke-onboarding.cjs')
const { readState } = require('../electron/cli/felixo-devtools.cjs')

const TASK_SOBREPOSICOES = '3ec91f95-497e-8112-82f9-fd1b86e3ec7d'
const INTERACTION_TIMEOUT_MS = process.platform === 'win32' ? 20_000 : 5_000
const HYDRATION_TIMEOUT_MS = process.platform === 'win32' || process.platform === 'linux' ? 45_000 : 20_000
/** Espera por condição com checagem a cada 100 ms: o padrão usa RAF, que a janela escondida não entrega. */
const POLLING_MS = 100
/** Faixa de canvas que a sidebar não pode tomar: o MIN_CANVAS_STRIP das ferramentas (inventário). */
const FAIXA_MINIMA_DO_CANVAS = 160
/** Os três pontos de viewport dos riscos de layout: 320, 768 e 1280 px, como na matriz. */
const VIEWPORTS_DOS_RISCOS = [
  { width: 320, height: 720 },
  { width: 768, height: 900 },
  { width: 1280, height: 800 },
]

/**
 * Defeitos já sabidos, com a task. Entrada = risco + tipo de problema + (opcional) caso.
 * `when` restringe o caso; sem `when`, vale em todos. Nada aqui é genérico: cada entrada
 * diz exatamente qual caso medido já está confirmado como defeito.
 */
const DEFEITOS_CONHECIDOS = [
  { risco: 'menu-ligar-agente', tipo: 'menu-cortado-pela-borda-de-cima', task: TASK_SOBREPOSICOES },
  { risco: 'menu-cor-moldura', tipo: 'fora-da-janela', task: TASK_SOBREPOSICOES },
  { risco: 'sidebar-expandida', tipo: 'faixa-do-canvas-curta', task: TASK_SOBREPOSICOES, when: (caso) => caso.width <= 320 },
  { risco: 'detalhes-e-ferramenta', tipo: 'detalhes-e-ferramenta-no-mesmo-lugar', task: TASK_SOBREPOSICOES },
  { risco: 'menu-perfil-acompanha-zoom', tipo: 'menu-nao-acompanha-o-zoom', task: TASK_SOBREPOSICOES },
  { risco: 'pergunta-sob-dialogos', tipo: 'pergunta-coberta-pelo-dialogo', task: TASK_SOBREPOSICOES },
]

/** Fixture dos cenários: um grupo grande, um arquivo baixo, agentes e uma Página Web. */
const NO_GRUPO = {
  id: 'sob-grupo',
  type: 'group',
  position: { x: 0, y: 0 },
  width: 480,
  height: 320,
  data: { label: 'Grupo sobreposição' },
}
const NO_ARQUIVO_BAIXO = {
  id: 'sob-arquivo',
  type: 'file',
  position: { x: 560, y: 0 },
  width: 320,
  height: 150,
  data: { fileName: 'sobre.md', label: 'Arquivo baixo', mode: 'scratchpad' },
}
const NO_TERMINAL = {
  id: 'sob-terminal',
  type: 'terminal',
  position: { x: 0, y: 420 },
  width: 520,
  height: 360,
  data: { label: 'Agente sobreposição', command: 'mock', args: [], cwd: '', launchMode: 'agent' },
}
const NO_WEB = {
  id: 'sob-web',
  type: 'webpage',
  position: { x: 1240, y: 0 },
  width: 560,
  height: 420,
  data: { label: 'Web sobreposição', url: 'http://127.0.0.1:9/' },
}
/** Seis agentes sem ligar: o menu "Ligar agente" do arquivo baixo fica mais alto que o cartão. */
const AGENTES_EXTRAS = Array.from({ length: 6 }, (_, index) => ({
  id: `sob-agente-${index + 1}`,
  type: 'terminal',
  position: { x: 1000 + index * 40, y: 900 + index * 40 },
  width: 520,
  height: 360,
  data: { label: `Agente extra ${index + 1}`, command: 'mock', args: [], cwd: '', launchMode: 'agent' },
}))
const FIXTURE_DOS_RISCOS = [NO_GRUPO, NO_ARQUIVO_BAIXO, NO_TERMINAL, NO_WEB, ...AGENTES_EXTRAS]

// ---------------------------------------------------------------------------
// Funções puras (testadas em `canvas-smoke-sobreposicoes.test.cjs`)
// ---------------------------------------------------------------------------

/** Os lados em que `rect` passa da janela `viewport` (mais que o subpixel). */
function cortesDaJanela(rect, viewport) {
  const lados = {}
  if (rect.left < -SUBPIXEL) lados.esquerda = Math.round(-rect.left)
  if (rect.top < -SUBPIXEL) lados.topo = Math.round(-rect.top)
  if (rect.right > viewport.width + SUBPIXEL) lados.direita = Math.round(rect.right - viewport.width)
  if (rect.bottom > viewport.height + SUBPIXEL) lados.base = Math.round(rect.bottom - viewport.height)
  return Object.keys(lados).length ? [{ tipo: 'fora-da-janela', lados }] : []
}

/** Um menu que abre para cima do botão some pela borda de cima do cartão `overflow-hidden`. */
function cortesDoMenuPorCima(menu, cartao) {
  if (!menu || !cartao) return [{ tipo: 'sem-medida' }]
  const cortado = cartao.top - menu.top
  return cortado > SUBPIXEL ? [{ tipo: 'menu-cortado-pela-borda-de-cima', cortadoEm: Math.round(cortado) }] : []
}

/** Área da sobreposição de dois retângulos, ou `null` quando só encostam. */
function sobreposicao(first, second) {
  if (!first || !second || !intersects(first, second)) return null
  return {
    largura: Math.round(Math.min(first.right, second.right) - Math.max(first.left, second.left)),
    altura: Math.round(Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top)),
  }
}

/**
 * A sidebar deixa menos que a faixa mínima de canvas, ou a barra superior sai da janela.
 * `medidas.sidebar` e `medidas.topbar` são retângulos (ou `null` quando ausentes).
 */
function problemasDaSidebar({ sidebar, topbar }, viewport) {
  if (!sidebar) return [{ tipo: 'sem-medida', elemento: 'sidebar' }]
  const problemas = []
  const faixa = Math.max(0, viewport.width - sidebar.right)
  if (faixa < FAIXA_MINIMA_DO_CANVAS) problemas.push({ tipo: 'faixa-do-canvas-curta', faixa: Math.round(faixa) })
  if (topbar && (topbar.left < -SUBPIXEL || topbar.right > viewport.width + SUBPIXEL)) {
    problemas.push({ tipo: 'barra-superior-fora-da-janela', topbar })
  }
  return problemas
}

/** Separa os problemas medidos entre os já sabidos (com task) e os novos. */
function separarDefeitos(risco, caso, problemas, defeitos = DEFEITOS_CONHECIDOS) {
  const conhecidos = []
  const novos = []
  for (const problema of problemas) {
    const sabido = defeitos.find(
      (entrada) => entrada.risco === risco && entrada.tipo === problema.tipo && (!entrada.when || entrada.when(caso)),
    )
    if (sabido) conhecidos.push({ ...problema, task: sabido.task })
    else novos.push(problema)
  }
  return { conhecidos, novos }
}

function resultado(risco, caso, medidas, problemas) {
  return { risco, caso, rotulo: `${caso.width}x${caso.height}`, medido: true, medidas, problemas }
}

// ---------------------------------------------------------------------------
// Renderer: leitura, preparo e navegação (Playwright; `page.evaluate` onde lê o DOM)
// ---------------------------------------------------------------------------

/** Retângulos visíveis dos seletores nomeados; `null` quando o elemento não existe ou está oculto. */
async function lerCaixas(page, seletores) {
  return page.evaluate((mapa) => {
    const caixa = (elemento) => {
      if (!elemento) return null
      const estilo = getComputedStyle(elemento)
      const r = elemento.getBoundingClientRect()
      if (estilo.display === 'none' || estilo.visibility === 'hidden' || r.width <= 0 || r.height <= 0) return null
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }
    }
    return Object.fromEntries(Object.entries(mapa).map(([nome, seletor]) => [nome, caixa(document.querySelector(seletor))]))
  }, seletores)
}

async function definirJanela(page, viewport) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height })
  await page.waitForFunction(
    ([w, h]) => window.innerWidth === w && window.innerHeight === h,
    [viewport.width, viewport.height],
    { timeout: INTERACTION_TIMEOUT_MS, polling: POLLING_MS },
  )
  await page.waitForTimeout(300)
}

/**
 * Espera o viewport do React Flow parar de mudar. As transições de zoom e de enquadrar usam
 * RAF (d3-timer): na janela escondida andam a poucos quadros por segundo, e uma espera fixa
 * mediria o meio do movimento.
 */
async function esperarViewportAssentar(page) {
  await page.waitForFunction(
    () => {
      const atual = document.querySelector('.react-flow__viewport')?.style.transform ?? ''
      const anterior = window.__sobreposicaoTransform
      window.__sobreposicaoTransform = atual
      return atual !== '' && atual === anterior
    },
    null,
    { timeout: INTERACTION_TIMEOUT_MS * 3, polling: 600 },
  )
}

async function lerTransform(page) {
  return page.evaluate(() => document.querySelector('.react-flow__viewport')?.style.transform ?? '')
}

/** Espera a transformação do canvas sair de `antes`. Devolve `false` se não mudar no prazo. */
async function esperarMudancaDeTransform(page, antes, timeout = INTERACTION_TIMEOUT_MS * 2) {
  try {
    await page.waitForFunction(
      (anterior) => (document.querySelector('.react-flow__viewport')?.style.transform ?? '') !== anterior,
      antes,
      { timeout, polling: 200 },
    )
    return true
  } catch {
    return false
  }
}

/** Dispara uma tecla no elemento pelo DOM (o React lê o `keydown`); não depende de foco nem de RAF. */
async function pressionarNoDom(page, seletor, key, shiftKey = false) {
  await page.evaluate(
    ({ sel, tecla, shift }) => {
      document.querySelector(sel)?.dispatchEvent(new KeyboardEvent('keydown', { key: tecla, shiftKey: shift, bubbles: true, cancelable: true }))
    },
    { sel: seletor, tecla: key, shift: shiftKey },
  )
}

async function enquadrarTodos(page) {
  const antes = await lerTransform(page)
  await page.evaluate(() => {
    document
      .querySelector('.felixo-zoom-pill button[aria-label="Enquadrar todos os blocos"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
  })
  // Já enquadrado não muda a transformação: aí não há o que esperar.
  if (await esperarMudancaDeTransform(page, antes, 3000)) await esperarViewportAssentar(page)
}

async function prepararCanvas(page) {
  await page.evaluate(async (nos) => {
    const ponte = window.felixo?.canvas
    if (!ponte) throw new Error('ponte canvas indisponivel')
    const limpo = await ponte.clear()
    if (!limpo?.ok) throw new Error(limpo?.message || 'limpeza do canvas falhou')
    for (const no of nos) {
      const salvo = await ponte.save(no)
      if (!salvo?.ok) throw new Error(salvo?.message || `persistencia falhou: ${no.id}`)
    }
  }, FIXTURE_DOS_RISCOS)
  await page.reload()
  await page.waitForFunction(
    (ids) => ids.every((id) => document.querySelector(`[data-id="${id}"]`)),
    FIXTURE_DOS_RISCOS.map((no) => no.id),
    { timeout: HYDRATION_TIMEOUT_MS, polling: POLLING_MS },
  )
  await page.waitForSelector('.felixo-zoom-pill', { timeout: HYDRATION_TIMEOUT_MS })
}

async function garantirSidebarAberta(page) {
  const recolhida = await page.evaluate(
    () => document.querySelector('.felixo-sidebar-content')?.getAttribute('aria-hidden') === 'true',
  )
  if (!recolhida) return
  await page.locator('nav.felixo-activity-rail').getByRole('button', { name: /Expandir sidebar/ }).dispatchEvent('click')
  await page.waitForFunction(
    () => document.querySelector('.felixo-sidebar-content')?.getAttribute('aria-hidden') !== 'true',
    null,
    { timeout: INTERACTION_TIMEOUT_MS, polling: POLLING_MS },
  )
}

async function recolherSidebar(page) {
  const aberta = await page.evaluate(
    () => document.querySelector('.felixo-sidebar-content')?.getAttribute('aria-hidden') !== 'true',
  )
  if (!aberta) return
  await page.locator('nav.felixo-activity-rail').getByRole('button', { name: /Recolher sidebar/ }).dispatchEvent('click')
  await page.waitForFunction(
    () => document.querySelector('.felixo-sidebar-content')?.getAttribute('aria-hidden') === 'true',
    null,
    { timeout: INTERACTION_TIMEOUT_MS, polling: POLLING_MS },
  )
}

/** Expande a seção "Ferramentas" da sidebar, que começa recolhida e guarda o menu de ferramentas. */
async function abrirSecaoFerramentas(page) {
  const aberta = await page.evaluate(() => Boolean(document.querySelector('[aria-label="Ferramentas auxiliares"]')))
  if (aberta) return
  await page.evaluate(() => {
    const cabecalho = [...document.querySelectorAll('button')].find((botao) => /^Ferramentas$/.test(botao.textContent.trim()))
    if (!cabecalho) throw new Error('cabeçalho da seção Ferramentas ausente')
    cabecalho.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
  })
  await page.waitForFunction(
    () => Boolean(document.querySelector('[aria-label="Ferramentas auxiliares"]')),
    null,
    { timeout: INTERACTION_TIMEOUT_MS, polling: POLLING_MS },
  )
}

/** Abre a gaveta do terminal do agente e o diálogo "Passar" (handoff) por cima dela. */
async function abrirDialogoDeHandoff(page) {
  await page.locator('[data-terminal-expand-trigger="sob-terminal"]').first().dispatchEvent('click')
  await page.locator('[data-canvas-terminal-drawer]').waitFor({ state: 'visible', timeout: INTERACTION_TIMEOUT_MS })
  await page.locator('[data-canvas-handoff-trigger]').first().dispatchEvent('click')
  await page.locator('[role="dialog"][aria-modal="true"]').first().waitFor({ state: 'visible', timeout: INTERACTION_TIMEOUT_MS })
}

async function fecharDialogoDeHandoff(page) {
  await page.keyboard.press('Escape')
  await page.locator('[role="dialog"][aria-modal="true"]').first().waitFor({ state: 'hidden', timeout: INTERACTION_TIMEOUT_MS })
  await page.getByRole('button', { name: 'Fechar terminal' }).first().dispatchEvent('click')
  await page.waitForFunction(
    () => !document.querySelector('[data-canvas-terminal-drawer]'),
    null,
    { timeout: INTERACTION_TIMEOUT_MS, polling: POLLING_MS },
  )
}

/**
 * Abre uma ferramenta pelo `abridor`, mede o painel dela contra a pílula de zoom e fecha.
 * Devolve `[]` quando o painel não abre (a ferramenta não é de painel).
 */
async function medirFerramenta(page, caso, abridor, rotulo) {
  await abridor.dispatchEvent('click')
  // O primeiro painel que aparece é o `loading-*` do chunk preguiçoso: espera o painel de verdade.
  const painel = page.locator('[data-felixo-canvas-panel]:not([data-felixo-canvas-panel^="loading-"])').first()
  const abriu = await painel.waitFor({ state: 'visible', timeout: INTERACTION_TIMEOUT_MS }).then(() => true, () => false)
  if (!abriu) return []
  const id = await painel.getAttribute('data-felixo-canvas-panel')
  const seletorPainel = `[data-felixo-canvas-panel="${id}"]`
  const resultados = [await medirPainelAberto(page, caso, rotulo, id, 'padrao')]
  // O painel também cresce até a altura máxima pela alça (Shift+seta para baixo): é o caso do risco.
  if (await alturaMaximaDoPainel(page, id)) resultados.push(await medirPainelAberto(page, caso, rotulo, id, 'maxima'))
  await pressionarNoDom(page, `[data-felixo-panel-height-handle="${id}"]`, 'Home')
  await page.locator(`${seletorPainel} button[aria-label^="Fechar painel"]`).first().dispatchEvent('click')
  await page.locator(seletorPainel).waitFor({ state: 'hidden', timeout: INTERACTION_TIMEOUT_MS })
  return resultados
}

/** Mede um painel já aberto contra a pílula de zoom e contra o botão "Aumentar zoom". */
async function medirPainelAberto(page, caso, rotulo, id, altura) {
  const seletorPainel = `[data-felixo-canvas-panel="${id}"]`
  const medidas = await lerCaixas(page, {
    painel: seletorPainel,
    pilula: '.felixo-zoom-pill',
    botaoAumentar: '.felixo-zoom-pill button[aria-label="Aumentar zoom"]',
  })
  const problemas = []
  const cobre = sobreposicao(medidas.painel, medidas.pilula)
  if (cobre) problemas.push({ tipo: 'painel-cobre-a-pilula', area: cobre })
  if (medidas.botaoAumentar) {
    const sobBotao = await page.evaluate((box) => {
      const hit = document.elementFromPoint((box.left + box.right) / 2, (box.top + box.bottom) / 2)
      return Boolean(hit?.closest?.('[data-felixo-canvas-panel]'))
    }, medidas.botaoAumentar)
    if (sobBotao) problemas.push({ tipo: 'botao-de-zoom-coberto-pelo-painel' })
  }
  return resultado('painel-sobre-pilula-de-zoom', { ...caso, ferramenta: rotulo, painel: id, altura }, medidas, problemas)
}

/**
 * Leva a altura do painel ao máximo: Shift+seta para baixo (passo de 80 px) até a altura visível
 * parar de crescer. Devolve `false` quando o painel não tem alça de altura (espaço de trabalho).
 */
async function alturaMaximaDoPainel(page, id) {
  const alca = `[data-felixo-panel-height-handle="${id}"]`
  if (!(await page.locator(alca).count())) return false
  const painel = `[data-felixo-canvas-panel="${id}"]`
  let anterior = -1
  for (let passo = 0; passo < 40; passo += 1) {
    await pressionarNoDom(page, alca, 'ArrowDown', true)
    const altura = await page.evaluate((sel) => Math.round(document.querySelector(sel)?.getBoundingClientRect().height ?? 0), painel)
    if (altura === anterior) return true
    anterior = altura
  }
  throw new Error(`altura do painel ${id} não parou de crescer em 40 passos`)
}

// ---------------------------------------------------------------------------
// Cenários: um por risco do inventário. Cada um devolve uma lista de resultados.
// ---------------------------------------------------------------------------

/** Risco: `nodes.ts` → "Ligar agente" de um bloco de arquivo baixo com muitos agentes. */
async function checarMenuLigarAgenteDentroDoCartao(page) {
  const caso = { width: 1280, height: 800 }
  await definirJanela(page, caso)
  await enquadrarTodos(page)
  const seletorMenu = '[data-id="sob-arquivo"] .nowheel.absolute.bottom-full'
  const botao = page.locator('[data-id="sob-arquivo"]').getByRole('button', { name: 'Ligar agente' }).first()
  await botao.dispatchEvent('click')
  await page.locator(seletorMenu).waitFor({ state: 'visible', timeout: INTERACTION_TIMEOUT_MS })
  const medidas = await lerCaixas(page, {
    cartao: '[data-id="sob-arquivo"] .felixo-canvas-card',
    menu: seletorMenu,
  })
  const problemas = cortesDoMenuPorCima(medidas.menu, medidas.cartao)
  // O próprio botão fecha o menu; ele fica abaixo do menu, então não é coberto por ele.
  await botao.dispatchEvent('click')
  await page.locator(seletorMenu).waitFor({ state: 'hidden', timeout: INTERACTION_TIMEOUT_MS })
  return [resultado('menu-ligar-agente', caso, medidas, problemas)]
}

/** Risco: `nodes.ts` → menu de cor da moldura aberto perto da borda direita ou de baixo. */
async function checarMenuDeCorDentroDaJanela(page) {
  const resultados = []
  const seletor = '[role="menu"][aria-label="Cor da moldura"]'
  for (const caso of VIEWPORTS_DOS_RISCOS) {
    await definirJanela(page, caso)
    await enquadrarTodos(page)
    await page.evaluate(({ width, height }) => {
      const alvo = document.querySelector('[data-id="sob-grupo"]')
      if (!alvo) throw new Error('bloco de grupo ausente')
      alvo.dispatchEvent(
        new MouseEvent('contextmenu', { bubbles: true, cancelable: true, view: window, button: 2, clientX: width - 4, clientY: height - 4 }),
      )
    }, caso)
    await page.locator(seletor).waitFor({ state: 'visible', timeout: INTERACTION_TIMEOUT_MS })
    const medidas = await lerCaixas(page, { menu: seletor })
    resultados.push(resultado('menu-cor-moldura', caso, medidas, cortesDaJanela(medidas.menu, caso)))
    await page.keyboard.press('Escape')
    await page.locator(seletor).waitFor({ state: 'hidden', timeout: INTERACTION_TIMEOUT_MS })
  }
  return resultados
}

/** Risco: `chrome.ts` → sidebar expandida em janela estreita: canvas e barra superior. */
async function checarSidebarExpandidaEmJanelaEstreita(page) {
  const resultados = []
  for (const caso of VIEWPORTS_DOS_RISCOS) {
    await definirJanela(page, caso)
    await garantirSidebarAberta(page)
    const medidas = await lerCaixas(page, {
      sidebar: '[data-felixo-region="sidebar"]',
      topbar: '[data-felixo-region="topbar"]',
    })
    resultados.push(resultado('sidebar-expandida', caso, medidas, problemasDaSidebar(medidas, caso)))
  }
  return resultados
}

/**
 * Risco: `chrome.ts` → painel de ferramenta (z-20, até viewport − 112 px) cobre a pílula de
 * zoom. Com a sidebar aberta (768 e 1280 px), abre cada ferramenta da seção "Ferramentas".
 * A 320 px a sidebar recolhida só deixa a Busca na barra, então só ela é medida ali; as outras
 * pedem a sidebar aberta, que é o risco `sidebar-expandida`.
 */
async function checarPainelDeFerramentaSobPilulaDeZoom(page) {
  const resultados = []
  const pequena = { width: 320, height: 720 }
  await definirJanela(page, pequena)
  await enquadrarTodos(page)
  await recolherSidebar(page)
  resultados.push(...(await medirFerramenta(page, pequena, page.locator('[data-canvas-tool-trigger="search"]').first(), 'Busca')))
  for (const caso of [{ width: 768, height: 900 }, { width: 1280, height: 800 }]) {
    await definirJanela(page, caso)
    await enquadrarTodos(page)
    await garantirSidebarAberta(page)
    await abrirSecaoFerramentas(page)
    const menu = page.locator('[aria-label="Ferramentas auxiliares"] button')
    const total = await menu.count()
    for (let indice = 0; indice < total; indice += 1) {
      const rotulo = ((await menu.nth(indice).textContent()) ?? '').trim()
      // "Tarefas Notion" cria um bloco no canvas em vez de abrir painel.
      if (!rotulo || /Tarefas Notion/i.test(rotulo)) continue
      resultados.push(...(await medirFerramenta(page, caso, menu.nth(indice), rotulo)))
    }
  }
  return resultados
}

/**
 * Risco: `terminal.ts` → detalhes do terminal (CanvasPanel em top-16) e uma ferramenta
 * ocupam o mesmo lugar: só o focus-within decide quem fica por cima.
 */
async function checarDetalhesDoTerminalComFerramenta(page) {
  const resultados = []
  const detalhes = '[data-felixo-canvas-panel="terminal-details"]'
  const busca = '[data-felixo-canvas-panel="search"]'
  for (const caso of VIEWPORTS_DOS_RISCOS.filter((item) => item.width >= 768)) {
    await definirJanela(page, caso)
    await enquadrarTodos(page)
    await garantirSidebarAberta(page)
    await page.locator('[data-id="sob-terminal"] [aria-label="Ver detalhes do terminal"]').first().dispatchEvent('click')
    await page.locator(detalhes).waitFor({ state: 'visible', timeout: INTERACTION_TIMEOUT_MS })
    await page.locator('[data-canvas-tool-trigger="search"]').first().dispatchEvent('click')
    await page.locator(busca).waitFor({ state: 'visible', timeout: INTERACTION_TIMEOUT_MS })
    const medidas = await lerCaixas(page, { detalhes, busca })
    const problemas = []
    const cobre = sobreposicao(medidas.detalhes, medidas.busca)
    if (cobre) problemas.push({ tipo: 'detalhes-e-ferramenta-no-mesmo-lugar', area: cobre })
    resultados.push(resultado('detalhes-e-ferramenta', caso, medidas, problemas))
    await page.locator(`${busca} button[aria-label^="Fechar painel"]`).first().dispatchEvent('click')
    await page.locator(busca).waitFor({ state: 'hidden', timeout: INTERACTION_TIMEOUT_MS })
    await page.locator(`${detalhes} button[aria-label^="Fechar painel"]`).first().dispatchEvent('click')
    await page.locator(detalhes).waitFor({ state: 'hidden', timeout: INTERACTION_TIMEOUT_MS })
  }
  return resultados
}

/**
 * Risco: `overlays.ts` → as alças de redimensionar do diálogo cobrem um botão do rodapé.
 * Mede o centro de cada botão visível do diálogo e vê quem o clique alcança.
 */
async function checarAlcasDoDialogoSobBotoes(page) {
  const resultados = []
  for (const caso of VIEWPORTS_DOS_RISCOS.filter((item) => item.width >= 768)) {
    await definirJanela(page, caso)
    await enquadrarTodos(page)
    await abrirDialogoDeHandoff(page)
    const botoes = await page.evaluate(() => {
      const dialogo = document.querySelector('[role="dialog"][aria-modal="true"]')
      if (!dialogo) return []
      return [...dialogo.querySelectorAll('button')]
        .filter((botao) => !botao.disabled && botao.getBoundingClientRect().width > 0)
        .map((botao) => {
          const r = botao.getBoundingClientRect()
          const hit = document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2)
          const alca = hit?.closest?.('[data-felixo-dialog-handle]') ?? null
          // Área de encosto com cada alça: o centro pode estar livre e ainda haver sobreposição nas bordas.
          // As alças ficam no quadro do diálogo (irmãs do painel role="dialog"): busca no documento inteiro.
          const sobrepostos = [...document.querySelectorAll('[data-felixo-dialog-handle]')]
            .map((h) => {
              const q = h.getBoundingClientRect()
              const largura = Math.min(r.right, q.right) - Math.max(r.left, q.left)
              const altura = Math.min(r.bottom, q.bottom) - Math.max(r.top, q.top)
              return largura > 0 && altura > 0
                ? { alca: h.getAttribute('data-felixo-dialog-handle'), largura: Math.round(largura), altura: Math.round(altura) }
                : null
            })
            .filter(Boolean)
          return {
            botao: (botao.getAttribute('aria-label') || botao.textContent || '').trim().slice(0, 40),
            alca: alca ? alca.getAttribute('data-felixo-dialog-handle') : null,
            sobrepostos,
          }
        })
    })
    const problemas = botoes
      .filter((item) => item.alca)
      .map((item) => ({ tipo: 'alca-cobre-o-botao', botao: item.botao, alca: item.alca }))
    const encostos = botoes.filter((item) => item.sobrepostos.length).map((item) => ({ botao: item.botao, sobrepostos: item.sobrepostos }))
    // Conta as alças antes de julgar: zero botões cobertos só vale se as alças existirem no diálogo.
    const alcas = await page.evaluate(() => document.querySelectorAll('[data-felixo-dialog-handle]').length)
    resultados.push(resultado('alcas-sobre-botoes', caso, { alcas, botoes: botoes.length, encostos }, problemas))
    await fecharDialogoDeHandoff(page)
  }
  return resultados
}

/**
 * Risco: `nodes.ts` → menu de perfil da Página Web (z-70, em portal) não acompanha o zoom: o
 * menu é posicionado só ao abrir, então o botão se move e o menu fica no lugar.
 */
async function checarMenuDoPerfilAcompanhaOZoom(page) {
  const caso = { width: 1280, height: 800 }
  await definirJanela(page, caso)
  await enquadrarTodos(page)
  const gatilho = '[data-id="sob-web"] button[aria-haspopup="menu"]'
  const menu = '.fixed.z-70.w-52'
  await page.locator(gatilho).first().dispatchEvent('click')
  await page.locator(menu).first().waitFor({ state: 'visible', timeout: INTERACTION_TIMEOUT_MS })
  const antes = await lerCaixas(page, { gatilho, menu })
  const transformAntes = await lerTransform(page)
  // Clique sintético no botão do zoom: não fecha o menu por fora antes da medida.
  await page.evaluate(() => {
    document
      .querySelector('.felixo-zoom-pill button[aria-label="Aumentar zoom"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
  })
  const zoomMudou = await esperarMudancaDeTransform(page, transformAntes)
  if (zoomMudou) await esperarViewportAssentar(page)
  const depois = await lerCaixas(page, { gatilho, menu })
  const medidas = { antes, depois, zoomMudou }
  if (!zoomMudou) {
    return [{ risco: 'menu-perfil-acompanha-zoom', caso, rotulo: `${caso.width}x${caso.height}`, medido: false, medidas, problemas: [], motivo: 'o botão de zoom não mudou o canvas' }]
  }
  const problemas = []
  if (!depois.menu) {
    medidas.menuFechouNoZoom = true
  } else if (antes.gatilho && depois.gatilho) {
    const andouBotao = Math.abs(depois.gatilho.left - antes.gatilho.left) > 5
    const andouMenu = Math.abs(depois.menu.left - antes.menu.left) > 2
    if (andouBotao && !andouMenu) {
      problemas.push({ tipo: 'menu-nao-acompanha-o-zoom', deslocouBotaoEm: Math.round(depois.gatilho.left - antes.gatilho.left) })
    }
  }
  await page.keyboard.press('Escape')
  return [resultado('menu-perfil-acompanha-zoom', caso, medidas, problemas)]
}

/**
 * Risco: `terminal.ts` → a pergunta do agente (AgentQuestionDialog, z-60) fica por baixo do
 * diálogo de passagem (HandoffDialog, z-60) quando os dois estão abertos. A pergunta fica
 * pendente no perfil isolado: por isso este cenário é o último.
 */
async function checarPerguntaDoAgenteSobDialogos(page) {
  // Uma largura só: a ordem de empilhamento (z-60 e ordem do DOM) não depende do viewport.
  const caso = { width: 1280, height: 800 }
  await definirJanela(page, caso)
  await enquadrarTodos(page)
  await abrirDialogoDeHandoff(page)
  const pergunta = 'Pergunta de sobreposição?'
  registrarPerguntaNoPerfil(readState(), { pergunta, opcoes: ['Sim', 'Não'] })
  const apareceu = await page.getByText(pergunta).first().waitFor({ state: 'visible', timeout: HYDRATION_TIMEOUT_MS }).then(() => true, () => false)
  if (!apareceu) {
    return [{ risco: 'pergunta-sob-dialogos', caso, rotulo: `${caso.width}x${caso.height}`, medido: false, medidas: {}, problemas: [], motivo: 'a pergunta do agente não apareceu com o diálogo aberto' }]
  }
  const medidas = await page.evaluate((texto) => {
    const dialogos = [...document.querySelectorAll('[role="dialog"][aria-modal="true"]')]
    const caixa = (el) => {
      const r = el.getBoundingClientRect()
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }
    }
    const perguntaEl = dialogos.find((el) => el.textContent?.includes(texto)) ?? null
    if (!perguntaEl) return null
    const outro = dialogos.find((el) => el !== perguntaEl) ?? null
    const r = perguntaEl.getBoundingClientRect()
    const hit = document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2)
    return {
      pergunta: caixa(perguntaEl),
      outro: outro ? caixa(outro) : null,
      coberta: Boolean(hit) && !perguntaEl.contains(hit),
      cobridorTitulo: hit ? (hit.closest?.('[role="dialog"]')?.querySelector('h2')?.textContent ?? '').trim().slice(0, 40) : null,
    }
  }, pergunta)
  if (!medidas) {
    return [{ risco: 'pergunta-sob-dialogos', caso, rotulo: `${caso.width}x${caso.height}`, medido: false, medidas: {}, problemas: [], motivo: 'o diálogo da pergunta não aparece como role="dialog" aria-modal' }]
  }
  const problemas = medidas.coberta ? [{ tipo: 'pergunta-coberta-pelo-dialogo', por: medidas.cobridorTitulo }] : []
  return [resultado('pergunta-sob-dialogos', caso, medidas, problemas)]
}

// ---------------------------------------------------------------------------
// Entrada usada pelo smoke (canvas-smoke.cjs) e pelo runner de desenvolvimento
// ---------------------------------------------------------------------------

const CENARIOS = [
  { risco: 'menu-ligar-agente', inventario: 'nodes.ts (Bloco Arquivo)', medir: checarMenuLigarAgenteDentroDoCartao },
  { risco: 'menu-cor-moldura', inventario: 'nodes.ts (menu de cor)', medir: checarMenuDeCorDentroDaJanela },
  { risco: 'sidebar-expandida', inventario: 'chrome.ts (Coluna da sidebar)', medir: checarSidebarExpandidaEmJanelaEstreita },
  { risco: 'painel-sobre-pilula-de-zoom', inventario: 'chrome.ts (Pílula de zoom)', medir: checarPainelDeFerramentaSobPilulaDeZoom },
  { risco: 'detalhes-e-ferramenta', inventario: 'terminal.ts (Detalhes do terminal)', medir: checarDetalhesDoTerminalComFerramenta },
  { risco: 'alcas-sobre-botoes', inventario: 'overlays.ts (Alças de redimensionar)', medir: checarAlcasDoDialogoSobBotoes },
  { risco: 'menu-perfil-acompanha-zoom', inventario: 'nodes.ts (Menu de perfil da Página Web)', medir: checarMenuDoPerfilAcompanhaOZoom },
  // Por último: deixa uma pergunta pendente no perfil isolado (a sessão é descartada ao sair).
  { risco: 'pergunta-sob-dialogos', inventario: 'terminal.ts (Pergunta de agente)', medir: checarPerguntaDoAgenteSobDialogos },
]

/**
 * Mede todos os cenários numa sessão já aberta. Recarrega a tela antes de cada um, para que
 * um menu ou diálogo deixado aberto não atrapalhe o seguinte. Devolve todos os resultados,
 * sem julgar: quem decide se é defeito novo é `checarSobreposicoesDoInventario`.
 * `tolerarFalhas` (uso de desenvolvimento): um cenário que quebra vira `medido: false` com o
 * motivo, e os outros continuam. No smoke a falha sobe e derruba a sessão.
 */
async function medirSobreposicoes(page, { tolerarFalhas = false } = {}) {
  await prepararCanvas(page)
  const resultados = []
  for (const cenario of CENARIOS) {
    try {
      await page.reload()
      await page.waitForSelector('.felixo-zoom-pill', { timeout: HYDRATION_TIMEOUT_MS })
      const medidos = await cenario.medir(page)
      for (const item of medidos) resultados.push({ ...item, inventario: cenario.inventario })
    } catch (error) {
      if (!tolerarFalhas) throw error
      resultados.push({
        risco: cenario.risco,
        rotulo: '-',
        caso: null,
        medido: false,
        medidas: {},
        problemas: [],
        motivo: `erro no cenário: ${String(error.message).replace(/\s+/g, ' ').slice(0, 300)}`,
        inventario: cenario.inventario,
      })
    }
  }
  return resultados
}

/** Roda os cenários e falha só com sobreposição que não está em `DEFEITOS_CONHECIDOS`. */
async function checarSobreposicoesDoInventario(page) {
  const resultados = await medirSobreposicoes(page)
  const novos = []
  for (const item of resultados) {
    if (!item.medido) {
      console.log(`[canvas-sobreposicoes] ${item.risco} ${item.rotulo}: não medido (${item.motivo})`)
      continue
    }
    const { conhecidos, novos: outros } = separarDefeitos(item.risco, item.caso, item.problemas)
    for (const problema of conhecidos) console.log(`[canvas-sobreposicoes] ${item.risco} ${item.rotulo}: defeito conhecido (${problema.task}) ${JSON.stringify(problema)}`)
    for (const problema of outros) novos.push({ risco: item.risco, rotulo: item.rotulo, ...problema })
  }
  if (novos.length) {
    throw new Error(`[canvas-sobreposicoes] ${novos.length} sobreposição(ões) fora de DEFEITOS_CONHECIDOS: ${JSON.stringify(novos.slice(0, 12))}`)
  }
  return resultados
}

module.exports = {
  CENARIOS,
  DEFEITOS_CONHECIDOS,
  FAIXA_MINIMA_DO_CANVAS,
  TASK_SOBREPOSICOES,
  VIEWPORTS_DOS_RISCOS,
  checarAlcasDoDialogoSobBotoes,
  checarDetalhesDoTerminalComFerramenta,
  checarMenuDeCorDentroDaJanela,
  checarMenuDoPerfilAcompanhaOZoom,
  checarMenuLigarAgenteDentroDoCartao,
  checarPainelDeFerramentaSobPilulaDeZoom,
  checarPerguntaDoAgenteSobDialogos,
  checarSidebarExpandidaEmJanelaEstreita,
  checarSobreposicoesDoInventario,
  cortesDaJanela,
  cortesDoMenuPorCima,
  medirSobreposicoes,
  prepararCanvas,
  problemasDaSidebar,
  separarDefeitos,
  sobreposicao,
}

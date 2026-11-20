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
 * Os avisos de hardware, de instalação das CLIs e de link usam estado forjado pelo processo principal
 * (`devtools:main-eval`: perfil de hardware, `clis:setup-status`, `external-links:open-failed`). Fora daqui,
 * como lacuna no inventário: a volta automática da placa de vídeo (estado de máquina), o card do tutorial
 * junto do aviso de link, e a barra de status e a dock sob a sugestão do Modo Performance.
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
  // Medido em 20/11/2026 com os três avisos de baixo juntos (sugestão do Modo Performance, instalação das CLIs, link que não abriu):
  // cada um é fixed por conta própria, sem pilha comum. Falta uma pilha única de avisos; ver a task de bug aberta no Notion.
  { risco: 'avisos-flutuantes-juntos', tipo: 'avisos-se-cobrem', task: TASK_SOBREPOSICOES },
  { risco: 'avisos-flutuantes-juntos', tipo: 'botao-de-aviso-coberto', task: TASK_SOBREPOSICOES },
  { risco: 'avisos-flutuantes-juntos', tipo: 'aviso-de-clis-cobre-o-minimapa', task: TASK_SOBREPOSICOES },
  // Medido em 20/11/2026 (320 a 1280 px, janela escondida): o bloco de terminal mínimo corta a prévia e as ações da retomada, o menu do
  // Excalidraw sai do cartão de 360x280, o Git perde largura com a gaveta aberta (e cai abaixo do piso de 260 px) e o aviso de CLIs cobre a gaveta.
  { risco: 'terminal-minimo-com-retomada', tipo: 'previa-sem-altura', task: TASK_SOBREPOSICOES },
  { risco: 'terminal-minimo-com-retomada', tipo: 'acoes-cortadas-pela-borda-do-cartao', task: TASK_SOBREPOSICOES },
  { risco: 'excalidraw-popover-em-bloco-pequeno', tipo: 'popover-cortado-pelo-cartao', task: TASK_SOBREPOSICOES },
  { risco: 'excalidraw-popover-em-bloco-pequeno', tipo: 'botao-do-editor-fora-do-cartao', task: TASK_SOBREPOSICOES },
  { risco: 'git-com-gaveta-do-terminal', tipo: 'git-e-gaveta-se-cobrem', task: TASK_SOBREPOSICOES },
  { risco: 'git-com-gaveta-do-terminal', tipo: 'git-abaixo-do-piso-de-largura', task: TASK_SOBREPOSICOES },
  { risco: 'git-com-gaveta-do-terminal', tipo: 'git-encolhe-com-a-gaveta', task: TASK_SOBREPOSICOES },
  { risco: 'aviso-de-clis-com-gaveta', tipo: 'aviso-de-clis-cobre-a-gaveta', task: TASK_SOBREPOSICOES },
  // Medido só no CI Linux (18/11/2026, 768x900 e 1280x800): o painel de ferramenta cobre de 5 a 32 px da pílula de
  // zoom e a área muda a cada rodada. No Windows (medição local) e no macOS do CI não colide. Falta reproduzir no Linux
  // para saber se é defeito do app ou da altura máxima do painel sob xvfb: ver a pendência aberta no Notion.
  { risco: 'painel-sobre-pilula-de-zoom', tipo: 'painel-cobre-a-pilula', task: TASK_SOBREPOSICOES, when: () => process.platform === 'linux' },
  { risco: 'painel-sobre-pilula-de-zoom', tipo: 'botao-de-zoom-coberto-pelo-painel', task: TASK_SOBREPOSICOES, when: () => process.platform === 'linux' },
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


/**
 * Riscos: `overlays.ts`/`setup` → os avisos fixos de baixo se cobrem. Monta os três ao mesmo tempo, como
 * na primeira abertura: a sugestão do Modo Performance (NoticeToast, centro, z 50; o perfil de hardware é
 * trocado por um de CPU fraca no processo principal), o aviso da instalação das CLIs (canto direito, z 50;
 * o estado é enviado pelo canal que o app usa) e o aviso "o link não abriu" (centro, z 70). Mede cada um
 * contra a janela, os pares entre si, o botão de cada um (quem o clique alcança) e o minimapa.
 * Não cobre a gaveta do terminal nem o card do tutorial junto do aviso de link: ficam como lacuna.
 */
const SELETOR_AVISO_FIXO = '[data-felixo-tour-avoid][role="status"]'
const SELETOR_AVISO_DE_LINK = '[data-felixo-link-open-failure]'

async function mainEval(page, expressao) {
  return page.evaluate((fonte) => window.felixo.devtools.mainEval(fonte), expressao)
}

async function checarAvisosFlutuantesJuntos(page) {
  const resultados = []
  // O perfil é lido ao montar: troca o handler e recarrega. O handler de webContents vence o do ipcMain.
  await mainEval(
    page,
    `(() => { const ipc = mainWindow.webContents.ipc; ipc.removeHandler('hardware:get-profile'); ipc.handle('hardware:get-profile', () => ({ logicalCpuCount: 2, lowCpu: true, lowCpuThreshold: 4, suggestPerformanceMode: true })); return true })()`,
  )
  try {
    for (const caso of VIEWPORTS_DOS_RISCOS) {
      await page.evaluate(() => {
        try { localStorage.removeItem('felixo-ai-core.performance-suggestion') } catch { /* sem storage */ }
      })
      await page.reload()
      await page.waitForSelector('.felixo-zoom-pill', { timeout: HYDRATION_TIMEOUT_MS })
      await definirJanela(page, caso)
      await enquadrarTodos(page)
      await mainEval(
        page,
        `mainWindow.webContents.send('clis:setup-status', { state: 'installing', message: 'Instalando as CLIs', updatedAt: new Date().toISOString(), clis: [{ id: 'claude', name: 'Claude Code', state: 'installing' }] })`,
      )
      await mainEval(page, `mainWindow.webContents.send('external-links:open-failed', { url: 'https://exemplo.com/', kind: 'falhou' })`)
      const apareceram = await page
        .waitForFunction(
          ([aviso, link]) => {
            const textos = [...document.querySelectorAll(aviso)].map((el) => el.textContent ?? '')
            return textos.some((t) => t.includes('Modo Performance')) && textos.some((t) => !t.includes('Modo Performance')) && Boolean(document.querySelector(link))
          },
          [SELETOR_AVISO_FIXO, SELETOR_AVISO_DE_LINK],
          { timeout: INTERACTION_TIMEOUT_MS * 2, polling: POLLING_MS },
        )
        .then(() => true, () => false)
      if (!apareceram) {
        resultados.push({ risco: 'avisos-flutuantes-juntos', caso, rotulo: `${caso.width}x${caso.height}`, medido: false, medidas: {}, problemas: [], motivo: 'os três avisos não apareceram juntos (Modo Performance, instalação das CLIs e link)' })
        continue
      }
      const medidas = await page.evaluate(
        ([aviso, link]) => {
          const caixa = (el) => {
            const r = el.getBoundingClientRect()
            return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }
          }
          const avisos = [...document.querySelectorAll(aviso)]
          const linkEl = document.querySelector(link)
          const todos = { performance: avisos.find((el) => (el.textContent ?? '').includes('Modo Performance')) ?? null, clis: avisos.find((el) => !(el.textContent ?? '').includes('Modo Performance')) ?? null, link: linkEl }
          const botoes = []
          for (const [nome, el] of Object.entries(todos)) {
            if (!el) continue
            for (const botao of el.querySelectorAll('button')) {
              const r = botao.getBoundingClientRect()
              if (r.width <= 0 || r.height <= 0) continue
              const hit = document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2)
              const dono = hit ? Object.entries(todos).find(([, outro]) => outro && outro.contains(hit))?.[0] ?? 'outro' : 'nenhum'
              botoes.push({ aviso: nome, rotulo: (botao.getAttribute('aria-label') || botao.textContent || '').trim().slice(0, 30), alcancadoPor: dono })
            }
          }
          const minimapa = document.querySelector('.react-flow__minimap')
          return {
            performance: todos.performance ? caixa(todos.performance) : null,
            clis: todos.clis ? caixa(todos.clis) : null,
            link: todos.link ? caixa(todos.link) : null,
            minimapa: minimapa ? caixa(minimapa) : null,
            botoes,
          }
        },
        [SELETOR_AVISO_FIXO, SELETOR_AVISO_DE_LINK],
      )
      medidas.barraDeStatus = (await lerCaixas(page, { barra: '.felixo-canvas-statusbar' })).barra
      const problemas = []
      const sobBarra = sobreposicao(medidas.performance, medidas.barraDeStatus)
      if (sobBarra) problemas.push({ tipo: 'aviso-cobre-a-barra-de-status', area: sobBarra })
      for (const nome of ['performance', 'clis', 'link']) {
        for (const corte of cortesDaJanela(medidas[nome], caso)) problemas.push({ ...corte, aviso: nome })
      }
      for (const [a, b] of [['clis', 'performance'], ['link', 'performance'], ['link', 'clis']]) {
        const area = sobreposicao(medidas[a], medidas[b])
        if (area) problemas.push({ tipo: 'avisos-se-cobrem', avisos: [a, b], area })
      }
      const sobMinimapa = sobreposicao(medidas.clis, medidas.minimapa)
      if (sobMinimapa) problemas.push({ tipo: 'aviso-de-clis-cobre-o-minimapa', area: sobMinimapa })
      for (const botao of medidas.botoes) {
        if (botao.alcancadoPor !== botao.aviso) problemas.push({ tipo: 'botao-de-aviso-coberto', ...botao })
      }
      resultados.push(resultado('avisos-flutuantes-juntos', caso, medidas, problemas))
    }
  } finally {
    await mainEval(page, `mainWindow.webContents.ipc.removeHandler('hardware:get-profile')`).catch(() => {})
  }
  return resultados
}

/**
 * Risco: `terminal.ts`/`overlays.ts` → o cartão "um agente quer abrir uma página" (fixed top-4, z 50) cobre a barra
 * superior ou sai da janela estreita. Grava um pedido `abrir-pagina` no perfil isolado e mede o cartão contra
 * a janela e a barra superior.
 */
async function checarPedidoDeNavegadorDoAgente(page) {
  const resultados = []
  const { criarRepositorioDePedidos } = require('../electron/services/fetch-all/agent-requests.cjs')
  const estado = readState()
  if (!estado?.userData || estado.realProfile) throw new Error('[canvas-smoke:sobreposicoes] gravar pedido de navegador só é permitido num perfil isolado do felixo devtools.')
  const pedidos = criarRepositorioDePedidos({ pasta: require('node:path').join(estado.userData, 'agent-requests') })
  const pedido = pedidos.registrar('abrir-pagina', { url: 'https://exemplo.com/sobreposicao', modo: 'embutido', origem: 'canvas-smoke' })
  // O app mostra um pedido por vez: se sobrou outro pendente de uma rodada anterior, é ele que aparece. O que se mede é o cartão.
  void pedido
  const seletor = '[data-felixo-agent-browser-request]'
  for (const caso of VIEWPORTS_DOS_RISCOS) {
    await definirJanela(page, caso)
    const apareceu = await page.locator(seletor).waitFor({ state: 'visible', timeout: HYDRATION_TIMEOUT_MS }).then(() => true, () => false)
    if (!apareceu) {
      resultados.push({ risco: 'pedido-de-navegador-do-agente', caso, rotulo: `${caso.width}x${caso.height}`, medido: false, medidas: {}, problemas: [], motivo: 'o cartão do pedido de navegador não apareceu' })
      continue
    }
    const medidas = await lerCaixas(page, { cartao: seletor, topbar: '[data-felixo-region="topbar"]' })
    const problemas = [...cortesDaJanela(medidas.cartao, caso)]
    const cobre = sobreposicao(medidas.cartao, medidas.topbar)
    if (cobre) problemas.push({ tipo: 'cartao-cobre-a-barra-superior', area: cobre })
    const botoes = await page.evaluate((sel) => {
      const cartao = document.querySelector(sel)
      return [...cartao.querySelectorAll('button')].map((botao) => {
        const r = botao.getBoundingClientRect()
        const hit = document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2)
        return { rotulo: (botao.textContent || '').trim().slice(0, 30), alcancavel: Boolean(hit) && cartao.contains(hit), visivel: r.width > 0 && r.height > 0 }
      })
    }, seletor)
    for (const botao of botoes.filter((item) => item.visivel && !item.alcancavel)) problemas.push({ tipo: 'botao-do-cartao-coberto', rotulo: botao.rotulo })
    resultados.push(resultado('pedido-de-navegador-do-agente', caso, { ...medidas, botoes: botoes.length }, problemas))
  }
  return resultados
}


/** Abre uma ferramenta pelo rótulo no menu "Ferramentas" da sidebar (precisa de 768 px ou mais). */
async function abrirFerramentaPorRotulo(page, rotulo) {
  await garantirSidebarAberta(page)
  await abrirSecaoFerramentas(page)
  const botao = page.locator('[aria-label="Ferramentas auxiliares"] button').filter({ hasText: rotulo }).first()
  await botao.dispatchEvent('click')
}

/** Grava um bloco temporário (fora da fixture), recarrega e devolve a função que o apaga. */
async function adicionarBlocoTemporario(page, no) {
  const salvo = await page.evaluate((n) => window.felixo.canvas.save(n), no)
  if (!salvo?.ok) throw new Error(salvo?.message || `persistencia falhou: ${no.id}`)
  await page.reload()
  await page.waitForSelector('.felixo-zoom-pill', { timeout: HYDRATION_TIMEOUT_MS })
  await page.waitForSelector(`[data-id="${no.id}"]`, { timeout: HYDRATION_TIMEOUT_MS })
  return () => page.evaluate((id) => window.felixo.canvas.delete(id), no.id).catch(() => {})
}

function naoMedido(risco, caso, motivo) {
  return { risco, caso, rotulo: `${caso.width}x${caso.height}`, medido: false, medidas: {}, problemas: [], motivo }
}

/**
 * Risco: `terminal.ts` → no bloco de terminal mínimo (200×120) a faixa de retomada, as ações e a faixa de atividade
 * empurram a prévia para fora do cartão `overflow-hidden`. Grava um bloco com a retomada pendente no tamanho mínimo
 * (o registro da conversa é ilegível de propósito: o app mostra a faixa e segura o bloco sem processo) e mede a
 * altura que sobra à prévia e o que passa da borda de baixo.
 */
async function checarTerminalMinimoComRetomada(page) {
  const caso = { width: 1280, height: 800 }
  await definirJanela(page, caso)
  const no = {
    id: 'sob-terminal-min',
    type: 'terminal',
    position: { x: 0, y: -500 },
    width: 200,
    height: 120,
    data: {
      label: 'Agente mínimo',
      command: 'claude',
      args: [],
      cwd: 'C:\\temp',
      launchMode: 'agent',
      resumeAgentSession: true,
      initialTextReady: false,
      agentSession: { provider: 'claude', sessionId: '11111111-1111-4111-8111-111111111111', cwd: 'C:\\temp', command: 'claude' },
    },
  }
  const apagar = await adicionarBlocoTemporario(page, no)
  try {
    const apareceu = await page
      .waitForFunction(() => /Abrir conversa nova/.test(document.querySelector('[data-id="sob-terminal-min"]')?.innerText ?? ''), null, { timeout: INTERACTION_TIMEOUT_MS * 2, polling: POLLING_MS })
      .then(() => true, () => false)
    if (!apareceu) return [naoMedido('terminal-minimo-com-retomada', caso, 'a faixa de retomada não apareceu no bloco mínimo')]
    const medidas = await page.evaluate(() => {
      const bloco = document.querySelector('[data-id="sob-terminal-min"]')
      const nr = bloco.getBoundingClientRect()
      const saida = bloco.querySelector('.felixo-node-preview .font-mono')
      const rel = (r) => ({ top: Math.round(r.top - nr.top), bottom: Math.round(r.bottom - nr.top) })
      const cortados = [...bloco.querySelectorAll('button')]
        .map((botao) => ({ rotulo: (botao.textContent ?? '').trim().slice(0, 30), r: botao.getBoundingClientRect() }))
        .filter((item) => item.rotulo && item.r.width > 0 && item.r.bottom > nr.bottom + 1)
        .map((item) => ({ rotulo: item.rotulo, ...rel(item.r) }))
      return { bloco: { altura: Math.round(nr.height), largura: Math.round(nr.width) }, saida: saida ? { altura: Math.round(saida.getBoundingClientRect().height) } : null, cortados }
    })
    const problemas = []
    if (!medidas.saida || medidas.saida.altura < 12) problemas.push({ tipo: 'previa-sem-altura', altura: medidas.saida?.altura ?? null })
    if (medidas.cortados.length) problemas.push({ tipo: 'acoes-cortadas-pela-borda-do-cartao', rotulos: medidas.cortados.map((item) => item.rotulo) })
    return [resultado('terminal-minimo-com-retomada', caso, medidas, problemas)]
  } finally {
    await apagar()
  }
}

/**
 * Risco: `nodes.ts` → popovers e menus do Excalidraw ficam presos ao cartão `overflow-hidden`: num bloco pequeno
 * (360×280, o mínimo) são cortados. Abre o menu "More tools" e mede o que fica fora do cartão e se o ponto
 * fora do cartão ainda alcança o menu.
 */
async function checarPopoverDoExcalidrawEmBlocoPequeno(page) {
  const caso = { width: 1280, height: 800 }
  await definirJanela(page, caso)
  const no = { id: 'sob-excalidraw-min', type: 'excalidrawDrawing', position: { x: 0, y: -700 }, width: 360, height: 280, data: { label: 'Excalidraw mínimo' } }
  const apagar = await adicionarBlocoTemporario(page, no)
  try {
    const medidas = await page.evaluate(async () => {
      const bloco = document.querySelector('[data-id="sob-excalidraw-min"]')
      const esperar = async (cond) => {
        for (let i = 0; i < 100; i += 1) {
          const valor = cond()
          if (valor) return valor
          await new Promise((resolve) => setTimeout(resolve, 100))
        }
        return null
      }
      const gatilho = await esperar(() => [...bloco.querySelectorAll('button')].find((b) => /More tools/i.test(b.getAttribute('aria-label') || b.title || '')))
      if (!gatilho) return null
      gatilho.click()
      const menu = await esperar(() => bloco.querySelector('.dropdown-menu-container'))
      if (!menu) return { semMenu: true }
      const caixa = (r) => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height })
      const nr = bloco.getBoundingClientRect()
      const mr = menu.getBoundingClientRect()
      const gr = gatilho.getBoundingClientRect()
      // Um ponto do menu que está fora do cartão: se o clique o alcança, o menu aparece; se não, foi cortado.
      const fora = mr.bottom > nr.bottom + 8 ? { x: (mr.left + mr.right) / 2, y: nr.bottom + 6 } : mr.right > nr.right + 8 ? { x: nr.right + 6, y: (mr.top + mr.bottom) / 2 } : null
      const hit = fora ? document.elementFromPoint(fora.x, fora.y) : null
      return { bloco: caixa(nr), menu: caixa(mr), gatilho: caixa(gr), pontoForaAlcancaOMenu: fora ? Boolean(hit) && menu.contains(hit) : null }
    })
    if (!medidas) return [naoMedido('excalidraw-popover-em-bloco-pequeno', caso, 'o botão "More tools" do Excalidraw não apareceu')]
    if (medidas.semMenu) return [naoMedido('excalidraw-popover-em-bloco-pequeno', caso, 'o menu "More tools" não abriu')]
    const problemas = []
    const relativo = (rect) => ({ left: rect.left - medidas.bloco.left, top: rect.top - medidas.bloco.top, right: rect.right - medidas.bloco.left, bottom: rect.bottom - medidas.bloco.top })
    const area = { width: medidas.bloco.width, height: medidas.bloco.height }
    for (const corte of cortesDaJanela(relativo(medidas.menu), area)) {
      if (medidas.pontoForaAlcancaOMenu === false) problemas.push({ ...corte, tipo: 'popover-cortado-pelo-cartao' })
    }
    for (const corte of cortesDaJanela(relativo(medidas.gatilho), area)) problemas.push({ ...corte, tipo: 'botao-do-editor-fora-do-cartao' })
    return [resultado('excalidraw-popover-em-bloco-pequeno', caso, medidas, problemas)]
  } finally {
    await apagar()
  }
}

/**
 * Risco: `tools-agents.ts` → o QA Logger chama `scrollIntoView({ block: "end" })` a cada entrada, que rola todos os
 * ancestrais roláveis: com o painel passando da janela pequena pode deslocar a moldura do canvas. Abre o painel,
 * grava 60 entradas e mede se a barra superior e a página mudaram de lugar.
 */
async function checarQaLoggerEmJanelaPequena(page) {
  const resultados = []
  for (const caso of [{ width: 768, height: 420 }, { width: 1280, height: 400 }]) {
    await page.reload()
    await page.waitForSelector('.felixo-zoom-pill', { timeout: HYDRATION_TIMEOUT_MS })
    await definirJanela(page, caso)
    await abrirFerramentaPorRotulo(page, 'QA Logger')
    const painel = '[data-felixo-canvas-panel="qa-logger"], [data-felixo-canvas-panel="qaLogger"]'
    const abriu = await page.locator(painel).first().waitFor({ state: 'visible', timeout: INTERACTION_TIMEOUT_MS }).then(() => true, () => false)
    if (!abriu) {
      resultados.push(naoMedido('qa-logger-rolagem', caso, 'o painel do QA Logger não abriu'))
      continue
    }
    const antes = await lerCaixas(page, { topbar: '[data-felixo-region="topbar"]', canvas: '[data-felixo-region="canvas"]' })
    await page.evaluate(async () => {
      for (let i = 0; i < 60; i += 1) {
        await window.felixo.qaLogger.log({ level: 'info', scope: 'sobreposicao', message: `entrada ${i} ${'texto '.repeat(8)}`, details: null })
      }
    })
    await page.waitForTimeout(600)
    const depois = await lerCaixas(page, { topbar: '[data-felixo-region="topbar"]', canvas: '[data-felixo-region="canvas"]', painel })
    const chegaram = await page.evaluate((sel) => (document.querySelector(sel)?.textContent ?? '').includes('entrada 59'), painel)
    if (!chegaram) {
      resultados.push(naoMedido('qa-logger-rolagem', caso, 'as 60 entradas não chegaram ao painel do QA Logger'))
      continue
    }
    const rolagem = await page.evaluate(() => {
      const deslocados = []
      for (const el of [document.documentElement, document.body, ...document.querySelectorAll('[data-felixo-region], #root, #root > *')]) {
        if (el.scrollTop || el.scrollLeft) deslocados.push({ elemento: (el.getAttribute?.('data-felixo-region') || el.id || el.tagName).toString(), top: Math.round(el.scrollTop), left: Math.round(el.scrollLeft) })
      }
      return deslocados
    })
    const problemas = [...cortesDaJanela(depois.painel, caso)]
    for (const nome of ['topbar', 'canvas']) {
      if (antes[nome] && depois[nome] && (Math.abs(antes[nome].top - depois[nome].top) > SUBPIXEL || Math.abs(antes[nome].left - depois[nome].left) > SUBPIXEL)) problemas.push({ tipo: 'moldura-deslocada-pelo-scroll', regiao: nome, de: Math.round(antes[nome].top), para: Math.round(depois[nome].top) })
    }
    if (rolagem.length) problemas.push({ tipo: 'ancestral-rolado-pelo-painel', ancestrais: rolagem })
    resultados.push(resultado('qa-logger-rolagem', caso, { antes, depois, rolagem }, problemas))
  }
  return resultados
}

/**
 * Risco: `chrome.ts` → o overlay de operação (limpar, importar) só bloqueia o ponteiro: o teclado continua chegando ao
 * canvas. Troca o `canvas:clear` por um que só responde quando o smoke manda (o contexto do main-eval não tem timers), aciona "Limpar" (o `confirm` é aceito) e, com o overlay de
 * pé, dispara Ctrl+K: se a Busca abre, o atalho vale durante a operação.
 */
async function checarTecladoDuranteOperacaoEmAndamento(page) {
  const caso = { width: 1280, height: 800 }
  await definirJanela(page, caso)
  await enquadrarTodos(page)
  await mainEval(
    page,
    `(() => { const ipc = mainWindow.webContents.ipc; ipc.removeHandler('canvas:clear'); ipc.handle('canvas:clear', () => new Promise((resolve) => { globalThis.__liberarClear = resolve })); return true })()`,
  )
  const aceitar = (dialogo) => void dialogo.accept().catch(() => {})
  page.on('dialog', aceitar)
  try {
    await garantirSidebarAberta(page)
    await page.locator('.felixo-sidebar-danger').first().dispatchEvent('click')
    const overlay = '[data-felixo-region="canvas"] div.cursor-wait[aria-hidden="true"]'
    const ocupado = await page.locator(overlay).first().waitFor({ state: 'attached', timeout: INTERACTION_TIMEOUT_MS }).then(() => true, () => false)
    if (!ocupado) return [naoMedido('teclado-durante-operacao', caso, 'o overlay de operação não apareceu')]
    const medidas = await page.evaluate(async (sobre) => {
      const tecla = (key, extras = {}) => window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...extras }))
      tecla('k', { ctrlKey: true })
      await new Promise((resolve) => setTimeout(resolve, 600))
      const buscaAbriu = Boolean(document.querySelector('[data-felixo-canvas-panel="search"]'))
      const ov = document.querySelector(sobre)
      const r = ov?.getBoundingClientRect()
      return { overlayAtivo: Boolean(ov), overlay: r ? { width: Math.round(r.width), height: Math.round(r.height) } : null, buscaAbriu }
    }, overlay)
    const problemas = medidas.buscaAbriu ? [{ tipo: 'atalho-vale-durante-a-operacao', atalho: 'Ctrl+K' }] : []
    return [resultado('teclado-durante-operacao', caso, medidas, problemas)]
  } finally {
    page.off('dialog', aceitar)
    await mainEval(page, `(() => { if (globalThis.__liberarClear) globalThis.__liberarClear({ ok: true }); mainWindow.webContents.ipc.removeHandler('canvas:clear'); return true })()`).catch(() => {})
    await page.waitForTimeout(800)
  }
}

/** Abre a gaveta do terminal pelo botão "Expandir terminal" do bloco de agente da fixture. */
async function abrirGavetaDoTerminal(page) {
  await page.locator('[data-id="sob-terminal"] [aria-label="Expandir terminal"]').first().dispatchEvent('click')
  // A gaveta abre por transição de largura: na janela escondida leva ~2 s, e medir antes pega 1 px.
  return page
    .waitForFunction(() => (document.querySelector('[data-canvas-terminal-drawer]')?.getBoundingClientRect().width ?? 0) > 200, null, { timeout: INTERACTION_TIMEOUT_MS * 3, polling: POLLING_MS })
    .then(() => true, () => false)
}

/**
 * Riscos: `tools-workspace.ts` (Git, variante workspace) e `overlays.ts` (aviso de instalação das CLIs) com a gaveta do
 * terminal aberta. Mede o painel de Git contra a gaveta (largura do piso de 260 px incluída) e o aviso de CLIs
 * contra a gaveta e o alcance dos botões dele.
 */
async function checarGitEAvisoDeClisComGavetaAberta(page) {
  const resultados = []
  for (const caso of [{ width: 768, height: 900 }, { width: 1280, height: 800 }]) {
    await page.reload()
    await page.waitForSelector('.felixo-zoom-pill', { timeout: HYDRATION_TIMEOUT_MS })
    await definirJanela(page, caso)
    await enquadrarTodos(page)
    await abrirFerramentaPorRotulo(page, 'Source Control')
    const painelGit = '[data-felixo-canvas-panel="git"]'
    const larguraSemGaveta = await page
      .locator(painelGit).first().waitFor({ state: 'visible', timeout: INTERACTION_TIMEOUT_MS * 2 })
      .then(async () => (await lerCaixas(page, { painel: painelGit })).painel?.width ?? null, () => null)
    await page.locator(`${painelGit} button[aria-label^="Fechar painel"]`).first().dispatchEvent('click').catch(() => {})
    await page.locator(painelGit).waitFor({ state: 'hidden', timeout: INTERACTION_TIMEOUT_MS }).catch(() => {})
    if (!(await abrirGavetaDoTerminal(page))) {
      resultados.push(naoMedido('git-com-gaveta-do-terminal', caso, 'a gaveta do terminal não abriu'))
      continue
    }
    await page.waitForTimeout(500)
    await abrirFerramentaPorRotulo(page, 'Source Control')
    const abriu = await page.locator(painelGit).first().waitFor({ state: 'visible', timeout: INTERACTION_TIMEOUT_MS * 2 }).then(() => true, () => false)
    if (!abriu) {
      resultados.push(naoMedido('git-com-gaveta-do-terminal', caso, 'o painel de Git não abriu com a gaveta aberta'))
    } else {
      const medidas = await lerCaixas(page, { painel: painelGit, gaveta: '[data-canvas-terminal-drawer]', topbar: '[data-felixo-region="topbar"]' })
      const problemas = [...cortesDaJanela(medidas.painel, caso)]
      const cobre = sobreposicao(medidas.painel, medidas.gaveta)
      if (cobre) problemas.push({ tipo: 'git-e-gaveta-se-cobrem', area: cobre })
      if (medidas.painel && medidas.painel.width < 260 - SUBPIXEL) problemas.push({ tipo: 'git-abaixo-do-piso-de-largura', largura: Math.round(medidas.painel.width) })
      if (larguraSemGaveta && medidas.painel && medidas.painel.width < larguraSemGaveta - SUBPIXEL) problemas.push({ tipo: 'git-encolhe-com-a-gaveta', de: Math.round(larguraSemGaveta), para: Math.round(medidas.painel.width) })
      resultados.push(resultado('git-com-gaveta-do-terminal', caso, { ...medidas, larguraSemGaveta }, problemas))
    }
    await mainEval(
      page,
      `mainWindow.webContents.send('clis:setup-status', { state: 'installing', message: 'Instalando as CLIs', updatedAt: new Date().toISOString(), clis: [{ id: 'claude', name: 'Claude Code', state: 'installing' }] })`,
    )
    const clis = await page
      .waitForFunction((sel) => [...document.querySelectorAll(sel)].some((el) => !(el.textContent ?? '').includes('Modo Performance')), SELETOR_AVISO_FIXO, { timeout: INTERACTION_TIMEOUT_MS, polling: POLLING_MS })
      .then(() => true, () => false)
    if (!clis) {
      resultados.push(naoMedido('aviso-de-clis-com-gaveta', caso, 'o aviso de instalação das CLIs não apareceu'))
      continue
    }
    const sobre = await page.evaluate((sel) => {
      const aviso = [...document.querySelectorAll(sel)].find((el) => !(el.textContent ?? '').includes('Modo Performance'))
      const gaveta = document.querySelector('[data-canvas-terminal-drawer]')
      const caixa = (el) => {
        const r = el.getBoundingClientRect()
        return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }
      }
      const botoes = [...aviso.querySelectorAll('button')].map((botao) => {
        const r = botao.getBoundingClientRect()
        const hit = document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2)
        return { rotulo: (botao.getAttribute('aria-label') || botao.textContent || '').trim().slice(0, 30), alcancavel: Boolean(hit) && aviso.contains(hit) }
      })
      return { aviso: caixa(aviso), gaveta: gaveta ? caixa(gaveta) : null, botoes }
    }, SELETOR_AVISO_FIXO)
    const problemas = [...cortesDaJanela(sobre.aviso, caso)]
    const cobreGaveta = sobreposicao(sobre.aviso, sobre.gaveta)
    if (cobreGaveta) problemas.push({ tipo: 'aviso-de-clis-cobre-a-gaveta', area: cobreGaveta })
    for (const botao of sobre.botoes.filter((item) => !item.alcancavel)) problemas.push({ tipo: 'botao-do-aviso-de-clis-coberto', rotulo: botao.rotulo })
    resultados.push(resultado('aviso-de-clis-com-gaveta', caso, sobre, problemas))
  }
  return resultados
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
  { risco: 'avisos-flutuantes-juntos', inventario: 'overlays.ts (avisos de baixo)', medir: checarAvisosFlutuantesJuntos },
  { risco: 'pedido-de-navegador-do-agente', inventario: 'terminal.ts (Pedido de agente para abrir página)', medir: checarPedidoDeNavegadorDoAgente },
  { risco: 'terminal-minimo-com-retomada', inventario: 'terminal.ts (Bloco Terminal)', medir: checarTerminalMinimoComRetomada },
  { risco: 'excalidraw-popover-em-bloco-pequeno', inventario: 'nodes.ts (Excalidraw)', medir: checarPopoverDoExcalidrawEmBlocoPequeno },
  { risco: 'qa-logger-rolagem', inventario: 'tools-agents.ts (QA Logger)', medir: checarQaLoggerEmJanelaPequena },
  { risco: 'git-com-gaveta-do-terminal', riscos: ['git-com-gaveta-do-terminal', 'aviso-de-clis-com-gaveta'], inventario: 'tools-workspace.ts (Git) e overlays.ts (aviso de CLIs)', medir: checarGitEAvisoDeClisComGavetaAberta },
  { risco: 'teclado-durante-operacao', inventario: 'chrome.ts (overlay de operação)', medir: checarTecladoDuranteOperacaoEmAndamento },
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
  checarAvisosFlutuantesJuntos,
  checarDetalhesDoTerminalComFerramenta,
  checarGitEAvisoDeClisComGavetaAberta,
  checarPopoverDoExcalidrawEmBlocoPequeno,
  checarQaLoggerEmJanelaPequena,
  checarTecladoDuranteOperacaoEmAndamento,
  checarTerminalMinimoComRetomada,
  checarMenuDeCorDentroDaJanela,
  checarMenuDoPerfilAcompanhaOZoom,
  checarMenuLigarAgenteDentroDoCartao,
  checarPainelDeFerramentaSobPilulaDeZoom,
  checarPedidoDeNavegadorDoAgente,
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

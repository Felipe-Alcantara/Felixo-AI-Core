'use strict'

/**
 * Cenários do tutorial do canvas no smoke real (CDP), chamados por
 * `canvas-smoke.cjs`, que injeta a página e os helpers (`esperarAte`,
 * `measureStableGeometry`, `recordVisualEvidence`...).
 *
 * Sessão A (a do smoke de sempre, com a abertura automática suprimida):
 * - SA0 logo depois da montagem: nada abre, a decisão de primeiro boot fica
 *   exposta e nada é gravado;
 * - SA1–SA10 no fim, com a fixture: percurso pela Ajuda com as sondas de IPC,
 *   rede, DOM e localStorage, teclado, Esc em camadas, leitor de tela,
 *   viewport e zoom, fonte e idioma, movimento e contraste, alvos invisíveis,
 *   retomada e chat, falha isolada.
 * Sessão B (`FELIXO_DEVTOOLS_ONBOARDING=1`, perfil novo, canvas vazio):
 * SB1–SB8, o primeiro uso de verdade, restart, update com e sem novidade,
 * downgrade, estado inválido e redefinição.
 *
 * Regras: asserts só relacionais (helpers de `canvas-smoke-onboarding-geometry.cjs`),
 * esperas por condição e por frames estáveis, nunca por tempo fixo. A única
 * espera por tempo é a janela ociosa de controle da sonda IPC, que é uma
 * medição com a mesma duração do percurso. Botões do tour são acionados pelo
 * DOM onde a faixa fantasma da dock (abaixo de 768 px) poderia interceptar.
 */

const path = require('node:path')
const {
  channelsOutside,
  clipToViewport,
  containingBlockReason,
  contains,
  contrastRatio,
  coversSmallTarget,
  diffChannels,
  diffStorage,
  externalRequests,
  flattenLayers,
  forbiddenChannels,
  inflate,
  intersects,
  rectInside,
  storageViolations,
} = require('./canvas-smoke-onboarding-geometry.cjs')
const { definirViewport: definirViewportDaPagina } = require('./canvas-smoke-wait.cjs')

const SEL = Object.freeze({
  cartao: '[data-felixo-onboarding="card"]',
  cartaoPosto: '[data-felixo-onboarding="card"][data-modo]',
  anel: '[data-felixo-onboarding="anel"]',
  aviso: '[data-felixo-onboarding="aviso"]',
  avisoPosto: '[data-felixo-onboarding="aviso"][data-modo]',
  anuncio: '[data-felixo-onboarding="anuncio"]',
  ajuda: '[data-felixo-help-trigger]',
  menuAjuda: '.felixo-onboarding-help-menu[data-posicionado]',
  avisoHardware: '[data-felixo-tour-avoid][role="status"]',
})
const acao = (id) => `[data-felixo-onboarding-action="${id}"]`

const MARCADOR_PRIMEIRO_BOOT = 'felixo:onboarding:primeiro-boot'
const CHAVE_SESSAO = 'felixo:onboarding:sessao'
const CHAVE_FALHA = 'felixo:onboarding:falha'
const CHAVE_SIDEBAR = 'felixo:canvas-sidebar-collapsed'
const CHAVE_TEMA = 'felixo-ai-core.theme'
const CHAVE_MODO_PERFORMANCE = 'felixo-ai-core.performance-mode'
/** Decisões automáticas que põem algo na tela; as demais deixam o canvas quieto. */
const DECISOES_QUE_ABREM = new Set(['aberto', 'retomada', 'anunciado'])
/** A ação da Ajuda que abre o tutorial do início, na ordem de preferência. */
const ACOES_QUE_ABREM = ['iniciar', 'recomecar', 'rever', 'continuar']
const VIEWPORT_PADRAO = { width: 1280, height: 800 }
/**
 * Espera curta por quadros estáveis depois de uma troca de passo ou de um Tab: o
 * card é posto no mesmo quadro (useLayoutEffect) e qualquer reação do tour vem no
 * quadro seguinte. A janela invisível da automação desenha poucos quadros por
 * segundo, e a espera padrão (4 + 12 quadros) custaria segundos em cada passo.
 */
const QUADROS_CURTOS = Object.freeze({ settleFrames: 2, sampleFrames: 3 })

/**
 * Espelho do catálogo (`onboarding-catalog.ts`). O U-cat confere o lado do
 * código; aqui a conferência é contra a interface real, e uma divergência
 * reprova o smoke.
 */
const PASSOS_INICIAL = Object.freeze(['projeto', 'agente', 'contexto', 'terminal', 'ferramentas', 'ajuda'])
const ALVO_PRIMARIO = Object.freeze({
  projeto: 'rail-projetos',
  agente: 'criar-agente',
  contexto: 'criar-bloco',
  terminal: 'inspector-elementos',
  ferramentas: 'secao-ferramentas',
  ajuda: 'rail-ajuda',
})
const ROTULO_DA_ANCORA = Object.freeze({
  'rail-menu': 'menu do canvas',
  'rail-projetos': 'Projetos',
  'rail-ajuda': 'Ajuda',
  'secao-criar': 'Criar',
  'criar-agente': 'Agente',
  'criar-bloco': 'Novo bloco',
  'secao-ferramentas': 'Ferramentas',
  'inspector-elementos': 'Elementos',
  'inspector-puck': 'elementos',
  canvas: 'canvas',
})

function seletorDaAncora(id) {
  return id === 'canvas' ? '[data-felixo-region="canvas"]' : `[data-felixo-tour-anchor="${id}"]`
}

const contem = (texto, trecho) => String(texto ?? '').toLocaleLowerCase('pt-BR').includes(trecho.toLocaleLowerCase('pt-BR'))

function falhar(cenario, mensagem, evidencia) {
  const detalhe = evidencia === undefined ? '' : ` Evidência: ${JSON.stringify(evidencia)}`
  throw new Error(`[canvas-smoke:tutorial] ${cenario}: ${mensagem}.${detalhe}`)
}

function exigir(condicao, cenario, mensagem, evidencia) {
  if (!condicao) falhar(cenario, mensagem, evidencia)
}

// ---------------------------------------------------------------------------
// Funções que rodam no renderer (sem acesso ao escopo do node)
// ---------------------------------------------------------------------------

function lerCartao() {
  const card = document.querySelector('[data-felixo-onboarding="card"]')
  if (!card) return null
  return {
    passo: card.dataset.passo ?? null,
    ancora: card.dataset.ancora ?? null,
    modo: card.dataset.modo ?? null,
    lado: card.dataset.lado ?? null,
    instancia: card.dataset.instancia ?? null,
    lang: card.getAttribute('lang'),
    contador: card.querySelector('.felixo-onboarding-card__counter')?.textContent ?? '',
    corpo: card.querySelector('.felixo-onboarding-card__body')?.textContent ?? '',
    total: document.querySelectorAll('[data-felixo-onboarding="card"]').length,
  }
}

function lerFoco() {
  const active = document.activeElement
  const inAgentFrame = Boolean(active?.closest?.('.felixo-sidebar-agent-trigger'))
  const text = (active?.textContent ?? '').trim()
  return {
    tag: active?.tagName ?? null,
    acao: active?.getAttribute?.('data-felixo-onboarding-action') ?? null,
    ehCartao: active?.getAttribute?.('data-felixo-onboarding') === 'card',
    noCartao: Boolean(active?.closest?.('[data-felixo-onboarding="card"]')),
    noAviso: Boolean(active?.closest?.('[data-felixo-onboarding="aviso"]')),
    // Onde o foco do tour espera enquanto um diálogo modal está por cima.
    naEspera: active?.getAttribute?.('data-felixo-onboarding') === 'espera',
    nokey: Boolean(active?.closest?.('.nokey')),
    ajuda: Boolean(active?.hasAttribute?.('data-felixo-help-trigger')),
    naSidebar: Boolean(active?.closest?.('[data-felixo-region="sidebar"]')),
    noCanvas: Boolean(active?.closest?.('[data-felixo-region="canvas"]')),
    rotulo: active?.getAttribute?.('aria-label') ?? null,
    texto: text.slice(0, 60),
    // A metade "Agente" lança a CLI; a setinha ao lado tem aria-label.
    metadeAgente: inAgentFrame && active?.tagName === 'BUTTON' && !active.hasAttribute('aria-label'),
    limpar: text === 'Limpar' || text === 'Limpando…',
    body: active === document.body,
  }
}

function lerAnuncio() {
  const region = document.querySelector('[data-felixo-onboarding="anuncio"]')
  return region
    ? {
        texto: region.textContent ?? '',
        lang: region.getAttribute('lang'),
        decisao: region.getAttribute('data-felixo-onboarding-decisao'),
        role: region.getAttribute('role'),
        live: region.getAttribute('aria-live'),
      }
    : null
}

/** Tudo o que o smoke confere num passo, medido de uma vez no mesmo quadro. */
function medirPasso(seletorAlvo) {
  const rectOf = (element) => {
    const rect = element.getBoundingClientRect()
    return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height }
  }
  const nameOf = (element) => {
    const label = element.getAttribute('aria-label')
    if (label) return label
    const ids = element.getAttribute('aria-labelledby')
    if (ids) return ids.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? '').join(' ')
    return element.textContent ?? ''
  }
  const card = document.querySelector('[data-felixo-onboarding="card"]')
  const ring = document.querySelector('[data-felixo-onboarding="anel"]')
  const target = document.querySelector(seletorAlvo)
  const chat = Array.from(document.querySelectorAll('nav.felixo-activity-rail button')).find(
    (button) => button.getAttribute('aria-label') === 'Chat',
  )
  let hit = null
  if (target) {
    const rect = target.getBoundingClientRect()
    hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
  }
  const ancestors = []
  for (let node = card?.parentElement ?? null; node; node = node.parentElement) {
    const style = getComputedStyle(node)
    ancestors.push({
      tag: node.tagName,
      classe: String(node.className).slice(0, 80),
      transform: style.transform,
      filter: style.filter,
      perspective: style.perspective,
      contain: style.contain,
      isolation: style.isolation,
      willChange: style.willChange,
      backdropFilter: style.backdropFilter,
    })
  }
  const ringStyle = ring ? getComputedStyle(ring) : null
  return {
    viewport: { width: window.innerWidth, height: window.innerHeight },
    cartao: card
      ? {
          rect: rectOf(card),
          modo: card.dataset.modo ?? null,
          passo: card.dataset.passo ?? null,
          ancora: card.dataset.ancora ?? null,
          corpo: card.querySelector('.felixo-onboarding-card__body')?.textContent ?? '',
        }
      : null,
    anel:
      ring && ring.dataset.visivel === 'true'
        ? { rect: rectOf(ring), contorno: (parseFloat(ringStyle.outlineOffset) || 0) + (parseFloat(ringStyle.outlineWidth) || 0) }
        : null,
    alvo: target
      ? {
          rect: rectOf(target),
          inert: Boolean(target.closest('[inert]')),
          ariaHidden: Boolean(target.closest('[aria-hidden="true"]')),
          atingido: Boolean(hit && target.contains(hit)),
          nome: nameOf(target).replace(/\s+/g, ' ').trim(),
        }
      : null,
    obstaculos: Array.from(document.querySelectorAll('[data-felixo-tour-avoid], [data-canvas-layout-warning]'))
      .map(rectOf)
      .filter((rect) => rect.width > 0 && rect.height > 0),
    chat: chat ? rectOf(chat) : null,
    ferramentasExpandida: document.querySelector('[data-felixo-tour-anchor="secao-ferramentas"]')?.getAttribute('aria-expanded') ?? null,
    ancestrais: ancestors,
  }
}

/** Foto do que o tour não pode mudar: blocos, terminais, webviews, preferências. */
async function lerPaginaParaSonda() {
  const listed = await window.felixo.canvas.list()
  const storage = {}
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index)
    if (key !== null) storage[key] = window.localStorage.getItem(key)
  }
  const expanded = (anchor) => document.querySelector(`[data-felixo-tour-anchor="${anchor}"]`)?.getAttribute('aria-expanded') ?? null
  return {
    contagens: {
      blocos: document.querySelectorAll('.react-flow__node').length,
      conexoes: document.querySelectorAll('.react-flow__edge').length,
      xterms: document.querySelectorAll('.xterm').length,
      gavetas: document.querySelectorAll('[data-canvas-terminal-drawer]').length,
      webviews: document.querySelectorAll('webview').length,
      persistidos: listed?.nodes?.length ?? 0,
    },
    expandido: { criar: expanded('secao-criar'), ferramentas: expanded('secao-ferramentas'), menu: expanded('rail-menu') },
    storage,
  }
}

/** Botões e textos do card: dentro dele, alcançáveis e sem texto cortado. */
function medirCartaoInteiro() {
  const rectOf = (element) => {
    const rect = element.getBoundingClientRect()
    return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height }
  }
  const card = document.querySelector('[data-felixo-onboarding="card"]')
  if (!card) return null
  const body = card.querySelector('.felixo-onboarding-card__body')
  const title = card.querySelector('.felixo-onboarding-card__title')
  const buttons = Array.from(card.querySelectorAll('button')).map((button) => {
    const rect = rectOf(button)
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
    return {
      acao: button.dataset.felixoOnboardingAction ?? null,
      rect,
      alcancavel: Boolean(hit && button.contains(hit)),
      cortado: button.scrollWidth > button.clientWidth + 1,
    }
  })
  return {
    viewport: { width: window.innerWidth, height: window.innerHeight },
    documento: { scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth },
    cartao: { rect: rectOf(card), modo: card.dataset.modo ?? null, instancia: card.dataset.instancia ?? null, lang: card.getAttribute('lang') },
    titulo: title ? { cortado: title.scrollWidth > title.clientWidth + 1 } : null,
    corpo: body
      ? {
          cabe: body.scrollHeight <= body.clientHeight + 1,
          focavel: body.tabIndex === 0,
          cortadoNaLargura: body.scrollWidth > body.clientWidth + 1,
        }
      : null,
    botoes: buttons,
  }
}

/** O card e o alvo que ele aponta agora (a âncora do próprio card), no mesmo quadro. */
function medirAlvoDoCartao() {
  const rectOf = (element) => {
    const rect = element.getBoundingClientRect()
    return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height }
  }
  const card = document.querySelector('[data-felixo-onboarding="card"]')
  if (!card) return null
  const anchor = card.dataset.ancora ?? null
  const target =
    anchor === 'canvas'
      ? document.querySelector('[data-felixo-region="canvas"]')
      : anchor
        ? document.querySelector(`[data-felixo-tour-anchor="${anchor}"]`)
        : null
  return {
    viewport: { width: window.innerWidth, height: window.innerHeight },
    passo: card.dataset.passo ?? null,
    ancora: anchor,
    modo: card.dataset.modo ?? null,
    lado: card.dataset.lado ?? null,
    cartao: rectOf(card),
    alvo: target ? rectOf(target) : null,
  }
}

/** Rolagem da sidebar, controle focado nela e anel, medidos no mesmo quadro. */
function lerSidebarComTour() {
  const rectOf = (rect) => ({ left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height })
  const scroller = document.querySelector('.felixo-sidebar-scroll')
  if (!scroller) return null
  const active = document.activeElement
  const ring = document.querySelector('[data-felixo-onboarding="anel"]')
  const card = document.querySelector('[data-felixo-onboarding="card"]')
  return {
    scrollTop: scroller.scrollTop,
    maximo: scroller.scrollHeight - scroller.clientHeight,
    sidebar: rectOf(scroller.getBoundingClientRect()),
    foco:
      active && scroller.contains(active)
        ? { rect: rectOf(active.getBoundingClientRect()), nome: (active.getAttribute('aria-label') || active.textContent || '').trim().slice(0, 40) }
        : null,
    anel: ring && ring.dataset.visivel === 'true' ? rectOf(ring.getBoundingClientRect()) : null,
    passo: card?.dataset.passo ?? null,
    ancora: card?.dataset.ancora ?? null,
  }
}

/** Movimento: nenhuma animação nem transição no card e no anel. */
function lerMovimento() {
  return ['[data-felixo-onboarding="card"]', '[data-felixo-onboarding="anel"]'].map((selector) => {
    const element = document.querySelector(selector)
    if (!element) return { selector, ausente: true }
    const style = getComputedStyle(element)
    return {
      selector,
      animationName: style.animationName,
      transitionDuration: style.transitionDuration,
      display: style.display,
    }
  })
}

/**
 * Cores em RGBA (normalizadas por um canvas 2D, que entende qualquer formato
 * de cor do Chromium) e as camadas de fundo do elemento até a raiz.
 */
function medirCores() {
  const probe = document.createElement('canvas')
  probe.width = 1
  probe.height = 1
  const context = probe.getContext('2d', { willReadFrequently: true })
  const rgba = (css) => {
    context.clearRect(0, 0, 1, 1)
    context.fillStyle = 'rgba(0, 0, 0, 0)'
    context.fillStyle = css
    context.fillRect(0, 0, 1, 1)
    const data = context.getImageData(0, 0, 1, 1).data
    return [data[0], data[1], data[2], Number((data[3] / 255).toFixed(4))]
  }
  const layers = (element) => {
    const result = []
    for (let node = element; node; node = node.parentElement) result.push(rgba(getComputedStyle(node).backgroundColor))
    return result
  }
  const card = document.querySelector('[data-felixo-onboarding="card"]')
  const ring = document.querySelector('[data-felixo-onboarding="anel"]')
  if (!card || !ring) return null
  const textSelectors = [
    '.felixo-onboarding-card__tour',
    '.felixo-onboarding-card__counter',
    '.felixo-onboarding-card__title',
    '.felixo-onboarding-card__body',
  ]
  const textos = textSelectors
    .map((selector) => card.querySelector(selector))
    .filter(Boolean)
    .map((element) => ({ nome: element.className, cor: rgba(getComputedStyle(element).color), camadas: layers(element) }))
  const botoes = Array.from(card.querySelectorAll('button')).map((button) => ({
    nome: button.dataset.felixoOnboardingAction,
    cor: rgba(getComputedStyle(button).color),
    camadas: layers(button),
    borda: rgba(getComputedStyle(button).borderTopColor),
    fundoDoCartao: layers(button.parentElement),
  }))
  const target = document.querySelector(`[data-felixo-tour-anchor="${card.dataset.ancora}"]`)
  return {
    textos,
    botoes,
    anel: { cor: rgba(getComputedStyle(ring).outlineColor), camadas: target?.parentElement ? layers(target.parentElement) : [] },
  }
}

/**
 * Por que uma âncora não foi escolhida: posição, caixa da sidebar, ancestrais
 * ocultos ou rolados e o que o teste de alvo encontra no centro dela (olhando
 * através do card e do aviso, como a camada faz). Só entra na mensagem de falha.
 */
function diagnosticarAncora(selector) {
  const element = document.querySelector(selector)
  if (!element) return { selector, ausente: true }
  const surfaces = Array.from(document.querySelectorAll('[data-felixo-onboarding="card"], [data-felixo-onboarding="aviso"]'))
  const previous = surfaces.map((surface) => surface.style.pointerEvents)
  surfaces.forEach((surface) => {
    surface.style.pointerEvents = 'none'
  })
  const rect = element.getBoundingClientRect()
  const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
  surfaces.forEach((surface, index) => {
    surface.style.pointerEvents = previous[index]
  })
  const describe = (node) =>
    node ? `${node.tagName.toLowerCase()}.${String(node.className).slice(0, 60)}[${node.getAttribute('aria-label') ?? ''}]` : null
  const scroller = document.querySelector('.felixo-sidebar-scroll')
  const box = scroller?.getBoundingClientRect()
  const rolados = []
  for (let node = element.parentElement; node; node = node.parentElement) {
    if (node.scrollTop || node.scrollLeft) rolados.push({ node: describe(node), top: node.scrollTop, left: node.scrollLeft })
  }
  const style = getComputedStyle(element)
  return {
    selector,
    rect: [rect.left, rect.top, rect.width, rect.height].map(Math.round),
    caixaSidebar: box ? [box.left, box.top, box.width, box.height].map(Math.round) : null,
    naSidebar: Boolean(scroller?.contains(element)),
    oculto: Boolean(element.closest('[inert], [aria-hidden="true"], [hidden]')),
    visibility: style.visibility,
    opacity: style.opacity,
    atingido: Boolean(hit && element.contains(hit)),
    noCentro: describe(hit),
    rolados,
    janela: [window.innerWidth, window.innerHeight],
  }
}

function lerBordaDoCartao() {
  const card = document.querySelector('[data-felixo-onboarding="card"]')
  if (!card) return null
  const style = getComputedStyle(card)
  return { estilo: style.borderTopStyle, largura: parseFloat(style.borderTopWidth) || 0, cor: style.borderTopColor }
}

// ---------------------------------------------------------------------------
// Cenários
// ---------------------------------------------------------------------------

/**
 * @param {{
 *   page: import('playwright-core').Page,
 *   esperarAte: Function,
 *   measureStableGeometry: Function,
 *   recordVisualEvidence: Function,
 *   checarMontagem: Function,
 *   checarLandmarksVisiveis: Function,
 *   corromperEstado?: () => void,
 *   timeoutMs: number,
 *   log?: (message: string) => void,
 * }} deps
 */
function criarCenariosDoTutorial(deps) {
  const { page, esperarAte, measureStableGeometry, recordVisualEvidence, checarMontagem, checarLandmarksVisiveis } = deps
  const timeout = deps.timeoutMs
  const log = deps.log ?? ((message) => console.log(`[canvas-smoke:tutorial] ${message}`))

  // --- ponte e leitura --------------------------------------------------------

  const mainEval = (expression) => page.evaluate((source) => window.felixo.devtools.mainEval(source), expression)
  const snapshotIpc = () => mainEval('ipcProbe.snapshot()')
  const lerEstado = () => page.evaluate(() => window.felixo.onboarding.read())
  const gravarEstado = (expectedRevision, value) =>
    page.evaluate((request) => window.felixo.onboarding.write(request), { expectedRevision, value })
  const cartao = () => page.evaluate(lerCartao)
  const foco = () => page.evaluate(lerFoco)
  const anuncio = () => page.evaluate(lerAnuncio)

  async function esperar(cenario, descricao, predicate, arg) {
    try {
      await page.waitForFunction(predicate, arg, { timeout })
    } catch (error) {
      const estado = await page.evaluate(lerCartao).catch(() => null)
      falhar(cenario, `${descricao} não aconteceu em ${timeout} ms (${error.message.split('\n')[0]})`, { cartao: estado })
    }
  }

  async function esperarNode(cenario, descricao, check) {
    const ok = await esperarAte(check, { timeoutMs: timeout })
    exigir(ok, cenario, `${descricao} não aconteceu em ${timeout} ms`)
  }

  async function esperarPasso(cenario, passo, ancora = null) {
    try {
      await page.waitForFunction(
        ({ passo: expected, ancora: anchor }) => {
          const card = document.querySelector('[data-felixo-onboarding="card"]')
          return Boolean(card?.dataset.modo) && card.dataset.passo === expected && (anchor === null || card.dataset.ancora === anchor)
        },
        { passo, ancora },
        { timeout },
      )
    } catch (error) {
      const estado = await page.evaluate(lerCartao).catch(() => null)
      const alvo = ancora ? await page.evaluate(diagnosticarAncora, seletorDaAncora(ancora)).catch(() => null) : null
      falhar(
        cenario,
        `card no passo ${passo}${ancora ? ` apontando ${ancora}` : ''} não aconteceu em ${timeout} ms (${error.message.split('\n')[0]})`,
        { cartao: estado, alvo },
      )
    }
  }

  const esperarSemCartao = (cenario) =>
    esperar(cenario, 'o card sumir', () => document.querySelector('[data-felixo-onboarding="card"]') === null)

  /** A decisão automática assentou; nada abriu (nem card nem aviso) depois de frames estáveis. */
  async function esperarNadaAberto(cenario) {
    await esperar(cenario, 'a decisão automática assentar', () => {
      const decisao = document.querySelector('[data-felixo-onboarding="anuncio"]')?.getAttribute('data-felixo-onboarding-decisao')
      return Boolean(decisao) && decisao !== 'carregando'
    })
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    const estado = await page.evaluate(() => ({
      decisao: document.querySelector('[data-felixo-onboarding="anuncio"]')?.getAttribute('data-felixo-onboarding-decisao'),
      cartoes: document.querySelectorAll('[data-felixo-onboarding="card"]').length,
      avisos: document.querySelectorAll('[data-felixo-onboarding="aviso"]').length,
    }))
    exigir(!DECISOES_QUE_ABREM.has(estado.decisao) && estado.cartoes === 0 && estado.avisos === 0, cenario, 'algo abriu sozinho', estado)
    return estado
  }

  async function recarregar() {
    await page.reload()
    await checarMontagem(page)
  }

  /**
   * Resize com o prazo do tutorial, como toda espera daqui. Logo depois de um reload
   * com a fixture o renderer passa segundos montando os blocos pesados, e o prazo de
   * interação do smoke (5 s no Linux) estourava no primeiro resize do SA8 com o
   * tamanho certo na tela. A falha traz o tamanho pedido e o lido.
   */
  const definirViewport = (viewport) => definirViewportDaPagina(page, viewport, { timeoutMs: timeout })

  // --- Ajuda --------------------------------------------------------------------

  async function abrirMenuAjuda(cenario) {
    await page.locator(SEL.ajuda).click()
    await esperar(cenario, 'o menu Ajuda abrir', (selector) => document.querySelector(selector) !== null, SEL.menuAjuda)
  }

  /** Clica a ação do tutorial no menu Ajuda (Iniciar, Recomeçar, Rever ou Continuar). */
  async function clicarAcaoDoTutorial(cenario) {
    const escolhida = await page.evaluate((ordem) => {
      const section = document.querySelector('.felixo-onboarding-help-menu .felixo-onboarding-help__section')
      const ids = Array.from(section?.querySelectorAll('[data-felixo-onboarding-action]') ?? []).map(
        (button) => button.getAttribute('data-felixo-onboarding-action'),
      )
      return ordem.find((id) => ids.includes(id)) ?? null
    }, ACOES_QUE_ABREM)
    exigir(escolhida, cenario, 'o menu Ajuda não oferece ação para abrir o tutorial')
    await page.locator(`.felixo-onboarding-help-menu .felixo-onboarding-help__section ${acao(escolhida)}`).first().click()
    return escolhida
  }

  async function abrirTourPelaAjuda(cenario) {
    await abrirMenuAjuda(cenario)
    await clicarAcaoDoTutorial(cenario)
    await esperar(cenario, 'o card abrir pela Ajuda', (selector) => document.querySelector(selector) !== null, SEL.cartaoPosto)
    return cartao()
  }

  /** Clique pelo DOM num botão do tour (a faixa fantasma da dock não intercepta). */
  async function clicarNoTour(cenario, id) {
    const clicked = await page.evaluate((selector) => {
      const button = document.querySelector(selector)
      if (!button) return false
      button.click()
      return true
    }, `:is([data-felixo-onboarding="card"], [data-felixo-onboarding="aviso"]) ${acao(id)}`)
    exigir(clicked, cenario, `botão ${id} ausente no tour`)
  }

  async function fecharTourSeAberto(cenario) {
    if (await page.locator(SEL.cartao).count()) {
      await clicarNoTour(cenario, 'pular')
      await esperarSemCartao(cenario)
    }
  }

  // --- conferência de um passo ------------------------------------------------------

  async function conferirPasso(cenario, { passo, ancora, modo = 'ancorado' }) {
    await esperarPasso(cenario, passo, ancora)
    await measureStableGeometry(page, `${cenario} ${passo}`, [SEL.cartao, SEL.anel])
    const medida = await page.evaluate(medirPasso, seletorDaAncora(ancora))
    const { viewport, cartao: card, anel, alvo } = medida
    const rotulo = ROTULO_DA_ANCORA[ancora]
    exigir(card && alvo && anel, cenario, `card, alvo ou anel ausente no passo ${passo}`, medida)
    exigir(card.modo === modo, cenario, `passo ${passo} em modo ${card.modo}, esperado ${modo}`, card)
    exigir(!alvo.inert && !alvo.ariaHidden, cenario, `alvo ${ancora} dentro de inert/aria-hidden`, alvo)
    exigir(rectInside(alvo.rect, viewport), cenario, `alvo ${ancora} fora da janela`, { alvo: alvo.rect, viewport })
    exigir(alvo.atingido, cenario, `elementFromPoint no centro de ${ancora} não cai no alvo`, alvo)
    exigir(contains(anel.rect, clipToViewport(alvo.rect, viewport), 2), cenario, `o anel não contém ${ancora}`, { anel: anel.rect, alvo: alvo.rect })
    exigir(rectInside(card.rect, viewport), cenario, `card fora da janela no passo ${passo}`, { card: card.rect, viewport })
    if (card.modo === 'ancorado') {
      exigir(!intersects(card.rect, alvo.rect), cenario, `card cobre o alvo ${ancora}`, { card: card.rect, alvo: alvo.rect })
    }
    for (const obstaculo of medida.obstaculos) {
      exigir(!intersects(card.rect, obstaculo), cenario, `card cobre um aviso ([data-felixo-tour-avoid]) no passo ${passo}`, { card: card.rect, obstaculo })
    }
    if (medida.chat) {
      exigir(!intersects(inflate(anel.rect, anel.contorno), medida.chat), cenario, `o anel cruza o botão Chat no passo ${passo}`, { anel: anel.rect, chat: medida.chat })
    }
    exigir(contem(alvo.nome, rotulo), cenario, `nome acessível de ${ancora} ("${alvo.nome}") não contém "${rotulo}"`)
    exigir(contem(card.corpo, rotulo), cenario, `texto do passo ${passo} não cita "${rotulo}"`, card.corpo)
    exigir(medida.ferramentasExpandida !== 'true', cenario, 'o tour abriu a seção Ferramentas')
    const preso = medida.ancestrais.find((style) => containingBlockReason(style))
    exigir(!preso, cenario, `ancestral do host cria containing block (${preso && containingBlockReason(preso)})`, preso)
    return medida
  }

  // --- sondas (IPC, rede, DOM, localStorage) ---------------------------------------

  /**
   * Espera o app parar de gravar por conta própria antes de abrir a janela das
   * sondas. Um resize logo antes (o smoke vem de 320×720) faz o canvas medir os
   * blocos de novo e gravar posição e tamanho com atraso (`canvas:save`); essas
   * gravações não são do tour e não podem cair dentro da janela. A condição é
   * uma amostra inteira sem nenhum canal proibido.
   */
  async function esperarIpcQuieto(cenario) {
    const amostraMs = 1_500
    // O que a última amostra ainda viu, para a falha dizer quem não parou
    // (no Windows da CI, o SA1 reprova de tempos em tempos sem isso).
    let ultimaAmostra = {}
    const quieto = await esperarAte(
      async () => {
        const antes = await snapshotIpc()
        await page.evaluate((ms) => new Promise((resolve) => setTimeout(resolve, ms)), amostraMs)
        const delta = diffChannels(antes, await snapshotIpc())
        ultimaAmostra = Object.fromEntries(forbiddenChannels(delta).map((canal) => [canal, delta[canal]]))
        return Object.keys(ultimaAmostra).length === 0
      },
      { timeoutMs: Math.max(timeout, 30_000), intervalMs: 0 },
    )
    exigir(quieto, cenario, 'o app não parou de gravar sozinho antes do percurso', {
      canaisNaUltimaAmostra: ultimaAmostra,
      amostraMs,
    })
  }

  async function abrirSondas(cenario) {
    await esperarIpcQuieto(cenario)
    const urls = []
    const onRequest = (request) => urls.push(request.url())
    // Antes: a página (inclui canvas:list) e só então o IPC, para a leitura
    // da própria sonda ficar fora da janela.
    const pagina = await page.evaluate(lerPaginaParaSonda)
    const ipc = await snapshotIpc()
    page.on('request', onRequest)
    const inicio = Date.now()
    return {
      async fechar() {
        page.off('request', onRequest)
        const ipcDepois = await snapshotIpc()
        const paginaDepois = await page.evaluate(lerPaginaParaSonda)
        return { antes: { ipc, pagina }, depois: { ipc: ipcDepois, pagina: paginaDepois }, urls, duracaoMs: Date.now() - inicio }
      },
    }
  }

  /** Janela ociosa de controle, com a mesma duração do percurso (uma medição, não uma espera). */
  async function janelaDeControle(duracaoMs) {
    const antes = await snapshotIpc()
    await page.waitForTimeout(duracaoMs)
    const depois = await snapshotIpc()
    return Object.keys(diffChannels(antes, depois))
  }

  async function conferirSondas(cenario, resultado) {
    const delta = diffChannels(resultado.antes.ipc, resultado.depois.ipc)
    const proibidos = forbiddenChannels(delta)
    exigir(proibidos.length === 0, cenario, `o percurso acionou canais proibidos (${proibidos.join(', ')})`, delta)
    const controle = await janelaDeControle(resultado.duracaoMs)
    const fora = channelsOutside(delta, controle)
    exigir(fora.length === 0, cenario, `o percurso usou canais fora da janela ociosa (${fora.join(', ')})`, { delta, controle })
    const origem = new URL(page.url()).origin
    const externas = externalRequests(resultado.urls, origem)
    exigir(externas.length === 0, cenario, 'o percurso fez requisição para fora do app', externas)
    const { contagens: antes, expandido: expandidoAntes, storage: storageAntes } = resultado.antes.pagina
    const { contagens: depois, expandido: expandidoDepois, storage: storageDepois } = resultado.depois.pagina
    exigir(JSON.stringify(antes) === JSON.stringify(depois), cenario, 'o percurso mudou blocos, terminais ou webviews', { antes, depois })
    exigir(JSON.stringify(expandidoAntes) === JSON.stringify(expandidoDepois), cenario, 'o percurso abriu ou fechou a sidebar ou uma seção', { expandidoAntes, expandidoDepois })
    const violacoes = storageViolations(diffStorage(storageAntes, storageDepois), { removable: [MARCADOR_PRIMEIRO_BOOT] })
    exigir(violacoes.length === 0, cenario, 'o percurso mudou o localStorage', violacoes)
    log(`${cenario}: sondas ok (IPC ${JSON.stringify(delta)}, ${resultado.urls.length} requisições locais, controle de ${resultado.duracaoMs} ms)`)
  }

  // =================================================================================
  // Sessão A
  // =================================================================================

  /** SA0: supressão na automação e captura dos sinais antes do tema. */
  async function sa0() {
    const cenario = 'SA0'
    await measureStableGeometry(page, 'SA0 canvas', ['[data-felixo-region="canvas"]'])
    await esperarNadaAberto(cenario)
    const regiao = await anuncio()
    exigir(regiao, cenario, 'a região live do tutorial não existe')
    exigir(regiao.texto === '' && regiao.lang === 'pt-BR' && regiao.role === 'status' && regiao.live === 'polite', cenario, 'região live fora do contrato', regiao)
    exigir(regiao.decisao === 'suprimido:abriria-inicial', cenario, `decisão ${regiao.decisao}; a captura dos sinais precisa ser anterior ao tema`, regiao)
    const estado = await lerEstado()
    exigir(estado.ok && estado.value === null && estado.revision === 0, cenario, 'a instância de automação gravou o estado sozinha', estado)
    exigir(estado.automation?.autoOpen === false && estado.automation?.reason === 'devtools', cenario, 'política de automação inesperada', estado.automation)
    const extras = await page.evaluate(
      ({ marcador, ajuda }) => ({
        marcador: window.localStorage.getItem(marcador),
        nomeAjuda: document.querySelector(ajuda)?.getAttribute('aria-label') ?? null,
      }),
      { marcador: MARCADOR_PRIMEIRO_BOOT, ajuda: SEL.ajuda },
    )
    exigir(extras.marcador === '1', cenario, 'o marcador de primeiro boot não foi gravado', extras)
    exigir(contem(extras.nomeAjuda, 'Ajuda'), cenario, 'o botão Ajuda não tem nome acessível', extras)
    log('SA0 supressão e captura: ok (suprimido:abriria-inicial, nada gravado)')
  }

  /** Alvos esperados no percurso de referência (sidebar aberta, Criar aberta). */
  async function alvosDoPercurso() {
    const inspectorAberto = await page.evaluate(
      () => document.querySelector('.felixo-elements-inspector')?.getAttribute('aria-hidden') === 'false',
    )
    return PASSOS_INICIAL.map((passo) => ({
      passo,
      ancora: passo === 'terminal' && !inspectorAberto ? 'inspector-puck' : ALVO_PRIMARIO[passo],
    }))
  }

  /**
   * O bloco Excalidraw da fixture regrava a si mesmo cerca de uma vez por segundo
   * com o canvas parado (o `onChange` do Excalidraw dispara sem edição e o
   * `updatedAt` muda com a cena igual). Isso é do bloco, não do tour, e tornaria
   * impossível provar "zero escritas no canvas" durante o percurso. Ele sai da
   * fixture antes das sondas; o canvas continua com blocos (o caso "não vazio").
   */
  async function removerBlocosQueGravamSozinhos() {
    const removidos = await page.evaluate(async () => {
      const { nodes = [] } = await window.felixo.canvas.list()
      const alvo = nodes.filter((node) => node.type === 'excalidrawDrawing')
      for (const node of alvo) await window.felixo.canvas.delete(node.id)
      return alvo.length
    })
    if (removidos > 0) await recarregar()
  }

  /** SA1: percurso manual pela Ajuda com a fixture, e as sondas em volta. */
  async function sa1() {
    const cenario = 'SA1'
    await definirViewport(VIEWPORT_PADRAO)
    await removerBlocosQueGravamSozinhos()
    const alvos = await alvosDoPercurso()
    const sondas = await abrirSondas(cenario)
    await abrirTourPelaAjuda(cenario)
    for (const [index, esperado] of alvos.entries()) {
      await conferirPasso(cenario, esperado)
      await recordVisualEvidence(page, `tutorial-passo-${index + 1}-${esperado.passo}`, [SEL.cartao, SEL.anel], {
        event: 'onboarding-step',
        step: esperado.passo,
        anchor: esperado.ancora,
      })
      await clicarNoTour(cenario, index === alvos.length - 1 ? 'concluir' : 'proximo')
    }
    await esperarSemCartao(cenario)
    await conferirSondas(cenario, await sondas.fechar())
    const estado = await lerEstado()
    exigir(estado.value?.tours?.inicial?.status === 'concluido', cenario, 'concluir não gravou o tutorial como concluído', estado.value?.tours)
    log('SA1 percurso pela Ajuda: ok (6 passos, alvos visíveis, sem cruzar alvo, avisos nem Chat)')
  }

  /**
   * Menu Ajuda pelo teclado. O menu é um portal no fim do body: o Tab que sairia
   * dele fecha o menu e devolve o foco ao botão Ajuda (o padrão do FelixoSelect),
   * em vez de levar o foco ao topo do app, ou ao aviso ao lado, com o menu aberto.
   */
  async function conferirTecladoDoMenuAjuda(cenario) {
    const lerMenu = () =>
      page.evaluate(() => {
        const menu = document.querySelector('.felixo-onboarding-help-menu')
        const active = document.activeElement
        return {
          aberto: Boolean(menu),
          focoNoMenu: Boolean(menu && active && menu.contains(active)),
          acao: active?.getAttribute?.('data-felixo-onboarding-action') ?? null,
          texto: (active?.textContent ?? '').trim().slice(0, 40),
          botoes: menu ? menu.querySelectorAll('button:not([disabled])').length : 0,
        }
      })
    const abrirPeloTeclado = async (etapa) => {
      await page.locator(SEL.ajuda).focus()
      await page.keyboard.press('Enter')
      await esperar(cenario, `o menu Ajuda abrir pelo teclado (${etapa})`, (selector) => document.querySelector(selector) !== null, SEL.menuAjuda)
      await esperar(cenario, `o foco entrar no menu (${etapa})`, () => Boolean(document.activeElement?.closest('.felixo-onboarding-help-menu')))
      return lerMenu()
    }
    const fechouNaAjuda = (etapa) =>
      esperar(
        cenario,
        `${etapa} fechar o menu e devolver o foco à Ajuda`,
        () => !document.querySelector('.felixo-onboarding-help-menu') && Boolean(document.activeElement?.hasAttribute('data-felixo-help-trigger')),
      )

    // O Tab percorre os controles do menu e, depois do último, fecha e volta à Ajuda.
    const aberto = await abrirPeloTeclado('Tab')
    const percorridos = [aberto.acao]
    for (let index = 0; index < aberto.botoes; index += 1) {
      await page.keyboard.press('Tab')
      const atual = await lerMenu()
      if (!atual.aberto) break
      exigir(atual.focoNoMenu, cenario, 'Tab no menu Ajuda levou o foco para fora com o menu aberto', atual)
      percorridos.push(atual.acao)
    }
    await fechouNaAjuda('Tab depois do último controle')
    exigir(percorridos.length === aberto.botoes, cenario, 'o Tab não passou por todos os controles do menu Ajuda', { percorridos, botoes: aberto.botoes })

    // Shift+Tab no primeiro controle: fecha e volta à Ajuda.
    await abrirPeloTeclado('Shift+Tab')
    await page.keyboard.press('Shift+Tab')
    await fechouNaAjuda('Shift+Tab no primeiro controle')

    // Esc com o foco no menu: fecha e volta à Ajuda.
    await abrirPeloTeclado('Esc')
    await page.keyboard.press('Escape')
    await fechouNaAjuda('Esc no menu')
    return percorridos
  }

  /** SA2: teclado, sem focus trap (menu Ajuda e card). */
  async function sa2() {
    const cenario = 'SA2'
    const menu = await conferirTecladoDoMenuAjuda(cenario)
    // O foco depois de cada ação do tour (abrir, Tab dentro do card, Voltar,
    // Próximo, Esc) nunca pode cair na metade "Agente" nem em "Limpar". Sair do
    // card com Tab/Shift+Tab é a ordem sequencial do documento, não ação do tour:
    // o Shift+Tab em Pular cai no último controle da sidebar (hoje "Limpar"), e só
    // se confere que ele ficou na sidebar.
    const amostras = []
    const amostrar = async () => {
      const atual = await foco()
      amostras.push(atual)
      return atual
    }
    await page.locator(SEL.ajuda).focus()
    await page.keyboard.press('Enter')
    await esperar(cenario, 'o menu Ajuda abrir pelo teclado', (selector) => document.querySelector(selector) !== null, SEL.menuAjuda)
    await esperar(cenario, 'o foco entrar no menu', () => Boolean(document.activeElement?.closest('.felixo-onboarding-help-menu')))
    await page.keyboard.press('Enter')
    await esperar(cenario, 'o card abrir com o foco nele', () => document.activeElement?.getAttribute('data-felixo-onboarding') === 'card')
    await esperarPasso(cenario, 'projeto')

    const ordem = []
    let atual = null
    for (let index = 0; index < 4; index += 1) {
      await page.keyboard.press('Tab')
      atual = await foco()
      if (!atual.noCartao) break
      amostras.push(atual)
      // O corpo só entra na ordem de Tab quando transborda; não conta como botão.
      if (atual.acao) ordem.push(atual.acao)
    }
    exigir(JSON.stringify(ordem) === JSON.stringify(['pular', 'voltar', 'proximo']), cenario, 'ordem de Tab no card', ordem)
    if (atual.noCartao) {
      await page.keyboard.press('Tab')
      atual = await foco()
    }
    exigir(!atual.noCartao && atual.noCanvas && !atual.naSidebar, cenario, 'Tab depois do último botão não seguiu para o canvas', atual)

    await page.keyboard.press('Shift+Tab')
    atual = await amostrar()
    exigir(atual.acao === 'proximo', cenario, 'Shift+Tab não voltou ao último botão do card', atual)
    await page.keyboard.press('Shift+Tab')
    await page.keyboard.press('Shift+Tab')
    atual = await amostrar()
    exigir(atual.acao === 'pular', cenario, 'Shift+Tab não chegou a Pular', atual)
    await page.keyboard.press('Shift+Tab')
    atual = await foco()
    exigir(atual.naSidebar && !atual.noCartao, cenario, 'Shift+Tab em Pular não voltou à sidebar (trap?)', atual)

    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')
    atual = await amostrar()
    exigir(atual.acao === 'voltar', cenario, 'Tab não chegou a Voltar', atual)
    await page.keyboard.press('Enter')
    atual = await amostrar()
    const noPrimeiro = await cartao()
    exigir(noPrimeiro.passo === 'projeto' && atual.acao === 'voltar', cenario, 'Enter em Voltar no passo 1 mudou algo', { cartao: noPrimeiro, foco: atual })

    await page.keyboard.press('Tab')
    atual = await amostrar()
    exigir(atual.acao === 'proximo', cenario, 'Tab não chegou a Próximo', atual)
    const contorno = await page.evaluate(() => {
      const style = getComputedStyle(document.activeElement)
      return { estilo: style.outlineStyle, largura: parseFloat(style.outlineWidth) || 0, focusVisible: document.activeElement.matches(':focus-visible') }
    })
    exigir(contorno.focusVisible && contorno.estilo !== 'none' && contorno.largura > 0, cenario, 'foco visível sem contorno', contorno)
    await page.keyboard.press('Enter')
    await esperarPasso(cenario, 'agente')
    atual = await amostrar()
    exigir(atual.acao === 'proximo', cenario, 'Enter em Próximo tirou o foco do botão', atual)

    await page.keyboard.press('Escape')
    await esperarSemCartao(cenario)
    await esperar(cenario, 'o foco voltar ao botão Ajuda', () => document.activeElement?.hasAttribute('data-felixo-help-trigger'))
    await amostrar()
    const perigosos = amostras.filter((item) => item.metadeAgente || item.limpar)
    exigir(perigosos.length === 0, cenario, 'o foco passou pela metade "Agente" ou por "Limpar"', perigosos)
    log(`SA2 teclado: ok (menu Ajuda ${menu.join(' → ')} e Tab, Shift+Tab ou Esc para fora devolvem o foco à Ajuda; Pular → Voltar → Próximo, sem trap, Esc devolve o foco à Ajuda)`)
  }

  /** SA3: Esc em camadas e o tutorial não bloqueia o agente. */
  async function sa3() {
    const cenario = 'SA3'
    await abrirTourPelaAjuda(cenario)
    await clicarNoTour(cenario, 'proximo')
    await esperarPasso(cenario, 'agente')
    const noAgente = async (etapa) => {
      const atual = await cartao()
      exigir(atual?.passo === 'agente' && atual.total === 1, cenario, `o tour mudou depois de ${etapa}`, atual)
    }

    // Flyout da seta "Configurar novo agente": o Esc fecha só ele.
    await page.locator('.felixo-sidebar-agent-trigger button[aria-label="Configurar novo agente"]').click()
    const flyout = page.locator('[role="group"][aria-label="Configurar novo agente"]')
    await flyout.waitFor({ state: 'visible', timeout })
    await esperar(cenario, 'o foco entrar no flyout', () => Boolean(document.activeElement?.closest('[role="group"][aria-label="Configurar novo agente"]')))
    await page.keyboard.press('Escape')
    await flyout.waitFor({ state: 'detached', timeout })
    await noAgente('o Esc no flyout')

    // Busca (Ctrl+K rouba o foco): o Esc fecha só o painel.
    await page.keyboard.press('Control+k')
    const busca = page.locator('[data-felixo-canvas-panel="search"]')
    await busca.waitFor({ state: 'visible', timeout })
    await esperar(cenario, 'o foco ir para o campo da Busca', () => document.activeElement?.closest('[data-felixo-canvas-panel="search"]') !== null)
    await page.keyboard.press('Escape')
    await busca.waitFor({ state: 'detached', timeout })
    await noAgente('o Esc na Busca')

    // HandoffDialog (modal, z 60) fica por cima do tour e o Esc é dele.
    await page.evaluate(() => {
      document
        .querySelector('.felixo-zoom-pill button[aria-label="Enquadrar todos os blocos"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
      return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    })
    // Pelo teclado: dependendo do enquadramento, a dock cobre o gatilho do bloco.
    const gatilho = page.locator('[data-terminal-expand-trigger="fixture-terminal"]').first()
    await gatilho.focus()
    await page.keyboard.press('Enter')
    await page.locator('[data-canvas-terminal-drawer]').waitFor({ state: 'visible', timeout })
    await page.locator('[data-canvas-handoff-trigger]').click()
    const dialog = page.locator('[role="dialog"][aria-modal="true"]')
    await dialog.waitFor({ state: 'visible', timeout })
    const topo = await page.evaluate(() => {
      const element = document.querySelector('[role="dialog"][aria-modal="true"]')
      const rect = element.getBoundingClientRect()
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
      return { noTopo: Boolean(hit && element.contains(hit)), focoNoDialogo: element.contains(document.activeElement) }
    })
    exigir(topo.noTopo, cenario, 'o HandoffDialog não ficou por cima do tour', topo)
    exigir(topo.focoNoDialogo, cenario, 'o foco não está no HandoffDialog', topo)
    await page.keyboard.press('Escape')
    await dialog.waitFor({ state: 'hidden', timeout })
    await noAgente('o Esc no HandoffDialog')
    const depoisDoDialogo = await foco()
    exigir(!depoisDoDialogo.noCartao, cenario, 'o tour puxou o foco depois do diálogo', depoisDoDialogo)
    await page.getByRole('button', { name: 'Fechar terminal' }).click()
    await page.waitForFunction(() => !document.querySelector('[data-canvas-terminal-drawer]'), null, { timeout })
    // Abrir a gaveta rola o shell de lado por um instante (o alvo sai da tela e o
    // tour cai no menu do canvas); quando o shell volta, o anel volta para a moldura.
    await esperarPasso(cenario, 'agente', 'criar-agente')

    // Fora da janela das sondas: "Agente" (PTY fake) com o tour aberto cria o terminal (T1.d).
    const antes = await page.evaluate(async () => (await window.felixo.canvas.list()).nodes?.length ?? 0)
    await page.locator('.felixo-sidebar-agent-trigger button:not([aria-label])').click()
    await esperarNode(cenario, 'o terminal novo ser criado com o tour aberto', async () =>
      (await page.evaluate(async () => (await window.felixo.canvas.list()).nodes?.length ?? 0)) === antes + 1,
    )
    await noAgente('criar um agente')
    if (await page.locator('[data-canvas-terminal-drawer]').count()) {
      await page.getByRole('button', { name: 'Fechar terminal' }).click()
      await page.waitForFunction(() => !document.querySelector('[data-canvas-terminal-drawer]'), null, { timeout })
    }
    // O "Agente" (ou a gaveta fechada) devolve o foco um quadro depois, e até lá ele
    // fica no body. Sem esperar, esse foco chegava depois do Próximo focado abaixo, e
    // o Enter sob a pergunta abria um segundo agente em vez de cair no tour cedido.
    await esperar(cenario, 'o foco assentar depois de criar o agente', () => {
      const active = document.activeElement
      return Boolean(active && active !== document.body && !active.closest('[data-canvas-terminal-drawer]'))
    })
    await conferirPerguntaSobreOTour(cenario)
    await fecharTourSeAberto(cenario)
    log('SA3 Esc em camadas: ok (flyout, Busca, HandoffDialog e pergunta do agente donos do teclado; Delete, Backspace e q sob a pergunta não agem no canvas; Agente cria terminal com o tour aberto)')
  }

  /**
   * AgentQuestionDialog de verdade (pergunta gravada na fila de pedidos do perfil
   * isolado) por cima do tour. O diálogo não pega o foco e escuta o teclado na
   * janela; o tour cede: o card fica inerte e o foco sai dele para um ponto de
   * espera neutro, Enter não avança o tour por baixo, Tab não volta a ele, as
   * teclas vão para o diálogo e as do canvas não agem por baixo dele. Fechado o
   * diálogo, o foco volta ao botão do tour, no mesmo passo, só se ninguém o levou
   * para outro lugar.
   */
  async function conferirPerguntaSobreOTour(cenario) {
    exigir(typeof deps.registrarPerguntaDoAgente === 'function', cenario, 'o smoke não recebeu como gravar uma pergunta de agente')
    const passo = (await cartao())?.passo
    const modalAberto = () => page.evaluate(() => document.querySelectorAll('[role="dialog"][aria-modal="true"]').length)
    const cedeu = () =>
      esperar(cenario, 'o card ceder à pergunta do agente (inert e sem o foco)', () => {
        const card = document.querySelector('[data-felixo-onboarding="card"]')
        return Boolean(document.querySelector('[aria-modal="true"]') && card?.hasAttribute('inert') && !card.contains(document.activeElement))
      })
    const retomou = () =>
      esperar(cenario, 'o card voltar depois da pergunta', () => {
        const card = document.querySelector('[data-felixo-onboarding="card"]')
        return !document.querySelector('[aria-modal="true"]') && Boolean(card) && !card.hasAttribute('inert')
      })
    const focarProximo = async () => {
      await page.evaluate((selector) => document.querySelector(selector)?.focus(), `${SEL.cartao} ${acao('proximo')}`)
      exigir((await foco()).acao === 'proximo', cenario, 'o foco não entrou no Próximo do card', await foco())
    }

    // 1) Foco no Próximo, como quem avança pelo teclado; a pergunta chega por cima.
    await focarProximo()
    deps.registrarPerguntaDoAgente({ pergunta: 'Smoke do tutorial: qual opção?', opcoes: ['Primeira', 'Segunda'] })
    await cedeu()
    await conferirCardParadoSobAPergunta(cenario)
    await page.keyboard.press('Enter')
    await measureStableGeometry(page, `${cenario} Enter sob a pergunta`, [SEL.cartao], QUADROS_CURTOS)
    const depoisDoEnter = await cartao()
    exigir(depoisDoEnter?.passo === passo && (await modalAberto()) === 1, cenario, 'Enter avançou o tour por baixo da pergunta', depoisDoEnter)
    // A tecla da opção é do diálogo; o foco volta ao Próximo e o tour segue no mesmo passo.
    await page.keyboard.press('2')
    await retomou()
    await esperar(cenario, 'o foco voltar ao Próximo do card', () =>
      document.activeElement?.getAttribute('data-felixo-onboarding-action') === 'proximo',
    )
    exigir((await cartao())?.passo === passo, cenario, 'a pergunta mudou o passo do tour', await cartao())

    // 2) Tab com a pergunta aberta nunca entra no card; o foco levado para fora fica lá.
    await focarProximo()
    deps.registrarPerguntaDoAgente({ pergunta: 'Smoke do tutorial: outra?', opcoes: ['A', 'B'] })
    await cedeu()
    for (let index = 0; index < 3; index += 1) {
      await page.keyboard.press('Tab')
      const atual = await foco()
      exigir(!atual.noCartao, cenario, 'Tab entrou no card inerte', atual)
    }
    const levado = await foco()
    await page.keyboard.press('Escape')
    await retomou()
    await measureStableGeometry(page, `${cenario} depois da pergunta`, [SEL.cartao], QUADROS_CURTOS)
    const final = await foco()
    exigir(!final.noCartao, cenario, 'o tour puxou de volta o foco que a pessoa levou para fora', { levado, final })
    exigir((await cartao())?.passo === passo, cenario, 'a pergunta mudou o passo do tour', await cartao())

    await conferirTeclasDoCanvasSobAPergunta(cenario, { cedeu, retomou, focarProximo })
  }

  /**
   * O fundo da pergunta (`fixed inset-0`) cobre todos os alvos, e o teste do centro
   * (`elementFromPoint`) rejeitava cada um: qualquer reposicionamento sob a pergunta
   * levava o card ao alvo reserva, com outro texto, e ele voltava quando a pergunta
   * fechava (no CI, o SA3 pegou o card indo de left 294 a 58). Um resize força o
   * reposicionamento na hora: o card tem de ficar no mesmo alvo e no mesmo lugar.
   */
  async function conferirCardParadoSobAPergunta(cenario) {
    const ler = () =>
      page.evaluate(() => {
        const card = document.querySelector('[data-felixo-onboarding="card"]')
        const rect = card?.getBoundingClientRect()
        return rect
          ? { ancora: card.dataset.ancora ?? null, left: Math.round(rect.left), top: Math.round(rect.top), corpo: card.querySelector('.felixo-onboarding-card__body')?.textContent ?? '' }
          : null
      })
    const antes = await ler()
    await page.evaluate(
      () =>
        new Promise((resolve) => {
          window.dispatchEvent(new Event('resize'))
          // Um quadro para o reposicionamento agendado, outro para o render da troca de alvo.
          requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 100)))
        }),
    )
    const depois = await ler()
    const parado =
      antes !== null &&
      depois !== null &&
      depois.ancora === antes.ancora &&
      depois.corpo === antes.corpo &&
      depois.left === antes.left &&
      depois.top === antes.top
    exigir(parado, cenario, 'o card trocou de alvo ou de lugar por baixo da pergunta', { antes, depois })
  }

  /**
   * As teclas do canvas com o foco cedido. No body, o React Flow tratava Delete e
   * Backspace como teclas do canvas e apagava o bloco selecionado por baixo da
   * pergunta (sem desfazer, soltando a sessão do terminal), e `q` trocava o modo
   * seleção/pan. O foco que era do tour espera num ponto neutro (`nokey`, fora do
   * card) e volta ao Próximo quando a pergunta fecha.
   */
  async function conferirTeclasDoCanvasSobAPergunta(cenario, { cedeu, retomou, focarProximo }) {
    const alvo = 'fixture-terminal'
    const lerCanvas = () =>
      page.evaluate(async (id) => {
        const node = document.querySelector(`.react-flow__node[data-id="${id}"]`)
        const lista = await window.felixo.canvas.list()
        return {
          noDom: Boolean(node),
          noDisco: (lista.nodes ?? []).some((item) => item.id === id),
          selecionado: Boolean(node?.classList.contains('selected')),
          pan: document.querySelector('.react-flow')?.classList.contains('cursor-grab') ?? null,
        }
      }, alvo)
    const noBloco = () =>
      page.evaluate((id) => {
        const node = document.querySelector(`.react-flow__node[data-id="${id}"]`)
        node?.focus({ preventScroll: true })
        return document.activeElement === node
      }, alvo)
    // Seleção pelo teclado do React Flow (Enter no bloco focado seleciona, Esc desfaz):
    // sem depender de onde o card, a dock ou a gaveta caem na tela.
    await page.evaluate(() => {
      document
        .querySelector('.felixo-zoom-pill button[aria-label="Enquadrar todos os blocos"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
    })
    await esperar(cenario, 'o bloco da fixture na tela', (id) => document.querySelector(`.react-flow__node[data-id="${id}"]`) !== null, alvo)
    exigir(await noBloco(), cenario, 'o foco não entrou no bloco da fixture')
    await page.keyboard.press('Enter')
    await esperar(cenario, 'o bloco da fixture ficar selecionado', (id) =>
      Boolean(document.querySelector(`.react-flow__node[data-id="${id}"]`)?.classList.contains('selected')), alvo)
    const antes = await lerCanvas()
    exigir(antes.noDom && antes.noDisco && antes.selecionado && antes.pan === false, cenario, 'o bloco da fixture não está pronto', antes)

    await focarProximo()
    deps.registrarPerguntaDoAgente({ pergunta: 'Smoke do tutorial: e o bloco selecionado?', opcoes: ['A', 'B'] })
    await cedeu()
    for (const tecla of ['Delete', 'Backspace', 'q']) {
      await page.keyboard.press(tecla)
      await measureStableGeometry(page, `${cenario} ${tecla} sob a pergunta`, [SEL.cartao], QUADROS_CURTOS)
      const depois = await lerCanvas()
      const evidencia = { tecla, foco: await foco(), antes, depois }
      exigir(depois.noDom && depois.noDisco, cenario, `${tecla} apagou o bloco selecionado por baixo da pergunta`, evidencia)
      exigir(depois.pan === antes.pan, cenario, `${tecla} trocou o modo do canvas por baixo da pergunta`, evidencia)
    }
    const esperando = await foco()
    exigir(esperando.naEspera && esperando.nokey && !esperando.noCartao, cenario, 'o foco cedido não ficou no ponto de espera do tour', esperando)
    exigir(
      (await page.evaluate(() => document.querySelectorAll('[role="dialog"][aria-modal="true"]').length)) === 1,
      cenario,
      'a pergunta fechou com as teclas do canvas',
    )

    // Esc é da pergunta; o foco volta ao Próximo (a espera não conta como "levado").
    await page.keyboard.press('Escape')
    await retomou()
    await esperar(cenario, 'o foco voltar ao Próximo depois da espera', () =>
      document.activeElement?.getAttribute('data-felixo-onboarding-action') === 'proximo',
    )
    exigir(await noBloco(), cenario, 'o foco não voltou ao bloco da fixture')
    await page.keyboard.press('Escape')
    await esperar(cenario, 'o bloco da fixture deixar de estar selecionado', (id) =>
      !document.querySelector(`.react-flow__node[data-id="${id}"]`)?.classList.contains('selected'), alvo)
  }

  /** SA4: o que o leitor de tela recebe (árvore de acessibilidade real) e a região live. */
  async function sa4() {
    const cenario = 'SA4'
    await abrirTourPelaAjuda(cenario)
    await esperarPasso(cenario, 'projeto')
    const cdp = await page.context().newCDPSession(page)
    try {
      await cdp.send('DOM.enable')
      await cdp.send('Accessibility.enable')
      const { root } = await cdp.send('DOM.getDocument', { depth: 0 })
      const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: SEL.cartao })
      exigir(nodeId, cenario, 'card ausente no DOM do CDP')
      const { nodes } = await cdp.send('Accessibility.getPartialAXTree', { nodeId, fetchRelatives: false })
      const dialogo = nodes[0]
      const nome = dialogo?.name?.value ?? ''
      const descricao = dialogo?.description?.value ?? ''
      exigir(dialogo?.role?.value === 'dialog', cenario, 'o card não é um dialog na árvore de acessibilidade', dialogo?.role)
      exigir(contem(nome, 'Tutorial do canvas') && contem(nome, 'Projeto'), cenario, 'nome do dialog', nome)
      exigir(contem(descricao, 'Passo 1 de 6') && contem(descricao, 'Projetos'), cenario, 'descrição do dialog', descricao)
      const { nodes: botoes } = await cdp.send('Accessibility.queryAXTree', { nodeId, role: 'button' })
      const nomes = botoes.map((botao) => botao.name?.value ?? '')
      for (const esperado of ['Pular tutorial', 'Voltar', 'Próximo']) {
        exigir(nomes.includes(esperado), cenario, `botão "${esperado}" sem nome na árvore`, nomes)
      }
    } finally {
      await cdp.detach().catch(() => {})
    }
    await clicarNoTour(cenario, 'proximo')
    await esperar(cenario, 'a região live anunciar o passo 2', () =>
      (document.querySelector('[data-felixo-onboarding="anuncio"]')?.textContent ?? '').includes('Passo 2 de 6: Agente'),
    )
    const [card, regiao] = [await cartao(), await anuncio()]
    exigir(card.lang === 'pt-BR' && regiao.lang === 'pt-BR', cenario, 'lang do card ou da região live', { card: card.lang, regiao: regiao.lang })
    await fecharTourSeAberto(cenario)
    log('SA4 leitor de tela: ok (dialog nomeado e descrito, botões nomeados, "Passo 2 de 6: Agente" anunciado)')
  }

  /**
   * SA5: viewport, zoom e foco depois do resize (o card nunca remonta). Em toda
   * medida o card não cobre o alvo do passo, a não ser que o alvo seja maior que
   * meia janela; no zoom alto da janela mínima, os seis passos são conferidos.
   */
  async function sa5() {
    const cenario = 'SA5'
    await definirViewport(VIEWPORT_PADRAO)
    const aberto = await abrirTourPelaAjuda(cenario)
    await page.locator(`${SEL.cartao} ${acao('proximo')}`).focus()
    /** `quadros`: opções da espera por geometria estável; `null` quando quem chama já esperou. */
    const conferirAlvoAVista = async (rotulo, quadros = QUADROS_CURTOS) => {
      if (quadros) await measureStableGeometry(page, `${cenario} ${rotulo}`, [SEL.cartao], quadros)
      const medida = await page.evaluate(medirAlvoDoCartao)
      exigir(medida?.alvo, cenario, `alvo do passo ausente em ${rotulo}`, medida)
      exigir(
        !coversSmallTarget(medida.cartao, medida.alvo, medida.viewport),
        cenario,
        `o card cobre o alvo ${medida.ancora} do passo ${medida.passo} em ${rotulo}`,
        medida,
      )
    }
    const conferir = async (rotulo) => {
      await measureStableGeometry(page, `${cenario} ${rotulo}`, [SEL.cartao])
      const medida = await page.evaluate(medirCartaoInteiro)
      const atual = await foco()
      const compacto = medida.viewport.width < 480 || medida.viewport.height < 360
      exigir(medida.cartao.instancia === aberto.instancia, cenario, `o card remontou em ${rotulo}`, medida.cartao)
      exigir(atual.acao === 'proximo', cenario, `o foco saiu de Próximo em ${rotulo}`, atual)
      exigir(medida.cartao.modo === (compacto ? 'folha' : 'ancorado'), cenario, `modo ${medida.cartao.modo} em ${rotulo}`, medida.viewport)
      exigir(rectInside(medida.cartao.rect, medida.viewport), cenario, `card fora da janela em ${rotulo}`, medida)
      for (const botao of medida.botoes) {
        exigir(rectInside(botao.rect, medida.viewport), cenario, `botão ${botao.acao} fora da janela em ${rotulo}`, botao)
        exigir(botao.alcancavel, cenario, `botão ${botao.acao} coberto em ${rotulo}`, botao)
      }
      await recordVisualEvidence(page, `tutorial-${rotulo}`, [SEL.cartao], { event: 'onboarding-viewport', viewport: medida.viewport, mode: medida.cartao.modo })
      await conferirAlvoAVista(rotulo, null)
    }
    for (const viewport of [VIEWPORT_PADRAO, { width: 375, height: 667 }, { width: 320, height: 720 }]) {
      await definirViewport(viewport)
      await conferir(`${viewport.width}x${viewport.height}`)
    }
    // Zoom alto na janela mínima: +3 em 720×500 dá ~416×289 CSS px (o caso compacto do
    // plano) e +2,5 em 800×500 dá ~507×317. Nenhuma borda cabe a folha sem cobrir o
    // rail ou a sidebar; a folha vai para a coluna ao lado do alvo. O percurso vai até o
    // passo 6 no primeiro zoom e volta ao passo 1 no segundo (Voltar), com o foco parado
    // no botão principal (clique pelo DOM).
    const zooms = [
      { janela: { width: 720, height: 500 }, nivel: 3, rotulo: 'zoom-3', passos: PASSOS_INICIAL.slice(1), botao: 'proximo' },
      { janela: { width: 800, height: 500 }, nivel: 2.5, rotulo: 'zoom-2.5', passos: PASSOS_INICIAL.slice(0, -1).reverse(), botao: 'voltar' },
    ]
    let janela = VIEWPORT_PADRAO
    try {
      for (const [indice, zoom] of zooms.entries()) {
        await mainEval('mainWindow.webContents.setZoomLevel(0)')
        await definirViewport(zoom.janela)
        janela = zoom.janela
        await mainEval(`mainWindow.webContents.setZoomLevel(${zoom.nivel})`)
        await esperar(cenario, `o zoom ${zoom.nivel} aplicar`, (largura) => window.innerWidth < largura * 0.7, zoom.janela.width)
        // Depois de trocar o zoom, a espera completa (a janela muda de tamanho em vários quadros).
        if (indice === 0) await conferir(zoom.rotulo)
        else await conferirAlvoAVista(`${zoom.rotulo} passo ${PASSOS_INICIAL.at(-1)}`, {})
        for (const passo of zoom.passos) {
          await clicarNoTour(cenario, zoom.botao)
          await esperarPasso(cenario, passo)
          await conferirAlvoAVista(`${zoom.rotulo} passo ${passo}`)
        }
      }
    } finally {
      await mainEval('mainWindow.webContents.setZoomLevel(0)')
      await page.waitForFunction((largura) => window.innerWidth === largura, janela.width, { timeout })
    }
    const depois = await foco()
    exigir(['proximo', 'concluir'].includes(depois.acao), cenario, 'o foco saiu do botão principal durante o percurso com zoom', depois)
    await definirViewport(VIEWPORT_PADRAO)
    await fecharTourSeAberto(cenario)
    log('SA5 viewport e zoom: ok (folha no compacto, alvo nunca coberto, botões alcançáveis, mesma instância e mesmo foco)')
  }

  /** SA6: fonte a 137,5% e pseudo-locale en-XA (+40%): nenhuma instrução cortada. */
  async function sa6() {
    const cenario = 'SA6'
    await definirViewport(VIEWPORT_PADRAO)
    const original = await page.evaluate(() => {
      const root = document.documentElement
      const before = { fontSize: root.style.fontSize, lang: root.lang }
      root.style.fontSize = '137.5%'
      root.lang = 'en-XA'
      return before
    })
    try {
      await abrirTourPelaAjuda(cenario)
      for (const [index, passo] of PASSOS_INICIAL.entries()) {
        await esperarPasso(cenario, passo)
        await measureStableGeometry(page, `${cenario} ${passo}`, [SEL.cartao])
        const medida = await page.evaluate(medirCartaoInteiro)
        exigir(medida.cartao.lang === 'en-XA', cenario, `lang do card no passo ${passo}`, medida.cartao)
        exigir(medida.documento.scrollWidth <= medida.documento.clientWidth, cenario, 'overflow horizontal', medida.documento)
        exigir(!medida.titulo?.cortado, cenario, `título cortado no passo ${passo}`, medida.titulo)
        exigir(medida.corpo && !medida.corpo.cortadoNaLargura && (medida.corpo.cabe || medida.corpo.focavel), cenario, `corpo cortado ou sem rolagem pelo teclado no passo ${passo}`, medida.corpo)
        exigir(rectInside(medida.cartao.rect, medida.viewport), cenario, `card fora da janela no passo ${passo}`, medida)
        for (const botao of medida.botoes) {
          exigir(!botao.cortado && contains(medida.cartao.rect, botao.rect, 0.5), cenario, `botão ${botao.acao} cortado ou fora do card no passo ${passo}`, botao)
        }
        if (index === 0) {
          await recordVisualEvidence(page, 'tutorial-en-xa-fonte-137', [SEL.cartao], { event: 'onboarding-i18n', lang: 'en-XA', fontScale: 1.375 })
        }
        await clicarNoTour(cenario, index === PASSOS_INICIAL.length - 1 ? 'concluir' : 'proximo')
      }
      await esperarSemCartao(cenario)
    } finally {
      await page.evaluate((before) => {
        document.documentElement.style.fontSize = before.fontSize
        document.documentElement.lang = before.lang
      }, original)
    }
    log('SA6 fonte e idioma: ok (en-XA a 137,5%, sem corte, corpo rolável quando transborda)')
  }

  /** SA7: reduced motion + Modo Performance sem animação; alto contraste medido; forced-colors. */
  async function sa7() {
    const cenario = 'SA7'
    const original = await page.evaluate(
      ({ tema, modo }) => ({ tema: window.localStorage.getItem(tema), modo: window.localStorage.getItem(modo) }),
      { tema: CHAVE_TEMA, modo: CHAVE_MODO_PERFORMANCE },
    )
    await page.evaluate(
      ({ tema, modo }) => {
        window.localStorage.setItem(tema, 'high_contrast')
        window.localStorage.setItem(modo, 'on')
      },
      { tema: CHAVE_TEMA, modo: CHAVE_MODO_PERFORMANCE },
    )
    try {
      await recarregar()
      await esperar(cenario, 'alto contraste e Modo Performance aplicados', () =>
        document.documentElement.dataset.theme === 'high_contrast' && document.documentElement.getAttribute('data-performance-mode') === 'on',
      )
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await abrirTourPelaAjuda(cenario)
      await measureStableGeometry(page, `${cenario} alto contraste`, [SEL.cartao, SEL.anel])
      const movimento = await page.evaluate(lerMovimento)
      for (const item of movimento) {
        exigir(!item.ausente && item.animationName === 'none' && item.transitionDuration.split(',').every((value) => parseFloat(value) === 0), cenario, 'animação ou transição no tour', item)
      }
      const cores = await page.evaluate(medirCores)
      exigir(cores, cenario, 'card ou anel ausente para medir contraste')
      const medidas = []
      for (const texto of [...cores.textos, ...cores.botoes]) {
        const razao = contrastRatio(texto.cor, flattenLayers(texto.camadas))
        medidas.push({ nome: texto.nome, razao: Number(razao.toFixed(2)) })
        exigir(razao >= 4.5, cenario, `contraste do texto ${texto.nome} abaixo de 4,5:1`, { razao, texto })
      }
      for (const botao of cores.botoes) {
        const razao = contrastRatio(botao.borda, flattenLayers(botao.fundoDoCartao))
        exigir(razao >= 3, cenario, `contraste da borda do botão ${botao.nome} abaixo de 3:1`, { razao, botao })
      }
      const razaoAnel = contrastRatio(cores.anel.cor, flattenLayers(cores.anel.camadas))
      exigir(razaoAnel >= 3, cenario, 'contraste do anel abaixo de 3:1', { razaoAnel, anel: cores.anel })
      await recordVisualEvidence(page, 'tutorial-alto-contraste', [SEL.cartao, SEL.anel], { event: 'onboarding-contrast', menorTexto: Math.min(...medidas.map((item) => item.razao)), anel: Number(razaoAnel.toFixed(2)) })

      await page.emulateMedia({ forcedColors: 'active' })
      const borda = await page.evaluate(lerBordaDoCartao)
      exigir(borda && borda.estilo !== 'none' && borda.largura >= 1 && !/rgba\(0, 0, 0, 0\)|transparent/.test(borda.cor), cenario, 'borda do card invisível em forced-colors', borda)
      await fecharTourSeAberto(cenario)
      log(`SA7 movimento e contraste: ok (sem animação; texto >= ${Math.min(...medidas.map((item) => item.razao))}:1, anel ${razaoAnel.toFixed(2)}:1; borda em forced-colors)`)
    } finally {
      await page.emulateMedia({ reducedMotion: 'no-preference', forcedColors: 'none' })
      await page.evaluate(
        ({ tema, modo, valores }) => {
          const restore = (key, value) => (value === null ? window.localStorage.removeItem(key) : window.localStorage.setItem(key, value))
          restore(tema, valores.tema)
          restore(modo, valores.modo)
        },
        { tema: CHAVE_TEMA, modo: CHAVE_MODO_PERFORMANCE, valores: original },
      )
      await recarregar()
    }
  }

  /** SA8: alvos invisíveis. O tour nunca expande nada; a pessoa expande e o anel migra. */
  async function sa8() {
    const cenario = 'SA8'
    await definirViewport(VIEWPORT_PADRAO)
    const erros = []
    const onPageError = (error) => erros.push(error.message)
    page.on('pageerror', onPageError)
    const lerSidebar = () => page.evaluate((key) => window.localStorage.getItem(key), CHAVE_SIDEBAR)
    const ferramentasFechada = async (etapa) => {
      const valor = await page.evaluate(() => document.querySelector('[data-felixo-tour-anchor="secao-ferramentas"]')?.getAttribute('aria-expanded'))
      exigir(valor === 'false', cenario, `o tour mexeu na seção Ferramentas (${etapa})`, valor)
    }
    const alternarSidebar = async (recolher) => {
      await page.locator(seletorDaAncora('rail-menu')).click()
      await esperar(
        cenario,
        recolher ? 'a sidebar recolher' : 'a sidebar abrir',
        (esperado) => (document.querySelector('.felixo-sidebar-content')?.getAttribute('aria-hidden') === 'true') === esperado,
        recolher,
      )
    }
    const conferirVariante = async (passo) => {
      const medida = await conferirPasso(cenario, { passo, ancora: 'rail-menu' })
      exigir(contem(medida.cartao.corpo, 'Abra o menu do canvas'), cenario, `passo ${passo} sem o texto variante`, medida.cartao.corpo)
    }
    try {
      const inspectorAberto = await page.evaluate(() => document.querySelector('.felixo-elements-inspector')?.getAttribute('aria-hidden') === 'false')
      await alternarSidebar(true)
      const recolhidaPelaPessoa = await lerSidebar()

      await abrirTourPelaAjuda(cenario)
      await conferirPasso(cenario, { passo: 'projeto', ancora: 'rail-projetos' })
      await clicarNoTour(cenario, 'proximo')
      await conferirVariante('agente')
      await clicarNoTour(cenario, 'proximo')
      await conferirVariante('contexto')
      await clicarNoTour(cenario, 'proximo')

      // Inspector: a pessoa recolhe e o anel vai para o puck; abre e o anel volta.
      const recolherInspector = async (recolher) => {
        await page.locator(recolher ? 'button[aria-label="Recolher elementos"]' : 'button[aria-label="Abrir elementos"]').click()
        await esperar(
          cenario,
          recolher ? 'o inspector recolher' : 'o inspector abrir',
          (esperado) => (document.querySelector('.felixo-elements-inspector')?.getAttribute('aria-hidden') === 'true') === esperado,
          recolher,
        )
      }
      if (!inspectorAberto) await recolherInspector(false)
      await esperarPasso(cenario, 'terminal', 'inspector-elementos')
      await recolherInspector(true)
      await conferirPasso(cenario, { passo: 'terminal', ancora: 'inspector-puck' })
      await recolherInspector(false)
      await esperarPasso(cenario, 'terminal', 'inspector-elementos')
      if (!inspectorAberto) await recolherInspector(true)
      await clicarNoTour(cenario, 'proximo')
      await conferirVariante('ferramentas')
      await ferramentasFechada('passo 5 com a sidebar recolhida')

      for (let index = 0; index < 3; index += 1) await clicarNoTour(cenario, 'voltar')
      await esperarPasso(cenario, 'agente', 'rail-menu')
      exigir((await lerSidebar()) === recolhidaPelaPessoa, cenario, `o tour mudou ${CHAVE_SIDEBAR}`, { antes: recolhidaPelaPessoa, depois: await lerSidebar() })

      // A pessoa expande a sidebar: o anel migra para a moldura "Agente".
      await alternarSidebar(false)
      await conferirPasso(cenario, { passo: 'agente', ancora: 'criar-agente' })
      // Criar recolhida no meio do passo 2: o TerminalMenu desmonta e o anel vai para o cabeçalho.
      await page.locator(seletorDaAncora('secao-criar')).click()
      await esperarPasso(cenario, 'agente', 'secao-criar')
      await conferirPasso(cenario, { passo: 'agente', ancora: 'secao-criar' })
      await page.locator(seletorDaAncora('secao-criar')).click()
      await esperarPasso(cenario, 'agente', 'criar-agente')
      await ferramentasFechada('fim do SA8')
      await conferirRolagemDaPessoa()
      await fecharTourSeAberto(cenario)
      exigir(erros.length === 0, cenario, 'erro de página durante a troca de alvo', erros)
    } finally {
      page.off('pageerror', onPageError)
      await fecharTourSeAberto(cenario).catch(() => {})
      await definirViewport(VIEWPORT_PADRAO).catch(() => {})
    }
    log('SA8 alvos invisíveis: ok (variantes no menu do canvas, puck, migração ao expandir, Criar recolhida sem erro, rolagem e Tab da pessoa respeitados)')

    /**
     * A pessoa rola a sidebar com o tour aberto no passo 2 (T1.d; foco visível,
     * WCAG 2.4.11): o tour não desfaz a rolagem nem troca de alvo, o anel não sai
     * da área visível da sidebar, o Tab deixa cada controle focado à vista e, no
     * passo seguinte, o tour volta a trazer o alvo novo para a vista.
     */
    async function conferirRolagemDaPessoa() {
      const ferramentas = seletorDaAncora('secao-ferramentas')
      // Janela mais baixa e Ferramentas aberta pela pessoa: a sidebar passa a rolar.
      await definirViewport({ width: 1280, height: 600 })
      await page.locator(ferramentas).click()
      await esperar(cenario, 'a seção Ferramentas abrir', (selector) => document.querySelector(selector)?.getAttribute('aria-expanded') === 'true', ferramentas)
      try {
        await esperarPasso(cenario, 'agente', 'criar-agente')
        const pedido = await page.evaluate(() => {
          const scroller = document.querySelector('.felixo-sidebar-scroll')
          scroller.scrollTop = scroller.scrollHeight
          return scroller.scrollTop
        })
        await measureStableGeometry(page, `${cenario} rolagem da pessoa`, [SEL.cartao])
        const rolada = await page.evaluate(lerSidebarComTour)
        exigir(rolada.maximo > 0 && pedido > 0, cenario, 'a sidebar não rola nesta janela (pré-condição do cenário)', rolada)
        exigir(Math.abs(rolada.scrollTop - pedido) <= 1, cenario, 'o tour desfez a rolagem da sidebar feita pela pessoa', { pedido, rolada })
        exigir(rolada.ancora === 'criar-agente', cenario, 'o tour trocou de alvo porque a pessoa rolou', rolada)
        exigir(!rolada.anel || contains(rolada.sidebar, rolada.anel, 0.5), cenario, 'o anel saiu da área visível da sidebar', rolada)

        // Tab de verdade a partir do cabeçalho de Ferramentas: cada controle focado fica à
        // vista (antes, o tour devolvia a sidebar para o alvo no quadro seguinte).
        await page.locator(ferramentas).focus()
        for (let tecla = 0; tecla < 8; tecla += 1) {
          await page.keyboard.press('Tab')
          await measureStableGeometry(page, `${cenario} Tab ${tecla + 1} na sidebar`, [SEL.cartao], QUADROS_CURTOS)
          const medida = await page.evaluate(lerSidebarComTour)
          if (!medida.foco) break
          exigir(contains(medida.sidebar, medida.foco.rect, 1), cenario, `o controle focado por Tab ficou fora de vista na sidebar (${medida.foco.nome})`, medida)
        }

        // Passo novo: o tour volta a poder rolar e traz o alvo novo para a vista.
        const alvoDoProximo = seletorDaAncora('criar-bloco')
        // Dois quadros depois da rolagem: o evento `scroll` dela chega ainda no passo 2.
        const escondido = await page.evaluate(async (selector) => {
          const scroller = document.querySelector('.felixo-sidebar-scroll')
          scroller.scrollTop = scroller.scrollHeight
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
          const box = scroller.getBoundingClientRect()
          const rect = document.querySelector(selector).getBoundingClientRect()
          return rect.bottom <= box.top || rect.top >= box.bottom
        }, alvoDoProximo)
        exigir(escondido, cenario, 'Novo bloco já estava à vista antes do passo 3 (pré-condição do cenário)')
        await clicarNoTour(cenario, 'proximo')
        await esperarPasso(cenario, 'contexto', 'criar-bloco')
        await measureStableGeometry(page, `${cenario} passo seguinte revela o alvo`, [SEL.cartao, SEL.anel])
        const revelado = await page.evaluate(medirPasso, alvoDoProximo)
        const sidebar = await page.evaluate(lerSidebarComTour)
        exigir(revelado.alvo && contains(sidebar.sidebar, revelado.alvo.rect, 1), cenario, 'no passo seguinte o tour não trouxe Novo bloco para a vista', { alvo: revelado.alvo, sidebar })
        exigir(revelado.alvo.atingido, cenario, 'Novo bloco revelado mas coberto', revelado.alvo)
        exigir(revelado.anel && contains(revelado.anel.rect, revelado.alvo.rect, 2), cenario, 'o anel não contém Novo bloco depois de revelado', { anel: revelado.anel, alvo: revelado.alvo })
      } finally {
        await page.locator(ferramentas).click()
        await esperar(cenario, 'a seção Ferramentas fechar', (selector) => document.querySelector(selector)?.getAttribute('aria-expanded') === 'false', ferramentas)
        await definirViewport(VIEWPORT_PADRAO)
      }
    }
  }

  /** SA9: ida ao chat e volta, retomada por sessão, conclusão sem reabrir. */
  async function sa9() {
    const cenario = 'SA9'
    await definirViewport(VIEWPORT_PADRAO)
    await abrirTourPelaAjuda(cenario)
    await clicarNoTour(cenario, 'proximo')
    await clicarNoTour(cenario, 'proximo')
    await esperarPasso(cenario, 'contexto')

    // Aberto pela Ajuda (foco "mover"): a volta do chat não pode puxar o foco de novo.
    const concluidoAntes = (await lerEstado()).value?.tours?.inicial?.completedAt ?? null
    await page.locator('nav.felixo-activity-rail button[aria-label="Chat"]').click()
    await page.waitForFunction(() => !document.querySelector('[data-felixo-region="canvas"]'), null, { timeout })
    exigir((await page.locator(SEL.cartao).count()) === 0, cenario, 'o card continuou na tela do chat')
    await page.locator('button[title="Voltar para o canvas"]').click()
    await checarMontagem(page)
    await esperarPasso(cenario, 'contexto')
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    const focoNaVolta = await foco()
    exigir(!focoNaVolta.noCartao, cenario, 'voltar do chat puxou o foco para o tour', focoNaVolta)
    const concluidoDepois = (await lerEstado()).value?.tours?.inicial?.completedAt ?? null
    exigir(concluidoAntes === concluidoDepois, cenario, 'ir ao chat concluiu o tutorial', { concluidoAntes, concluidoDepois })

    // Reload do renderer: retoma no mesmo passo, um card só, sem mover o foco.
    await recarregar()
    await esperarPasso(cenario, 'contexto')
    const retomado = await cartao()
    exigir(retomado.total === 1, cenario, 'mais de um card depois do reload', retomado)
    const focoRetomado = await foco()
    exigir(!focoRetomado.noCartao, cenario, 'a retomada puxou o foco', focoRetomado)
    await esperar(cenario, 'a região live anunciar a retomada', () =>
      (document.querySelector('[data-felixo-onboarding="anuncio"]')?.textContent ?? '').includes('Tutorial retomado no passo 3 de 6'),
    )

    for (let passo = 2; passo < PASSOS_INICIAL.length - 1; passo += 1) await clicarNoTour(cenario, 'proximo')
    await esperarPasso(cenario, 'ajuda')
    await clicarNoTour(cenario, 'concluir')
    await esperarSemCartao(cenario)
    await recarregar()
    await esperarNadaAberto(`${cenario} reload depois de concluir`)
    await page.evaluate(() => window.sessionStorage.clear())
    await recarregar()
    await esperarNadaAberto(`${cenario} restart do renderer`)

    await abrirMenuAjuda(cenario)
    const status = await page.evaluate(
      () => document.querySelector('.felixo-onboarding-help-menu .felixo-onboarding-help__section .felixo-onboarding-help__status')?.textContent ?? '',
    )
    exigir(/^Concluído em \S+/.test(status), cenario, 'a Ajuda não mostra a conclusão', status)
    await page.keyboard.press('Escape')
    await page.locator(SEL.menuAjuda).waitFor({ state: 'detached', timeout })
    log(`SA9 chat e retomada: ok (volta do chat no mesmo passo sem puxar o foco, um card no passo 3 depois do reload, "${status}")`)
  }

  /** SA10: falha de render forçada fica isolada; o canvas continua de pé. */
  async function sa10() {
    const cenario = 'SA10'
    await page.evaluate((key) => window.sessionStorage.setItem(key, 'render'), CHAVE_FALHA)
    const antes = await snapshotIpc()
    await abrirMenuAjuda(cenario)
    await clicarAcaoDoTutorial(cenario)
    // O boundary registra a falha no QA Logger: é o sinal de que ela foi tratada.
    await esperarNode(cenario, 'a falha chegar ao QA Logger', async () => (diffChannels(antes, await snapshotIpc())['qa-logger:log'] ?? 0) >= 1)
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    const pagina = await page.evaluate(() => ({
      cartoes: document.querySelectorAll('[data-felixo-onboarding="card"]').length,
      hidratado: document.querySelector('[data-felixo-hydrated="true"]') !== null,
      telaDeErro: document.body.innerText.includes('A interface não conseguiu carregar'),
    }))
    exigir(pagina.cartoes === 0 && pagina.hidratado && !pagina.telaDeErro, cenario, 'a falha do tutorial derrubou o canvas', pagina)
    await checarLandmarksVisiveis(page)

    await page.evaluate((key) => window.sessionStorage.removeItem(key), CHAVE_FALHA)
    await recarregar()
    await abrirTourPelaAjuda(cenario)
    await fecharTourSeAberto(cenario)
    log('SA10 falha isolada: ok (sem card, canvas hidratado e landmarks de pé; a Ajuda volta depois do reload)')
  }

  async function sessaoA() {
    await sa1()
    await sa2()
    await sa3()
    await sa4()
    await sa5()
    await sa6()
    await sa7()
    await sa8()
    await sa9()
    await sa10()
  }

  // =================================================================================
  // Sessão B: FELIXO_DEVTOOLS_ONBOARDING=1, perfil novo, canvas vazio
  // =================================================================================

  /** SB1: o primeiro uso abre sozinho, com o foco, ao lado do NoticeToast. */
  async function sb1() {
    const cenario = 'SB1'
    await esperar(cenario, 'o tutorial abrir sozinho depois da hidratação', (selector) => document.querySelector(selector) !== null, SEL.cartaoPosto)
    await esperarPasso(cenario, 'projeto')
    const card = await cartao()
    const atual = await foco()
    exigir(card.total === 1 && card.contador === 'Passo 1 de 6' && card.lang === 'pt-BR', cenario, 'card do primeiro uso', card)
    exigir(atual.ehCartao || atual.noCartao, cenario, 'o primeiro uso não moveu o foco para o card', atual)
    exigir((await anuncio()).decisao === 'aberto', cenario, 'decisão do primeiro uso', await anuncio())
    const estado = await lerEstado()
    exigir(estado.automation?.autoOpen === true && estado.automation?.reason === 'devtools-opt-in', cenario, 'política de automação da sessão B', estado.automation)
    exigir(estado.revision === 1 && estado.value?.tours?.inicial?.status === 'ativo', cenario, 'a reivindicação do primeiro uso', { revision: estado.revision, inicial: estado.value?.tours?.inicial })
    const marcador = await page.evaluate((key) => window.localStorage.getItem(key), MARCADOR_PRIMEIRO_BOOT)
    exigir(marcador === null, cenario, 'o marcador de primeiro boot não foi removido', marcador)

    const perfil = await page.evaluate(() => window.felixo.hardware.getProfile())
    if (perfil?.lowCpu && perfil?.suggestPerformanceMode) {
      await page.locator(SEL.avisoHardware).waitFor({ state: 'visible', timeout })
      await measureStableGeometry(page, `${cenario} convivência`, [SEL.cartao, SEL.avisoHardware])
      const convivencia = await page.evaluate(({ cartaoSel, avisoSel }) => {
        const rectOf = (element) => {
          const rect = element.getBoundingClientRect()
          return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height }
        }
        const box = document.querySelector(avisoSel)
        return {
          cartao: rectOf(document.querySelector(cartaoSel)),
          aviso: rectOf(box),
          botoes: Array.from(box.querySelectorAll('button')).map((button) => {
            const rect = rectOf(button)
            const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
            return { texto: (button.getAttribute('aria-label') ?? button.textContent ?? '').trim(), alcancavel: Boolean(hit && button.contains(hit)) }
          }),
        }
      }, { cartaoSel: SEL.cartao, avisoSel: SEL.avisoHardware })
      exigir(!intersects(convivencia.cartao, convivencia.aviso), cenario, 'o card cobre o NoticeToast', convivencia)
      exigir(convivencia.botoes.length > 0 && convivencia.botoes.every((botao) => botao.alcancavel), cenario, 'botão do NoticeToast coberto pelo tour', convivencia.botoes)
      await recordVisualEvidence(page, 'tutorial-primeiro-uso', [SEL.cartao, SEL.anel, SEL.avisoHardware], { event: 'onboarding-first-use', logicalCpuCount: perfil.logicalCpuCount ?? null })
      log(`SB1 primeiro uso: ok (abriu sozinho com o foco; NoticeToast livre, ${perfil.logicalCpuCount ?? '?'} CPUs lógicas)`)
      return { avisoHardware: true }
    }
    await recordVisualEvidence(page, 'tutorial-primeiro-uso', [SEL.cartao, SEL.anel], { event: 'onboarding-first-use', logicalCpuCount: perfil?.logicalCpuCount ?? null })
    log(`SB1 primeiro uso: ok; convivência com o NoticeToast pulada (esta máquina não recebe a sugestão: ${perfil?.logicalCpuCount ?? '?'} CPUs lógicas)`)
    return { avisoHardware: false }
  }

  /** SB2: percurso só por teclado até Concluir, com as sondas. */
  async function sb2({ avisoHardware }) {
    const cenario = 'SB2'
    const sondas = await abrirSondas(cenario)
    for (let index = 0; index < 3; index += 1) await page.keyboard.press('Tab')
    let atual = await foco()
    exigir(atual.acao === 'proximo', cenario, 'Tab a partir do card não chegou a Próximo', atual)
    for (const passo of PASSOS_INICIAL.slice(1)) {
      await page.keyboard.press('Enter')
      await esperarPasso(cenario, passo)
      atual = await foco()
      exigir(atual.acao === 'proximo' || atual.acao === 'concluir', cenario, `o foco saiu do botão no passo ${passo}`, atual)
    }
    exigir(atual.acao === 'concluir', cenario, 'o último passo não mostra Concluir', atual)
    await page.keyboard.press('Enter')
    await esperarSemCartao(cenario)
    await esperar(cenario, 'a região live anunciar a conclusão', () =>
      (document.querySelector('[data-felixo-onboarding="anuncio"]')?.textContent ?? '').includes('Tutorial concluído. Reabra em Ajuda.'),
    )
    await esperar(cenario, 'o foco voltar ao botão Ajuda', () => document.activeElement?.hasAttribute('data-felixo-help-trigger'))
    await conferirSondas(cenario, await sondas.fechar())
    const estado = await lerEstado()
    exigir(estado.value?.tours?.inicial?.status === 'concluido', cenario, 'o tutorial não ficou concluído', estado.value?.tours?.inicial)

    if (avisoHardware) {
      // O aviso de hardware continua respondendo a clique (o tour nunca o bloqueou).
      await page.locator(SEL.avisoHardware).getByRole('button', { name: 'Agora não' }).click()
      await page.locator(SEL.avisoHardware).waitFor({ state: 'detached', timeout })
    }
    log('SB2 percurso por teclado: ok (Concluir anunciado, foco na Ajuda, sondas sem processo, rede nem crédito)')
  }

  /** SB3 e SB4: reload e restart não reabrem nem gravam; update sem feature não muda um byte. */
  async function sb3sb4() {
    const antes = await lerEstado()
    await recarregar()
    await esperarNadaAberto('SB3 reload')
    await page.evaluate(() => window.sessionStorage.clear())
    await recarregar()
    await esperarNadaAberto('SB3 restart do renderer')
    const depois = await lerEstado()
    exigir(depois.revision === antes.revision, 'SB3', 'reload ou restart gravou o estado', { antes: antes.revision, depois: depois.revision })
    log(`SB3 restart e reload: ok (nada abriu, revisão ${depois.revision} inalterada)`)

    const foto = JSON.stringify({ revision: depois.revision, value: depois.value })
    await recarregar()
    await esperarNadaAberto('SB4 update sem feature')
    const final = await lerEstado()
    exigir(JSON.stringify({ revision: final.revision, value: final.value }) === foto, 'SB4', 'o estado mudou sem feature nova', { antes: foto, depois: final })
    log('SB4 update sem feature: ok (nada abriu, revisão e valor iguais byte a byte)')
  }

  /** SB5: update com feature: o aviso aparece uma vez, sem foco, e o concluído é preservado. */
  async function sb5() {
    const cenario = 'SB5'
    const atual = await lerEstado()
    const tours = { ...atual.value.tours }
    delete tours['novidade-ajuda']
    const escrita = await gravarEstado(atual.revision, { ...atual.value, knownFeatures: [], tours })
    exigir(escrita.ok && escrita.applied, cenario, 'não consegui semear o estado', escrita)
    await recarregar()
    await esperar(cenario, 'o aviso de novidade aparecer', (selector) => document.querySelector(selector) !== null, SEL.avisoPosto)
    const atualFoco = await foco()
    exigir(!atualFoco.noAviso, cenario, 'o aviso roubou o foco', atualFoco)
    exigir((await page.locator(SEL.cartao).count()) === 0, cenario, 'um tour abriu junto com o aviso')
    await esperar(cenario, 'a região live anunciar a novidade', () =>
      (document.querySelector('[data-felixo-onboarding="anuncio"]')?.textContent ?? '').includes('Novidade em Ajuda: Ajuda.'),
    )
    const lido = await lerEstado()
    exigir(lido.value.knownFeatures.includes('feature.ajuda'), cenario, 'a novidade não entrou em knownFeatures', lido.value.knownFeatures)
    exigir(Boolean(lido.value.tours['novidade-ajuda']?.announcedAt), cenario, 'announcedAt da novidade', lido.value.tours['novidade-ajuda'])
    exigir(lido.value.tours.inicial.status === 'concluido', cenario, 'a migração rebaixou o tutorial concluído (T3.c)', lido.value.tours.inicial)
    await recordVisualEvidence(page, 'tutorial-aviso-novidade', [SEL.aviso], { event: 'onboarding-novelty' })

    await page.locator(`${SEL.aviso} ${acao('ver')}`).click()
    await esperarPasso(cenario, 'ajuda-novidade')
    await esperar(cenario, 'o foco entrar no mini-tour', () => Boolean(document.activeElement?.closest('[data-felixo-onboarding="card"]')))
    await clicarNoTour(cenario, 'concluir')
    await esperarSemCartao(cenario)
    await recarregar()
    await esperarNadaAberto(`${cenario} reload depois da novidade`)
    log('SB5 update com feature: ok (aviso uma vez sem foco, inicial ainda concluído, Ver abre o mini-tour)')
  }

  /** SB6: a novidade espera o tour e, ao aparecer, não tira o foco do campo onde a pessoa digita. */
  async function sb6() {
    const cenario = 'SB6'
    const atual = await lerEstado()
    const tours = { ...atual.value.tours, inicial: { ...atual.value.tours.inicial, status: 'ativo', completedAt: null } }
    delete tours['novidade-ajuda']
    const escrita = await gravarEstado(atual.revision, { ...atual.value, knownFeatures: [], tours })
    exigir(escrita.ok && escrita.applied, cenario, 'não consegui semear o estado', escrita)
    await page.evaluate(
      ({ key, value }) => window.sessionStorage.setItem(key, value),
      { key: CHAVE_SESSAO, value: JSON.stringify({ v: 1, tourId: 'inicial', stepIndex: 2, trigger: 'primeiro-uso' }) },
    )
    await recarregar()
    await esperarPasso(cenario, 'contexto')
    exigir((await page.locator(SEL.aviso).count()) === 0, cenario, 'o aviso apareceu com o tour aberto')

    await page.keyboard.press('Control+k')
    const campo = page.locator('[data-felixo-canvas-panel="search"] input').first()
    await campo.waitFor({ state: 'visible', timeout })
    await esperar(cenario, 'o foco ir para a Busca', () => document.activeElement?.closest('[data-felixo-canvas-panel="search"]') !== null)
    await page.keyboard.type('abc')
    await clicarNoTour(cenario, 'pular')
    await esperarSemCartao(cenario)
    await esperar(cenario, 'o aviso de novidade aparecer depois do tour', (selector) => document.querySelector(selector) !== null, SEL.avisoPosto)
    const noCampo = await page.evaluate(() => {
      const active = document.activeElement
      return { naBusca: Boolean(active?.closest('[data-felixo-canvas-panel="search"]')), tag: active?.tagName, valor: active?.value ?? null }
    })
    exigir(noCampo.naBusca && noCampo.tag === 'INPUT', cenario, 'o aviso tirou o foco da Busca', noCampo)
    await page.keyboard.type('d')
    const valor = await campo.inputValue()
    exigir(valor === 'abcd', cenario, 'o texto digitado não chegou inteiro ao campo', valor)
    await page.keyboard.press('Escape')
    await page.locator('[data-felixo-canvas-panel="search"]').waitFor({ state: 'detached', timeout })
    await clicarNoTour(cenario, 'agora-nao')
    await page.locator(SEL.aviso).waitFor({ state: 'detached', timeout })
    log('SB6 novidade sem roubar foco: ok (esperou o tour, "abcd" inteiro na Busca)')
  }

  /** SB7: estado de versão futura (somente leitura), reparável e inválido. */
  async function sb7() {
    const cenario = 'SB7'
    // Downgrade: um schema mais novo nunca é sobrescrito.
    let atual = await lerEstado()
    const futuro = { ...atual.value, schemaVersion: 2 }
    let escrita = await gravarEstado(atual.revision, futuro)
    exigir(escrita.ok && escrita.applied, cenario, 'não consegui gravar o estado futuro', escrita)
    const fotoFuturo = JSON.stringify({ revision: escrita.revision, value: futuro })
    await recarregar()
    const futuroAssentado = await esperarNadaAberto(`${cenario} futuro`)
    exigir(futuroAssentado.decisao === 'somente-leitura', cenario, 'o estado futuro não virou somente leitura', futuroAssentado)
    await abrirMenuAjuda(cenario)
    const nota = await page.evaluate(() => document.querySelector('.felixo-onboarding-help__note')?.textContent ?? '')
    exigir(nota.includes('O progresso não será salvo nesta sessão.'), cenario, 'o menu não avisa que o progresso não será salvo', nota)
    await clicarAcaoDoTutorial(cenario)
    await esperar(cenario, 'o tour abrir em memória', (selector) => document.querySelector(selector) !== null, SEL.cartaoPosto)
    await fecharTourSeAberto(cenario)
    atual = await lerEstado()
    exigir(JSON.stringify({ revision: atual.revision, value: atual.value }) === fotoFuturo, cenario, 'o estado futuro foi sobrescrito', atual)

    // Campo quebrado dentro de um v1: reparado, sem escrita no boot; a próxima ação grava a forma reparada.
    const quebrado = { ...futuro, schemaVersion: 1, tours: 'x', createdAt: 'não é data', knownFeatures: ['feature.ajuda'] }
    escrita = await gravarEstado(atual.revision, quebrado)
    exigir(escrita.ok && escrita.applied, cenario, 'não consegui gravar o estado quebrado', escrita)
    await recarregar()
    await esperarNadaAberto(`${cenario} reparado`)
    await abrirTourPelaAjuda(cenario)
    await fecharTourSeAberto(cenario)
    atual = await lerEstado()
    exigir(atual.value && typeof atual.value.tours === 'object' && atual.value.tours.inicial?.status === 'dispensado', cenario, 'o estado não foi reparado na primeira ação', atual.value)

    // Forma inválida: a ponte recusa (o main só aceita schemaVersion inteiro >= 1),
    // então o estado inválido chega como no mundo real, por um arquivo danificado:
    // a linha do perfil isolado é corrompida direto no SQLite.
    const recusada = await gravarEstado(atual.revision, { schemaVersion: 0, tours: {} })
    exigir(recusada.ok === false, cenario, 'a ponte aceitou um schemaVersion inválido', recusada)
    exigir(typeof deps.corromperEstado === 'function', cenario, 'o smoke não injetou corromperEstado')
    deps.corromperEstado()
    exigir((await lerEstado()).corrupted === true, cenario, 'a linha corrompida não foi lida como corrompida')
    await recarregar()
    const recuperado = await esperarNadaAberto(`${cenario} inválido`)
    exigir(recuperado.decisao === 'recuperado', cenario, 'o estado inválido não foi recuperado', recuperado)
    await checarLandmarksVisiveis(page)
    await esperarNode(cenario, 'o estado recuperado ser gravado', async () => (await lerEstado()).value?.origin === 'recuperado')
    await abrirTourPelaAjuda(cenario)
    await fecharTourSeAberto(cenario)
    log('SB7 downgrade e inválido: ok (futuro intacto e em memória, v1 reparado na 1ª ação, linha corrompida recuperada)')
  }

  /** SB8: redefinir com confirmação abre o inicial com o foco e preserva knownFeatures. */
  async function sb8() {
    const cenario = 'SB8'
    const conhecidas = (await lerEstado()).value.knownFeatures
    await abrirMenuAjuda(cenario)
    await page.locator(`${SEL.menuAjuda} ${acao('redefinir')}`).click()
    await esperar(cenario, 'a confirmação aparecer com o foco em Cancelar', () =>
      document.activeElement?.getAttribute('data-felixo-onboarding-action') === 'cancelar-redefinir',
    )
    await page.locator(`${SEL.menuAjuda} ${acao('confirmar-redefinir')}`).click()
    await esperarPasso(cenario, 'projeto')
    await esperar(cenario, 'o foco entrar no card', () => Boolean(document.activeElement?.closest('[data-felixo-onboarding="card"]')))
    await page.keyboard.press('Escape')
    await esperarSemCartao(cenario)
    await recarregar()
    await esperarNadaAberto(`${cenario} reload depois do reset`)
    const estado = await lerEstado()
    exigir(JSON.stringify(estado.value.knownFeatures) === JSON.stringify(conhecidas), cenario, 'redefinir mudou knownFeatures', { antes: conhecidas, depois: estado.value.knownFeatures })
    exigir(Boolean(estado.value.resetAt), cenario, 'resetAt não foi gravado', estado.value)
    log('SB8 redefinir: ok (confirmação na tela, inicial com foco, Esc, reload sem reabrir, knownFeatures preservado)')
  }

  async function sessaoB() {
    await definirViewport(VIEWPORT_PADRAO)
    await checarMontagem(page)
    const convivencia = await sb1()
    await sb2(convivencia)
    await sb3sb4()
    await sb5()
    await sb6()
    await sb7()
    await sb8()
  }

  // Os cenários soltos servem para depurar um de cada vez; o smoke usa as sessões.
  return { sa0, sa1, sa2, sa3, sa4, sa5, sa6, sa7, sa8, sa9, sa10, sessaoA, sessaoB }
}

/**
 * Corrompe a linha `onboarding.state` do banco de um perfil ISOLADO (nunca o
 * real), como um arquivo danificado: o JSON do envelope fica truncado. O main
 * lê isso como `corrupted: true` sem lançar (o mesmo caso do N-repo, aqui de
 * ponta a ponta).
 */
function corromperEstadoNoPerfil(sessionState) {
  if (!sessionState?.userData || sessionState.realProfile) {
    throw new Error('[canvas-smoke:tutorial] corromper o estado só é permitido num perfil isolado do felixo devtools.')
  }
  const { createStorageDatabase } = require('../electron/services/storage/sqlite-database.cjs')
  const database = createStorageDatabase({ databaseDir: path.join(sessionState.userData, 'database') })
  try {
    const result = database.connection
      .prepare("UPDATE settings SET value_json = ? WHERE key = 'onboarding.state'")
      .run('{"revision":3,"value":{"schemaVersion"')
    if (Number(result.changes) !== 1) throw new Error('[canvas-smoke:tutorial] a linha onboarding.state não existe para corromper.')
  } finally {
    database.close()
  }
}

/**
 * Grava uma pergunta de agente (a mesma de `felixo perguntar`) na fila de pedidos
 * de um perfil ISOLADO: o main vê o arquivo novo e o AgentQuestionDialog abre,
 * como numa sessão real. Nenhum agente é aberto.
 */
function registrarPerguntaNoPerfil(sessionState, { pergunta, opcoes }) {
  if (!sessionState?.userData || sessionState.realProfile) {
    throw new Error('[canvas-smoke:tutorial] gravar uma pergunta de agente só é permitido num perfil isolado do felixo devtools.')
  }
  const { criarRepositorioDePedidos } = require('../electron/services/fetch-all/agent-requests.cjs')
  const pedidos = criarRepositorioDePedidos({ pasta: path.join(sessionState.userData, 'agent-requests') })
  return pedidos.registrar('perguntar', { pergunta, opcoes, origem: 'canvas-smoke' })
}

module.exports = {
  ALVO_PRIMARIO,
  PASSOS_INICIAL,
  ROTULO_DA_ANCORA,
  corromperEstadoNoPerfil,
  criarCenariosDoTutorial,
  registrarPerguntaNoPerfil,
  seletorDaAncora,
}

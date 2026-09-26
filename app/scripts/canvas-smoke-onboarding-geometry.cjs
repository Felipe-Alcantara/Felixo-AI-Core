'use strict'

/**
 * Helpers puros do smoke do tutorial do canvas (`canvas-smoke-onboarding.cjs`).
 *
 * Os asserts do smoke são relacionais: "o card está dentro da janela", "o card
 * não cruza o alvo", "o anel contém o alvo", "o contraste passa de 4,5". Nunca
 * uma coordenada fixa, que mudaria com a fonte, o SO ou o DPR do runner. As
 * medidas saem do renderer (retângulos, cores já normalizadas em RGBA, estilos
 * computados, contadores IPC) e as decisões ficam aqui, testadas em node com
 * casos que precisam passar e casos que precisam reprovar.
 */

/** Tolerância de subpixel para arredondamentos do layout. */
const SUBPIXEL = 0.5

/**
 * Canais IPC que o tutorial nunca pode acionar: processo (PTY, CLIs), rede e
 * crédito (OpenIA, Notion, Fetch All), git, arquivos, voz, perfis de webview,
 * presets de agente, seletor de pasta e as escritas do canvas. Conferidos
 * contra os canais reais do `preload.cjs` no teste.
 */
const FORBIDDEN_CHANNEL_PATTERNS = Object.freeze([
  /^pty:/,
  /^cli:/,
  /^cli-accounts:/,
  /^openia:/,
  /^notion:/,
  /^fetch-all:/,
  /^git:/,
  /^projects:pick-folder$/,
  /^projects:detect-repos$/,
  /^canvas-file:/,
  /^context-file:/,
  /^text-file:/,
  /^speech:/,
  /^webview-profiles:/,
  /^agent-presets:/,
  /^canvas:(save|delete|clear|import|answer-|resolve-|set-)/,
])

/** Canais que o percurso pode usar além dos da janela ociosa de controle. */
const TOUR_CHANNEL_PATTERNS = Object.freeze([/^onboarding:/, /^devtools:/])

function isRect(value) {
  return Boolean(value) && ['left', 'top', 'right', 'bottom'].every((key) => Number.isFinite(value[key]))
}

function assertRect(value, name) {
  if (!isRect(value)) throw new TypeError(`${name} não é um retângulo válido: ${JSON.stringify(value)}`)
}

/** Retângulo da janela a partir de `{ width, height }`. */
function viewportRect(viewport) {
  return { left: 0, top: 0, right: viewport.width, bottom: viewport.height, width: viewport.width, height: viewport.height }
}

/** `inner` inteiro dentro de `outer`, com folga de `tolerance` px para fora. */
function contains(outer, inner, tolerance = 0) {
  assertRect(outer, 'outer')
  assertRect(inner, 'inner')
  return (
    inner.left >= outer.left - tolerance &&
    inner.top >= outer.top - tolerance &&
    inner.right <= outer.right + tolerance &&
    inner.bottom <= outer.bottom + tolerance
  )
}

/** O retângulo cabe na janela, a pelo menos `margin` px da borda (menos o subpixel). */
function rectInside(rect, viewport, margin = 0) {
  assertRect(rect, 'rect')
  const inner = viewportRect(viewport)
  return contains(
    { left: inner.left + margin, top: inner.top + margin, right: inner.right - margin, bottom: inner.bottom - margin },
    rect,
    SUBPIXEL,
  )
}

/** Sobreposição com área positiva; encostar a borda não conta. */
function intersects(first, second) {
  assertRect(first, 'first')
  assertRect(second, 'second')
  return (
    Math.min(first.right, second.right) - Math.max(first.left, second.left) > SUBPIXEL &&
    Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top) > SUBPIXEL
  )
}

/** Retângulo crescido `amount` px de cada lado (o contorno visível do anel). */
function inflate(rect, amount) {
  assertRect(rect, 'rect')
  return {
    left: rect.left - amount,
    top: rect.top - amount,
    right: rect.right + amount,
    bottom: rect.bottom + amount,
    width: rect.right - rect.left + amount * 2,
    height: rect.bottom - rect.top + amount * 2,
  }
}

/** Parte do retângulo que está dentro da janela (vazio vira largura/altura 0). */
function clipToViewport(rect, viewport) {
  assertRect(rect, 'rect')
  const left = Math.max(0, rect.left)
  const top = Math.max(0, rect.top)
  const right = Math.max(left, Math.min(viewport.width, rect.right))
  const bottom = Math.max(top, Math.min(viewport.height, rect.bottom))
  return { left, top, right, bottom, width: right - left, height: bottom - top }
}

// ---------------------------------------------------------------------------
// Cor e contraste (WCAG 2.x)
// ---------------------------------------------------------------------------

function assertColor(color, name) {
  const ok =
    Array.isArray(color) &&
    color.length >= 3 &&
    color.slice(0, 3).every((channel) => Number.isFinite(channel) && channel >= 0 && channel <= 255) &&
    (color.length === 3 || (Number.isFinite(color[3]) && color[3] >= 0 && color[3] <= 1))
  if (!ok) throw new TypeError(`${name} não é uma cor RGBA válida: ${JSON.stringify(color)}`)
}

const alphaOf = (color) => (color.length > 3 ? color[3] : 1)

/** `top` desenhado sobre `bottom` (os dois RGBA, alfa de 0 a 1). */
function compositeOver(top, bottom) {
  assertColor(top, 'top')
  assertColor(bottom, 'bottom')
  const topAlpha = alphaOf(top)
  const bottomAlpha = alphaOf(bottom)
  const alpha = topAlpha + bottomAlpha * (1 - topAlpha)
  if (alpha === 0) return [0, 0, 0, 0]
  const channel = (index) => (top[index] * topAlpha + bottom[index] * bottomAlpha * (1 - topAlpha)) / alpha
  return [channel(0), channel(1), channel(2), alpha]
}

/**
 * Fundo efetivo a partir das camadas do elemento até a raiz (a primeira é a do
 * próprio elemento), compostas sobre `base` (opaco). Imagens e gradientes não
 * entram: o smoke só usa isto onde o fundo é cor sólida.
 */
function flattenLayers(layers, base = [0, 0, 0, 1]) {
  assertColor(base, 'base')
  let result = [...base.slice(0, 3), 1]
  for (let index = layers.length - 1; index >= 0; index -= 1) {
    result = compositeOver(layers[index], result)
  }
  return [result[0], result[1], result[2], 1]
}

function channelLuminance(value) {
  const normalized = value / 255
  return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
}

function relativeLuminance(color) {
  assertColor(color, 'color')
  return 0.2126 * channelLuminance(color[0]) + 0.7152 * channelLuminance(color[1]) + 0.0722 * channelLuminance(color[2])
}

/** Razão de contraste WCAG; uma frente translúcida é composta sobre o fundo antes. */
function contrastRatio(foreground, background) {
  assertColor(foreground, 'foreground')
  assertColor(background, 'background')
  const back = alphaOf(background) < 1 ? flattenLayers([background]) : background
  const front = alphaOf(foreground) < 1 ? compositeOver(foreground, back) : foreground
  const lighter = Math.max(relativeLuminance(front), relativeLuminance(back))
  const darker = Math.min(relativeLuminance(front), relativeLuminance(back))
  return (lighter + 0.05) / (darker + 0.05)
}

// ---------------------------------------------------------------------------
// Stacking context do host do tour
// ---------------------------------------------------------------------------

const isSet = (value) => Boolean(value && value !== 'none' && value !== 'auto' && value !== 'normal')

/**
 * Propriedade que faz um ancestral criar containing block ou stacking context
 * (o `fixed` e o z 55 do tour ficariam presos a ele), ou `null`. Mesma regra de
 * `containingBlockReason` em `onboarding-layout.ts`.
 */
function containingBlockReason(style) {
  if (isSet(style.transform)) return 'transform'
  if (isSet(style.filter)) return 'filter'
  if (isSet(style.perspective)) return 'perspective'
  if (style.contain && /\b(paint|layout|strict|content)\b/.test(style.contain)) return 'contain'
  if (style.isolation === 'isolate') return 'isolation'
  if (style.willChange && /\b(transform|filter|perspective)\b/.test(style.willChange)) return 'will-change'
  if (isSet(style.backdropFilter)) return 'backdrop-filter'
  return null
}

// ---------------------------------------------------------------------------
// Sondas: IPC e localStorage
// ---------------------------------------------------------------------------

/** Canais cuja contagem subiu entre dois `ipcProbe.snapshot()`, com o aumento. */
function diffChannels(before, after) {
  const delta = {}
  for (const channel of Object.keys(after ?? {}).sort()) {
    const increase = (after[channel] ?? 0) - (before?.[channel] ?? 0)
    if (increase > 0) delta[channel] = increase
  }
  return delta
}

const matchesAny = (channel, patterns) => patterns.some((pattern) => pattern.test(channel))

/** Canais do delta que o tutorial nunca pode acionar. */
function forbiddenChannels(delta, patterns = FORBIDDEN_CHANNEL_PATTERNS) {
  return Object.keys(delta).filter((channel) => matchesAny(channel, patterns))
}

/** Canais do percurso fora da janela ociosa de controle e dos canais do próprio tour. */
function channelsOutside(delta, controlChannels, allowedPatterns = TOUR_CHANNEL_PATTERNS) {
  const control = new Set(controlChannels)
  return Object.keys(delta).filter((channel) => !control.has(channel) && !matchesAny(channel, allowedPatterns))
}

/** Diferença entre duas fotos do localStorage (`{ chave: valor }`). */
function diffStorage(before, after) {
  const added = []
  const removed = []
  const changed = []
  for (const key of Object.keys(after).sort()) {
    if (!Object.hasOwn(before, key)) added.push(key)
    else if (before[key] !== after[key]) changed.push(key)
  }
  for (const key of Object.keys(before).sort()) {
    if (!Object.hasOwn(after, key)) removed.push(key)
  }
  return { added, removed, changed }
}

/** O que mudou fora do permitido (por padrão, só remover as chaves listadas). */
function storageViolations(diff, { removable = [] } = {}) {
  const allowed = new Set(removable)
  return [
    ...diff.added.map((key) => ({ key, kind: 'added' })),
    ...diff.changed.map((key) => ({ key, kind: 'changed' })),
    ...diff.removed.filter((key) => !allowed.has(key)).map((key) => ({ key, kind: 'removed' })),
  ]
}

/** Requisições para fora da origem do app (servidor local, `file:`, `data:`, `blob:`, `devtools:`). */
function externalRequests(urls, appOrigin) {
  const localSchemes = new Set(['file:', 'data:', 'blob:', 'devtools:'])
  return urls.filter((url) => {
    try {
      const parsed = new URL(url)
      return !localSchemes.has(parsed.protocol) && parsed.origin !== appOrigin
    } catch {
      return true
    }
  })
}

module.exports = {
  FORBIDDEN_CHANNEL_PATTERNS,
  SUBPIXEL,
  TOUR_CHANNEL_PATTERNS,
  channelsOutside,
  clipToViewport,
  compositeOver,
  containingBlockReason,
  contains,
  contrastRatio,
  diffChannels,
  diffStorage,
  externalRequests,
  flattenLayers,
  forbiddenChannels,
  inflate,
  intersects,
  rectInside,
  relativeLuminance,
  storageViolations,
  viewportRect,
}

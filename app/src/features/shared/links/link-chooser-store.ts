/**
 * Estado do menu "para onde abrir este link", compartilhado pelo app inteiro.
 *
 * Fica fora do React porque quem abre o menu nem sempre é componente: o
 * terminal é um store imperativo em volta do xterm. Todas as superfícies
 * chamam `openLinkChooser`, e um único `LinkChooserHost` (montado no `App`)
 * desenha o menu. Um menu só por vez: abrir outro troca o pedido.
 */
import type { LinkOrigin } from './link-destination'

/** Ponto (clique) ou retângulo (o link inteiro, quando o pedido veio do teclado). */
export type LinkChooserAnchor = { x: number; y: number; width?: number; height?: number }

export type FocusReturn = { focus: (options?: FocusOptions) => void; isConnected: boolean }

export type LinkChooserRequest = {
  /**
   * O link como estava no instante do gesto. É uma cópia: se a saída do
   * terminal rolar ou uma resposta em streaming reescrever o texto enquanto o
   * menu está aberto, o que o menu mostra e o que ele abre continuam iguais.
   */
  url: string
  origin: LinkOrigin
  anchor: LinkChooserAnchor
  /** Bloco do canvas de onde o link veio: a Página Web nasce ao lado dele. */
  sourceNodeId?: string
  /** Para onde o foco volta quando o menu fecha sem abrir um bloco novo. */
  returnFocus?: FocusReturn | null
}

export type LinkChooserState = {
  request: LinkChooserRequest | null
  /** Muda a cada pedido, inclusive quando o mesmo link é pedido de novo. */
  version: number
}

let state: LinkChooserState = { request: null, version: 0 }
const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of listeners) listener()
}

export function openLinkChooser(request: LinkChooserRequest): void {
  state = { request, version: state.version + 1 }
  emit()
}

export function closeLinkChooser(): void {
  if (!state.request) return
  state = { request: null, version: state.version + 1 }
  emit()
}

export function getLinkChooserState(): LinkChooserState {
  return state
}

export function subscribeLinkChooser(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Cria um bloco Página Web e devolve o id dele. O canvas registra o seu ao
 * montar; sem canvas (tela do chat), o menu não oferece essa escolha.
 */
export type WebpageOpener = (url: string, sourceNodeId?: string) => OpenedWebpage | undefined

/**
 * O bloco criado e a câmera indo até ele. O foco só vai ao bloco quando ela
 * chega: um bloco que nasce fora da tela entra no DOM na hora (o React Flow
 * desenha nó ainda sem medida), sai quando é medido fora do container e volta
 * quando a câmera o alcança — focado cedo demais, o foco cai no `body`.
 */
export type OpenedWebpage = { id: string; cameraSettled?: Promise<unknown> }

let webpageOpener: WebpageOpener | null = null

export function registerWebpageOpener(opener: WebpageOpener): () => void {
  webpageOpener = opener
  return () => {
    if (webpageOpener === opener) webpageOpener = null
  }
}

export function getWebpageOpener(): WebpageOpener | null {
  return webpageOpener
}

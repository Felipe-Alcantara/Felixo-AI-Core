/**
 * De onde o menu de link nasce e de qual bloco o link veio, a partir do
 * elemento e do evento que pediram o menu. Usado pelo Markdown e pelo bloco
 * Página Web; o terminal sabe o próprio bloco e não precisa disto.
 */
import type { LinkChooserAnchor } from './link-chooser-store'

type BoxElement = { getBoundingClientRect?: () => { left: number; top: number; width: number; height: number } }

type ChooserEvent = {
  clientX: number
  clientY: number
  /** Em `click`, 0 quando quem clicou foi o teclado (Enter sobre o link). */
  detail?: number
  type?: string
  /** O evento do navegador: no `contextmenu`, um PointerEvent com `pointerType`. */
  nativeEvent?: object
}

/**
 * Clique de mouse ou toque: o ponto do gesto. Teclado (Enter no link, ou a
 * tecla de menu): o retângulo do próprio link, para o menu nascer embaixo
 * dele e não no canto onde o evento sintético diz que o "ponteiro" estava.
 */
export function chooserAnchorFor(event: ChooserEvent, element: BoxElement): LinkChooserAnchor {
  const pointerType = (event.nativeEvent as { pointerType?: string } | undefined)?.pointerType
  const fromKeyboard = event.type === 'contextmenu' ? pointerType === '' : event.detail === 0
  const rect = fromKeyboard ? element.getBoundingClientRect?.() : undefined
  if (!rect) return { x: event.clientX, y: event.clientY }
  return { x: rect.left, y: rect.top, width: rect.width, height: rect.height }
}

type ClosestElement = { closest?: (selector: string) => { getAttribute: (name: string) => string | null } | null }

/**
 * O bloco do canvas que contém o elemento (o nó do React Flow tem `data-id`),
 * para a Página Web nascer ao lado dele. Fora do canvas (painel, tela do
 * chat), `undefined`.
 */
export function canvasNodeIdOf(element: ClosestElement | null | undefined): string | undefined {
  const node = typeof element?.closest === 'function' ? element.closest('.react-flow__node') : null
  return node?.getAttribute('data-id') ?? undefined
}

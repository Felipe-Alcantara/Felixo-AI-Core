/**
 * Mecânica do menu de link sem DOM: onde ele aparece e o que cada tecla faz.
 * Separado do componente para ser testado no ambiente sem navegador da suíte.
 */
import type { LinkChooserAnchor } from './link-chooser-store'

export type Size = { width: number; height: number }

/** Folga entre o menu e a borda da janela, e entre o menu e o link. */
const EDGE_MARGIN = 8
const ANCHOR_GAP = 4

/**
 * Canto superior esquerdo do menu, sempre inteiro dentro da janela.
 *
 * Âncora de ponto (clique): o menu nasce no ponteiro e vira para a esquerda
 * ou para cima quando não cabe. Âncora de retângulo (link escolhido pelo
 * teclado): o menu nasce logo abaixo do link, alinhado à esquerda dele, e
 * sobe para cima do link quando não cabe embaixo.
 */
export function placeLinkChooser(
  anchor: LinkChooserAnchor,
  menu: Size,
  viewport: Size,
): { left: number; top: number } {
  const width = anchor.width ?? 0
  const height = anchor.height ?? 0
  const isRect = width > 0 || height > 0

  let left = anchor.x
  let top = isRect ? anchor.y + height + ANCHOR_GAP : anchor.y

  if (left + menu.width > viewport.width - EDGE_MARGIN) {
    left = isRect ? anchor.x + width - menu.width : anchor.x - menu.width
  }
  if (top + menu.height > viewport.height - EDGE_MARGIN) {
    top = isRect ? anchor.y - menu.height - ANCHOR_GAP : anchor.y - menu.height
  }

  return {
    left: clamp(left, EDGE_MARGIN, viewport.width - menu.width - EDGE_MARGIN),
    top: clamp(top, EDGE_MARGIN, viewport.height - menu.height - EDGE_MARGIN),
  }
}

function clamp(value: number, min: number, max: number): number {
  // Janela menor que o menu: fica colado na margem de cima/esquerda, que é
  // onde começa a leitura, em vez de sair pelos dois lados.
  return Math.max(min, Math.min(value, Math.max(min, max)))
}

export type LinkChooserKeyAction =
  | { type: 'move'; index: number }
  | { type: 'close' }
  /** A tecla não faz nada, nem o clique que o navegador faria no item. */
  | { type: 'ignore' }

/**
 * O que uma tecla faz com o menu aberto. Setas circulam entre os itens, Home e
 * End vão às pontas, Esc e Tab fecham (devolvendo o foco a quem abriu).
 * Enter e Espaço não passam por aqui: o item é um `<button>`, e o próprio
 * navegador transforma essas teclas em clique. A exceção é a repetição
 * automática (`repeat`) de uma tecla segurada desde antes do menu abrir.
 * `null` = a tecla segue o caminho normal.
 */
export function linkChooserKeyAction(
  key: string,
  activeIndex: number,
  itemCount: number,
  repeat = false,
): LinkChooserKeyAction | null {
  if (key === 'Escape' || key === 'Tab') return { type: 'close' }
  // Enter segurado num link do Markdown: o primeiro toque abre o menu e leva o
  // foco ao primeiro item, e a repetição da tecla o ativaria — o link abria no
  // navegador sem ninguém escolher. Só um Enter (ou Espaço) novo confirma.
  if (repeat && (key === 'Enter' || key === ' ')) return { type: 'ignore' }
  if (itemCount <= 0) return null
  if (key === 'ArrowDown') return { type: 'move', index: (activeIndex + 1) % itemCount }
  if (key === 'ArrowUp') return { type: 'move', index: (activeIndex - 1 + itemCount) % itemCount }
  if (key === 'Home') return { type: 'move', index: 0 }
  if (key === 'End') return { type: 'move', index: itemCount - 1 }
  return null
}

/** Como o menu fecha sem uma escolha, fora as teclas (Esc e Tab sempre devolvem o foco). */
export type LinkChooserDismissCause = 'pointer-outside' | 'wheel' | 'resize' | 'window-blur'

/**
 * Fechar o menu sem escolha devolve o foco a quem o abriu?
 *
 * Só pela roda ou pelo redimensionamento, e só com o foco no menu: ele some
 * com o foco dentro, e o foco cairia no `body` — o terminal para de receber
 * teclas, e Backspace/Delete chegam ao canvas e apagam o bloco selecionado.
 * Nos outros casos o foco já tem destino: o clique fora o leva aonde a pessoa
 * clicou, e a janela que perdeu o foco o levou de propósito (um clique dentro
 * de uma Página Web vai para a página). Quando a janela volta, é o
 * `useFocusRestore` que devolve o foco a quem o tinha antes do menu.
 */
export function restoresFocusOnDismiss(
  cause: LinkChooserDismissCause,
  focusWasInMenu: boolean,
): boolean {
  return focusWasInMenu && (cause === 'wheel' || cause === 'resize')
}

/** O pedido veio do teclado? Clique direito pela tecla de menu não tem posição de ponteiro. */
export function isKeyboardContextMenu(event: { pointerType?: string }): boolean {
  // O Chromium entrega o `contextmenu` como PointerEvent; o da tecla de menu
  // (ou Shift+F10) chega sem tipo de ponteiro.
  return event.pointerType === ''
}

/**
 * O gesto veio de um dedo? Um toque não tem Ctrl nem Cmd, então no terminal
 * ele vale como o gesto que pede o menu. O Chromium marca os eventos de mouse
 * sintetizados a partir de toque em `sourceCapabilities.firesTouchEvents`.
 */
export function isTouchGesture(event: {
  pointerType?: string
  sourceCapabilities?: { firesTouchEvents?: boolean } | null
}): boolean {
  return event.pointerType === 'touch' || event.sourceCapabilities?.firesTouchEvents === true
}

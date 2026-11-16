import { focusWasLost } from './keyboard-focus'

/**
 * Devolve o foco ao botão de um menu que fechou, um quadro depois, só se ele se
 * perdeu (o elemento focado sumiu junto com o menu). Nesse quadro a pessoa, ou
 * um atalho como o Ctrl+K, já pode ter levado o foco para outro lugar: devolver
 * mesmo assim roubava o foco da Busca aberta logo em seguida. Numa janela
 * escondida o quadro demora (~2 fps), e a corrida aparecia no smoke do canvas.
 */
export function restoreFocusIfLost(target: { readonly current: HTMLElement | null }) {
  window.requestAnimationFrame(() => {
    if (focusWasLost(document.activeElement, document.body)) target.current?.focus()
  })
}

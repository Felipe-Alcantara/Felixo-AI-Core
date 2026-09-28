/**
 * Quando o canvas precisa manter TODOS os blocos montados, desligando a
 * virtualização do React Flow (`onlyRenderVisibleElements`).
 *
 * A virtualização desmonta os blocos fora da janela visível — é o que mantém
 * um canvas com centenas de blocos leve. Ela só precisa sair do caminho em
 * volta da gaveta do terminal: com a gaveta aberta, o recentramento pode tirar
 * o cartão da janela, e ao fechar o foco precisa voltar para o botão
 * "expandir" desse cartão (acessibilidade, conferida pelo canvas-smoke). Se o
 * cartão estivesse desmontado, não haveria onde devolver o foco.
 *
 * Antes, a trava ia para `true` na primeira abertura da gaveta e nunca mais
 * voltava: dali até recarregar a janela, todo bloco ficava montado, inclusive
 * os fora da tela. Aqui ela vale só enquanto é necessária:
 *
 * - gaveta aberta;
 * - gaveta recém-fechada, enquanto o layout novo assenta e o foco é devolvido
 *   (`settling`). Soltar no mesmo lote do fechamento fazia o React Flow calcular
 *   os blocos visíveis com a largura antiga do container e desmontar/remontar
 *   os cartões da faixa que a gaveta ocupava — um webview ali recarregaria;
 * - foco devolvido ainda num bloco fora da área visível (`holdingRestoredFocus`).
 */
export type NodeMountLatchState = {
  drawerOpen: boolean
  /** A gaveta fechou e o layout/foco ainda não assentaram. */
  settling: boolean
  /** O foco voltou para um bloco e ainda está num bloco fora da área visível. */
  holdingRestoredFocus: boolean
  /** Fechamento a que os eventos seguintes se referem. */
  generation: number
}

export type NodeMountLatchEvent =
  | { type: 'drawer-opened' }
  | { type: 'drawer-closed'; generation: number }
  | { type: 'focus-restored-to-node'; generation: number }
  | { type: 'settled'; generation: number }
  | { type: 'restored-focus-left'; generation: number }

export const INITIAL_NODE_MOUNT_LATCH: NodeMountLatchState = {
  drawerOpen: false,
  settling: false,
  holdingRestoredFocus: false,
  generation: 0,
}

export function reduceNodeMountLatch(
  state: NodeMountLatchState,
  event: NodeMountLatchEvent,
): NodeMountLatchState {
  switch (event.type) {
    case 'drawer-opened':
      return { ...state, drawerOpen: true, settling: false, holdingRestoredFocus: false }
    case 'drawer-closed':
      return {
        drawerOpen: false,
        settling: true,
        holdingRestoredFocus: false,
        generation: event.generation,
      }
    default:
      break
  }

  // Eventos de um fechamento antigo (uma gaveta foi aberta e fechada de novo
  // no meio) não podem soltar a trava do atual.
  if (event.generation !== state.generation || state.drawerOpen) {
    return state
  }

  switch (event.type) {
    case 'focus-restored-to-node':
      return { ...state, settling: false, holdingRestoredFocus: true }
    case 'settled':
      return { ...state, settling: false, holdingRestoredFocus: false }
    case 'restored-focus-left':
      return { ...state, holdingRestoredFocus: false }
  }
}

export function shouldKeepCanvasNodesMounted(state: NodeMountLatchState): boolean {
  return state.drawerOpen || state.settling || state.holdingRestoredFocus
}

export type LatchRect = { left: number; top: number; right: number; bottom: number }

/**
 * Se dois retângulos (de `getBoundingClientRect`) se sobrepõem com área. Um
 * bloco que não cruza o container do canvas está fora da janela visível e a
 * virtualização o desmontaria — com o foco dentro, o foco cairia no body.
 */
export function rectsIntersect(a: LatchRect, b: LatchRect): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
}

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
 * os fora da tela. Aqui ela vale só enquanto é necessária — gaveta aberta,
 * foco sendo devolvido, ou foco devolvido ainda parado no gatilho do cartão —
 * e volta sozinha quando o foco sai dele.
 */
export type NodeMountLatchState = {
  drawerOpen: boolean
  /** A gaveta fechou com o foco dentro dela e o foco está sendo devolvido. */
  restoringFocus: boolean
  /** O foco voltou para um gatilho dentro de um bloco e ainda está lá. */
  holdingRestoredFocus: boolean
  /** Fechamento a que os eventos de devolução de foco se referem. */
  generation: number
}

export type NodeMountLatchEvent =
  | { type: 'drawer-opened' }
  | { type: 'drawer-closed'; generation: number; restoringFocus: boolean }
  | { type: 'focus-restored-to-node'; generation: number }
  | { type: 'focus-restore-done'; generation: number }
  | { type: 'restored-focus-left'; generation: number }

export const INITIAL_NODE_MOUNT_LATCH: NodeMountLatchState = {
  drawerOpen: false,
  restoringFocus: false,
  holdingRestoredFocus: false,
  generation: 0,
}

export function reduceNodeMountLatch(
  state: NodeMountLatchState,
  event: NodeMountLatchEvent,
): NodeMountLatchState {
  switch (event.type) {
    case 'drawer-opened':
      return { ...state, drawerOpen: true, restoringFocus: false, holdingRestoredFocus: false }
    case 'drawer-closed':
      return {
        drawerOpen: false,
        restoringFocus: event.restoringFocus,
        holdingRestoredFocus: false,
        generation: event.generation,
      }
    default:
      break
  }

  // Eventos de devolução de foco de um fechamento antigo (uma gaveta foi
  // aberta e fechada de novo no meio) não podem soltar a trava do atual.
  if (event.generation !== state.generation || state.drawerOpen) {
    return state
  }

  switch (event.type) {
    case 'focus-restored-to-node':
      return { ...state, restoringFocus: false, holdingRestoredFocus: true }
    case 'focus-restore-done':
      return { ...state, restoringFocus: false, holdingRestoredFocus: false }
    case 'restored-focus-left':
      return { ...state, holdingRestoredFocus: false }
  }
}

export function shouldKeepCanvasNodesMounted(state: NodeMountLatchState): boolean {
  return state.drawerOpen || state.restoringFocus || state.holdingRestoredFocus
}

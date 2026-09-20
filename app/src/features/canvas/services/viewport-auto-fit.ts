// Quando o canvas pode reenquadrar a visão sozinho.
//
// O efeito de enquadramento tinha `fitCanvasViewSafely` nas dependências, e essa
// função é recriada a cada mudança de layout (`occupancy`: gaveta, painéis,
// inspector). Resultado: abrir/fechar/redimensionar qualquer superfície jogava
// fora o pan e o zoom da pessoa ("o canvas fica resetando a visualização").
// Regra agora: o enquadramento automático vale para a PRIMEIRA vez de cada
// revisão do canvas e para mudanças de layout ENQUANTO a pessoa ainda não mexeu
// na visão; depois disso a visão é dela.

/** Movimentos do viewport dentro desta janela, logo após o nosso próprio ajuste, não contam como da pessoa. */
export const AUTO_FIT_MOVE_WINDOW_MS = 400

export type AutoFitState = {
  revision: number | null
  userMoved: boolean
  ignoreMovesUntil: number
}

export function initialAutoFitState(): AutoFitState {
  return { revision: null, userMoved: false, ignoreMovesUntil: 0 }
}

/** Devolve se deve enquadrar agora e o estado seguinte (que abre a janela de "movimento nosso"). */
export function planAutoFit(
  state: AutoFitState,
  revision: number,
  now: number,
): { fit: boolean; state: AutoFitState } {
  if (state.revision !== revision) {
    return { fit: true, state: { revision, userMoved: false, ignoreMovesUntil: now + AUTO_FIT_MOVE_WINDOW_MS } }
  }
  if (state.userMoved) return { fit: false, state }
  return { fit: true, state: { ...state, ignoreMovesUntil: now + AUTO_FIT_MOVE_WINDOW_MS } }
}

/**
 * O viewport mudou (`onMove`). Fora da janela do nosso ajuste, foi a pessoa —
 * pan, zoom, botões de zoom, foco em bloco: qualquer coisa que não seja o
 * enquadramento automático torna a visão dela.
 */
export function registerViewportMove(state: AutoFitState, now: number): AutoFitState {
  if (state.userMoved || now < state.ignoreMovesUntil) return state
  return { ...state, userMoved: true }
}

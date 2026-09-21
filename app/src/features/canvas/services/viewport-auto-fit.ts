// Quando o canvas pode reenquadrar a visão sozinho.
//
// O efeito de enquadramento tinha `fitCanvasViewSafely` nas dependências, e essa
// função é recriada a cada mudança de layout (`occupancy`: gaveta, painéis,
// inspector). Resultado: abrir/fechar/redimensionar qualquer superfície jogava
// fora o pan e o zoom da pessoa ("o canvas fica resetando a visualização").
// Regra: o enquadramento automático vale para a PRIMEIRA vez de cada revisão do
// canvas e para mudanças de layout ENQUANTO a pessoa ainda não mexeu na visão;
// depois disso a visão é dela.
//
// Como distinguir o movimento do nosso ajuste do movimento da pessoa: um evento
// DOM real (mouse/roda/toque) é sempre da pessoa; um movimento sem evento
// (programático) só é "nosso" enquanto um ajuste está pendente ou logo depois de
// executado. A janela conta a partir da EXECUÇÃO do ajuste, não do planejamento:
// num runner/PC lento o ajuste roda tarde, e uma janela aberta no planejamento já
// teria fechado (o ajuste seria confundido com movimento da pessoa e os
// reenquadramentos por layout parariam — o enquadramento inicial ficava sob a topbar).

/** Movimentos programáticos dentro desta janela, logo após o ajuste executar, não contam como da pessoa. */
export const AUTO_FIT_MOVE_WINDOW_MS = 400

export type AutoFitState = {
  revision: number | null
  userMoved: boolean
  /** `Infinity` enquanto um ajuste está planejado e ainda não executou. */
  ignoreMovesUntil: number
}

export function initialAutoFitState(): AutoFitState {
  return { revision: null, userMoved: false, ignoreMovesUntil: 0 }
}

/** Devolve se deve enquadrar e o estado seguinte (ajuste pendente: movimentos programáticos são nossos). */
export function planAutoFit(
  state: AutoFitState,
  revision: number,
): { fit: boolean; state: AutoFitState } {
  if (state.revision !== revision) {
    return { fit: true, state: { revision, userMoved: false, ignoreMovesUntil: Infinity } }
  }
  if (state.userMoved) return { fit: false, state }
  return { fit: true, state: { ...state, ignoreMovesUntil: Infinity } }
}

/** O ajuste está executando agora: abre a janela de movimento "nosso" a partir de `now`. */
export function markAutoFitExecuted(state: AutoFitState, now: number): AutoFitState {
  if (state.userMoved) return state
  return { ...state, ignoreMovesUntil: now + AUTO_FIT_MOVE_WINDOW_MS }
}

/**
 * O viewport mudou (`onMove`). `fromUserEvent` = veio de um evento DOM real
 * (arrastar, roda, toque): sempre da pessoa. Sem evento (botões de zoom, foco em
 * bloco, nosso ajuste): é da pessoa, exceto dentro da janela do nosso ajuste.
 */
export function registerViewportMove(
  state: AutoFitState,
  now: number,
  fromUserEvent: boolean,
): AutoFitState {
  if (state.userMoved) return state
  if (!fromUserEvent && now < state.ignoreMovesUntil) return state
  return { ...state, userMoved: true }
}

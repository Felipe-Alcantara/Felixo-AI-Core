/**
 * Conta de uma CLI com login próprio.
 *
 * Cada uma tem a própria pasta de credencial, então duas contas do mesmo
 * provedor convivem sem logout — o terminal escolhe em qual nasce. Nada de
 * segredo trafega neste tipo: só metadados e, no Openia, o booleano seguro que
 * informa se existe uma chave guardada para aquela conta.
 */
export type CliAccount = {
  id: string
  providerId: string
  label: string
  createdAt: string
  /** Nunca contém a chave; só existe para o provedor que usa segredo por conta. */
  secretConfigured?: boolean
}

/**
 * Terminal vivo que nasceu na conta, como a confirmação de remoção o mostra.
 * Não traz ambiente nem caminho de perfil: só o que ajuda a reconhecer o bloco.
 */
export type CliAccountAffectedSession = {
  sessionId: string
  cwd: string
  startedAt: number | null
}

/**
 * Pedido de remoção. Sem `confirmed: true` o processo principal não apaga
 * nada; com ele, `acknowledgedSessionIds` precisa cobrir todo terminal vivo na
 * conta, senão a confirmação volta com a lista nova.
 */
export type CliAccountRemoveOptions = {
  confirmed?: boolean
  acknowledgedSessionIds?: string[]
}

export type CliAccountRemoveResult = {
  ok: boolean
  removed?: boolean
  /** A remoção foi recusada por falta de confirmação que cubra os terminais vivos. */
  requiresConfirmation?: boolean
  sessions?: CliAccountAffectedSession[]
  message?: string
}

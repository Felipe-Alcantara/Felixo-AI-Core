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

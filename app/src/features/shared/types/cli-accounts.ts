/**
 * Conta de uma CLI com login próprio.
 *
 * Cada uma tem a própria pasta de credencial, então duas contas do mesmo
 * provedor convivem sem logout — o terminal escolhe em qual nasce. Nada de
 * segredo trafega neste tipo: só o que a pessoa mesma escreveu.
 */
export type CliAccount = {
  id: string
  providerId: string
  label: string
  createdAt: string
}

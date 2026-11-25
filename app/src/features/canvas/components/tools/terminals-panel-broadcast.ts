/**
 * "Mesma mensagem para os selecionados" do modo de envio em massa do dock.
 * Lógica pura (seleção, proteções e envio em sequência) fora do componente.
 */
export type BroadcastTarget = { id: string; activity: string }

export type BroadcastStatus = 'sending' | 'delivered' | 'failed'
export type BroadcastResults = Record<string, BroadcastStatus>

/** Acima disso o envio pede confirmação com a lista dos destinatários. */
export const BROADCAST_CONFIRM_ABOVE = 5

/** Quem espera aprovação nunca entra por "pasta"/"todos": a mensagem viraria resposta à pergunta dele. */
export const isWaitingApproval = (activity: string) => activity === 'waiting_approval'

/** Ids que "selecionar pasta/todos" marca: terminais vivos, fora os que esperam aprovação. */
export function bulkSelectableIds(targets: BroadcastTarget[]): string[] {
  return targets.filter((t) => !isWaitingApproval(t.activity) && t.activity !== 'exited').map((t) => t.id)
}

export function toggleSelected(selected: string[], id: string): string[] {
  return selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]
}

/** Marca (ou desmarca, se todos já estão marcados) o grupo de ids, sem tocar nos demais. */
export function toggleGroup(selected: string[], groupIds: string[]): string[] {
  if (groupIds.length === 0) return selected
  const allOn = groupIds.every((id) => selected.includes(id))
  return allOn
    ? selected.filter((id) => !groupIds.includes(id))
    : [...selected, ...groupIds.filter((id) => !selected.includes(id))]
}

export const needsBroadcastConfirmation = (count: number) => count > BROADCAST_CONFIRM_ABOVE

/**
 * Entrega a mesma mensagem, um destino por vez (sem rajada de IPC), e devolve
 * o resultado de cada um. `send` nunca deve lançar; se lançar, conta como falha.
 */
export async function broadcastSequentially(
  ids: string[],
  send: (id: string) => Promise<boolean>,
  onProgress: (results: BroadcastResults) => void,
): Promise<BroadcastResults> {
  const results: BroadcastResults = Object.fromEntries(ids.map((id) => [id, 'sending' as const]))
  onProgress({ ...results })
  for (const id of ids) {
    results[id] = await send(id).then((ok) => (ok ? 'delivered' : 'failed'), () => 'failed' as const)
    onProgress({ ...results })
  }
  return results
}

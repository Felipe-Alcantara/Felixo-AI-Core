/**
 * Conexão e database que cada bloco "Tarefas Notion" mostra. A escolha vive no
 * `data` do próprio bloco (gravado no canvas), não no localStorage: dois
 * blocos podem apontar para databases diferentes, e cada um reabre na sua.
 */

export type NotionTasksSelection = {
  connectionId: string
  dataSourceId: string
}

export type NotionTasksSelectionPatch = {
  notionConnectionId: string
  notionDataSourceId: string
}

/** A escolha atual se ela ainda está na lista; senão a primeira (ou vazio). */
export function keepIfListed(current: string, options: readonly { id: string }[]): string {
  return options.some((option) => option.id === current) ? current : options[0]?.id || ''
}

/** Lê a escolha gravada no `data` do bloco; bloco antigo ou campo inválido vira vazio. */
export function readNotionTasksSelection(data: unknown): NotionTasksSelection {
  const record = data && typeof data === 'object' ? (data as Record<string, unknown>) : {}
  return {
    connectionId: typeof record.notionConnectionId === 'string' ? record.notionConnectionId : '',
    dataSourceId: typeof record.notionDataSourceId === 'string' ? record.notionDataSourceId : '',
  }
}

/**
 * O que gravar no bloco, ou `null`. Escolha pela metade (conexão trocada e a
 * lista de databases ainda chegando) não vale gravar: o próximo passo já
 * completa o par.
 */
export function selectionPatch(saved: NotionTasksSelection, current: NotionTasksSelection): NotionTasksSelectionPatch | null {
  if (!current.connectionId || !current.dataSourceId) return null
  if (saved.connectionId === current.connectionId && saved.dataSourceId === current.dataSourceId) return null
  return { notionConnectionId: current.connectionId, notionDataSourceId: current.dataSourceId }
}

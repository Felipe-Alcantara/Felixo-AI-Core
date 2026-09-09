/**
 * Quais propriedades da database aparecem como coluna extra na tabela de
 * tarefas do Notion, sem precisar expandir a linha — escolha salva por
 * conexão + database, no mesmo padrão de armazenamento de `notion-task-views`.
 */

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

function getStorage(): StorageLike | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage
  } catch {
    return undefined
  }
}

function storageKey(connectionId: string, dataSourceId: string): string {
  return `felixo:notion-table-columns:${connectionId}:${dataSourceId}`
}

export function readVisibleColumns(
  connectionId: string,
  dataSourceId: string,
  storage: StorageLike | undefined = getStorage(),
): string[] {
  if (!storage || !connectionId || !dataSourceId) return []
  try {
    const raw = storage.getItem(storageKey(connectionId, dataSourceId))
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((name): name is string => typeof name === 'string') : []
  } catch {
    return []
  }
}

export function saveVisibleColumns(
  connectionId: string,
  dataSourceId: string,
  columns: string[],
  storage: StorageLike | undefined = getStorage(),
): void {
  if (!storage || !connectionId || !dataSourceId) return
  try {
    storage.setItem(storageKey(connectionId, dataSourceId), JSON.stringify(columns))
  } catch {
    // Preferência local best-effort; storage indisponível não pode quebrar o app.
  }
}

import type { NotionCachedTasksResult, NotionSyncStatus, NotionTasksResult } from '../../shared/types/notion'

/** Estado real de stale-while-revalidate no painel — ver PanelSyncStatus em NotionTasksPanel.tsx. */
export type PanelSyncStatus = 'idle' | 'syncing' | 'success' | 'stale' | 'empty' | 'error'

/**
 * Decide o syncStatus final do painel a partir dos dois resultados de
 * `loadTasks`: a leitura local (fase 1, sem rede) e a revalidação de rede
 * (fase 2). Extraído como função pura pra ser testável sem montar o
 * componente inteiro — este repositório testa lógica em .ts, não
 * renderização (sem @testing-library/react instalado).
 */
export function decideSyncStatusAfterNetwork(
  networkResult: Pick<NotionTasksResult, 'ok' | 'syncStatus' | 'stale'>,
  hasLocalSnapshot: boolean,
): PanelSyncStatus {
  if (!networkResult.ok) {
    return hasLocalSnapshot ? 'stale' : 'error'
  }
  return networkResult.syncStatus ?? (networkResult.stale ? 'stale' : 'success')
}

/** Se a leitura local (fase 1) trouxe algum snapshot utilizável. */
export function hasUsableCachedSnapshot(
  cachedResult: Pick<NotionCachedTasksResult, 'ok' | 'tasks'>,
): boolean {
  return cachedResult.ok === true && Array.isArray(cachedResult.tasks) && cachedResult.tasks.length > 0
}

export type { NotionSyncStatus }

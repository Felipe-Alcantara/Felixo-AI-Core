export type NotionConnection = {
  id: string
  label: string
  profileId: string
  createdAt: string
  updatedAt: string
  lastTestedAt: string | null
  hasToken: boolean
}

export type NotionDatabase = {
  id: string
  name: string
  databaseId: string | null
  url: string | null
  lastEditedAt: string | null
}

export type NotionSchemaProperty = {
  id: string
  name: string
  type: string
  [key: string]: unknown
}

export type NotionTask = {
  id: string
  title: string
  completed: boolean
  status: string
  dueDate: string
  priority: string
  text: string
  url: string | null
  archived: boolean
  createdAt: string | null
  updatedAt: string | null
  fields: Record<string, unknown>
}

export type NotionListResult = {
  ok: boolean
  message?: string
  connections?: NotionConnection[]
  secureStorage?: { ok: boolean; reason: string | null }
}

export type NotionDatabaseResult = {
  ok: boolean
  message?: string
  databases?: NotionDatabase[]
}

export type NotionSchemaResult = {
  ok: boolean
  message?: string
  database?: {
    id: string
    name: string
    databaseId: string | null
    dataSourceId: string
  }
  schema?: Record<string, NotionSchemaProperty>
}

/**
 * Estado real de sincronização, além do boolean `stale` legado (mantido só
 * por compatibilidade): `success` veio da rede agora; `stale` é cache local
 * (rede indisponível, ou ainda não revalidado); `empty` é cache vazio (sem
 * dado local pra mostrar enquanto a rede não responde); `error` é erro sem
 * nenhum dado utilizável, nem remoto nem local.
 */
export type NotionSyncStatus = 'success' | 'stale' | 'empty' | 'error'

export type NotionTasksResult = {
  ok: boolean
  message?: string
  tasks?: NotionTask[]
  schema?: Record<string, NotionSchemaProperty>
  dataSourceId?: string
  fetchedAt?: string | null
  stale?: boolean
  fromCache?: boolean
  hasMore?: boolean
  syncStatus?: NotionSyncStatus
}

export type NotionCachedTasksResult = {
  ok: boolean
  message?: string
  tasks?: NotionTask[]
  schema?: Record<string, NotionSchemaProperty>
  dataSourceId?: string
  fetchedAt?: string | null
  hasCache?: boolean
  syncStatus?: NotionSyncStatus
}

export type NotionTaskContentResult = {
  ok: boolean
  message?: string
  pageId?: string
  content?: string
}

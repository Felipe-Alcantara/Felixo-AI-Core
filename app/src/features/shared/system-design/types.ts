/** De onde vem a fonte configurada: o padrão do app ou uma escolha da pessoa. */
export type SystemDesignSourceMode = 'default' | 'custom'

/**
 * Estado da sincronização. Espelha `SYNC_STATES` de
 * `electron/core/system-design-source.cjs` — quem consome faz `switch`.
 */
export type SystemDesignSyncState =
  | 'disabled'
  | 'never-synced'
  | 'synced'
  | 'offline-fallback'
  | 'pending-source-change'

/** A fonte cujo conteúdo foi de fato entregue na última sincronização. */
export type SystemDesignDeliveredSource = {
  repoUrl: string
  branch: string
  sha: string
  syncedAt: string | null
  label: string
}

/**
 * O que o renderer lê. O default NÃO é copiado aqui: quem o resolve é o
 * processo principal, e este objeto só o repete já resolvido.
 */
export type SystemDesignConfig = {
  schemaVersion: number
  enabled: boolean
  /** Fonte configurada agora (já resolvida pela precedência). */
  repoUrl: string
  branch: string
  sourceMode: SystemDesignSourceMode
  label: string
  syncState: SystemDesignSyncState
  /** Fonte cujo conteúdo está em cache — pode diferir da configurada. */
  delivered: SystemDesignDeliveredSource | null
  lastSha: string | null
  lastSyncedAt: string | null
  lastError: string | null
}

/**
 * O que o renderer pode pedir para mudar. Sha, data, erro e fonte entregue só
 * o app escreve — não existem aqui de propósito.
 */
export type SystemDesignConfigChange = {
  enabled?: boolean
  /** `'default'` volta ao padrão do app e descarta a fonte própria. */
  sourceMode?: 'default'
  repoUrl?: string
  branch?: string
}

export type SystemDesignDocumentSummary = {
  path: string
  title: string
  summary: string
  byteSize: number
  sourceSha?: string
  updatedAt: string
}

export type SystemDesignDocument = SystemDesignDocumentSummary & {
  content: string
}

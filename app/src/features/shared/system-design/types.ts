export type SystemDesignConfig = {
  enabled: boolean
  repoUrl: string
  branch: string
  lastSha: string | null
  lastSyncedAt: string | null
  lastError: string | null
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

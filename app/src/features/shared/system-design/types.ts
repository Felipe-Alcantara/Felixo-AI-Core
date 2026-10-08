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
 * De onde vem um guia: o padrão do app, a lista da pessoa, ou o projeto (por
 * arquivo versionado, escolha no app ou pasta de guias). Espelha
 * `electron/core/system-design-project.cjs`.
 */
export type SystemDesignGuideOrigin =
  | 'default'
  | 'custom'
  | 'projeto-arquivo'
  | 'projeto-app'
  | 'projeto-pasta'

/** Um guia com o próprio estado: cada fonte tem cache e índice próprios. */
export type SystemDesignGuide = {
  /** Identidade estável (`url#branch` canônico, ou `local:<pasta>`). */
  key: string
  kind: 'git' | 'local'
  repoUrl: string
  branch: string
  /** Só para `kind: 'local'`: a pasta de guias dentro do projeto. */
  path?: string
  label: string
  origin: SystemDesignGuideOrigin
  syncState: SystemDesignSyncState
  sha: string | null
  syncedAt: string | null
  lastError: string | null
  documentCount?: number
}

/** O que a pessoa pode escrever na lista de guias (o resto só o app escreve). */
export type SystemDesignGuideInput = { repoUrl: string; branch: string }

/**
 * O que o renderer lê. O default NÃO é copiado aqui: quem o resolve é o
 * processo principal, e este objeto só o repete já resolvido.
 */
export type SystemDesignConfig = {
  schemaVersion: number
  enabled: boolean
  /** Lista da camada do usuário (sempre ≥ 1 quando carregada). */
  guides: SystemDesignGuide[]
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
  /** `'default'` volta ao padrão do app e descarta a lista própria. */
  sourceMode?: 'default'
  /** Troca a lista inteira (vazia = padrão do app). */
  guides?: SystemDesignGuideInput[]
  repoUrl?: string
  branch?: string
}

/** Camada que vale num projeto. */
export type SystemDesignLayer = 'padrao' | 'usuario' | 'projeto'

/** Situação do `.felixo/system-design.json`. Espelha `FILE_STATUS`. */
export type SystemDesignProjectFileStatus =
  | 'ausente'
  | 'pendente'
  | 'confirmado'
  | 'alterado'
  | 'ignorado'
  | 'invalido'

/** A camada de projeto de um diretório, já cruzada com a do usuário. */
export type SystemDesignProject = {
  directory: string | null
  /** Raiz do projeto (pasta com `.git`); `null` fora do autorizado. */
  root: string | null
  /** `false`: a pasta não está num projeto registrado; nada dela foi lido. */
  authorized: boolean
  layer: SystemDesignLayer
  /** Os guias que valem ali. */
  guides: SystemDesignGuide[]
  /** Guias do usuário que a lista do projeto substituiu ali. */
  replaced: SystemDesignGuide[]
  file: {
    present: boolean
    path: string
    status: SystemDesignProjectFileStatus
    guides: SystemDesignGuide[]
    problems: string[]
    hash: string | null
  } | null
  folders: { name: string; label: string; path: string; active: boolean }[]
  appGuides: SystemDesignGuide[]
  useGuideFolders: boolean
}

/** O que a pessoa pode mudar na camada de UM projeto. */
export type SystemDesignProjectChange = {
  /** Hash do arquivo que a pessoa está vendo; outro hash é recusado. */
  confirmFile?: string
  ignoreFile?: true
  useRepoFile?: true
  useGuideFolders?: boolean
  guides?: SystemDesignGuideInput[]
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

/// <reference types="vite/client" />

import type {
  AutomationDefinition,
  GitProjectSummary,
  ChatSession,
  Model,
  OrchestratorSettings,
  OrchestrationRun,
  Project,
  ProjectNote,
  OrchestrationStreamEvent,
  QaLogEntry,
  StreamEvent,
  SystemDesignConfig,
  SystemDesignDocument,
  SystemDesignDocumentSummary,
  TerminalOutputEvent,
} from './features/chat/types'
import type {
  FetchAllActionResult,
  FetchAllAgentRequest,
  FetchAllPlan,
  FetchAllProgress,
  FetchAllSettings,
} from './features/canvas/types'
import type { CliAccount } from './features/shared/types/cli-accounts'
import type {
  AgentUsageDashboard,
  ClaudeStatuslineState,
  AgentUsageMutationResult,
} from './features/shared/agent-usage/agent-usage'

type DetectedRepo = { name: string; path: string }
type DirectoryEntry = { name: string; isDirectory: boolean; path: string }

type PersistedCanvasEdge = {
  id: string
  source: string
  target: string
  createdAt?: string
  updatedAt?: string
}

type PersistedCanvasNode = {
  id: string
  type: 'terminal' | 'note' | 'group' | 'file' | 'webpage'
  parentId?: string | null
  position: { x: number; y: number }
  width?: number | null
  height?: number | null
  data: Record<string, unknown>
  createdAt?: string
  updatedAt?: string
}
type CanvasSkill = {
  id: string
  name: string
  description: string
  /** Absolute path to the skill file the agent should read/use. */
  path: string
}
type AgentModelCatalog = Record<
  string,
  {
    models?: string[]
    labels?: Record<string, string>
    effortLevels?: Record<string, string[]>
  }
> & { discoveredAt?: string }

type CliStreamEvent = StreamEvent | OrchestrationStreamEvent

type CliInvokeResult = {
  ok: boolean
  message?: string
}

type OpeniaInterface = {
  key: string
  name: string
  description: string
  ecosystem: string
  command: string
  homepage: string
  modelPrefix: string
  supportsModelSelection: boolean
  modelSelection: 'automatic' | 'inside'
  supportsSubscription: boolean
  isCodeAgent: boolean
  emoji: string
}

type OpeniaModel = {
  id: string
  vendor: string
  name: string
  completionPrice: number
}

type SaveAttachmentResult = CliInvokeResult & {
  filePath?: string
  fileName?: string
  type?: string
  size?: number
}

type ReadImageAttachmentResult = CliInvokeResult & {
  dataUrl?: string
  type?: string
  size?: number
}

/** Andamento da instalação automática das CLIs de IA. */
type CliSetupStatus = {
  state: 'disabled' | 'idle' | 'checking' | 'installing' | 'done' | 'error'
  message: string
  updatedAt: string
  clis?: Array<{
    id: string
    name: string
    state: 'present' | 'pending' | 'installing' | 'installed' | 'failed' | 'skipped'
    message?: string
  }>
}

type UpdateStatus = {
  state:
    | 'disabled'
    | 'idle'
    | 'checking'
    | 'available'
    | 'downloading'
    | 'downloaded'
    | 'error'
  message: string
  updatedAt: string
  reason?: string
  version?: string
  progress?: number
}

type CliOrchestrationStatusResult = CliInvokeResult & {
  run?: OrchestrationRun
  runs?: OrchestrationRun[]
}

type OfficialCliCatalogItem = {
  id: string
  name: string
  provider: string
  command: string
  detected: boolean
  version?: string | null
  path?: string | null
  error?: string | null
  installCommand: string
  loginCommand: string
  statusCommand?: string
  switchAccountCommand?: string
  supportsAccountSwitch?: boolean
  isLauncher?: boolean
  sourceOfTruth?: string
  modelSelection?: string
  installRequiresConfirmation?: boolean
  installUrl: string
  authUrl: string
  models: Model[]
}

type OfficialCliCatalogResult = CliInvokeResult & {
  clis?: OfficialCliCatalogItem[]
}

type OfficialCliInstallResult = CliInvokeResult & {
  cli?: OfficialCliCatalogItem
  models?: Model[]
  requiresConfirmation?: boolean
  /** True quando o pip recusou por PEP 668 e a instalação repetiu sozinha com --break-system-packages. */
  retriedWithBreakSystemPackages?: boolean
  stdout?: string
  stderr?: string
}

type OfficialCliLoginResult = CliInvokeResult & {
  command?: string
  args?: string[]
  manualCommand?: string
}

/**
 * Identidade só aparece quando a própria CLI a imprime. Campo ausente
 * significa "a CLI não informa", nunca "não há conta".
 */
type OfficialCliAccountStatusResult = CliInvokeResult & {
  authStatus?: 'logged_in' | 'logged_out' | 'unknown'
  method?: string
  account?: string
  plan?: string
  organization?: string
  statusCommand?: string
  /** Saída da CLI já redigida no processo principal. */
  output?: string
}

/** Terminal vivo que roda a CLI cuja conta será trocada. */
type OfficialCliAccountSession = {
  sessionId: string
  elementId: string | null
  cwd: string
  startedAt: number | null
}

type OfficialCliAccountSessionsResult = CliInvokeResult & {
  sessions?: OfficialCliAccountSession[]
}

type OfficialCliSwitchAccountResult = OfficialCliLoginResult & {
  /** A troca foi recusada por falta de confirmação explícita. */
  requiresConfirmation?: boolean
  /** O logout foi executado; a conta anterior já não está autenticada. */
  loggedOut?: boolean
}

declare global {
  interface Window {
    felixo?: {
      platform: string
      versions: {
        chrome?: string
        electron?: string
        node?: string
      }
      getFilePath?: (file: File) => string
      /** Versão empacotada do app (a do CI, não a do package.json versionado). */
      getVersion?: () => Promise<string>
      cli?: {
        send: (params: {
          sessionId: string
          threadId?: string
          prompt: string
          resumePrompt?: string
          promptHint?: string
          model: Model
          cwd?: string
          availableModels?: Model[]
          orchestratorSettings?: OrchestratorSettings
        }) => Promise<CliInvokeResult>
        stop: (params: {
          sessionId: string
          threadId?: string
        }) => Promise<CliInvokeResult>
        resetThread: (params: {
          threadId: string
        }) => Promise<CliInvokeResult & { killed?: boolean }>
        listOfficial: () => Promise<OfficialCliCatalogResult>
        installOfficial: (params: {
          id: string
          confirmed?: boolean
        }) => Promise<OfficialCliInstallResult>
        openOfficialLogin: (params: {
          id: string
        }) => Promise<OfficialCliLoginResult>
        getOfficialAccountStatus: (params: {
          id: string
        }) => Promise<OfficialCliAccountStatusResult>
        getOfficialAccountSessions: (params: {
          id: string
        }) => Promise<OfficialCliAccountSessionsResult>
        switchOfficialAccount: (params: {
          id: string
          confirmed: boolean
        }) => Promise<OfficialCliSwitchAccountResult>
        orchestrationStatus: (params?: {
          runId?: string
          threadId?: string
        }) => Promise<CliOrchestrationStatusResult>
        onStream: (callback: (event: CliStreamEvent) => void) => () => void
        onRawOutput: (callback: (event: TerminalOutputEvent) => void) => () => void
        onTerminalOutput: (callback: (event: TerminalOutputEvent) => void) => () => void
      }
      openia?: {
        listInterfaces: () => Promise<CliInvokeResult & { interfaces?: OpeniaInterface[] }>
        listModels: (params?: { refresh?: boolean }) => Promise<CliInvokeResult & { models?: OpeniaModel[] }>
        keyStatus: () => Promise<CliInvokeResult & { configured?: boolean; active?: string | null }>
        setKey: (params: { name?: string; key: string }) => Promise<CliInvokeResult & { configured?: boolean }>
      }
      pty?: {
        spawn: (params: {
          sessionId: string
          command?: string
          args?: string[]
          cwd?: string
          cols?: number
          rows?: number
          reuseExisting?: boolean
          /** Interpreter to try when `command` isn't installed (Windows `py`/`python`). */
          fallbackCommand?: string
          /** Keeps the terminal interactive after the command exits (run-a-file). */
          keepShellOpen?: boolean
          accountId?: string
        }) => Promise<CliInvokeResult & { sessionId?: string; reused?: boolean }>
        write: (params: {
          sessionId: string
          data: string
        }) => Promise<CliInvokeResult & { delivered?: boolean }>
        resize: (params: {
          sessionId: string
          cols: number
          rows: number
        }) => Promise<CliInvokeResult & { applied?: boolean }>
        kill: (params: {
          sessionId: string
          force?: boolean
        }) => Promise<CliInvokeResult & { killed?: boolean }>
        onData: (
          callback: (event: { sessionId: string; data: string }) => void,
        ) => () => void
        onExit: (
          callback: (event: {
            sessionId: string
            exitCode: number
            signal?: number
          }) => void,
        ) => () => void
        onSession: (callback: (event: {
          ptySessionId: string
          version: 1
          provider: 'codex' | 'claude' | 'gemini'
          cwd: string
          capturedAt: number
          source?: string
        }) => void) => () => void
      }
      projects?: {
        pickFolder: () => Promise<string | null>
        detectRepos: (folderPath: string) => Promise<DetectedRepo[]>
        list: () => Promise<CliInvokeResult & { projects?: unknown[] }>
        save: (project: Project) => Promise<CliInvokeResult>
        delete: (projectId: string) => Promise<CliInvokeResult & { deleted?: boolean }>
        loadActiveIds: () => Promise<
          CliInvokeResult & { projectIds?: unknown[] | null }
        >
        saveActiveIds: (
          projectIds: string[],
        ) => Promise<CliInvokeResult & { projectIds?: unknown[] }>
        buildDocsIndex: (params: {
          projectPath: string
          docsDirectory: string
        }) => Promise<
          CliInvokeResult & {
            entries?: { filename: string; summary: string }[]
            docsPath?: string
          }
        >
        listDirectory: (params: {
          rootPath: string
          subPath?: string
        }) => Promise<
          CliInvokeResult & {
            path?: string
            relativePath?: string
            entries?: DirectoryEntry[]
          }
        >
      }
      notes?: {
        list: () => Promise<CliInvokeResult & { notes?: unknown[] }>
        save: (note: ProjectNote) => Promise<CliInvokeResult>
        delete: (noteId: string) => Promise<CliInvokeResult & { deleted?: boolean }>
      }
      canvas?: {
        list: () => Promise<CliInvokeResult & { nodes?: PersistedCanvasNode[] }>
        save: (
          node: PersistedCanvasNode,
        ) => Promise<CliInvokeResult & { node?: PersistedCanvasNode }>
        delete: (nodeId: string) => Promise<CliInvokeResult & { deleted?: boolean }>
        clear: () => Promise<
          CliInvokeResult & {
            nodesDeleted?: number
            edgesDeleted?: number
            filesDeleted?: number
          }
        >
        exportBundle: (state: {
          nodes: PersistedCanvasNode[]
          edges: PersistedCanvasEdge[]
        }) => Promise<CliInvokeResult & { bundle?: unknown }>
        validateImport: (content: string) => Promise<
          CliInvokeResult & {
            nodeCount?: number
            edgeCount?: number
            fileCount?: number
          }
        >
        importBundle: (content: string) => Promise<
          CliInvokeResult & {
            nodes?: PersistedCanvasNode[]
            edges?: PersistedCanvasEdge[]
            filesImported?: number
          }
        >
        listEdges: () => Promise<CliInvokeResult & { edges?: PersistedCanvasEdge[] }>
        saveEdge: (
          edge: PersistedCanvasEdge,
        ) => Promise<CliInvokeResult & { edge?: PersistedCanvasEdge }>
        deleteEdge: (edgeId: string) => Promise<CliInvokeResult & { deleted?: boolean }>
        getFileLinkPrompt: () => Promise<
          CliInvokeResult & { prompt?: string | null }
        >
        setFileLinkPrompt: (prompt: string) => Promise<CliInvokeResult>
        getFileBootstrapPrompt: () => Promise<
          CliInvokeResult & { prompt?: string | null }
        >
        setFileBootstrapPrompt: (prompt: string) => Promise<CliInvokeResult>
        getQualityStandard: () => Promise<
          CliInvokeResult & { prompt?: string | null; enabled?: boolean }
        >
        setQualityStandard: (params: {
          prompt?: string
          enabled?: boolean
        }) => Promise<CliInvokeResult>
        getSkills: () => Promise<CliInvokeResult & { skills?: CanvasSkill[] }>
        setSkills: (
          skills: CanvasSkill[],
        ) => Promise<CliInvokeResult & { skills?: CanvasSkill[] }>
        listAvailableSkills: () => Promise<
          CliInvokeResult & { skills?: CanvasSkill[]; communityEnabled?: boolean }
        >
        setSkillsSettings: (params: {
          communityEnabled?: boolean
          hiddenBuiltinIds?: string[]
        }) => Promise<CliInvokeResult>
      }
      canvasFiles?: {
        list: () => Promise<CliInvokeResult & { files?: string[] }>
        read: (params: {
          name: string
        }) => Promise<CliInvokeResult & { name?: string; content?: string }>
        write: (params: {
          name: string
          content: string
        }) => Promise<CliInvokeResult & { name?: string }>
        resolve: (params: {
          name: string
        }) => Promise<CliInvokeResult & { name?: string; path?: string }>
        watch: (params: { name: string }) => Promise<CliInvokeResult>
        unwatch: (params: { name: string }) => Promise<CliInvokeResult>
        onChanged: (
          callback: (event: { name: string }) => void,
        ) => () => void
      }
      /** Contextos imutáveis e temporários entregues aos terminais de agentes. */
      contextFiles?: {
        write: (params: {
          sessionId: string
          kind?: string
          source?: string
          content: string
        }) => Promise<CliInvokeResult & { path?: string; name?: string; bytes?: number }>
        release: (params: { sessionId: string }) => Promise<CliInvokeResult & { removed?: number }>
      }
      /**
       * Arquivos de texto que já existem no disco, abertos num bloco do canvas.
       * Ao contrário de `canvasFiles`, o bloco não é dono do arquivo — só aponta
       * para ele, então nada é criado nem apagado por aqui.
       */
      textFiles?: {
        /** Abre o seletor nativo; escolher é o que autoriza o caminho. */
        pick: () => Promise<
          CliInvokeResult & { canceled?: boolean; path?: string; name?: string }
        >
        /** Autoriza um arquivo alcançado por dentro de um projeto registrado. */
        openInProject: (params: {
          path: string
        }) => Promise<CliInvokeResult & { path?: string; name?: string }>
        read: (params: {
          path: string
        }) => Promise<
          CliInvokeResult & { path?: string; name?: string; content?: string }
        >
        write: (params: {
          path: string
          content: string
        }) => Promise<CliInvokeResult & { path?: string }>
        /** Editor de terminal a usar: `$VISUAL`/`$EDITOR`, senão o primeiro do PATH. */
        resolveEditor: () => Promise<
          CliInvokeResult & { editor?: { command: string; args: string[] } }
        >
        watch: (params: { path: string }) => Promise<CliInvokeResult>
        unwatch: (params: { path: string }) => Promise<CliInvokeResult>
        onChanged: (callback: (event: { path: string }) => void) => () => void
      }
      automations?: {
        list: () => Promise<
          CliInvokeResult & { automations?: AutomationDefinition[] }
        >
        save: (
          automation: AutomationDefinition,
        ) => Promise<CliInvokeResult & { automation?: AutomationDefinition }>
        delete: (
          automationId: string,
        ) => Promise<CliInvokeResult & { deleted?: boolean }>
      }
      models?: {
        list: () => Promise<CliInvokeResult & { models?: Model[] }>
        save: (model: Model) => Promise<CliInvokeResult & { model?: Model }>
        delete: (modelId: string) => Promise<CliInvokeResult & { deleted?: boolean }>
      }
      agentModels?: {
        get: () => Promise<CliInvokeResult & { catalog?: AgentModelCatalog }>
        refresh: () => Promise<CliInvokeResult & { catalog?: AgentModelCatalog }>
      }
      cliAccounts?: {
        list: (providerId?: string) => Promise<{
          ok: boolean
          accounts?: CliAccount[]
          secretStorage?: { ok: boolean; reason: string | null }
          message?: string
        }>
        create: (params: { providerId: string; label: string }) => Promise<{
          ok: boolean
          account?: CliAccount
          message?: string
        }>
        remove: (accountId: string) => Promise<{
          ok: boolean
          removed?: boolean
          message?: string
        }>
        setSecret: (params: { accountId: string; secret: string }) => Promise<{
          ok: boolean
          message?: string
        }>
      }
      agentUsage?: {
        list: () => Promise<AgentUsageDashboard>
        refresh: () => Promise<AgentUsageDashboard>
        addAccount: (params: {
          providerId: string
          label: string
          identityHint?: string
        }) => Promise<AgentUsageMutationResult>
        removeAccount: (accountId: string) => Promise<AgentUsageMutationResult>
        claudeStatuslineStatus: () => Promise<ClaudeStatuslineState>
        enableClaudeStatusline: () => Promise<ClaudeStatuslineState>
        disableClaudeStatusline: () => Promise<ClaudeStatuslineState>
        onChanged: (
          callback: (dashboard: AgentUsageDashboard) => void,
        ) => () => void
      }
      systemDesign?: {
        getConfig: () => Promise<
          CliInvokeResult & { config?: SystemDesignConfig }
        >
        saveConfig: (
          partial: Partial<SystemDesignConfig>,
        ) => Promise<CliInvokeResult & { config?: SystemDesignConfig }>
        listDocuments: () => Promise<
          CliInvokeResult & { documents?: SystemDesignDocumentSummary[] }
        >
        getDocument: (
          path: string,
        ) => Promise<
          CliInvokeResult & { document?: SystemDesignDocument }
        >
        sync: () => Promise<
          CliInvokeResult & {
            config?: SystemDesignConfig
            indexedCount?: number
            removedCount?: number
          }
        >
        resetCache: () => Promise<
          CliInvokeResult & { cleared?: number; config?: SystemDesignConfig }
        >
      }
      chats?: {
        list: (params?: {
          limit?: number
        }) => Promise<CliInvokeResult & { sessions?: unknown[] }>
        get: (chatId: string) => Promise<
          CliInvokeResult & { session?: unknown | null }
        >
        save: (session: ChatSession) => Promise<
          CliInvokeResult & { session?: unknown }
        >
        delete: (chatId: string) => Promise<CliInvokeResult & { deleted?: boolean }>
      }
      files?: {
        readImageAttachment: (params: {
          path: string
          name?: string
          type?: string
        }) => Promise<ReadImageAttachmentResult>
        saveAttachment: (params: {
          name: string
          type: string
          data: ArrayBuffer
        }) => Promise<SaveAttachmentResult>
        /**
         * Saves whatever image the OS clipboard holds. Used when the paste
         * event reached the renderer without the bitmap, which happens with
         * several Linux screenshot tools.
         */
        saveClipboardImage: () => Promise<SaveAttachmentResult>
        saveTextFile: (params: {
          defaultPath: string
          content: string
          filters?: Array<{ name: string; extensions: string[] }>
        }) => Promise<CliInvokeResult & { canceled?: boolean; filePath?: string }>
      }
      settings?: {
        loadOrchestrator: () => Promise<
          CliInvokeResult & { settings?: unknown | null }
        >
        saveOrchestrator: (
          settings: OrchestratorSettings,
        ) => Promise<CliInvokeResult>
      }
      updates?: {
        getStatus: () => Promise<CliInvokeResult & { status?: UpdateStatus }>
        check: () => Promise<
          CliInvokeResult & { status?: UpdateStatus; updateInfo?: unknown }
        >
        install: () => Promise<CliInvokeResult & { status?: UpdateStatus }>
        onStatus: (callback: (status: UpdateStatus) => void) => () => void
      }
      /**
       * Instalação automática das CLIs de IA, em segundo plano na primeira
       * abertura do app instalado.
       */
      cliSetup?: {
        getStatus: () => Promise<CliInvokeResult & { status?: CliSetupStatus }>
        retry: () => Promise<CliInvokeResult & { status?: CliSetupStatus }>
        onStatus: (callback: (status: CliSetupStatus) => void) => () => void
      }
      fileOpen?: {
        getPending: () => Promise<{ filePath: string; ext: string } | null>
        onOpened: (callback: (data: { filePath: string; ext: string }) => void) => () => void
      }
      git?: {
        getSummary: (params: {
          projectPath: string
        }) => Promise<{
          ok: boolean
          message?: string
          summary?: GitProjectSummary
        }>
        stageAll: (params: {
          projectPath: string
        }) => Promise<{
          ok: boolean
          message?: string
          summary?: GitProjectSummary
        }>
        unstageAll: (params: {
          projectPath: string
        }) => Promise<{
          ok: boolean
          message?: string
          summary?: GitProjectSummary
        }>
        commit: (params: {
          projectPath: string
          message: string
        }) => Promise<{
          ok: boolean
          message?: string
          output?: string
          summary?: GitProjectSummary
        }>
      }
      fetchAll?: {
        getState: () => Promise<{
          ok: boolean
          phase?: FetchAllProgress['phase']
          busy?: boolean
          plan?: FetchAllPlan | null
          scanMode?: string
        }>
        getSettings: () => Promise<{
          ok: boolean
          message?: string
          settings?: FetchAllSettings
        }>
        saveSettings: (settings: FetchAllSettings) => Promise<{
          ok: boolean
          message?: string
          settings?: FetchAllSettings
        }>
        getScope: () => Promise<{
          ok: boolean
          message?: string
          scope?: { configured: string[]; resolved: string[]; available: string[] }
        }>
        scan: (params?: { useCache?: boolean }) => Promise<{
          ok: boolean
          message?: string
          cancelled?: boolean
          plan?: FetchAllPlan
          scanMode?: string
        }>
        execute: (params?: { autoCommit?: boolean }) => Promise<{
          ok: boolean
          message?: string
          results?: FetchAllActionResult[]
          reportPath?: string
        }>
        cancel: () => Promise<{ ok: boolean; cancelled: boolean }>
        ignorePath: (params: { path: string }) => Promise<{
          ok: boolean
          message?: string
          settings?: FetchAllSettings
          plan?: FetchAllPlan | null
        }>
        unignorePath: (params: { path: string }) => Promise<{
          ok: boolean
          message?: string
          settings?: FetchAllSettings
        }>
        onProgress: (callback: (progress: FetchAllProgress) => void) => () => void
        listRequests: () => Promise<{
          ok: boolean
          message?: string
          requests?: FetchAllAgentRequest[]
        }>
        resolveRequest: (params: { id: string; aceito: boolean }) => Promise<{
          ok: boolean
          message?: string
          resolved?: FetchAllAgentRequest | null
          resultado?: {
            ok: boolean
            message?: string
            results?: FetchAllActionResult[]
            reportPath?: string
          }
        }>
        onRequests: (
          callback: (data: { requests: FetchAllAgentRequest[] }) => void,
        ) => () => void
      }
      qaLogger?: {
        getEntries: () => Promise<QaLogEntry[]>
        clear: () => Promise<CliInvokeResult>
        onEntry: (callback: (entry: QaLogEntry) => void) => () => void
        onCleared: (callback: () => void) => () => void
      }
    }
  }
}

export {}

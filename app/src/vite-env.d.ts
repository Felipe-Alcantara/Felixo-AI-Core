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

type DetectedRepo = { name: string; path: string }

type PersistedCanvasEdge = {
  id: string
  source: string
  target: string
  createdAt?: string
  updatedAt?: string
}

type PersistedCanvasNode = {
  id: string
  type: 'terminal' | 'note' | 'group' | 'file'
  parentId?: string | null
  position: { x: number; y: number }
  width?: number | null
  height?: number | null
  data: Record<string, unknown>
  createdAt?: string
  updatedAt?: string
}
type CliStreamEvent = StreamEvent | OrchestrationStreamEvent

type CliInvokeResult = {
  ok: boolean
  message?: string
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
  stdout?: string
  stderr?: string
}

type OfficialCliLoginResult = CliInvokeResult & {
  command?: string
  args?: string[]
  manualCommand?: string
}

type OfficialCliAccountStatusResult = CliInvokeResult & {
  authStatus?: 'logged_in' | 'logged_out' | 'unknown'
  stdout?: string
  stderr?: string
}

type OfficialCliSwitchAccountResult = OfficialCliLoginResult & {
  logout?: CliInvokeResult & {
    stdout?: string
    stderr?: string
  }
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
        }) => Promise<OfficialCliInstallResult>
        openOfficialLogin: (params: {
          id: string
        }) => Promise<OfficialCliLoginResult>
        getOfficialAccountStatus: (params: {
          id: string
        }) => Promise<OfficialCliAccountStatusResult>
        switchOfficialAccount: (params: {
          id: string
        }) => Promise<OfficialCliSwitchAccountResult>
        orchestrationStatus: (params?: {
          runId?: string
          threadId?: string
        }) => Promise<CliOrchestrationStatusResult>
        onStream: (callback: (event: CliStreamEvent) => void) => () => void
        onRawOutput: (callback: (event: TerminalOutputEvent) => void) => () => void
        onTerminalOutput: (callback: (event: TerminalOutputEvent) => void) => () => void
      }
      pty?: {
        spawn: (params: {
          sessionId: string
          command?: string
          args?: string[]
          cwd?: string
          cols?: number
          rows?: number
        }) => Promise<CliInvokeResult & { sessionId?: string }>
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

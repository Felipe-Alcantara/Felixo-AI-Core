/// <reference types="vite/client" />

import type {
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
  TerminalOutputEvent,
} from './features/chat/types'

type DetectedRepo = { name: string; path: string }
type CliStreamEvent = StreamEvent | OrchestrationStreamEvent

type CliInvokeResult = {
  ok: boolean
  message?: string
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
      }
      notes?: {
        list: () => Promise<CliInvokeResult & { notes?: unknown[] }>
        save: (note: ProjectNote) => Promise<CliInvokeResult>
        delete: (noteId: string) => Promise<CliInvokeResult & { deleted?: boolean }>
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

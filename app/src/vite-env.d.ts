/// <reference types="vite/client" />

import type {
  GitProjectSummary,
  Model,
  OrchestrationRun,
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

type CliOrchestrationStatusResult = CliInvokeResult & {
  run?: OrchestrationRun
  runs?: OrchestrationRun[]
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
          model: Model
          cwd?: string
        }) => Promise<CliInvokeResult>
        stop: (params: {
          sessionId: string
          threadId?: string
        }) => Promise<CliInvokeResult>
        resetThread: (params: {
          threadId: string
        }) => Promise<CliInvokeResult & { killed?: boolean }>
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

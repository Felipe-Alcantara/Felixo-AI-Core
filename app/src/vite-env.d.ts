/// <reference types="vite/client" />

import type {
  Model,
  QaLogEntry,
  RawOutputEvent,
  StreamEvent,
} from './features/chat/types'

type DetectedRepo = { name: string; path: string }

type CliInvokeResult = {
  ok: boolean
  message?: string
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
          model: Model
          cwd?: string
        }) => Promise<CliInvokeResult>
        stop: (params: {
          sessionId: string
          threadId?: string
        }) => Promise<CliInvokeResult>
        onStream: (callback: (event: StreamEvent) => void) => () => void
        onRawOutput: (callback: (event: RawOutputEvent) => void) => () => void
      }
      projects?: {
        pickFolder: () => Promise<string | null>
        detectRepos: (folderPath: string) => Promise<DetectedRepo[]>
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

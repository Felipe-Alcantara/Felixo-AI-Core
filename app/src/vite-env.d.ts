/// <reference types="vite/client" />

import type { Model, QaLogEntry, StreamEvent } from './features/chat/types'

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
          prompt: string
          model: Model
        }) => Promise<CliInvokeResult>
        stop: (params: { sessionId: string }) => Promise<CliInvokeResult>
        onStream: (callback: (event: StreamEvent) => void) => () => void
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

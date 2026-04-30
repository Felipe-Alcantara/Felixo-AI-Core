import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { RawOutputEvent } from '../types'

export type TerminalSessionStatus = 'running' | 'completed' | 'error' | 'stopped'

export type TerminalOutputChunk = RawOutputEvent & {
  id: number
  createdAt: string
}

export type TerminalOutputSession = {
  sessionId: string
  chunks: TerminalOutputChunk[]
  status: TerminalSessionStatus
  startedAt: string
  updatedAt: string
  outputSize: number
}

type TerminalOutputSessions = Record<string, TerminalOutputSession>
const textEncoder = new TextEncoder()

export function useTerminalOutput() {
  const [sessionsById, setSessionsById] = useState<TerminalOutputSessions>({})
  const nextChunkId = useRef(1)

  const startSession = useCallback((sessionId: string) => {
    const now = new Date().toISOString()

    setSessionsById((currentSessions) => {
      const currentSession = currentSessions[sessionId]

      return {
        ...currentSessions,
        [sessionId]: {
          sessionId,
          chunks: currentSession?.chunks ?? [],
          status: 'running',
          startedAt: currentSession?.startedAt ?? now,
          updatedAt: now,
          outputSize: currentSession?.outputSize ?? 0,
        },
      }
    })
  }, [])

  const markSessionStatus = useCallback(
    (sessionId: string, status: TerminalSessionStatus) => {
      const now = new Date().toISOString()

      setSessionsById((currentSessions) => {
        const currentSession = currentSessions[sessionId]

        return {
          ...currentSessions,
          [sessionId]: {
            sessionId,
            chunks: currentSession?.chunks ?? [],
            status,
            startedAt: currentSession?.startedAt ?? now,
            updatedAt: now,
            outputSize: currentSession?.outputSize ?? 0,
          },
        }
      })
    },
    [],
  )

  const clearSessions = useCallback(() => {
    setSessionsById({})
  }, [])

  const appendRawOutput = useCallback((event: RawOutputEvent) => {
    const now = new Date().toISOString()
    const chunk: TerminalOutputChunk = {
      ...event,
      id: nextChunkId.current,
      createdAt: now,
    }
    nextChunkId.current += 1

    setSessionsById((currentSessions) => {
      const currentSession = currentSessions[event.sessionId]
      const status =
        currentSession?.status === 'completed' ||
        currentSession?.status === 'error' ||
        currentSession?.status === 'stopped'
          ? currentSession.status
          : 'running'

      return {
        ...currentSessions,
        [event.sessionId]: {
          sessionId: event.sessionId,
          chunks: [...(currentSession?.chunks ?? []), chunk],
          status,
          startedAt: currentSession?.startedAt ?? now,
          updatedAt: now,
          outputSize:
            (currentSession?.outputSize ?? 0) +
            textEncoder.encode(event.chunk).length,
        },
      }
    })
  }, [])

  useEffect(() => {
    return window.felixo?.cli?.onRawOutput?.(appendRawOutput)
  }, [appendRawOutput])

  const sessions = useMemo(
    () =>
      Object.values(sessionsById).sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      ),
    [sessionsById],
  )

  return {
    sessions,
    sessionsById,
    startSession,
    markSessionStatus,
    clearSessions,
  }
}

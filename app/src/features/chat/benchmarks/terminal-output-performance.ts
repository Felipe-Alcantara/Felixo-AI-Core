import type { TerminalOutputEvent } from '../types'
import {
  appendTerminalOutputToSession,
  createTerminalOutputSession,
  getVisibleChars,
  inferSessionStatusFromTerminalEvent,
  shouldMergeTerminalOutput,
  type TerminalOutputSession,
} from '../hooks/terminal-output-store'

export const TERMINAL_OUTPUT_PERFORMANCE_SCENARIOS = [
  'curta',
  'longa',
  'alta-frequencia',
  'multiplas-sessoes',
] as const

export const TERMINAL_OUTPUT_PERFORMANCE_MODES = ['baseline', 'atual'] as const

export type TerminalOutputPerformanceScenario =
  (typeof TERMINAL_OUTPUT_PERFORMANCE_SCENARIOS)[number]

export type TerminalOutputPerformanceMode =
  (typeof TERMINAL_OUTPUT_PERFORMANCE_MODES)[number]

export type TerminalOutputPerformanceState = {
  sessions: Record<string, TerminalOutputSession>
  nextChunkId: number
}

const SCENARIO_SHAPES: Record<
  TerminalOutputPerformanceScenario,
  { sessions: number; eventsPerSession: number }
> = {
  curta: { sessions: 1, eventsPerSession: 40 },
  longa: { sessions: 1, eventsPerSession: 600 },
  'alta-frequencia': { sessions: 2, eventsPerSession: 320 },
  'multiplas-sessoes': { sessions: 4, eventsPerSession: 120 },
}

export function createTerminalOutputPerformanceFixture(
  scenario: TerminalOutputPerformanceScenario,
): TerminalOutputEvent[] {
  const shape = SCENARIO_SHAPES[scenario]
  const events: TerminalOutputEvent[] = []

  for (let sessionIndex = 0; sessionIndex < shape.sessions; sessionIndex += 1) {
    const sessionId = `benchmark-session-${sessionIndex + 1}`
    events.push({
      sessionId,
      source: 'system',
      kind: 'lifecycle',
      severity: 'info',
      title: 'Iniciado',
      chunk: `Sessão ${sessionIndex + 1} iniciada.`,
      metadata: {
        cliType: sessionIndex % 2 === 0 ? 'claude' : 'codex',
        modelName: sessionIndex % 2 === 0 ? 'claude-sonnet' : 'gpt-5',
        promptHint: `fixture ${scenario}`,
      },
    })

    for (let eventIndex = 0; eventIndex < shape.eventsPerSession; eventIndex += 1) {
      events.push(createPerformanceEvent(sessionId, eventIndex))
    }

    events.push({
      sessionId,
      source: 'system',
      kind: 'metrics',
      severity: 'info',
      title: 'Concluído',
      chunk: `Sessão ${sessionIndex + 1} concluída.`,
    })
  }

  return events
}

export function createEmptyTerminalOutputPerformanceState(): TerminalOutputPerformanceState {
  return { sessions: {}, nextChunkId: 1 }
}

export function appendTerminalOutputPerformanceEvents(
  state: TerminalOutputPerformanceState,
  events: TerminalOutputEvent[],
  mode: TerminalOutputPerformanceMode,
  now: string,
): TerminalOutputPerformanceState {
  let nextState = state

  for (const event of events) {
    const currentSession = nextState.sessions[event.sessionId]
    const nextSession =
      mode === 'atual'
        ? appendTerminalOutputToSession(
            currentSession,
            event,
            nextState.nextChunkId,
            now,
            true,
          )
        : appendBaselineTerminalOutput(
            currentSession,
            event,
            nextState.nextChunkId,
            now,
          )
    const hasNewLogicalChunk =
      !currentSession ||
      nextSession.totalChunkCount > currentSession.totalChunkCount

    nextState = {
      sessions: {
        ...nextState.sessions,
        [event.sessionId]: nextSession,
      },
      nextChunkId: nextState.nextChunkId + (hasNewLogicalChunk ? 1 : 0),
    }
  }

  return nextState
}

function createPerformanceEvent(
  sessionId: string,
  eventIndex: number,
): TerminalOutputEvent {
  const pattern = eventIndex % 8

  if (pattern === 0 || pattern === 1) {
    return {
      sessionId,
      source: 'stdout',
      kind: 'assistant',
      severity: 'info',
      chunk: `resposta ${eventIndex} — `,
      metadata: { streamItemId: `answer-${Math.floor(eventIndex / 8)}` },
    }
  }

  if (pattern === 2 || pattern === 7) {
    return {
      sessionId,
      source: 'system',
      kind: 'tool',
      severity: 'info',
      title: 'Ferramenta',
      chunk: `tool ${eventIndex}: ${'resultado '.repeat(4)}`,
      metadata: { toolName: 'fixture-tool', callIndex: eventIndex },
    }
  }

  if (pattern === 3) {
    return {
      sessionId,
      source: 'stderr',
      kind: 'stderr',
      severity: 'warn',
      title: 'Aviso da CLI',
      chunk: `aviso ${eventIndex}: saída de diagnóstico`,
    }
  }

  if (pattern === 4) {
    return {
      sessionId,
      source: 'stdout',
      kind: 'assistant',
      severity: 'info',
      chunk: `resposta final ${eventIndex}`,
      metadata: { streamItemId: `answer-${Math.floor(eventIndex / 8)}-final` },
    }
  }

  if (pattern === 5) {
    return {
      sessionId,
      source: 'system',
      kind: 'lifecycle',
      severity: 'debug',
      title: 'Progresso',
      chunk: `progresso ${eventIndex}%`,
    }
  }

  return {
    sessionId,
    source: 'stdout',
    chunk: `stdout ${eventIndex}: ${'x'.repeat(36)}`,
  }
}

function appendBaselineTerminalOutput(
  currentSession: TerminalOutputSession | undefined,
  event: TerminalOutputEvent,
  nextChunkId: number,
  now: string,
): TerminalOutputSession {
  const session =
    currentSession ??
    createTerminalOutputSession(event.sessionId, event.parentThreadId, now, true)
  const lastChunk = session.chunks.at(-1)
  const shouldMerge = Boolean(lastChunk && shouldMergeTerminalOutput(lastChunk, event))
  const chunk = shouldMerge && lastChunk
    ? {
        ...lastChunk,
        chunk: `${lastChunk.chunk}${event.chunk}`,
        metadata: { ...lastChunk.metadata, ...event.metadata },
      }
    : { ...event, id: nextChunkId, createdAt: now }
  const chunks = shouldMerge
    ? [...session.chunks.slice(0, -1), chunk]
    : [...session.chunks, chunk]
  const totalChunkCount = session.totalChunkCount + (shouldMerge ? 0 : 1)

  return {
    ...session,
    parentThreadId: event.parentThreadId ?? session.parentThreadId,
    chunks,
    status: inferSessionStatusFromTerminalEvent(event, session.status),
    updatedAt: now,
    outputSize: session.outputSize + new TextEncoder().encode(event.chunk).byteLength,
    totalChunkCount,
    droppedChunkCount: 0,
    visibleChars: getVisibleChars(chunks),
    historyAvailable: true,
    startMetadata:
      session.startMetadata ??
      (event.kind === 'lifecycle' ? event.metadata : undefined),
  }
}

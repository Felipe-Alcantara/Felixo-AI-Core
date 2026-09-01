import type { TerminalOutputEvent } from '../types'

export const TERMINAL_OUTPUT_VISUAL_POLICY = Object.freeze({
  maxChunks: 240,
  maxChars: 240_000,
  maxChunkChars: 32_000,
  maxOrchestratorChunks: 720,
})

const textEncoder = new TextEncoder()
const TRUNCATION_MARKER = '… parte anterior fora da janela visual …\n'

export type TerminalSessionStatus = 'running' | 'completed' | 'error' | 'stopped'

export type TerminalOutputTrimPolicy = Readonly<{
  maxChunks: number
  maxChars: number
  maxChunkChars: number
}>

export type TerminalOutputVisualPolicy = TerminalOutputTrimPolicy & Readonly<{
  maxOrchestratorChunks: number
}>

export type TerminalOutputChunk = TerminalOutputEvent & {
  id: number
  createdAt: string
  isTextTruncated?: boolean
}

export type TerminalOutputSession = {
  sessionId: string
  parentThreadId?: string
  chunks: TerminalOutputChunk[]
  status: TerminalSessionStatus
  startedAt: string
  updatedAt: string
  outputSize: number
  totalChunkCount: number
  droppedChunkCount: number
  visibleChars: number
  historyAvailable: boolean
  startMetadata?: TerminalOutputEvent['metadata']
}

export type TerminalOutputSessions = Record<string, TerminalOutputSession>

export function createTerminalOutputSession(
  sessionId: string,
  parentThreadId: string | undefined,
  now: string,
  historyAvailable: boolean,
): TerminalOutputSession {
  return {
    sessionId,
    parentThreadId,
    chunks: [],
    status: 'running',
    startedAt: now,
    updatedAt: now,
    outputSize: 0,
    totalChunkCount: 0,
    droppedChunkCount: 0,
    visibleChars: 0,
    historyAvailable,
  }
}

export function appendTerminalOutputToSession(
  currentSession: TerminalOutputSession | undefined,
  event: TerminalOutputEvent,
  nextChunkId: number,
  now: string,
  historyAvailable: boolean,
): TerminalOutputSession {
  const session =
    currentSession ??
    createTerminalOutputSession(
      event.sessionId,
      event.parentThreadId,
      now,
      historyAvailable,
    )
  const currentChunks = session.chunks
  const lastChunk = currentChunks[currentChunks.length - 1]
  const shouldMerge = shouldMergeTerminalOutput(lastChunk, event)
  const chunk: TerminalOutputChunk = shouldMerge
    ? createMergedChunk(lastChunk, event)
    : createVisibleChunk(event, nextChunkId, now)
  const nextChunks = shouldMerge
    ? [...currentChunks.slice(0, -1), chunk]
    : [...currentChunks, chunk]
  const totalChunkCount =
    session.totalChunkCount + (shouldMerge ? 0 : 1)
  const chunks = trimTerminalOutputChunks(nextChunks)

  return {
    sessionId: event.sessionId,
    parentThreadId: event.parentThreadId ?? session.parentThreadId,
    chunks,
    status: inferSessionStatusFromTerminalEvent(event, session.status),
    startedAt: session.startedAt,
    updatedAt: now,
    outputSize:
      session.outputSize + textEncoder.encode(event.chunk).byteLength,
    totalChunkCount,
    droppedChunkCount: Math.max(0, totalChunkCount - chunks.length),
    visibleChars: getVisibleChars(chunks),
    historyAvailable: session.historyAvailable || historyAvailable,
    startMetadata:
      session.startMetadata ??
      (event.kind === 'lifecycle' ? event.metadata : undefined),
  }
}

export function markTerminalOutputSessionStatus(
  currentSession: TerminalOutputSession | undefined,
  sessionId: string,
  status: TerminalSessionStatus,
  now: string,
  historyAvailable: boolean,
): TerminalOutputSession {
  const session =
    currentSession ??
    createTerminalOutputSession(sessionId, undefined, now, historyAvailable)

  return {
    ...session,
    status,
    updatedAt: now,
    historyAvailable: session.historyAvailable || historyAvailable,
  }
}

export function trimTerminalOutputChunks(
  chunks: TerminalOutputChunk[],
  policy: TerminalOutputTrimPolicy = TERMINAL_OUTPUT_VISUAL_POLICY,
) {
  if (chunks.length <= policy.maxChunks && getVisibleChars(chunks) <= policy.maxChars) {
    return chunks
  }

  let firstVisibleIndex = chunks.length
  let visibleChars = 0

  for (let index = chunks.length - 1; index >= 0; index -= 1) {
    if (chunks.length - index > policy.maxChunks) {
      break
    }

    const nextChars = visibleChars + chunks[index].chunk.length
    if (nextChars > policy.maxChars && firstVisibleIndex < chunks.length) {
      break
    }

    firstVisibleIndex = index
    visibleChars = nextChars
  }

  return chunks.slice(firstVisibleIndex)
}

export function getVisibleChars(chunks: TerminalOutputChunk[]) {
  return chunks.reduce((total, chunk) => total + chunk.chunk.length, 0)
}

export function shouldMergeTerminalOutput(
  lastChunk: TerminalOutputChunk | undefined,
  event: TerminalOutputEvent,
) {
  return (
    event.kind === 'assistant' &&
    lastChunk?.kind === 'assistant' &&
    lastChunk.sessionId === event.sessionId &&
    lastChunk.source === event.source &&
    lastChunk.severity === event.severity &&
    getStreamItemId(lastChunk.metadata) === getStreamItemId(event.metadata)
  )
}

export function inferSessionStatusFromTerminalEvent(
  event: TerminalOutputEvent,
  currentStatus: TerminalSessionStatus | undefined,
): TerminalSessionStatus {
  if (
    currentStatus === 'completed' ||
    currentStatus === 'error' ||
    currentStatus === 'stopped'
  ) {
    return currentStatus
  }

  if (event.kind === 'error') {
    return 'error'
  }

  if (event.kind === 'metrics' && event.title === 'Concluído') {
    return 'completed'
  }

  if (
    event.kind === 'lifecycle' &&
    (event.title === 'Interrompido' || event.title === 'Thread reiniciada')
  ) {
    return 'stopped'
  }

  return 'running'
}

function createVisibleChunk(
  event: TerminalOutputEvent,
  id: number,
  now: string,
): TerminalOutputChunk {
  const visibleText = limitChunkText(event.chunk)

  return {
    ...event,
    chunk: visibleText.text,
    id,
    createdAt: now,
    ...(visibleText.isTruncated
      ? { isTextTruncated: true }
      : {}),
  }
}

function createMergedChunk(
  lastChunk: TerminalOutputChunk,
  event: TerminalOutputEvent,
): TerminalOutputChunk {
  const visibleText = limitChunkText(`${lastChunk.chunk}${event.chunk}`)

  return {
    ...lastChunk,
    chunk: visibleText.text,
    metadata: {
      ...lastChunk.metadata,
      ...event.metadata,
    },
    ...(visibleText.isTruncated || lastChunk.isTextTruncated
      ? { isTextTruncated: true }
      : { isTextTruncated: undefined }),
  }
}

function limitChunkText(value: string) {
  const maxChars = TERMINAL_OUTPUT_VISUAL_POLICY.maxChunkChars

  if (value.length <= maxChars) {
    return { text: value, isTruncated: false }
  }

  const availableChars = Math.max(0, maxChars - TRUNCATION_MARKER.length)
  return {
    text: `${TRUNCATION_MARKER}${value.slice(-availableChars)}`,
    isTruncated: true,
  }
}

function getStreamItemId(
  metadata: TerminalOutputEvent['metadata'] | undefined,
) {
  const value = metadata?.streamItemId

  return typeof value === 'string' ? value : ''
}

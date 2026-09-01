'use strict'

const fs = require('node:fs')
const fsPromises = require('node:fs/promises')
const path = require('node:path')

const TERMINAL_LOG_VERSION = 1
const TERMINAL_LOG_FILE_PATTERN = /^session-\d+-\d+-\d+\.jsonl$/
const TERMINAL_OUTPUT_SOURCES = new Set(['stdout', 'stderr', 'system'])
const TERMINAL_OUTPUT_KINDS = new Set([
  'assistant',
  'error',
  'lifecycle',
  'metrics',
  'stderr',
  'tool',
])
const TERMINAL_OUTPUT_SEVERITIES = new Set([
  'debug',
  'info',
  'warn',
  'error',
])

/**
 * Guarda a saída completa da CLI fora do estado React.
 *
 * O arquivo é somente da execução atual do app. A UI mantém uma janela curta
 * em memória, enquanto o JSONL permite exportar toda a sessão sem transformar
 * cada evento em uma cópia do array do renderer. O arquivo é apagado quando o
 * usuário limpa os logs ou quando a execução seguinte do app começa.
 */
function createTerminalLogStore(options = {}) {
  const directory = normalizeDirectory(options.directory)
  fs.mkdirSync(directory, { recursive: true })
  removeStaleLogFiles(directory)

  let generation = 0
  let filePath = createLogFilePath(directory, generation)
  let writer = null
  let nextSequence = 1
  let ignoredSessionIds = new Set()
  let disposed = false

  function append(event) {
    const normalizedEvent = normalizeTerminalOutputEvent(event)

    if (
      disposed ||
      !normalizedEvent ||
      ignoredSessionIds.has(normalizedEvent.sessionId) ||
      (normalizedEvent.parentThreadId &&
        ignoredSessionIds.has(normalizedEvent.parentThreadId))
    ) {
      return false
    }

    const currentWriter = getWriter()
    const record = {
      version: TERMINAL_LOG_VERSION,
      sequence: nextSequence,
      capturedAt: new Date().toISOString(),
      event: normalizedEvent,
    }
    nextSequence += 1

    const line = `${JSON.stringify(record)}\n`
    currentWriter.pending += 1
    try {
      currentWriter.stream.write(line, 'utf8', (error) => {
        if (error) {
          currentWriter.error = normalizeError(error)
        }
        currentWriter.pending -= 1
        settleWriterWaiters(currentWriter)
      })
    } catch (error) {
      currentWriter.error = normalizeError(error)
      currentWriter.pending -= 1
      settleWriterWaiters(currentWriter)
    }

    return true
  }

  async function getSessions() {
    const currentWriter = writer
    if (currentWriter) {
      await flushWriter(currentWriter)
    }

    let content = ''
    try {
      content = await fsPromises.readFile(filePath, 'utf8')
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        throw error
      }
    }

    return aggregateTerminalLogRecords(content)
  }

  async function clear(options = {}) {
    ignoredSessionIds = new Set(
      Array.isArray(options.ignoreSessionIds)
        ? options.ignoreSessionIds.filter(
            (sessionId) => typeof sessionId === 'string' && sessionId,
          )
        : [],
    )

    const previousWriter = writer
    const previousFilePath = filePath
    generation += 1
    filePath = createLogFilePath(directory, generation)
    writer = null

    if (previousWriter) {
      await finishWriter(previousWriter)
    }

    await fsPromises.rm(previousFilePath, { force: true })

    return { ok: true }
  }

  async function dispose() {
    if (disposed) {
      return
    }

    disposed = true
    const currentWriter = writer
    const currentFilePath = filePath
    writer = null

    if (currentWriter) {
      await finishWriter(currentWriter)
    }

    await fsPromises.rm(currentFilePath, { force: true })
  }

  function getWriter() {
    if (writer) {
      return writer
    }

    writer = createWriter(filePath)
    return writer
  }

  return {
    append,
    clear,
    dispose,
    getSessions,
    getFilePath: () => filePath,
  }
}

function createWriter(filePath) {
  const currentWriter = {
    filePath,
    error: null,
    pending: 0,
    waiters: [],
    ended: false,
    stream: fs.createWriteStream(filePath, { flags: 'a', encoding: 'utf8' }),
  }

  currentWriter.stream.on('error', (error) => {
    currentWriter.error = normalizeError(error)
    settleWriterWaiters(currentWriter)
  })

  return currentWriter
}

function flushWriter(writer) {
  if (writer.error) {
    return Promise.reject(writer.error)
  }

  if (writer.pending === 0) {
    return Promise.resolve()
  }

  return new Promise((resolve, reject) => {
    writer.waiters.push({ resolve, reject })
  })
}

async function finishWriter(writer) {
  await flushWriter(writer)

  if (writer.ended) {
    return
  }

  await new Promise((resolve, reject) => {
    const onError = (error) => {
      writer.error = normalizeError(error)
      reject(writer.error)
    }

    writer.stream.once('error', onError)
    writer.stream.end(() => {
      writer.stream.removeListener('error', onError)
      writer.ended = true
      resolve()
    })
  })
}

function settleWriterWaiters(writer) {
  if (writer.pending !== 0 && !writer.error) {
    return
  }

  const waiters = writer.waiters.splice(0)
  for (const waiter of waiters) {
    if (writer.error) {
      waiter.reject(writer.error)
    } else {
      waiter.resolve()
    }
  }
}

function aggregateTerminalLogRecords(content) {
  const sessions = new Map()
  const lines = String(content ?? '').split('\n')

  for (const line of lines) {
    if (!line.trim()) {
      continue
    }

    let record
    try {
      record = JSON.parse(line)
    } catch {
      continue
    }

    const event = normalizeTerminalOutputEvent(record?.event)
    if (!event) {
      continue
    }

    const capturedAt = normalizeDateString(record?.capturedAt) ?? new Date().toISOString()
    const sequence = Number.isInteger(record?.sequence)
      ? record.sequence
      : Number.MAX_SAFE_INTEGER
    const session =
      sessions.get(event.sessionId) ?? createArchivedSession(event, capturedAt)

    appendEventToArchivedSession(session, event, sequence, capturedAt)
    sessions.set(event.sessionId, session)
  }

  return [...sessions.values()].sort(
    (left, right) =>
      new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
  )
}

function createArchivedSession(event, capturedAt) {
  return {
    sessionId: event.sessionId,
    parentThreadId: event.parentThreadId,
    chunks: [],
    status: 'running',
    startedAt: capturedAt,
    updatedAt: capturedAt,
    outputSize: 0,
    totalChunkCount: 0,
    droppedChunkCount: 0,
    visibleChars: 0,
    historyAvailable: true,
    startMetadata: undefined,
  }
}

function appendEventToArchivedSession(session, event, sequence, capturedAt) {
  const lastChunk = session.chunks[session.chunks.length - 1]
  const shouldMerge = shouldMergeTerminalOutput(lastChunk, event)
  const chunk = shouldMerge
    ? {
        ...lastChunk,
        chunk: `${lastChunk.chunk}${event.chunk}`,
        metadata: {
          ...lastChunk.metadata,
          ...event.metadata,
        },
      }
    : {
        ...event,
        id: Number.isSafeInteger(sequence) ? sequence : session.totalChunkCount + 1,
        createdAt: capturedAt,
      }

  session.chunks = shouldMerge
    ? [...session.chunks.slice(0, -1), chunk]
    : [...session.chunks, chunk]
  if (!shouldMerge) {
    session.totalChunkCount += 1
  }
  session.updatedAt = capturedAt
  session.outputSize += Buffer.byteLength(event.chunk, 'utf8')
  session.visibleChars = session.chunks.reduce(
    (total, currentChunk) => total + currentChunk.chunk.length,
    0,
  )
  session.status = inferSessionStatusFromTerminalEvent(event, session.status)

  if (
    !session.startMetadata &&
    event.kind === 'lifecycle' &&
    event.metadata
  ) {
    session.startMetadata = event.metadata
  }
}

function normalizeTerminalOutputEvent(event) {
  if (!event || typeof event !== 'object') {
    return null
  }

  const sessionId = typeof event.sessionId === 'string' ? event.sessionId.trim() : ''
  if (!sessionId) {
    return null
  }

  const source = TERMINAL_OUTPUT_SOURCES.has(event.source)
    ? event.source
    : 'system'
  const normalized = {
    sessionId,
    source,
    chunk: typeof event.chunk === 'string' ? event.chunk : String(event.chunk ?? ''),
  }

  if (typeof event.parentThreadId === 'string' && event.parentThreadId.trim()) {
    normalized.parentThreadId = event.parentThreadId.trim()
  }
  if (TERMINAL_OUTPUT_SEVERITIES.has(event.severity)) {
    normalized.severity = event.severity
  }
  if (TERMINAL_OUTPUT_KINDS.has(event.kind)) {
    normalized.kind = event.kind
  }
  if (typeof event.title === 'string' && event.title) {
    normalized.title = event.title
  }

  const metadata = normalizeMetadata(event.metadata)
  if (metadata) {
    normalized.metadata = metadata
  }

  return normalized
}

function normalizeMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return undefined
  }

  const normalized = {}
  for (const [key, value] of Object.entries(metadata)) {
    if (
      typeof value === 'string' ||
      typeof value === 'boolean' ||
      value === null ||
      (typeof value === 'number' && Number.isFinite(value))
    ) {
      normalized[key] = value
    }
  }

  return Object.keys(normalized).length > 0 ? normalized : undefined
}

function shouldMergeTerminalOutput(lastChunk, event) {
  return (
    event.kind === 'assistant' &&
    lastChunk?.kind === 'assistant' &&
    lastChunk.sessionId === event.sessionId &&
    lastChunk.source === event.source &&
    lastChunk.severity === event.severity &&
    getStreamItemId(lastChunk.metadata) === getStreamItemId(event.metadata)
  )
}

function getStreamItemId(metadata) {
  return typeof metadata?.streamItemId === 'string' ? metadata.streamItemId : ''
}

function inferSessionStatusFromTerminalEvent(event, currentStatus) {
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

function normalizeDirectory(directory) {
  if (typeof directory !== 'string' || !directory.trim()) {
    throw new Error('Diretorio dos logs de terminal nao informado.')
  }

  return path.resolve(directory)
}

function createLogFilePath(directory, generation) {
  return path.join(
    directory,
    `session-${process.pid}-${Date.now()}-${generation}.jsonl`,
  )
}

function removeStaleLogFiles(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isFile() || !TERMINAL_LOG_FILE_PATTERN.test(entry.name)) {
      continue
    }

    try {
      fs.rmSync(path.join(directory, entry.name), { force: true })
    } catch {
      // Um arquivo antigo bloqueado não deve impedir o app de iniciar.
    }
  }
}

function normalizeDateString(value) {
  if (typeof value !== 'string' || !value) {
    return null
  }

  const timestamp = new Date(value).getTime()
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null
}

function normalizeError(error) {
  return error instanceof Error ? error : new Error(String(error))
}

module.exports = {
  TERMINAL_LOG_FILE_PATTERN,
  aggregateTerminalLogRecords,
  createTerminalLogStore,
  inferSessionStatusFromTerminalEvent,
  normalizeTerminalOutputEvent,
  shouldMergeTerminalOutput,
}

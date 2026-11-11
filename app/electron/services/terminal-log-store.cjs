'use strict'

const fs = require('node:fs')
const fsPromises = require('node:fs/promises')
const path = require('node:path')
const { createJsonlLineReader } = require('./jsonl-line-reader.cjs')

const TERMINAL_LOG_VERSION = 1
const TERMINAL_LOG_FILE_PATTERN = /^session-\d+-\d+-\d+\.jsonl$/
// Teto da execução (decisão de 11/11/2026): dois arquivos de metade do teto que se revezam; ao
// encher o atual, o anterior sai inteiro, e a leitura vê sempre os últimos 128 a 256 MB.
const DEFAULT_MAX_BYTES = 256 * 1024 * 1024
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
  const segmentBytes = Math.max(
    1,
    Math.floor((Number.isFinite(options.maxBytes) ? options.maxBytes : DEFAULT_MAX_BYTES) / 2),
  )
  let currentBytes = 0
  // Arquivo que encheu: `{ filePath, done }`, onde `done` termina o writer dele.
  let previous = null
  let pendingRemoval = Promise.resolve()

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

    const record = {
      version: TERMINAL_LOG_VERSION,
      sequence: nextSequence,
      capturedAt: new Date().toISOString(),
      event: normalizedEvent,
    }
    nextSequence += 1

    const line = `${JSON.stringify(record)}\n`
    const lineBytes = Buffer.byteLength(line, 'utf8')
    if (currentBytes > 0 && currentBytes + lineBytes > segmentBytes) {
      rotate()
    }
    currentBytes += lineBytes

    const currentWriter = getWriter()
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

  function rotate() {
    const dropped = previous
    previous = {
      filePath,
      done: writer ? finishWriter(writer).catch(() => {}) : Promise.resolve(),
    }
    generation += 1
    filePath = createLogFilePath(directory, generation)
    writer = null
    currentBytes = 0

    if (dropped) {
      pendingRemoval = pendingRemoval
        .then(() => dropped.done)
        .then(() => fsPromises.rm(dropped.filePath, { force: true }))
        .catch(() => {})
    }
  }

  async function getSessions() {
    const currentWriter = writer
    const filePaths = previous ? [previous.filePath, filePath] : [filePath]
    await previous?.done
    if (currentWriter) {
      await flushWriter(currentWriter)
    }
    await pendingRemoval

    // Em fluxo, linha a linha: o arquivo pode ter centenas de MB, e lê-lo inteiro numa string (e
    // depois o array das linhas) dobrava ou triplicava esse pico no processo principal.
    const aggregator = createTerminalLogAggregator()
    for (const currentFilePath of filePaths) {
      await readLogLines(currentFilePath, aggregator.addLine)
    }

    return aggregator.result()
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
    const rotated = previous
    generation += 1
    filePath = createLogFilePath(directory, generation)
    writer = null
    currentBytes = 0
    previous = null

    if (previousWriter) {
      await finishWriter(previousWriter)
    }

    await fsPromises.rm(previousFilePath, { force: true })
    await removeRotated(rotated)

    return { ok: true }
  }

  async function dispose() {
    if (disposed) {
      return
    }

    disposed = true
    const currentWriter = writer
    const currentFilePath = filePath
    const rotated = previous
    writer = null
    previous = null

    if (currentWriter) {
      await finishWriter(currentWriter)
    }

    await fsPromises.rm(currentFilePath, { force: true })
    await removeRotated(rotated)
  }

  async function removeRotated(rotated) {
    await pendingRemoval
    if (rotated) {
      await rotated.done
      await fsPromises.rm(rotated.filePath, { force: true })
    }
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

async function readLogLines(filePath, onLine) {
  // Não o `readline`: ele também quebra em U+2028/U+2029, que o JSON guarda literais dentro do texto.
  const reader = createJsonlLineReader(onLine)

  try {
    for await (const chunk of fs.createReadStream(filePath, { encoding: 'utf8' })) {
      reader.push(chunk)
    }
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return
    }
    throw error
  }

  reader.flush()
}

function aggregateTerminalLogRecords(content) {
  const aggregator = createTerminalLogAggregator()

  for (const line of String(content ?? '').split('\n')) {
    aggregator.addLine(line)
  }

  return aggregator.result()
}

function createTerminalLogAggregator() {
  const sessions = new Map()

  return {
    addLine(line) {
      if (!line.trim()) {
        return
      }

      let record
      try {
        record = JSON.parse(line)
      } catch {
        return
      }

      const event = normalizeTerminalOutputEvent(record?.event)
      if (!event) {
        return
      }

      const capturedAt = normalizeDateString(record?.capturedAt) ?? new Date().toISOString()
      const sequence = Number.isInteger(record?.sequence)
        ? record.sequence
        : Number.MAX_SAFE_INTEGER
      const session =
        sessions.get(event.sessionId) ?? createArchivedSession(event, capturedAt)

      appendEventToArchivedSession(session, event, sequence, capturedAt)
      sessions.set(event.sessionId, session)
    },
    result() {
      return [...sessions.values()].sort(
        (left, right) =>
          new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
      )
    },
  }
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
  // No lugar, sem recopiar o array nem somar todos os pedaços de novo: a agregação era quadrática.
  const lastIndex = session.chunks.length - 1
  const lastChunk = session.chunks[lastIndex]

  if (shouldMergeTerminalOutput(lastChunk, event)) {
    session.chunks[lastIndex] = {
      ...lastChunk,
      chunk: `${lastChunk.chunk}${event.chunk}`,
      metadata: {
        ...lastChunk.metadata,
        ...event.metadata,
      },
    }
  } else {
    session.chunks.push({
      ...event,
      id: Number.isSafeInteger(sequence) ? sequence : session.totalChunkCount + 1,
      createdAt: capturedAt,
    })
    session.totalChunkCount += 1
  }
  session.updatedAt = capturedAt
  session.outputSize += Buffer.byteLength(event.chunk, 'utf8')
  session.visibleChars += event.chunk.length
  session.status = inferSessionStatusFromTerminalEvent(event, session.status)

  if (event.kind === 'lifecycle' && event.metadata) {
    const isPromptLifecycleEvent =
      typeof event.metadata.promptHint === 'string' ||
      typeof event.metadata.promptInsertion === 'string'
    if (isPromptLifecycleEvent || !session.startMetadata) {
      session.startMetadata = event.metadata
    }
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

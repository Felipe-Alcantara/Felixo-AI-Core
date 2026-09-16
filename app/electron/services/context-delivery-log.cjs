'use strict'

/**
 * Small, process-independent adapter for context delivery evidence.
 *
 * The Electron process already persists QA events through qa-log-disk-store.
 * The standalone `felixo context read` command cannot require Electron, so it
 * uses this adapter to append the same `context-delivery` entries directly to
 * the shared QA directory. Keeping the format in one place also makes the
 * renderer/CLI handoff joinable after an app restart.
 */

const path = require('node:path')
const { CONTEXT_FILE_PREFIX, CONTEXT_FILE_SUFFIX } = require('../core/context-file-contract.cjs')
const { createQaLogDiskStore } = require('./qa-log-disk-store.cjs')

const CONTEXT_DELIVERY_SCOPE = 'context-delivery'
const CONTEXT_DELIVERY_STATES = new Set(['written', 'path-typed', 'read', 'failed'])
const CONTEXT_DELIVERY_LOG_LIMIT = 2_000

// A renderer can create several files at once and a terminal can read them in
// parallel. Reusing one disk store per directory preserves FIFO order inside a
// process while retaining the QA store's rotation and redaction guarantees.
const storesByDirectory = new Map()

function getContextDeliveryStore(directory) {
  const normalized = normalizeDirectory(directory)
  let store = storesByDirectory.get(normalized)
  if (!store) {
    store = createQaLogDiskStore({ directory: normalized })
    storesByDirectory.set(normalized, store)
  }
  return store
}

function normalizeDirectory(directory) {
  if (typeof directory !== 'string' || !directory.trim()) {
    throw new Error('Diretório do log de entrega de contexto não informado.')
  }
  return path.resolve(directory)
}

function normalizeText(value, fallback = undefined) {
  if (value === undefined || value === null) return fallback
  const text = String(value).replace(/[\r\n]+/g, ' ').trim()
  return text ? text.slice(0, 240) : fallback
}

function normalizeArtifactId(value) {
  const artifactId = normalizeText(value)
  if (
    !artifactId ||
    artifactId.includes('/') ||
    artifactId.includes('\\') ||
    !artifactId.startsWith(CONTEXT_FILE_PREFIX) ||
    !artifactId.endsWith(CONTEXT_FILE_SUFFIX)
  ) {
    return undefined
  }
  return artifactId
}

function normalizeState(value) {
  const state = normalizeText(value)
  return CONTEXT_DELIVERY_STATES.has(state) ? state : 'failed'
}

/**
 * Build the QA entry shared by the main process and the standalone reader.
 * No context body or absolute path is copied into the log.
 */
function buildContextDeliveryEntry(event = {}) {
  const state = normalizeState(event.state)
  const artifactId = normalizeArtifactId(event.artifactId ?? event.name)
  return {
    level: state === 'failed' ? 'error' : 'info',
    scope: CONTEXT_DELIVERY_SCOPE,
    sessionId: normalizeText(event.sessionId),
    message: `context-delivery:${state}`,
    details: {
      artifactId: artifactId || null,
      terminal: normalizeText(event.terminal ?? event.terminalId),
      agent: normalizeText(event.agent),
      kind: normalizeText(event.kind),
      state,
      ...(normalizeText(event.error) ? { error: normalizeText(event.error) } : {}),
    },
  }
}

/** Append one delivery transition to the shared QA JSONL store. */
function appendContextDeliveryEvent(directory, event) {
  const entry = buildContextDeliveryEntry(event)
  return getContextDeliveryStore(directory).append(entry)
}

/** Wait until all context-delivery writes issued by this process are durable. */
async function flushContextDeliveryLog(directory) {
  const normalized = normalizeDirectory(directory)
  const store = storesByDirectory.get(normalized)
  if (store) await store.flush()
}

/**
 * Read the latest metadata for an artifact. The read command runs in a child
 * process, so this lookup bridges the metadata written by the Electron process
 * without putting terminal paths in the artifact itself.
 */
async function findContextDeliveryMetadata(directory, artifactId) {
  const name = normalizeArtifactId(artifactId)
  if (!name) return {}
  const entries = await getContextDeliveryStore(directory).loadRecent(CONTEXT_DELIVERY_LOG_LIMIT)
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index]
    if (
      entry?.scope !== CONTEXT_DELIVERY_SCOPE ||
      entry?.details?.artifactId !== name ||
      entry?.details?.state !== 'written'
    ) {
      continue
    }
    return {
      sessionId: entry.sessionId,
      terminal: entry.details.terminal,
      agent: entry.details.agent,
      kind: entry.details.kind,
    }
  }
  return {}
}

/** Record a successful read while retaining the writer's terminal/agent data. */
async function recordContextDeliveryRead(directory, artifactId) {
  const metadata = await findContextDeliveryMetadata(directory, artifactId)
  await appendContextDeliveryEvent(directory, {
    ...metadata,
    artifactId,
    state: 'read',
  })
}

module.exports = {
  CONTEXT_DELIVERY_LOG_LIMIT,
  CONTEXT_DELIVERY_SCOPE,
  CONTEXT_DELIVERY_STATES,
  appendContextDeliveryEvent,
  buildContextDeliveryEntry,
  findContextDeliveryMetadata,
  flushContextDeliveryLog,
  normalizeArtifactId,
  recordContextDeliveryRead,
}

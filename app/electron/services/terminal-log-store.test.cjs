'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const fsPromises = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const {
  aggregateTerminalLogRecords,
  createTerminalLogStore,
  normalizeTerminalOutputEvent,
} = require('./terminal-log-store.cjs')

function makeEvent(sessionId, chunk, overrides = {}) {
  return {
    sessionId,
    source: 'stdout',
    chunk,
    ...overrides,
  }
}

async function withStore(callback) {
  const directory = await fsPromises.mkdtemp(
    path.join(os.tmpdir(), 'felixo-terminal-log-store-'),
  )
  const store = createTerminalLogStore({ directory })

  try {
    return await callback(store, directory)
  } finally {
    await store.dispose().catch(() => {})
    await fsPromises.rm(directory, { recursive: true, force: true })
  }
}

test('arquiva todas as sessões, coalesceia assistant e restaura metadados/status', async () => {
  await withStore(async (store) => {
    assert.equal(
      store.append(
        makeEvent('session-a', 'início', {
          source: 'system',
          kind: 'lifecycle',
          severity: 'info',
          title: 'Iniciado',
          metadata: { modelName: 'claude-sonnet', promptHint: 'investigar' },
        }),
      ),
      true,
    )
    store.append(
      makeEvent('session-a', 'Olá', {
        kind: 'assistant',
        metadata: { streamItemId: 'answer-1' },
      }),
    )
    store.append(
      makeEvent('session-a', ' mundo', {
        kind: 'assistant',
        metadata: { streamItemId: 'answer-1' },
      }),
    )
    store.append(
      makeEvent('session-a', 'tool result', {
        source: 'system',
        kind: 'tool',
        title: 'Ferramenta',
      }),
    )
    store.append(
      makeEvent('session-a', 'Concluído', {
        source: 'system',
        kind: 'metrics',
        title: 'Concluído',
      }),
    )
    store.append(
      makeEvent('session-b', 'falha', {
        source: 'system',
        kind: 'error',
        severity: 'error',
        title: 'Erro',
      }),
    )

    const sessions = await store.getSessions()
    const sessionA = sessions.find((session) => session.sessionId === 'session-a')
    const sessionB = sessions.find((session) => session.sessionId === 'session-b')

    assert.ok(sessionA)
    assert.ok(sessionB)
    assert.equal(sessionA.status, 'completed')
    assert.equal(sessionB.status, 'error')
    assert.equal(sessionA.historyAvailable, true)
    assert.equal(sessionA.startMetadata.modelName, 'claude-sonnet')
    assert.deepEqual(
      sessionA.chunks.map((chunk) => chunk.chunk),
      ['início', 'Olá mundo', 'tool result', 'Concluído'],
    )
    assert.equal(sessionA.totalChunkCount, 4)
    assert.equal(sessionA.droppedChunkCount, 0)
    assert.equal(
      sessionA.outputSize,
      Buffer.byteLength('inícioOlá mundotool resultConcluído', 'utf8'),
    )
    assert.equal(sessionB.chunks[0].kind, 'error')
  })
})

test('clear troca o arquivo e ignora eventos tardios das sessões apagadas', async () => {
  await withStore(async (store, directory) => {
    store.append(makeEvent('old-session', 'antes'))
    await store.clear({ ignoreSessionIds: ['old-session'] })

    assert.equal(store.append(makeEvent('old-session', 'atrasado')), false)
    assert.equal(store.append(makeEvent('new-session', 'depois')), true)

    const sessions = await store.getSessions()
    assert.deepEqual(sessions.map((session) => session.sessionId), ['new-session'])

    const files = fs.readdirSync(directory).filter((file) => file.endsWith('.jsonl'))
    assert.equal(files.length, 1)
    assert.doesNotMatch(fs.readFileSync(path.join(directory, files[0]), 'utf8'), /old-session/)
  })
})

test('remove somente arquivos de sessão antigos no início e mantém arquivos alheios', async () => {
  const directory = await fsPromises.mkdtemp(
    path.join(os.tmpdir(), 'felixo-terminal-log-stale-'),
  )
  const stalePath = path.join(directory, 'session-1-2-0.jsonl')
  const unrelatedPath = path.join(directory, 'notes.jsonl')
  await fsPromises.writeFile(stalePath, 'stale\n', 'utf8')
  await fsPromises.writeFile(unrelatedPath, 'keep\n', 'utf8')

  const store = createTerminalLogStore({ directory })
  try {
    assert.equal(fs.existsSync(stalePath), false)
    assert.equal(fs.existsSync(unrelatedPath), true)
  } finally {
    await store.dispose()
    await fsPromises.rm(directory, { recursive: true, force: true })
  }
})

test('normaliza eventos externos e ignora linhas inválidas no replay', () => {
  const normalized = normalizeTerminalOutputEvent({
    sessionId: ' session-a ',
    source: 'unknown',
    kind: 'unknown',
    chunk: 42,
    metadata: { safe: true, nested: { no: 'json' }, finite: 2 },
  })
  assert.deepEqual(normalized, {
    sessionId: 'session-a',
    source: 'system',
    chunk: '42',
    metadata: { safe: true, finite: 2 },
  })

  const content = [
    'not-json',
    JSON.stringify({
      sequence: 1,
      capturedAt: '2026-09-01T12:00:00.000Z',
      event: makeEvent('session-a', 'ok'),
    }),
    JSON.stringify({ event: { chunk: 'missing session' } }),
  ].join('\n')
  const sessions = aggregateTerminalLogRecords(content)

  assert.equal(sessions.length, 1)
  assert.equal(sessions[0].sessionId, 'session-a')
  assert.equal(sessions[0].chunks[0].chunk, 'ok')
})

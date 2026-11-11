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

test('restores the latest prompt provenance from archived lifecycle events', async () => {
  await withStore(async (store, directory) => {
    const firstInsertion = JSON.stringify({
      id: 'manual-1',
      source: 'manual',
      combinedNames: [],
      autoSubmit: false,
      timestamp: '2026-11-03T12:00:00.000Z',
    })
    const latestInsertion = JSON.stringify({
      id: 'catalog-2',
      name: 'Revisão — 東京',
      source: 'catalog',
      combinedNames: ['Revisão — 東京'],
      autoSubmit: true,
      timestamp: '2026-11-03T13:00:00.000Z',
    })

    store.append(makeEvent('thread-a', 'start', {
      source: 'system',
      kind: 'lifecycle',
      metadata: { promptHint: 'pergunta digitada', promptInsertion: firstInsertion },
    }))
    store.append(makeEvent('thread-a', 'continuation', {
      source: 'system',
      kind: 'lifecycle',
      metadata: { promptHint: 'prévia mais recente', promptInsertion: latestInsertion },
    }))
    store.append(makeEvent('thread-a', 'status', {
      source: 'system',
      kind: 'lifecycle',
      metadata: { mode: 'processo-persistente' },
    }))

    const [session] = await store.getSessions()
    assert.equal(session.startMetadata.promptHint, 'prévia mais recente')
    assert.equal(session.startMetadata.promptInsertion, latestInsertion)
    assert.equal(session.chunks.length, 3)
    assert.deepEqual(
      session.chunks.map((chunk) => chunk.metadata?.promptInsertion),
      [firstInsertion, latestInsertion, undefined],
    )

    const logText = fs.readFileSync(store.getFilePath(), 'utf8')
    assert.doesNotMatch(logText, /BODY-MUST-NOT-LEAK/)
    assert.match(logText, /Revisão — 東京/)
  })
})

test('agrega 20.000 eventos que não se mesclam numa sessão em tempo linear', () => {
  // A agregação antiga recopiava o array de pedaços e somava todos eles a cada evento: quadrática
  // (1,6 s para 20.000 eventos nesta máquina). O critério da task é abaixo de 150 ms; o teto aqui
  // tem folga para a máquina do CI.
  const lines = []
  for (let index = 0; index < 20_000; index += 1) {
    lines.push(JSON.stringify({
      version: 1,
      sequence: index + 1,
      capturedAt: new Date(1_800_000_000_000 + index).toISOString(),
      event: makeEvent('sessao-unica', `pedaço ${index}`, { kind: 'tool', title: 'Bash' }),
    }))
  }
  const content = `${lines.join('\n')}\n`

  const started = process.hrtime.bigint()
  const [session] = aggregateTerminalLogRecords(content)
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6

  assert.equal(session.chunks.length, 20_000)
  assert.equal(session.totalChunkCount, 20_000)
  assert.equal(session.visibleChars, lines.reduce((total, _line, index) => total + `pedaço ${index}`.length, 0))
  assert.equal(session.chunks[19_999].chunk, 'pedaço 19999')
  assert.ok(elapsedMs < 400, `levou ${Math.round(elapsedMs)} ms`)
})

test('passa do teto: reveza dois arquivos e descarta o trecho mais antigo', async () => {
  const directory = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'felixo-terminal-log-store-'))
  const store = createTerminalLogStore({ directory, maxBytes: 8 * 1024 })

  try {
    for (let index = 0; index < 200; index += 1) {
      store.append(makeEvent('sessao-longa', `linha ${String(index).padStart(3, '0')} ${'x'.repeat(100)}`, { kind: 'tool' }))
    }

    const sessions = await store.getSessions()
    const files = fs.readdirSync(directory)
    const bytesOnDisk = files.reduce((total, name) => total + fs.statSync(path.join(directory, name)).size, 0)
    const chunks = sessions[0].chunks.map((item) => item.chunk.slice(0, 9))

    assert.ok(files.length <= 2, `arquivos: ${files.join(', ')}`)
    assert.ok(bytesOnDisk <= 8 * 1024, `${bytesOnDisk} bytes no disco`)
    assert.equal(chunks.at(-1), 'linha 199')
    assert.ok(!chunks.includes('linha 000'), 'o trecho mais antigo devia ter saído')
    // Contíguo e em ordem: o arquivo anterior é lido antes do atual.
    const first = Number(chunks[0].slice(6))
    assert.deepEqual(chunks, Array.from({ length: 200 - first }, (_, offset) => `linha ${String(first + offset).padStart(3, '0')}`))

    await store.clear()
    assert.deepEqual(fs.readdirSync(directory), [])
  } finally {
    await store.dispose().catch(() => {})
    await fsPromises.rm(directory, { recursive: true, force: true })
  }
})

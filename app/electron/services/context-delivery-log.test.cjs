'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fsp = require('node:fs/promises')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const {
  CONTEXT_DELIVERY_SCOPE,
  appendContextDeliveryEvent,
  buildContextDeliveryEntry,
  findContextDeliveryMetadata,
  flushContextDeliveryLog,
} = require('./context-delivery-log.cjs')

test('normaliza a transicao de entrega sem persistir o corpo do contexto', () => {
  const entry = buildContextDeliveryEntry({
    artifactId: 'felixo-context-1-handoff.txt',
    sessionId: 'canvas:terminal-1',
    terminal: 'terminal-1',
    agent: 'claude',
    kind: 'handoff',
    state: 'path-typed',
    content: 'segredo que nao deve entrar no diagnostico',
  })

  assert.equal(entry.scope, CONTEXT_DELIVERY_SCOPE)
  assert.equal(entry.details.state, 'path-typed')
  assert.equal(entry.details.artifactId, 'felixo-context-1-handoff.txt')
  assert.equal('content' in entry.details, false)
  assert.equal(buildContextDeliveryEntry({ artifactId: 'C:\\Users\\other\\felixo-context-1-handoff.txt' }).details.artifactId, null)
  assert.equal(buildContextDeliveryEntry({ artifactId: '/tmp/felixo-context-1-handoff.txt' }).details.artifactId, null)
})

test('grava escrita e permite recuperar metadados para o evento de leitura', async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'felixo-context-delivery-log-'))
  const directory = path.join(root, 'qa')

  try {
    await appendContextDeliveryEvent(directory, {
      artifactId: 'felixo-context-2-initial-context.txt',
      sessionId: 'canvas:terminal-2',
      terminal: 'terminal-2',
      agent: 'codex',
      kind: 'initial-context',
      state: 'written',
    })
    await appendContextDeliveryEvent(directory, {
      artifactId: 'felixo-context-2-initial-context.txt',
      sessionId: 'canvas:terminal-2',
      terminal: 'terminal-2',
      agent: 'codex',
      kind: 'initial-context',
      state: 'path-typed',
    })
    await flushContextDeliveryLog(directory)

    assert.deepEqual(await findContextDeliveryMetadata(directory, 'felixo-context-2-initial-context.txt'), {
      sessionId: 'canvas:terminal-2',
      terminal: 'terminal-2',
      agent: 'codex',
      kind: 'initial-context',
    })
    const files = fs.readdirSync(directory)
    assert.equal(files.length, 1)
    assert.match(fs.readFileSync(path.join(directory, files[0]), 'utf8'), /context-delivery:path-typed/)
  } finally {
    await fsp.rm(root, { recursive: true, force: true })
  }
})

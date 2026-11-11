'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createQaLogDiskStore, redactValue, QA_LOG_FILE_PATTERN } = require('./qa-log-disk-store.cjs')

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-qa-log-disk-'))
}

test('QA_LOG_FILE_PATTERN casa com o nome de arquivo diário e captura a data', () => {
  assert.equal(QA_LOG_FILE_PATTERN.test('qa-2026-09-14.jsonl'), true)
  assert.equal(QA_LOG_FILE_PATTERN.test('session-123-456-0.jsonl'), false)
  assert.equal(QA_LOG_FILE_PATTERN.exec('qa-2026-09-14.jsonl')[1], '2026-09-14')
})

test('append grava uma linha JSONL no arquivo do dia atual', async () => {
  const directory = tempDir()
  const store = createQaLogDiskStore({ directory, now: () => new Date('2026-09-14T10:00:00.000Z') })

  await store.append({ id: 1, level: 'error', scope: 'test', message: 'falhou' })
  await store.flush()

  const content = fs.readFileSync(path.join(directory, 'qa-2026-09-14.jsonl'), 'utf8')
  const parsed = JSON.parse(content.trim())
  assert.equal(parsed.message, 'falhou')
})

test('append redige segredos no message e em details antes de gravar', async () => {
  const directory = tempDir()
  const store = createQaLogDiskStore({ directory, now: () => new Date('2026-09-14T10:00:00.000Z') })

  await store.append({
    id: 1,
    level: 'error',
    scope: 'test',
    message: 'token=ghp_1234567890abcdefghij falhou',
    details: { authorization: 'Bearer abc.def.ghi', nested: { password: 'senhaSuperSecreta123' } },
  })
  await store.flush()

  const content = fs.readFileSync(path.join(directory, 'qa-2026-09-14.jsonl'), 'utf8')
  assert.doesNotMatch(content, /ghp_1234567890abcdefghij/)
  assert.doesNotMatch(content, /abc\.def\.ghi/)
  assert.doesNotMatch(content, /senhaSuperSecreta123/)
})

test('append preserva a ordem das escritas mesmo disparadas em paralelo', async () => {
  const directory = tempDir()
  const store = createQaLogDiskStore({ directory, now: () => new Date('2026-09-14T10:00:00.000Z') })

  await Promise.all([
    store.append({ id: 1, message: 'um' }),
    store.append({ id: 2, message: 'dois' }),
    store.append({ id: 3, message: 'tres' }),
  ])
  await store.flush()

  const lines = fs
    .readFileSync(path.join(directory, 'qa-2026-09-14.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line).message)
  assert.deepEqual(lines, ['um', 'dois', 'tres'])
})

test('loadRecent lê do arquivo mais recente pra trás e respeita o limite', async () => {
  const directory = tempDir()
  fs.writeFileSync(
    path.join(directory, 'qa-2026-09-13.jsonl'),
    `${JSON.stringify({ id: 1, message: 'ontem-1' })}\n${JSON.stringify({ id: 2, message: 'ontem-2' })}\n`,
  )
  fs.writeFileSync(
    path.join(directory, 'qa-2026-09-14.jsonl'),
    `${JSON.stringify({ id: 3, message: 'hoje-1' })}\n${JSON.stringify({ id: 4, message: 'hoje-2' })}\n`,
  )
  const store = createQaLogDiskStore({ directory })

  const recent = await store.loadRecent(3)
  assert.deepEqual(
    recent.map((entry) => entry.message),
    ['ontem-2', 'hoje-1', 'hoje-2'],
  )
})

test('loadRecent ignora linha corrompida sem derrubar as demais', async () => {
  const directory = tempDir()
  fs.writeFileSync(
    path.join(directory, 'qa-2026-09-14.jsonl'),
    `${JSON.stringify({ id: 1, message: 'ok-1' })}\n{linha quebrada\n${JSON.stringify({ id: 2, message: 'ok-2' })}\n`,
  )
  const store = createQaLogDiskStore({ directory })

  const recent = await store.loadRecent(10)
  assert.deepEqual(recent.map((entry) => entry.message), ['ok-1', 'ok-2'])
})

test('prune remove arquivo mais velho que maxDays', async () => {
  const directory = tempDir()
  fs.writeFileSync(path.join(directory, 'qa-2026-08-01.jsonl'), `${JSON.stringify({ message: 'velho' })}\n`)
  fs.writeFileSync(path.join(directory, 'qa-2026-09-14.jsonl'), `${JSON.stringify({ message: 'novo' })}\n`)
  const store = createQaLogDiskStore({ directory, maxDays: 14, now: () => new Date('2026-09-14T10:00:00.000Z') })

  await store.prune()

  assert.equal(fs.existsSync(path.join(directory, 'qa-2026-08-01.jsonl')), false)
  assert.equal(fs.existsSync(path.join(directory, 'qa-2026-09-14.jsonl')), true)
})

test('prune remove os arquivos mais antigos até caber no orçamento de tamanho', async () => {
  const directory = tempDir()
  const now = () => new Date('2026-09-14T10:00:00.000Z')
  fs.writeFileSync(path.join(directory, 'qa-2026-09-12.jsonl'), 'a'.repeat(50))
  fs.writeFileSync(path.join(directory, 'qa-2026-09-13.jsonl'), 'b'.repeat(50))
  fs.writeFileSync(path.join(directory, 'qa-2026-09-14.jsonl'), 'c'.repeat(50))
  const store = createQaLogDiskStore({ directory, maxDays: 30, maxTotalBytes: 80, now })

  await store.prune()

  const remaining = fs.readdirSync(directory).sort()
  // O mais antigo sai primeiro; o mais novo (hoje) tem que sobreviver.
  assert.equal(remaining.includes('qa-2026-09-12.jsonl'), false)
  assert.equal(remaining.includes('qa-2026-09-14.jsonl'), true)
})

test('redactValue redige string em qualquer profundidade de objeto/array aninhado', () => {
  const redacted = redactValue({
    a: 'token=ghp_1234567890abcdefghij',
    b: ['x', { password: 'segredo12345' }],
    c: { d: { e: 'Authorization: Bearer zzz.yyy.xxx' } },
    n: 42,
    bool: true,
    nil: null,
  })

  assert.doesNotMatch(JSON.stringify(redacted), /ghp_1234567890abcdefghij/)
  assert.doesNotMatch(JSON.stringify(redacted), /segredo12345/)
  assert.doesNotMatch(JSON.stringify(redacted), /zzz\.yyy\.xxx/)
  assert.equal(redacted.n, 42)
  assert.equal(redacted.bool, true)
  assert.equal(redacted.nil, null)
})

test('redactValue não perde a estrutura de arrays e objetos não-sensíveis', () => {
  assert.deepEqual(redactValue({ a: 1, b: ['x', 'y'] }), { a: 1, b: ['x', 'y'] })
})

test('redactValue mascara segredo com nome de variável de ambiente e credencial em URL, não só rótulo solto', () => {
  const redigido = redactValue({
    message: 'OPENAI_API_KEY=CANARIOdisco1 e https://u:CANARIOdisco2@h.example.com',
    details: { lista: ['GITHUB_TOKEN=CANARIOdisco3', 'ya29.CANARIOdisco4-AbCdEfGhIjKlMnOpQrStUv'], ok: 'Resets 6:50pm (America/Sao_Paulo)' },
  })

  assert.doesNotMatch(JSON.stringify(redigido), /CANARIO/)
  assert.equal(redigido.details.ok, 'Resets 6:50pm (America/Sao_Paulo)')
})

test('QA_LOG_FILE_PATTERN também casa as partes do dia e captura a data', () => {
  assert.equal(QA_LOG_FILE_PATTERN.test('qa-2026-09-14.3.jsonl'), true)
  assert.equal(QA_LOG_FILE_PATTERN.exec('qa-2026-09-14.3.jsonl')[1], '2026-09-14')
})

test('prune nunca apaga a parte em uso do dia atual, mesmo sozinha acima do orçamento', async () => {
  // O prune antigo apagava até o arquivo de hoje quando ele sozinho passava do orçamento: o
  // histórico que o "Reportar problema" mais precisa sumia.
  const directory = tempDir()
  fs.writeFileSync(path.join(directory, 'qa-2026-09-13.jsonl'), 'b'.repeat(50))
  fs.writeFileSync(path.join(directory, 'qa-2026-09-14.jsonl'), 'c'.repeat(200))
  const store = createQaLogDiskStore({ directory, maxDays: 30, maxTotalBytes: 80, now: () => new Date('2026-09-14T10:00:00.000Z') })

  await store.prune()

  assert.deepEqual(fs.readdirSync(directory), ['qa-2026-09-14.jsonl'])
})

test('append abre uma parte nova ao passar do tamanho e roda o prune sem esperar o próximo boot', async () => {
  const directory = tempDir()
  const store = createQaLogDiskStore({
    directory,
    maxDays: 30,
    maxTotalBytes: 600,
    maxPartBytes: 200,
    now: () => new Date('2026-09-14T10:00:00.000Z'),
  })

  for (let id = 1; id <= 30; id += 1) {
    store.append({ id, level: 'warn', scope: 'test', message: `entrada ${String(id).padStart(2, '0')}` })
  }
  await store.flush()

  const files = fs.readdirSync(directory)
  const bytes = files.reduce((total, name) => total + fs.statSync(path.join(directory, name)).size, 0)
  assert.ok(files.length > 1, `uma parte só: ${files.join(', ')}`)
  assert.ok(bytes <= 600 + 200, `${bytes} bytes no disco`)
  assert.ok(files.every((name) => QA_LOG_FILE_PATTERN.test(name)), files.join(', '))
  // As partes do dia são lidas na ordem em que foram escritas.
  const recent = await store.loadRecent(4)
  assert.deepEqual(recent.map((entry) => entry.id), [27, 28, 29, 30])
})

test('virar o dia durante a execução apaga o que passou de maxDays sem esperar o boot', async () => {
  const directory = tempDir()
  let current = new Date('2026-09-01T10:00:00.000Z')
  const store = createQaLogDiskStore({ directory, maxDays: 14, now: () => current })

  store.append({ id: 1, message: 'primeiro dia' })
  await store.flush()
  current = new Date('2026-09-20T10:00:00.000Z')
  store.append({ id: 2, message: 'dias depois' })
  await store.flush()

  assert.deepEqual(fs.readdirSync(directory), ['qa-2026-09-20.jsonl'])
})

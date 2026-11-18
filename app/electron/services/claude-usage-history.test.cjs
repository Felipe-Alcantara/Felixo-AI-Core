'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { scanClaudeUsage, parsePricing, loadPricing } = require('./claude-usage-history.cjs')

// Preço fictício só do teste: não é tabela oficial.
const PRICING = parsePricing({
  source: 'fixture do teste',
  asOf: '2026-01-01',
  currency: 'USD',
  models: { 'modelo-a': { input: 10, output: 20, cacheRead: 1, cacheWrite5m: 12, cacheWrite1h: 14 } },
})

function line(extra) {
  return JSON.stringify({ type: 'assistant', cwd: '/x/meu-projeto', timestamp: '2026-03-02T10:00:00.000Z', ...extra })
}

function message(id, model, usage) {
  return { requestId: `r-${id}`, message: { id, model, usage } }
}

function makeRoot(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-usage-'))
  for (const [name, lines] of Object.entries(files)) {
    const file = path.join(root, 'projects', name)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, lines.join('\n') + '\n')
  }
  return root
}

test('soma por dia, projeto e modelo, sem contar duas vezes a conversa retomada', async () => {
  const dup = line(message('m1', 'modelo-a', { input_tokens: 1000000, output_tokens: 500000, cache_read_input_tokens: 2000000, cache_creation: { ephemeral_5m_input_tokens: 1000000, ephemeral_1h_input_tokens: 1000000 } }))
  const root = makeRoot({
    'p1/a.jsonl': [dup, line(message('m2', 'modelo-b', { input_tokens: 5, output_tokens: 7 })), '{quebrado', line({ message: { id: 'z', content: 'texto secreto' } })],
    'p1/b.jsonl': [dup], // cópia da retomada
    'p2/sub/c.jsonl': [line({ ...message('m3', '<synthetic>', { input_tokens: 9 }) })],
  })
  try {
    const result = await scanClaudeUsage({ roots: [root, path.join(root, 'nao-existe')], pricing: PRICING })
    assert.equal(result.rows.length, 2)
    const a = result.rows.find((row) => row.model === 'modelo-a')
    assert.equal(a.messages, 1)
    assert.equal(a.project, 'meu-projeto')
    assert.equal(a.day, '2026-03-02')
    // 1M*10 + 0.5M*20 + 2M*1 + 1M*12 + 1M*14 = 10+10+2+12+14 = 48
    assert.equal(a.costUsd, 48)
    const b = result.rows.find((row) => row.model === 'modelo-b')
    assert.equal(b.costUsd, null)
    assert.deepEqual(result.unpricedModels, ['modelo-b'])
    assert.equal(result.pricing.source, 'fixture do teste')
    assert.ok(!JSON.stringify(result).includes('secreto'))
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('sem preço configurado, só tokens e custo nulo; sinceMs filtra por data', async () => {
  const root = makeRoot({
    'p/a.jsonl': [line(message('m1', 'modelo-a', { input_tokens: 3, output_tokens: 4 })), line({ ...message('m2', 'modelo-a', { input_tokens: 100 }), timestamp: '2025-01-01T00:00:00.000Z' })],
  })
  try {
    const all = await scanClaudeUsage({ roots: [root] })
    assert.equal(all.pricing, null)
    assert.equal(all.rows.length, 2)
    assert.ok(all.rows.every((row) => row.costUsd === null))
    const recent = await scanClaudeUsage({ roots: [root], sinceMs: Date.parse('2026-01-01') })
    assert.deepEqual(recent.rows.map((row) => row.input), [3])
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('arquivo de preços sem fonte, data ou moeda USD é recusado', () => {
  const ok = { source: 's', asOf: '2026-01-01', currency: 'USD', models: { m: { input: 1, output: 2 } } }
  assert.ok(parsePricing(ok))
  assert.equal(parsePricing({ ...ok, source: '' }), null)
  assert.equal(parsePricing({ ...ok, asOf: 'ontem' }), null)
  assert.equal(parsePricing({ ...ok, currency: 'BRL' }), null)
  assert.deepEqual(parsePricing({ ...ok, models: { m: { input: 1 } } }).models, {})
  assert.equal(loadPricing(path.join(os.tmpdir(), 'felixo-sem-arquivo.json')), null)
})

test('prefixo mais longo vence entre modelos de preço', async () => {
  const pricing = parsePricing({ source: 's', asOf: '2026-01-01', currency: 'USD', models: { m: { input: 1, output: 1 }, 'm-grande': { input: 100, output: 100 } } })
  const root = makeRoot({ 'p/a.jsonl': [line(message('m1', 'm-grande-2', { input_tokens: 1000000 }))] })
  try {
    const result = await scanClaudeUsage({ roots: [root], pricing })
    assert.equal(result.rows[0].costUsd, 100)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

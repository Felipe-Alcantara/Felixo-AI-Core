'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { createAiPricingCatalog, parseAiPricing, parseUsdBrlRate, toCostPricing } = require('./ai-pricing.cjs')
const bundled = require('./ai-pricing.json')

const model = (id, extra = {}) => ({ id, provider: 'anthropic', name: id, input: 1, output: 2, source: 'https://exemplo.com/precos', asOf: '2026-11-18', ...extra })
const table = (asOf, models = [model('m-1')]) => ({ schemaVersion: 1, asOf, currency: 'USD', models, subscriptions: [] })
const rateBody = { amount: 1, base: 'USD', date: '2026-11-17', rates: { BRL: 5.78 } }

function fakeFetch(routes) {
  const calls = []
  const impl = async (url, options) => {
    calls.push(url)
    assert.ok(options.signal, 'toda busca tem prazo')
    const route = routes[url]
    if (route instanceof Error) throw route
    if (!route) return { ok: false, status: 404, text: async () => '' }
    return { ok: true, status: 200, text: async () => (typeof route === 'string' ? route : JSON.stringify(route)) }
  }
  impl.calls = calls
  return impl
}

test('a tabela embutida passa na validação inteira: todo item tem fonte https e data, e todo plano aponta para modelos da tabela', () => {
  const parsed = parseAiPricing(bundled)
  assert.ok(parsed)
  assert.equal(parsed.models.length, bundled.models.length)
  assert.equal(parsed.subscriptions.length, bundled.subscriptions.length)
  for (const sub of parsed.subscriptions) assert.deepEqual(sub.models, bundled.subscriptions.find((s) => s.id === sub.id).models)
})

test('a validação descarta item sem fonte, com fonte http ou sem data, e preço inválido vira null (sem preço), nunca zero', () => {
  const parsed = parseAiPricing(
    table('2026-11-18', [
      model('ok', { input: -1, output: 'dez', cacheRead: 0 }),
      model('sem-fonte', { source: undefined }),
      model('http', { source: 'http://exemplo.com' }),
      model('sem-data', { asOf: 'ontem' }),
      model('<script>'),
    ]),
  )
  assert.deepEqual(parsed.models.map((m) => [m.id, m.input, m.output, m.cacheRead]), [['ok', null, null, 0]])
  assert.equal(parseAiPricing({ ...table('2026-11-18'), schemaVersion: 2 }), null)
  assert.equal(parseAiPricing({ ...table('2026-11-18'), currency: 'BRL' }), null)
  assert.equal(parseAiPricing('lixo'), null)
})

test('a cotação só vale com base USD, BRL plausível e data', () => {
  assert.deepEqual(parseUsdBrlRate(rateBody), { brlPerUsd: 5.78, date: '2026-11-17', source: 'Frankfurter (taxa de referência do BCE)' })
  assert.equal(parseUsdBrlRate({ ...rateBody, rates: { BRL: 0 } }), null)
  assert.equal(parseUsdBrlRate({ ...rateBody, base: 'EUR' }), null)
  assert.equal(parseUsdBrlRate({ ...rateBody, date: undefined }), null)
})

test('usa a tabela online quando ela é válida e não é mais velha que a embutida, com a cotação', async () => {
  const fetchImpl = fakeFetch({ precos: table('2026-12-01', [model('novo')]), cotacao: rateBody })
  const catalog = createAiPricingCatalog({ fetchImpl, bundled: table('2026-11-18'), pricingUrl: 'precos', rateUrl: 'cotacao' })
  const result = await catalog.get()
  assert.equal(result.origin, 'online')
  assert.deepEqual(result.table.models.map((m) => m.id), ['novo'])
  assert.equal(result.rate.brlPerUsd, 5.78)
  assert.equal(result.onlineError, null)
})

test('cai na reserva embutida se a rede falha, se o JSON é inválido ou se a online é mais velha; sem cotação fica só USD', async () => {
  const offline = createAiPricingCatalog({ fetchImpl: fakeFetch({ precos: new Error('offline') }), bundled: table('2026-11-18'), pricingUrl: 'precos', rateUrl: 'cotacao' })
  const a = await offline.get()
  assert.equal(a.origin, 'reserva')
  assert.equal(a.onlineError, 'sem acesso à tabela online')
  assert.equal(a.rate, null)
  assert.deepEqual(a.table.models.map((m) => m.id), ['m-1'])

  const invalid = createAiPricingCatalog({ fetchImpl: fakeFetch({ precos: '{"schemaVersion":1' }), bundled: table('2026-11-18'), pricingUrl: 'precos', rateUrl: 'cotacao' })
  assert.equal((await invalid.get()).origin, 'reserva')

  const bad = createAiPricingCatalog({ fetchImpl: fakeFetch({ precos: { ...table('2026-12-01'), models: 'x' } }), bundled: table('2026-11-18'), pricingUrl: 'precos', rateUrl: 'cotacao' })
  assert.equal((await bad.get()).onlineError, 'a tabela baixada não passou na validação')

  const older = createAiPricingCatalog({ fetchImpl: fakeFetch({ precos: table('2026-01-01', [model('velho')]) }), bundled: table('2026-11-18'), pricingUrl: 'precos', rateUrl: 'cotacao' })
  const d = await older.get()
  assert.equal(d.origin, 'reserva')
  assert.deepEqual(d.table.models.map((m) => m.id), ['m-1'])
})

test('guarda por uma hora e só baixa de novo com force', async () => {
  let clock = 0
  const fetchImpl = fakeFetch({ precos: table('2026-12-01'), cotacao: rateBody })
  const catalog = createAiPricingCatalog({ fetchImpl, bundled: table('2026-11-18'), pricingUrl: 'precos', rateUrl: 'cotacao', now: () => clock })
  await Promise.all([catalog.get(), catalog.get()])
  assert.equal(fetchImpl.calls.length, 2)
  clock = 30 * 60 * 1000
  await catalog.get()
  assert.equal(fetchImpl.calls.length, 2)
  await catalog.get({ force: true })
  assert.equal(fetchImpl.calls.length, 4)
})

test('toCostPricing leva só modelos com entrada e saída e mantém as tarifas de cache que existem', () => {
  const parsed = parseAiPricing(table('2026-11-18', [model('a', { cacheRead: 0.1 }), model('b', { input: null })]))
  const pricing = toCostPricing(parsed, 'reserva')
  assert.deepEqual(pricing.models, { a: { input: 1, output: 2, cacheRead: 0.1 } })
  assert.equal(pricing.asOf, '2026-11-18')
  assert.match(pricing.source, /embutida/)
})

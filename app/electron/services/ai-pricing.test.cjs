'use strict'
require('../../scripts/test-support/pasta-do-teste.cjs') // isola o temporário deste arquivo (ver pasta-do-teste.cjs)

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const {
  createAiPricingCatalog,
  parseAiPricing,
  parseFrankfurterRate,
  parseOpenRouterModels,
  convertTable,
  toCostPricing,
} = require('./ai-pricing.cjs')
const bundled = require('./ai-pricing.json')

const reserveRate = { brlPerUsd: 5, cnyPerUsd: 7, date: '2026-11-01', source: 'reserva de teste' }
const model = (id, extra = {}) => ({ id, provider: 'anthropic', name: id, input: 1, output: 2, source: 'https://exemplo.com/precos', asOf: '2026-11-18', ...extra })
const table = (asOf, models = [model('m-1')], extra = {}) => ({ schemaVersion: 2, asOf, currency: 'USD', exchangeRates: reserveRate, models, subscriptions: [], ...extra })
const rateBody = { amount: 1, base: 'USD', date: '2026-11-17', rates: { BRL: 5.78, CNY: 6.66 } }
const openRouterBody = {
  data: [
    { id: 'z-ai/glm-5.3', name: 'Z.ai: GLM 5.3', pricing: { prompt: '0.0000014', completion: '0.0000044', input_cache_read: '0.00000026' } },
    { id: 'google/gemma-4-31b-it:free', name: 'Gemma 4 31B (free)', pricing: { prompt: '0', completion: '0' } },
    { id: 'openrouter/auto', name: 'Auto Router', pricing: { prompt: '-1', completion: '-1' } },
    { id: '../../etc', name: 'ruim', pricing: { prompt: '0', completion: '0' } },
    { id: 'sem/preco', name: 'Sem preço' },
  ],
}

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

const urls = { pricingUrl: 'precos', rateUrl: 'cotacao', openRouterUrl: 'openrouter' }

function tempFile() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ai-pricing-')), 'sub', 'cotacao.json')
}

test('a tabela embutida passa na validação inteira: todo item tem fonte https e data, e todo plano aponta para modelos da tabela', () => {
  const parsed = parseAiPricing(bundled)
  assert.ok(parsed)
  assert.equal(parsed.models.length, bundled.models.length)
  assert.equal(parsed.subscriptions.length, bundled.subscriptions.length)
  for (const sub of parsed.subscriptions) assert.deepEqual(sub.models, bundled.subscriptions.find((s) => s.id === sub.id).models)
  assert.ok(parsed.exchangeRates.brlPerUsd > 1 && parsed.exchangeRates.cnyPerUsd > 1, 'a tabela traz cotação de reserva')
  for (const provider of ['openrouter', 'opencode', 'openclaw', 'deepseek', 'alibaba', 'moonshot', 'zhipu', 'minimax', 'bytedance', 'baidu', 'tencent', 'stepfun', 'iflytek', '01ai']) {
    assert.ok([...parsed.models, ...parsed.subscriptions].some((item) => item.provider === provider), `falta ${provider}`)
  }
})

test('a validação descarta item sem fonte, com fonte http, sem data ou moeda desconhecida, e preço inválido vira null (sem preço), nunca zero', () => {
  const parsed = parseAiPricing(
    table('2026-11-18', [
      model('ok', { input: -1, output: 'dez', cacheRead: 0 }),
      model('sem-fonte', { source: undefined }),
      model('http', { source: 'http://exemplo.com' }),
      model('sem-data', { asOf: 'ontem' }),
      model('euro', { currency: 'EUR' }),
      model('<script>'),
    ]),
  )
  assert.deepEqual(parsed.models.map((m) => [m.id, m.input, m.output, m.cacheRead]), [['ok', null, null, 0]])
  assert.equal(parseAiPricing({ ...table('2026-11-18'), schemaVersion: 1 }), null, 'tabela v1 (só dólar) não serve')
  assert.equal(parseAiPricing({ ...table('2026-11-18'), currency: 'BRL' }), null)
  assert.equal(parseAiPricing({ ...table('2026-11-18'), exchangeRates: undefined }), null, 'sem cotação de reserva não serve')
  assert.equal(parseAiPricing({ ...table('2026-11-18'), exchangeRates: { ...reserveRate, cnyPerUsd: 0 } }), null)
  assert.equal(parseAiPricing('lixo'), null)
})

test('a cotação ao vivo só vale com base USD, BRL e CNY plausíveis e data', () => {
  assert.deepEqual(parseFrankfurterRate(rateBody), { brlPerUsd: 5.78, cnyPerUsd: 6.66, date: '2026-11-17', source: 'Frankfurter (taxa de referência do BCE)' })
  assert.equal(parseFrankfurterRate({ ...rateBody, rates: { BRL: 0, CNY: 6.66 } }), null)
  assert.equal(parseFrankfurterRate({ ...rateBody, rates: { BRL: 5.78 } }), null)
  assert.equal(parseFrankfurterRate({ ...rateBody, base: 'EUR' }), null)
  assert.equal(parseFrankfurterRate({ ...rateBody, date: undefined }), null)
})

test('preço em yuan vira dólar pela cotação e guarda o valor original', () => {
  const parsed = parseAiPricing(
    table('2026-11-18', [model('hy4', { currency: 'CNY', input: 7, output: 14, cacheRead: null })], {
      subscriptions: [{ id: 'plano', provider: 'tencent', name: 'Plano', monthly: 70, currency: 'CNY', unit: 'mês', models: ['hy4'], codingPlan: true, source: 'https://x.com', asOf: '2026-11-18' }],
    }),
  )
  const converted = convertTable(parsed, reserveRate)
  const [hy4] = converted.models
  assert.deepEqual([hy4.input, hy4.output, hy4.cacheRead], [1, 2, null])
  assert.deepEqual(hy4.original, { currency: 'CNY', input: 7, output: 14, cacheRead: null, cacheWrite5m: null, cacheWrite1h: null })
  const [plan] = converted.subscriptions
  assert.equal(plan.monthlyUsd, 10)
  assert.deepEqual(plan.original, { currency: 'CNY', monthly: 70 })
  assert.equal(plan.codingPlan, true)
})

test('lê a lista do OpenRouter: preço por token vira por milhão, gratuitos ganham nota, roteador e lixo ficam sem preço ou de fora', () => {
  const models = parseOpenRouterModels(openRouterBody, '2026-11-18')
  assert.deepEqual(
    models.map((m) => [m.id, m.input, m.output, m.cacheRead]),
    [
      ['z-ai/glm-5.3', 1.4, 4.4, 0.26],
      ['google/gemma-4-31b-it:free', 0, 0, null],
      ['openrouter/auto', null, null, null],
    ],
  )
  assert.equal(models[0].source, 'https://openrouter.ai/z-ai/glm-5.3')
  assert.match(models[1].note, /Gratuito/)
  assert.match(models[2].note, /Roteador/)
  assert.equal(parseOpenRouterModels({ data: 'x' }, '2026-11-18'), null)
  assert.equal(parseOpenRouterModels({ data: [] }, '2026-11-18'), null)
})

test('usa a tabela online, a cotação ao vivo e os modelos ao vivo do OpenRouter no lugar dos embutidos', async () => {
  const file = tempFile()
  const fetchImpl = fakeFetch({ precos: table('2026-12-01', [model('novo'), model('velho/or', { provider: 'openrouter' })]), cotacao: rateBody, openrouter: openRouterBody })
  const catalog = createAiPricingCatalog({ fetchImpl, bundled: table('2026-11-18'), ...urls, rateCacheFile: file, now: () => Date.parse('2026-11-18T12:00:00Z') })
  const result = await catalog.get()
  assert.equal(result.origin, 'online')
  assert.deepEqual(result.table.models.map((m) => m.id), ['novo', 'z-ai/glm-5.3', 'google/gemma-4-31b-it:free', 'openrouter/auto'])
  assert.deepEqual(result.openRouter, { origin: 'online', count: 3, error: null })
  assert.deepEqual(result.rate, { brlPerUsd: 5.78, cnyPerUsd: 6.66, date: '2026-11-17', source: 'Frankfurter (taxa de referência do BCE)', origin: 'ao vivo' })
  assert.equal(result.onlineError, null)
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).brlPerUsd, 5.78, 'a cotação ao vivo fica salva')
})

test('sem cotação ao vivo usa a última salva; sem ela, a de reserva da tabela: nunca fica sem real', async () => {
  const file = tempFile()
  const online = createAiPricingCatalog({ fetchImpl: fakeFetch({ cotacao: rateBody }), bundled: table('2026-11-18'), ...urls, rateCacheFile: file })
  assert.equal((await online.get()).rate.origin, 'ao vivo')

  const offlineWithCache = createAiPricingCatalog({ fetchImpl: fakeFetch({ cotacao: new Error('offline') }), bundled: table('2026-11-18'), ...urls, rateCacheFile: file })
  const cached = (await offlineWithCache.get()).rate
  assert.deepEqual([cached.origin, cached.brlPerUsd, cached.date], ['cache', 5.78, '2026-11-17'])

  fs.writeFileSync(file, '{"brlPerUsd": "lixo"}')
  const brokenCache = createAiPricingCatalog({ fetchImpl: fakeFetch({}), bundled: table('2026-11-18'), ...urls, rateCacheFile: file })
  assert.deepEqual((await brokenCache.get()).rate, { ...reserveRate, origin: 'reserva' })

  const noFile = createAiPricingCatalog({ fetchImpl: fakeFetch({ cotacao: { ...rateBody, rates: { BRL: 999 } } }), bundled: table('2026-11-18'), ...urls })
  assert.equal((await noFile.get()).rate.origin, 'reserva')
})

test('cai na reserva embutida se a rede falha, se o JSON é inválido ou se a online é mais velha; OpenRouter fora do ar usa a lista embutida', async () => {
  const embedded = table('2026-11-18', [model('m-1'), model('x/y', { provider: 'openrouter' })])
  const offline = createAiPricingCatalog({ fetchImpl: fakeFetch({ precos: new Error('offline') }), bundled: embedded, ...urls })
  const a = await offline.get()
  assert.equal(a.origin, 'reserva')
  assert.equal(a.onlineError, 'sem acesso à tabela online')
  assert.deepEqual(a.table.models.map((m) => m.id), ['m-1', 'x/y'])
  assert.deepEqual(a.openRouter, { origin: 'reserva', count: 1, error: 'sem acesso à API do OpenRouter' })

  const badOpenRouter = createAiPricingCatalog({ fetchImpl: fakeFetch({ openrouter: { data: [{ id: 'x' }] } }), bundled: embedded, ...urls })
  assert.equal((await badOpenRouter.get()).openRouter.error, 'a lista do OpenRouter não passou na validação')

  const invalid = createAiPricingCatalog({ fetchImpl: fakeFetch({ precos: '{"schemaVersion":2' }), bundled: table('2026-11-18'), ...urls })
  assert.equal((await invalid.get()).origin, 'reserva')

  const oldFormat = createAiPricingCatalog({ fetchImpl: fakeFetch({ precos: { ...table('2026-12-01'), schemaVersion: 1 } }), bundled: table('2026-11-18'), ...urls })
  assert.equal((await oldFormat.get()).onlineError, 'a tabela online ainda está no formato antigo')

  const bad = createAiPricingCatalog({ fetchImpl: fakeFetch({ precos: { ...table('2026-12-01'), models: 'x' } }), bundled: table('2026-11-18'), ...urls })
  assert.equal((await bad.get()).onlineError, 'a tabela baixada não passou na validação')

  const older = createAiPricingCatalog({ fetchImpl: fakeFetch({ precos: table('2026-01-01', [model('velho')]) }), bundled: table('2026-11-18'), ...urls })
  const d = await older.get()
  assert.equal(d.origin, 'reserva')
  assert.deepEqual(d.table.models.map((m) => m.id), ['m-1'])
})

test('recusa resposta grande demais', async () => {
  const huge = JSON.stringify({ ...table('2026-12-01'), comentario: 'x'.repeat(600 * 1024) })
  const catalog = createAiPricingCatalog({ fetchImpl: fakeFetch({ precos: huge }), bundled: table('2026-11-18'), ...urls })
  assert.equal((await catalog.get()).onlineError, 'sem acesso à tabela online')
})

test('guarda por uma hora e só baixa de novo com force', async () => {
  let clock = 0
  const fetchImpl = fakeFetch({ precos: table('2026-12-01'), cotacao: rateBody })
  const catalog = createAiPricingCatalog({ fetchImpl, bundled: table('2026-11-18'), ...urls, now: () => clock })
  await Promise.all([catalog.get(), catalog.get()])
  assert.equal(fetchImpl.calls.length, 3)
  clock = 30 * 60 * 1000
  await catalog.get()
  assert.equal(fetchImpl.calls.length, 3)
  await catalog.get({ force: true })
  assert.equal(fetchImpl.calls.length, 6)
})

test('toCostPricing leva só modelos com entrada e saída e mantém as tarifas de cache que existem', () => {
  const parsed = parseAiPricing(table('2026-11-18', [model('a', { cacheRead: 0.1 }), model('b', { input: null })]))
  const pricing = toCostPricing(parsed, 'reserva')
  assert.deepEqual(pricing.models, { a: { input: 1, output: 2, cacheRead: 0.1 } })
  assert.equal(pricing.asOf, '2026-11-18')
  assert.match(pricing.source, /embutida/)
})

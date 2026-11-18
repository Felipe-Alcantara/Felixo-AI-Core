'use strict'

/**
 * Tabela de preços de modelos de IA (por milhão de tokens) e de assinaturas (por mês), com a
 * cotação do dólar em reais e do yuan. Rede só aqui, no processo principal, sempre com prazo.
 *
 * Fonte online: o próprio `ai-pricing.json` servido pelo GitHub (raw, branch main). As páginas de
 * preço dos fornecedores mudam de layout e algumas recusam leitura automática; um JSON versionado
 * no repositório é estável, sem chave e revisado em PR. A cópia embutida é a reserva offline.
 * Os modelos do OpenRouter vêm ao vivo da API pública dele (sem chave); os da tabela são reserva.
 * Tudo que vem da rede passa por um parser antes de ser usado: é fronteira de confiança.
 *
 * Cotação, nesta ordem: ao vivo, a última ao vivo salva em disco, a de reserva da tabela. Assim o
 * preço sempre aparece em US$ e R$. Itens com preço oficial em yuan (`currency: "CNY"`) são
 * convertidos para dólar aqui, e o valor original segue junto em `original`.
 */

const fs = require('node:fs')
const path = require('node:path')
const bundledTable = require('./ai-pricing.json')

const PRICING_URL = 'https://raw.githubusercontent.com/Felipe-Alcantara/Felixo-AI-Core/main/app/electron/services/ai-pricing.json'
// Frankfurter: taxa de referência do Banco Central Europeu, grátis e sem chave, com a data.
const RATE_URL = 'https://api.frankfurter.dev/v1/latest?base=USD&symbols=BRL,CNY'
const RATE_SOURCE = 'Frankfurter (taxa de referência do BCE)'
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/models'
const TIMEOUT_MS = 8000
const MAX_BYTES = 512 * 1024
// A lista do OpenRouter tem perto de 1 MB (descrições longas de ~500 modelos).
const OPENROUTER_MAX_BYTES = 4 * 1024 * 1024
const CACHE_MS = 60 * 60 * 1000
const MAX_ITEMS = 1000
const OPENROUTER_MAX_ITEMS = 2000
const PRICE_KEYS = ['input', 'output', 'cacheRead', 'cacheWrite5m', 'cacheWrite1h']

const DATE = /^\d{4}-\d{2}-\d{2}$/
const ID = /^[a-z0-9][a-z0-9._-]{0,79}$/
// Ids do OpenRouter: "autor/modelo", às vezes com "~" no começo e ":free" no fim.
const MODEL_ID = /^~?[a-z0-9][a-z0-9._-]*(\/[a-z0-9][a-z0-9._:~-]*)?$/

function text(value, max) {
  return typeof value === 'string' && value.trim() && value.length <= max ? value.trim() : null
}

/** Preço: número finito e não negativo; qualquer outra coisa é "sem preço" (`null`), nunca zero. */
function price(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value < 100000 ? value : null
}

function httpsUrl(value) {
  const raw = text(value, 300)
  if (!raw) return null
  try {
    return new URL(raw).protocol === 'https:' ? raw : null
  } catch {
    return null
  }
}

/** Campos comuns a modelo e assinatura; item sem id, nome, fonte https ou data é descartado. */
function baseItem(raw, idPattern) {
  if (!raw || typeof raw !== 'object') return null
  const id = typeof raw.id === 'string' && raw.id.length <= 120 && idPattern.test(raw.id) ? raw.id : null
  const provider = typeof raw.provider === 'string' && ID.test(raw.provider) ? raw.provider : null
  const name = text(raw.name, 120)
  const source = httpsUrl(raw.source)
  const asOf = typeof raw.asOf === 'string' && DATE.test(raw.asOf) ? raw.asOf : null
  if (!id || !provider || !name || !source || !asOf) return null
  const item = { id, provider, name, source, asOf, currency: raw.currency === 'CNY' ? 'CNY' : 'USD' }
  if (raw.currency !== undefined && raw.currency !== 'USD' && raw.currency !== 'CNY') return null
  const note = text(raw.note, 300)
  if (note) item.note = note
  return item
}

/** Cotação: real e yuan por dólar dentro de faixas plausíveis, com data e fonte. */
function parseRate(raw) {
  const brl = raw?.brlPerUsd
  const cny = raw?.cnyPerUsd
  if (typeof brl !== 'number' || !Number.isFinite(brl) || brl < 0.5 || brl > 100) return null
  if (typeof cny !== 'number' || !Number.isFinite(cny) || cny < 1 || cny > 50) return null
  if (typeof raw.date !== 'string' || !DATE.test(raw.date)) return null
  const source = text(raw.source, 120)
  if (!source) return null
  return { brlPerUsd: brl, cnyPerUsd: cny, date: raw.date, source }
}

/**
 * Valida a tabela (embutida ou baixada). Devolve `null` se o envelope não confere ou se nada sobra.
 * Preços ficam na moeda do item; `convertTable` passa tudo para dólar.
 */
function parseAiPricing(raw) {
  if (!raw || typeof raw !== 'object' || raw.schemaVersion !== 2 || raw.currency !== 'USD') return null
  if (typeof raw.asOf !== 'string' || !DATE.test(raw.asOf)) return null
  if (!Array.isArray(raw.models) || !Array.isArray(raw.subscriptions)) return null
  const exchangeRates = parseRate(raw.exchangeRates)
  if (!exchangeRates) return null
  const models = []
  const seen = new Set()
  for (const entry of raw.models.slice(0, MAX_ITEMS)) {
    const item = baseItem(entry, MODEL_ID)
    if (!item || seen.has(item.id)) continue
    seen.add(item.id)
    for (const key of PRICE_KEYS) item[key] = price(entry[key])
    models.push(item)
  }
  const subscriptions = []
  for (const entry of raw.subscriptions.slice(0, MAX_ITEMS)) {
    const item = baseItem(entry, ID)
    if (!item) continue
    item.monthly = price(entry.monthly)
    item.unit = ['usuário/mês', 'uso'].includes(entry.unit) ? entry.unit : 'mês'
    if (entry.codingPlan === true) item.codingPlan = true
    item.models = Array.isArray(entry.models) ? entry.models.filter((id) => typeof id === 'string' && seen.has(id)) : []
    subscriptions.push(item)
  }
  if (models.length === 0 && subscriptions.length === 0) return null
  return { asOf: raw.asOf, currency: 'USD', exchangeRates, models, subscriptions }
}

/** Cotação do Frankfurter (base USD, BRL e CNY); `null` se a resposta não for a esperada. */
function parseFrankfurterRate(raw) {
  if (raw?.base !== 'USD') return null
  return parseRate({ brlPerUsd: raw?.rates?.BRL, cnyPerUsd: raw?.rates?.CNY, date: raw?.date, source: RATE_SOURCE })
}

/** Preço do OpenRouter: texto em dólar por token. Negativo ("-1", roteadores) é "sem preço". */
function perMillion(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const perToken = Number(value)
  if (!Number.isFinite(perToken) || perToken < 0) return null
  // Arredonda para micro-dólar: "0.0000004" vira 0.4, sem ruído de ponto flutuante.
  return price(Math.round(perToken * 1e12) / 1e6)
}

/**
 * Valida a resposta de `GET /api/v1/models` do OpenRouter e devolve itens no formato da tabela.
 * @returns {object[] | null} `null` se o envelope não confere ou nenhum modelo passa.
 */
function parseOpenRouterModels(raw, asOf) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.data)) return null
  const models = []
  const seen = new Set()
  for (const entry of raw.data.slice(0, OPENROUTER_MAX_ITEMS)) {
    const id = typeof entry?.id === 'string' && entry.id.length <= 120 && entry.id.includes('/') && MODEL_ID.test(entry.id) ? entry.id : null
    const name = text(entry?.name, 120)
    const pricing = entry?.pricing
    if (!id || !name || seen.has(id) || !pricing || typeof pricing !== 'object') continue
    seen.add(id)
    const item = {
      id,
      provider: 'openrouter',
      name,
      source: `https://openrouter.ai/${id}`,
      asOf,
      currency: 'USD',
      input: perMillion(pricing.prompt),
      output: perMillion(pricing.completion),
      cacheRead: perMillion(pricing.input_cache_read),
      cacheWrite5m: perMillion(pricing.input_cache_write),
      cacheWrite1h: null,
    }
    if (item.input === 0 && item.output === 0) item.note = 'Gratuito: 50 pedidos por dia sem créditos, 1.000 com US$ 10 comprados.'
    else if (Number(pricing.prompt) < 0) item.note = 'Roteador: cobra o preço do modelo que escolher.'
    else if (Array.isArray(pricing.overrides) && pricing.overrides.length > 0) item.note = 'Preço maior para prompts longos.'
    models.push(item)
  }
  return models.length > 0 ? models : null
}

/** Passa os preços em yuan para dólar com a cotação escolhida; o valor original segue em `original`. */
function convertTable(table, rate) {
  const toUsd = (value) => (value === null ? null : value / rate.cnyPerUsd)
  const models = table.models.map((model) => {
    if (model.currency !== 'CNY') return model
    const converted = { ...model, original: { currency: 'CNY' } }
    for (const key of PRICE_KEYS) {
      converted.original[key] = model[key]
      converted[key] = toUsd(model[key])
    }
    return converted
  })
  const subscriptions = table.subscriptions.map(({ monthly, ...subscription }) =>
    subscription.currency === 'CNY'
      ? { ...subscription, monthlyUsd: toUsd(monthly), original: { currency: 'CNY', monthly } }
      : { ...subscription, monthlyUsd: monthly },
  )
  return { ...table, models, subscriptions }
}

async function fetchJson(fetchImpl, url, timeoutMs, maxBytes = MAX_BYTES) {
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs), headers: { accept: 'application/json' } })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const body = await response.text()
  if (body.length > maxBytes) throw new Error('resposta grande demais')
  return JSON.parse(body)
}

/** Última cotação ao vivo salva; `null` se não há arquivo ou ele não passa na validação. */
function readRateCache(file) {
  if (!file) return null
  try {
    return parseRate(JSON.parse(fs.readFileSync(file, 'utf8')))
  } catch {
    return null
  }
}

function writeRateCache(file, rate) {
  if (!file) return
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, JSON.stringify(rate))
  } catch {
    // Sem disco, a cotação ao vivo vale só nesta sessão; a de reserva continua garantindo o real.
  }
}

/** Converte a tabela para o formato de `claude-usage-history.parsePricing` (só modelos com entrada e saída). */
function toCostPricing(table, origin) {
  const models = {}
  for (const model of table.models) {
    if (model.input === null || model.output === null) continue
    const rates = { input: model.input, output: model.output }
    for (const key of ['cacheRead', 'cacheWrite5m', 'cacheWrite1h']) if (model[key] !== null) rates[key] = model[key]
    models[model.id] = rates
  }
  return { source: origin === 'online' ? 'tabela de preços online do Felixo AI Core' : 'tabela de preços embutida no app', asOf: table.asOf, currency: 'USD', models }
}

/**
 * @param {{ fetchImpl?: typeof fetch, bundled?: unknown, pricingUrl?: string, rateUrl?: string, openRouterUrl?: string, rateCacheFile?: string | null, timeoutMs?: number, now?: () => number }} [options]
 */
function createAiPricingCatalog({
  fetchImpl = globalThis.fetch,
  bundled = bundledTable,
  pricingUrl = PRICING_URL,
  rateUrl = RATE_URL,
  openRouterUrl = OPENROUTER_URL,
  rateCacheFile = null,
  timeoutMs = TIMEOUT_MS,
  now = () => Date.now(),
} = {}) {
  const reserve = parseAiPricing(bundled)
  let cached = null
  let pending = null

  async function load() {
    let table = reserve
    let origin = 'reserva'
    let onlineError = null
    const [tableResult, rateResult, openRouterResult] = await Promise.allSettled([
      fetchJson(fetchImpl, pricingUrl, timeoutMs),
      fetchJson(fetchImpl, rateUrl, timeoutMs),
      fetchJson(fetchImpl, openRouterUrl, timeoutMs, OPENROUTER_MAX_BYTES),
    ])
    if (tableResult.status === 'fulfilled') {
      const online = parseAiPricing(tableResult.value)
      if (!online) {
        // A main só passa a servir a versão 2 depois da integração; até lá a online é a v1, só em dólar.
        const version = tableResult.value?.schemaVersion
        onlineError = typeof version === 'number' && version < 2 ? 'a tabela online ainda está no formato antigo' : 'a tabela baixada não passou na validação'
      }
      // A cópia embutida pode ser mais nova que a da main (app de uma branch à frente): vale a data mais recente.
      else if (!table || online.asOf >= table.asOf) {
        table = online
        origin = 'online'
      }
    } else {
      onlineError = 'sem acesso à tabela online'
    }

    const fetchedAt = new Date(now()).toISOString()
    let rate = null
    const live = rateResult.status === 'fulfilled' ? parseFrankfurterRate(rateResult.value) : null
    if (live) {
      writeRateCache(rateCacheFile, live)
      rate = { ...live, origin: 'ao vivo' }
    } else {
      const saved = readRateCache(rateCacheFile)
      if (saved) rate = { ...saved, origin: 'cache' }
      else if (table) rate = { ...table.exchangeRates, origin: 'reserva' }
    }
    if (!table) return { table: null, origin, onlineError, rate, openRouter: null, fetchedAt }

    const liveOpenRouter = openRouterResult.status === 'fulfilled' ? parseOpenRouterModels(openRouterResult.value, fetchedAt.slice(0, 10)) : null
    const openRouter = liveOpenRouter
      ? { origin: 'online', count: liveOpenRouter.length, error: null }
      : {
          origin: 'reserva',
          count: table.models.filter((model) => model.provider === 'openrouter').length,
          error: openRouterResult.status === 'fulfilled' ? 'a lista do OpenRouter não passou na validação' : 'sem acesso à API do OpenRouter',
        }
    if (liveOpenRouter) table = { ...table, models: [...table.models.filter((model) => model.provider !== 'openrouter'), ...liveOpenRouter] }

    return { table: convertTable(table, rate), origin, onlineError, rate, openRouter, fetchedAt }
  }

  /** Baixa no máximo uma vez por hora, salvo `force` (botão Atualizar); chamadas simultâneas dividem a mesma busca. */
  async function get({ force = false } = {}) {
    if (!force && cached && now() - cached.at < CACHE_MS) return cached.value
    if (!pending) {
      pending = load()
        .then((value) => {
          cached = { at: now(), value }
          return value
        })
        .finally(() => {
          pending = null
        })
    }
    return pending
  }

  return { get }
}

module.exports = {
  createAiPricingCatalog,
  parseAiPricing,
  parseFrankfurterRate,
  parseOpenRouterModels,
  convertTable,
  toCostPricing,
  PRICING_URL,
  RATE_URL,
  OPENROUTER_URL,
}

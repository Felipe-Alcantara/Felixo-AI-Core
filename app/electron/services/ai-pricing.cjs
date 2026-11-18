'use strict'

/**
 * Tabela de preços de modelos de IA (US$ por milhão de tokens) e de assinaturas (US$ por mês),
 * com a cotação do dólar em reais. Rede só aqui, no processo principal, sempre com prazo.
 *
 * Fonte online: o próprio `ai-pricing.json` servido pelo GitHub (raw, branch main). As páginas de
 * preço dos fornecedores mudam de layout e algumas recusam leitura automática; um JSON versionado
 * no repositório é estável, sem chave e revisado em PR. A cópia embutida é a reserva offline.
 * Tudo que vem da rede passa por `parseAiPricing` antes de ser usado: é fronteira de confiança.
 */

const bundledTable = require('./ai-pricing.json')

const PRICING_URL = 'https://raw.githubusercontent.com/Felipe-Alcantara/Felixo-AI-Core/main/app/electron/services/ai-pricing.json'
// Frankfurter: taxa de referência do Banco Central Europeu, grátis e sem chave, com a data.
const RATE_URL = 'https://api.frankfurter.dev/v1/latest?base=USD&symbols=BRL'
const RATE_SOURCE = 'Frankfurter (taxa de referência do BCE)'
const TIMEOUT_MS = 8000
const MAX_BYTES = 512 * 1024
const CACHE_MS = 60 * 60 * 1000
const MAX_ITEMS = 1000

const DATE = /^\d{4}-\d{2}-\d{2}$/
const ID = /^[a-z0-9][a-z0-9._-]{0,79}$/

function text(value, max) {
  return typeof value === 'string' && value.trim() && value.length <= max ? value.trim() : null
}

/** Preço em dólar: número finito e não negativo; qualquer outra coisa é "sem preço" (`null`), nunca zero. */
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
function baseItem(raw) {
  if (!raw || typeof raw !== 'object') return null
  const id = typeof raw.id === 'string' && ID.test(raw.id) ? raw.id : null
  const provider = typeof raw.provider === 'string' && ID.test(raw.provider) ? raw.provider : null
  const name = text(raw.name, 120)
  const source = httpsUrl(raw.source)
  const asOf = typeof raw.asOf === 'string' && DATE.test(raw.asOf) ? raw.asOf : null
  if (!id || !provider || !name || !source || !asOf) return null
  const item = { id, provider, name, source, asOf }
  const note = text(raw.note, 300)
  if (note) item.note = note
  return item
}

/**
 * Valida a tabela (embutida ou baixada). Devolve `null` se o envelope não confere ou se nada sobra.
 * @returns {{ asOf: string, currency: 'USD', models: object[], subscriptions: object[] } | null}
 */
function parseAiPricing(raw) {
  if (!raw || typeof raw !== 'object' || raw.schemaVersion !== 1 || raw.currency !== 'USD') return null
  if (typeof raw.asOf !== 'string' || !DATE.test(raw.asOf)) return null
  if (!Array.isArray(raw.models) || !Array.isArray(raw.subscriptions)) return null
  const models = []
  const seen = new Set()
  for (const entry of raw.models.slice(0, MAX_ITEMS)) {
    const item = baseItem(entry)
    if (!item || seen.has(item.id)) continue
    seen.add(item.id)
    for (const key of ['input', 'output', 'cacheRead', 'cacheWrite5m', 'cacheWrite1h']) item[key] = price(entry[key])
    models.push(item)
  }
  const subscriptions = []
  for (const entry of raw.subscriptions.slice(0, MAX_ITEMS)) {
    const item = baseItem(entry)
    if (!item) continue
    item.monthlyUsd = price(entry.monthlyUsd)
    item.unit = entry.unit === 'usuário/mês' ? 'usuário/mês' : 'mês'
    item.models = Array.isArray(entry.models) ? entry.models.filter((id) => typeof id === 'string' && seen.has(id)) : []
    subscriptions.push(item)
  }
  if (models.length === 0 && subscriptions.length === 0) return null
  return { asOf: raw.asOf, currency: 'USD', models, subscriptions }
}

/** Cotação USD→BRL do Frankfurter; `null` se a resposta não for a esperada. */
function parseUsdBrlRate(raw) {
  const rate = raw?.rates?.BRL
  if (raw?.base !== 'USD' || typeof rate !== 'number' || !Number.isFinite(rate) || rate < 0.5 || rate > 100) return null
  if (typeof raw.date !== 'string' || !DATE.test(raw.date)) return null
  return { brlPerUsd: rate, date: raw.date, source: RATE_SOURCE }
}

async function fetchJson(fetchImpl, url, timeoutMs) {
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs), headers: { accept: 'application/json' } })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const body = await response.text()
  if (body.length > MAX_BYTES) throw new Error('resposta grande demais')
  return JSON.parse(body)
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
 * @param {{ fetchImpl?: typeof fetch, bundled?: unknown, pricingUrl?: string, rateUrl?: string, timeoutMs?: number, now?: () => number }} [options]
 */
function createAiPricingCatalog({
  fetchImpl = globalThis.fetch,
  bundled = bundledTable,
  pricingUrl = PRICING_URL,
  rateUrl = RATE_URL,
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
    const [tableResult, rateResult] = await Promise.allSettled([
      fetchJson(fetchImpl, pricingUrl, timeoutMs),
      fetchJson(fetchImpl, rateUrl, timeoutMs),
    ])
    if (tableResult.status === 'fulfilled') {
      const online = parseAiPricing(tableResult.value)
      if (!online) onlineError = 'a tabela baixada não passou na validação'
      // A cópia embutida pode ser mais nova que a da main (app de uma branch à frente): vale a data mais recente.
      else if (!table || online.asOf >= table.asOf) {
        table = online
        origin = 'online'
      }
    } else {
      onlineError = 'sem acesso à tabela online'
    }
    const rate = rateResult.status === 'fulfilled' ? parseUsdBrlRate(rateResult.value) : null
    return { table, origin, onlineError, rate, fetchedAt: new Date(now()).toISOString() }
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

module.exports = { createAiPricingCatalog, parseAiPricing, parseUsdBrlRate, toCostPricing, PRICING_URL, RATE_URL }

'use strict'

const fs = require('node:fs')
const path = require('node:path')
const readline = require('node:readline')

/**
 * Custo equivalente do Claude por dia, projeto e modelo, lido das conversas locais
 * (`<CLAUDE_CONFIG_DIR>/projects/**\/*.jsonl`). Só números saem: nunca texto, título nem
 * caminho completo (o projeto é o nome da pasta).
 *
 * Preço não mora no código: vem de um arquivo do usuário com fonte e data (`loadPricing`).
 * Sem preço para o modelo, o custo é `null` e os tokens continuam somados.
 */

const MAX_FILES = 5000
const MILLION = 1e6

function toCount(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
}

/**
 * Valida o arquivo de preços. Formato:
 * `{ source, asOf, currency: 'USD', models: { '<prefixo do modelo>': { input, output, cacheRead, cacheWrite5m, cacheWrite1h } } }`
 * com valores em dólar por milhão de tokens. Sem `source` e `asOf` o arquivo é recusado: preço sem
 * origem e data é o que esta task proíbe.
 *
 * @returns {{ source: string, asOf: string, currency: 'USD', models: Record<string, Record<string, number>> } | null}
 */
function parsePricing(raw) {
  if (!raw || typeof raw !== 'object') return null
  if (typeof raw.source !== 'string' || !raw.source.trim()) return null
  if (typeof raw.asOf !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw.asOf)) return null
  if (raw.currency !== 'USD' || !raw.models || typeof raw.models !== 'object') return null
  const models = {}
  for (const [prefix, rates] of Object.entries(raw.models)) {
    if (!prefix || !rates || typeof rates !== 'object') continue
    const clean = {}
    for (const key of ['input', 'output', 'cacheRead', 'cacheWrite5m', 'cacheWrite1h']) {
      if (typeof rates[key] === 'number' && rates[key] >= 0 && Number.isFinite(rates[key])) clean[key] = rates[key]
    }
    // Sem entrada e saída o custo seria subestimado em silêncio.
    if (clean.input !== undefined && clean.output !== undefined) models[prefix] = clean
  }
  return { source: raw.source.trim(), asOf: raw.asOf, currency: 'USD', models }
}

function loadPricing(file) {
  try {
    return parsePricing(JSON.parse(fs.readFileSync(file, 'utf8')))
  } catch {
    return null
  }
}

function ratesFor(pricing, model) {
  if (!pricing) return null
  let best = null
  for (const prefix of Object.keys(pricing.models)) {
    if (model.startsWith(prefix) && (best === null || prefix.length > best.length)) best = prefix
  }
  return best === null ? null : pricing.models[best]
}

function costOf(rates, tokens) {
  const input = rates.input
  // Sem tarifa de cache própria, o cache cai na de entrada (mais caro que o real, nunca zero).
  const write5m = rates.cacheWrite5m ?? input
  const write1h = rates.cacheWrite1h ?? write5m
  return (
    (tokens.input * input +
      tokens.output * rates.output +
      tokens.cacheRead * (rates.cacheRead ?? input) +
      tokens.cacheWrite5m * write5m +
      tokens.cacheWrite1h * write1h) /
    MILLION
  )
}

function listJsonl(dir, out) {
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    if (out.length >= MAX_FILES) return
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) listJsonl(full, out)
    else if (entry.isFile() && entry.name.endsWith('.jsonl')) out.push(full)
  }
}

function usageTokens(usage) {
  const created = usage.cache_creation && typeof usage.cache_creation === 'object' ? usage.cache_creation : null
  const write1h = toCount(created?.ephemeral_1h_input_tokens)
  const writeTotal = toCount(usage.cache_creation_input_tokens)
  return {
    input: toCount(usage.input_tokens),
    output: toCount(usage.output_tokens),
    cacheRead: toCount(usage.cache_read_input_tokens),
    cacheWrite1h: write1h,
    cacheWrite5m: created ? toCount(created.ephemeral_5m_input_tokens) : writeTotal,
  }
}

/**
 * @param {{ roots: string[], pricing?: ReturnType<typeof parsePricing>, sinceMs?: number }} params
 *   `roots`: pastas de configuração do Claude (`~/.claude` e a de cada perfil de conta).
 */
async function scanClaudeUsage({ roots, pricing = null, sinceMs = 0 }) {
  const files = []
  for (const root of roots) listJsonl(path.join(root, 'projects'), files)
  const seen = new Set()
  const rows = new Map()
  let filesRead = 0
  for (const file of files) {
    try {
      if (sinceMs && fs.statSync(file).mtimeMs < sinceMs) continue
    } catch {
      continue
    }
    filesRead += 1
    let project = null
    const lines = readline.createInterface({ input: fs.createReadStream(file, { encoding: 'utf8' }), crlfDelay: Infinity })
    try {
      for await (const line of lines) {
        if (!line.includes('"usage"') && !line.includes('"cwd"')) continue
        let entry
        try {
          entry = JSON.parse(line)
        } catch {
          continue
        }
        if (project === null && typeof entry.cwd === 'string' && entry.cwd) project = path.basename(entry.cwd.replace(/[\/]+$/, ''))
        const message = entry.message
        if (entry.type !== 'assistant' || !message?.usage || typeof message.model !== 'string') continue
        // Conversa retomada copia mensagens antigas para outro arquivo: conta cada resposta uma vez.
        const key = `${message.id ?? ''}:${entry.requestId ?? ''}`
        if (key !== ':') {
          if (seen.has(key)) continue
          seen.add(key)
        }
        const time = Date.parse(entry.timestamp)
        if (!Number.isFinite(time) || time < sinceMs || message.model.startsWith('<')) continue
        const tokens = usageTokens(message.usage)
        // shortcut: dia em UTC (como o carimbo da conversa), trocar por fuso local se o Felipe pedir.
        const day = new Date(time).toISOString().slice(0, 10)
        const name = project ?? path.basename(path.dirname(file))
        const id = `${day}\u0000${name}\u0000${message.model}`
        const row = rows.get(id) ?? { day, project: name, model: message.model, messages: 0, input: 0, output: 0, cacheRead: 0, cacheWrite5m: 0, cacheWrite1h: 0 }
        row.messages += 1
        for (const field of ['input', 'output', 'cacheRead', 'cacheWrite5m', 'cacheWrite1h']) row[field] += tokens[field]
        rows.set(id, row)
      }
    } catch {
      // arquivo sumiu ou ilegível no meio da leitura: segue com os demais
    } finally {
      lines.close()
    }
  }
  const unpricedModels = new Set()
  const result = [...rows.values()]
    .sort((a, b) => a.day.localeCompare(b.day) || a.project.localeCompare(b.project) || a.model.localeCompare(b.model))
    .map((row) => {
      const rates = ratesFor(pricing, row.model)
      if (!rates) unpricedModels.add(row.model)
      return { ...row, costUsd: rates ? costOf(rates, row) : null }
    })
  return {
    rows: result,
    unpricedModels: [...unpricedModels].sort(),
    pricing: pricing ? { source: pricing.source, asOf: pricing.asOf, currency: pricing.currency } : null,
    filesRead,
    truncated: files.length >= MAX_FILES,
  }
}

module.exports = { scanClaudeUsage, loadPricing, parsePricing }

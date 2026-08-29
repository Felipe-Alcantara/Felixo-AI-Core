'use strict'

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

/**
 * Leitura local da quota do Codex.
 *
 * `codex login status` só informa que existe sessão; o número do plano nunca
 * aparece numa saída não interativa. Mas a própria CLI grava o objeto
 * `rate_limits` que recebe da API em cada evento `token_count` do rollout da
 * sessão, em `~/.codex/sessions/<ano>/<mês>/<dia>/rollout-*.jsonl`.
 *
 * Este módulo lê esse arquivo — nunca executa a CLI e nunca escreve nada — e
 * devolve o último `rate_limits` observado. É a fonte oficial da própria
 * ferramenta, só que lida do disco em vez de uma sessão interativa; por isso o
 * horário devolvido é o do evento, não o da consulta: o painel mostra "lido às
 * X, medido às Y" em vez de fingir que o número é do instante atual.
 */

/** Trecho lido a partir do fim do arquivo antes de crescer a janela. */
const TAIL_CHUNK_BYTES = 128 * 1024
/** Teto por arquivo: rollouts longos passam de 50 MB e não cabem na memória. */
const MAX_TAIL_BYTES = 4 * 1024 * 1024
/** Rollouts inspecionados, do mais recente para o mais antigo. */
const MAX_ROLLOUTS_INSPECTED = 6

const NO_ROLLOUT_MESSAGE =
  'Nenhuma sessão do Codex com quota registrada foi encontrada em ~/.codex/sessions.'

/**
 * Devolve o `rate_limits` mais recente gravado pela CLI do Codex.
 *
 * @returns {{ok: boolean, collectedAt: string|null, metrics: Array, plan: string|null, message: string|null}}
 */
function readCodexLocalUsage({ homeDir = os.homedir(), fileSystem = fs } = {}) {
  const rollouts = listRecentRollouts(homeDir, fileSystem)

  for (const rollout of rollouts) {
    const event = readLastRateLimitEvent(rollout, fileSystem)
    if (event) {
      return {
        ok: true,
        collectedAt: event.observedAt,
        metrics: toUsageMetrics(event.rateLimits),
        plan: cleanPlan(event.rateLimits?.plan_type),
        message: null,
      }
    }
  }

  return {
    ok: false,
    collectedAt: null,
    metrics: [],
    plan: null,
    message: NO_ROLLOUT_MESSAGE,
  }
}

/**
 * Conta logada no Codex, como a própria CLI a conhece.
 *
 * `codex login status` responde só "Logged in using ChatGPT", sem dizer qual
 * conta é. Quem sabe disso é o `auth.json`, e é por isso que ele é lido aqui.
 *
 * `auth.json` é arquivo de credencial, então a leitura é deliberadamente
 * estreita: das claims do `id_token` saem apenas e-mail, id da conta e plano —
 * os mesmos campos que a CLI mostra na tela. O token não é validado, não é
 * devolvido, não é persistido e não sai deste módulo; o e-mail vira fingerprint
 * SHA-256 e forma mascarada antes de chegar ao painel.
 */
function readCodexIdentity({ homeDir = os.homedir(), fileSystem = fs } = {}) {
  const authPath = path.join(homeDir, '.codex', 'auth.json')

  let payload
  try {
    payload = JSON.parse(fileSystem.readFileSync(authPath, 'utf8'))
  } catch {
    return { identity: null, plan: null }
  }

  const claims = decodeJwtClaims(payload?.tokens?.id_token)
  const openAiAuth = claims?.['https://api.openai.com/auth']

  return {
    identity:
      cleanClaim(claims?.email) ??
      cleanClaim(openAiAuth?.chatgpt_account_id) ??
      cleanClaim(payload?.tokens?.account_id),
    plan: cleanPlan(openAiAuth?.chatgpt_plan_type),
  }
}

/**
 * Lê o corpo do JWT sem verificar assinatura: aqui ele não autoriza nada, só
 * responde "qual conta está logada". A assinatura importaria se o valor fosse
 * usado para dar acesso — e ele nunca é.
 */
function decodeJwtClaims(token) {
  if (typeof token !== 'string') {
    return null
  }

  const [, claims] = token.split('.')

  if (!claims) {
    return null
  }

  try {
    return JSON.parse(Buffer.from(claims, 'base64url').toString('utf8'))
  } catch {
    return null
  }
}

function cleanClaim(value) {
  return typeof value === 'string' && value.trim()
    ? value.trim().slice(0, 160)
    : null
}

/** Rollouts existentes, do mais recente para o mais antigo pelo mtime. */
function listRecentRollouts(homeDir, fileSystem) {
  const sessionsDir = path.join(homeDir, '.codex', 'sessions')

  let entries
  try {
    entries = fileSystem.readdirSync(sessionsDir, {
      recursive: true,
      withFileTypes: true,
    })
  } catch {
    return []
  }

  const files = []

  for (const entry of entries) {
    if (entry.isDirectory?.() || !isRolloutName(entry.name)) {
      continue
    }

    // `parentPath` é o campo atual do Node; `path` é o nome antigo do mesmo
    // dado e continua aqui para não depender da versão instalada.
    const parent = entry.parentPath ?? entry.path ?? sessionsDir
    const filePath = path.join(parent, entry.name)

    try {
      files.push({
        path: filePath,
        modifiedAt: fileSystem.statSync(filePath).mtimeMs,
      })
    } catch {
      // Arquivo apagado entre a listagem e o stat: some da lista.
    }
  }

  return files
    .sort((a, b) => b.modifiedAt - a.modifiedAt)
    .slice(0, MAX_ROLLOUTS_INSPECTED)
    .map((file) => file.path)
}

function isRolloutName(name) {
  return (
    typeof name === 'string' &&
    name.startsWith('rollout-') &&
    name.endsWith('.jsonl')
  )
}

/**
 * Varre o arquivo do fim para o começo procurando o último evento com
 * `rate_limits`. A janela cresce só enquanto não achar, porque a esmagadora
 * maioria dos rollouts responde no primeiro trecho.
 */
function readLastRateLimitEvent(filePath, fileSystem) {
  let handle
  let size

  try {
    size = fileSystem.statSync(filePath).size
    handle = fileSystem.openSync(filePath, 'r')
  } catch {
    return null
  }

  try {
    for (
      let window = TAIL_CHUNK_BYTES;
      window <= MAX_TAIL_BYTES;
      window *= 2
    ) {
      const readBytes = Math.min(window, size)
      const buffer = Buffer.alloc(readBytes)
      fileSystem.readSync(handle, buffer, 0, readBytes, size - readBytes)

      const event = findLastRateLimitEvent(
        buffer.toString('utf8'),
        readBytes < size,
      )
      if (event) {
        return event
      }

      if (readBytes >= size) {
        return null
      }
    }
  } catch {
    return null
  } finally {
    try {
      fileSystem.closeSync(handle)
    } catch {
      // Fechar é higiene; falhar aqui não muda o resultado da leitura.
    }
  }

  return null
}

/**
 * @param {string} chunk trecho lido do fim do arquivo
 * @param {boolean} isPartial descarta a primeira linha, cortada ao meio
 */
function findLastRateLimitEvent(chunk, isPartial) {
  const lines = chunk.split('\n')

  if (isPartial) {
    lines.shift()
  }

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]
    if (!line || !line.includes('"rate_limits"')) {
      continue
    }

    let entry
    try {
      entry = JSON.parse(line)
    } catch {
      continue
    }

    const rateLimits = entry?.payload?.rate_limits
    if (!rateLimits || typeof rateLimits !== 'object') {
      continue
    }

    return {
      observedAt: toIsoTimestamp(entry?.timestamp) ?? new Date().toISOString(),
      rateLimits,
    }
  }

  return null
}

/**
 * Converte as janelas do Codex em métricas do painel. `used_percent` é o dado
 * publicado; o limite é a própria escala de 100%, então o restante é derivado
 * dela — e o zero continua sendo zero, nunca "desconhecido".
 */
function toUsageMetrics(rateLimits) {
  const metrics = []

  for (const [key, windowKey] of [
    ['primary', 'primary'],
    ['secondary', 'secondary'],
  ]) {
    const metric = toWindowMetric(key, rateLimits?.[windowKey])
    if (metric) {
      metrics.push(metric)
    }
  }

  const credits = toCreditsMetric(rateLimits?.credits)
  if (credits) {
    metrics.push(credits)
  }

  return metrics
}

function toWindowMetric(key, window) {
  const used = toFiniteNumber(window?.used_percent)

  if (used === null) {
    return null
  }

  return {
    key,
    label: describeWindow(window?.window_minutes, key),
    used,
    limit: 100,
    remaining: Math.max(0, Math.round((100 - used) * 100) / 100),
    unit: '%',
    precision: 'reported',
    resetAt: toIsoTimestamp(window?.resets_at),
  }
}

function toCreditsMetric(credits) {
  if (credits?.unlimited === true) {
    return null
  }

  const balance = toFiniteNumber(credits?.balance)

  if (balance === null) {
    return null
  }

  return {
    key: 'credits',
    label: 'Créditos avulsos',
    used: null,
    limit: null,
    remaining: balance,
    unit: null,
    precision: 'reported',
    resetAt: null,
  }
}

/** Traduz a janela em minutos para o rótulo que a pessoa reconhece. */
function describeWindow(minutes, fallbackKey) {
  const value = toFiniteNumber(minutes)

  if (value === null || value <= 0) {
    return fallbackKey === 'primary' ? 'Janela principal' : 'Janela secundária'
  }

  if (value % (60 * 24) === 0) {
    const days = value / (60 * 24)
    return days === 1 ? 'Últimas 24 h' : `Últimos ${days} dias`
  }

  if (value % 60 === 0) {
    const hours = value / 60
    return hours === 1 ? 'Última 1 h' : `Últimas ${hours} h`
  }

  return `Últimos ${value} min`
}

function cleanPlan(value) {
  return typeof value === 'string' && value.trim()
    ? value.trim().slice(0, 40)
    : null
}

function toFiniteNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null
  }

  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) ? number : null
}

/** Aceita tanto o epoch em segundos do `resets_at` quanto ISO já pronto. */
function toIsoTimestamp(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value * 1000).toISOString()
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
  }

  return null
}

module.exports = {
  NO_ROLLOUT_MESSAGE,
  readCodexIdentity,
  readCodexLocalUsage,
}

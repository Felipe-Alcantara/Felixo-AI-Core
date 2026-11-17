'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { parseAgentUsage } = require('./agent-usage-report.cjs')

/**
 * Consumo de cada terminal de agente vivo, lido do que a própria CLI já grava.
 *
 * Hoje só o Claude: o script da status line do app (ligado por `--settings` no lançamento do
 * terminal) grava `sessions/<ptySessionId>.json` a cada resposta. Aqui o processo principal
 * faz um `stat` por segundo por terminal vivo (por `mtime`, como `agent-usage-watcher.cjs`,
 * sem `fs.watch`) e lê o arquivo só quando ele muda. Nada passa por `pty:data`.
 *
 * Cada leitura tem o formato `SessionReading`: o consumo da sessão e a janela da conta dela.
 * A chave é o ID do terminal, não o `session_id` do Claude, que muda no `/clear`. A janela vai
 * para a conta do terminal (`accountId` do PTY); o consumo fica só em memória.
 *
 * O arquivo é de um terminal vivo: terminal fechado sai da memória e o arquivo é apagado, e o
 * que sobrou de um app que caiu é apagado na partida.
 */

const POLL_MS = 1000
const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{1,100}$/

/**
 * @typedef {object} SessionReading
 * @property {string} ptySessionId
 * @property {string} providerId
 * @property {string | null} accountId
 * @property {string | null} agentSessionId
 * @property {'claude-statusline'} source
 * @property {string} measuredAt
 * @property {{ tokens: { input: number | null, output: number | null, cacheRead: number | null, cacheWrite: number | null, reasoning: number | null, total: number | null } | null, contextUsedPercent: number | null, contextWindowTokens: number | null, costUsdEquivalent: number | null, model: string | null, effort: string | null, fastMode: boolean }} session
 * @property {Array<object>} accountWindows
 */

function createAgentUsageSessionCapture({
  sessionsDir,
  listSessions,
  recordWindows = async () => {},
  onChanged = () => {},
  fileSystem = fs,
  pollMs = POLL_MS,
} = {}) {
  /** @type {Map<string, SessionReading>} */
  const readings = new Map()
  /** `mtime:tamanho` do arquivo na última leitura, por terminal. */
  const fingerprints = new Map()
  let timer = null

  function fileOf(ptySessionId) {
    return path.join(sessionsDir, `${ptySessionId}.json`)
  }

  function fingerprint(filePath) {
    try {
      const stats = fileSystem.statSync(filePath)
      return `${stats.mtimeMs}:${stats.size}`
    } catch {
      return null
    }
  }

  function removeFile(ptySessionId) {
    try {
      fileSystem.unlinkSync(fileOf(ptySessionId))
    } catch {
      // Já não existia.
    }
  }

  function liveClaudeSessions() {
    let sessions = []
    try {
      sessions = listSessions() ?? []
    } catch {
      sessions = []
    }
    return sessions.filter(
      (session) =>
        session?.providerId === 'claude' && SESSION_ID_PATTERN.test(String(session.sessionId)),
    )
  }

  function tick() {
    const live = liveClaudeSessions()
    const liveIds = new Set(live.map((session) => session.sessionId))
    const changed = []
    const removed = []

    for (const session of live) {
      const id = session.sessionId
      const current = fingerprint(fileOf(id))

      if (current === null || fingerprints.get(id) === current) {
        continue
      }

      fingerprints.set(id, current)
      const reading = readSessionFile(fileSystem, fileOf(id), session)

      if (!reading) {
        continue
      }

      readings.set(id, reading)
      changed.push(reading)
      deliverWindows(reading)
    }

    for (const id of [...readings.keys(), ...fingerprints.keys()]) {
      if (liveIds.has(id)) {
        continue
      }
      if (readings.delete(id)) {
        removed.push(id)
      }
      fingerprints.delete(id)
      removeFile(id)
    }

    if (changed.length || removed.length) {
      onChanged({ changed, removed })
    }
  }

  function deliverWindows(reading) {
    if (!reading.accountWindows.length) {
      return
    }

    // O serviço decide: número novo grava amostra, o mesmo número só confirma (avança o `measuredAt`).
    Promise.resolve(recordWindows(reading)).catch(() => {
      // Uma leitura que falhou não derruba a captura: a próxima resposta tenta de novo.
    })
  }

  function purgeLeftovers() {
    try {
      const live = new Set(liveClaudeSessions().map((session) => session.sessionId))
      for (const name of fileSystem.readdirSync(sessionsDir)) {
        const id = name.endsWith('.json') ? name.slice(0, -'.json'.length) : null
        // `.tmp` de uma gravação interrompida também sai.
        if ((id && !live.has(id)) || name.endsWith('.tmp')) {
          fileSystem.unlinkSync(path.join(sessionsDir, name))
        }
      }
    } catch {
      // Pasta ainda não existe: nada a limpar.
    }
  }

  function start() {
    purgeLeftovers()
    timer = setInterval(tick, pollMs)
    timer.unref?.()
  }

  function stop() {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
    readings.clear()
    fingerprints.clear()
  }

  return {
    start,
    stop,
    tick,
    list: () => [...readings.values()],
  }
}

/**
 * Lê e valida o arquivo gravado pelo script. É dado de fora do processo: só passa o que é número
 * finito ou texto curto, o resto vira `null`.
 */
function readSessionFile(fileSystem, filePath, liveSession) {
  let raw
  try {
    raw = JSON.parse(fileSystem.readFileSync(filePath, 'utf8'))
  } catch {
    return null
  }

  if (!raw || typeof raw !== 'object') {
    return null
  }

  const measuredAt = isoOrNull(raw.measuredAt)

  if (!measuredAt) {
    return null
  }

  const input = finiteOrNull(raw.inputTokens)
  const output = finiteOrNull(raw.outputTokens)

  return {
    ptySessionId: liveSession.sessionId,
    providerId: 'claude',
    accountId: liveSession.accountId ?? null,
    agentSessionId: textOrNull(raw.agentSessionId),
    source: 'claude-statusline',
    measuredAt,
    session: {
      tokens:
        input === null && output === null
          ? null
          : {
              input,
              output,
              // A status line só traz o cache da última chamada, não o acumulado.
              cacheRead: null,
              cacheWrite: null,
              reasoning: null,
              total: (input ?? 0) + (output ?? 0),
            },
      contextUsedPercent: finiteOrNull(raw.contextUsedPercent),
      contextWindowTokens: finiteOrNull(raw.contextWindowTokens),
      costUsdEquivalent: finiteOrNull(raw.costUsd),
      model: textOrNull(raw.model),
      effort: textOrNull(raw.effort),
      fastMode: raw.fastMode === true,
    },
    accountWindows: raw.rateLimits && typeof raw.rateLimits === 'object'
      ? parseAgentUsage('claude', JSON.stringify({ rate_limits: raw.rateLimits })).metrics
      : [],
  }
}

function finiteOrNull(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function textOrNull(value) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 100) : null
}

function isoOrNull(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null
}

module.exports = {
  POLL_MS,
  createAgentUsageSessionCapture,
}

'use strict'

const path = require('node:path')
const { randomUUID } = require('node:crypto')
const { buildSessionReport, formatSessionReportMarkdown } = require('./agent-session-report.cjs')

// Retenção: o registro serve a análise de uso, não a memória eterna; 2 anos cobrem o "por ano".
const RETENTION_DAYS = 730
// Intervalo entre duas interações que ainda conta como tempo ativo (depois disso, a pessoa saiu).
const ACTIVE_GAP_MS = 5 * 60 * 1000
const BUCKETS = {
  hour: '%Y-%m-%d %H:00',
  day: '%Y-%m-%d',
  week: '%Y-W%W',
  month: '%Y-%m',
  year: '%Y',
}
const CSV_COLUMNS = [
  'id', 'agent', 'model', 'effort', 'fast', 'account_id', 'project', 'user_id', 'responsible',
  'started_at', 'ended_at', 'ended_reason', 'wall_ms', 'active_ms', 'interactions',
]

/** Lê modelo, esforço e fast dos argumentos de launch (`agent-launch-options.ts`). */
function parseLaunchArgs(args) {
  const list = Array.isArray(args) ? args.map(String) : []
  const after = (flag) => {
    const index = list.indexOf(flag)
    return index >= 0 && index + 1 < list.length ? list[index + 1] : null
  }
  const codexEffort = list.find((a) => a.startsWith('model_reasoning_effort='))
  return {
    model: after('--model') ?? after('-m'),
    effort: after('--effort') ?? (codexEffort ? codexEffort.split('=')[1].replace(/["']/g, '') : null),
    fast: list.includes('service_tier=priority'),
  }
}

/** Nome livre do responsável: texto curto sem quebra de linha; vazio vira nulo. */
function cleanResponsible(value) {
  const text = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, 60) : ''
  return text || null
}

const NO_RESPONSIBLE = 'Sem responsável'

/**
 * Resumo do período por pessoa, só com o que o registro guarda: sessões, interações, tempo ativo
 * e como cada sessão terminou. Resultado de tarefa e aprovação pendente não são registrados.
 */
function summarizeSessions(sessions) {
  const people = new Map()
  for (const s of sessions) {
    const name = s.responsible ?? NO_RESPONSIBLE
    let person = people.get(name)
    if (!person) {
      person = { responsible: name, sessions: 0, interactions: 0, active_ms: 0, wall_ms: 0, open: 0, interrupted: 0, idle: 0, agents: new Map() }
      people.set(name, person)
    }
    person.sessions += 1
    person.interactions += s.interactions
    person.active_ms += s.active_ms
    person.wall_ms += s.wall_ms
    if (!s.ended_at) person.open += 1
    // app_closed: o app fechou ou caiu com a sessão aberta, ou seja, ela não terminou por conta própria.
    if (s.ended_reason === 'app_closed') person.interrupted += 1
    if (s.interactions === 0) person.idle += 1
    const key = `${s.agent ?? '?'}|${s.model ?? ''}`
    const agent = person.agents.get(key) ?? { agent: s.agent, model: s.model, sessions: 0, interactions: 0, active_ms: 0 }
    agent.sessions += 1
    agent.interactions += s.interactions
    agent.active_ms += s.active_ms
    person.agents.set(key, agent)
  }
  return [...people.values()]
    .map((p) => ({ ...p, agents: [...p.agents.values()].sort((a, b) => b.sessions - a.sessions) }))
    .sort((a, b) => (a.responsible === NO_RESPONSIBLE) - (b.responsible === NO_RESPONSIBLE) || a.responsible.localeCompare(b.responsible, 'pt-BR'))
}

function agentFromCommand(command, providerId) {
  if (providerId) return providerId
  const name = path.basename(String(command ?? '')).replace(/\.(exe|cmd|ps1)$/i, '')
  return name || null
}

function csvCell(value) {
  const text = value === null || value === undefined ? '' : String(value)
  // O apóstrofo impede que a planilha execute célula iniciada por = + - @ (injeção de fórmula).
  const safe = /^[=+\-@]/.test(text) && Number.isNaN(Number(text)) ? "'" + text : text
  return /[",\r\n]/.test(safe) ? '"' + safe.replace(/"/g, '""') + '"' : safe
}

function createAgentSessionLogRepository(database, { now = () => new Date(), userId = 'local' } = {}) {
  const connection = database?.connection ?? database
  if (!connection || typeof connection.prepare !== 'function') {
    throw new Error('Conexao SQLite invalida para agent session log repository.')
  }
  // id do PTY -> id da linha aberta (o id do PTY se reaproveita a cada reabertura do bloco).
  const open = new Map()
  const iso = () => now().toISOString()

  function endRow(id, reason) {
    connection
      .prepare('UPDATE agent_sessions SET ended_at = ?, ended_reason = ? WHERE id = ? AND ended_at IS NULL')
      .run(iso(), reason, id)
  }

  return {
    /** Abre o registro; reabrir o mesmo PTY fecha o anterior (kill + re-spawn). */
    start({ sessionId, command, args, cwd, accountId, providerId, responsible }) {
      if (open.has(sessionId)) endRow(open.get(sessionId), 'exit')
      const id = randomUUID()
      const launch = parseLaunchArgs(args)
      connection
        .prepare(
          `INSERT INTO agent_sessions
             (id, pty_session_id, agent, provider_id, model, effort, fast, account_id, project, user_id, started_at, responsible)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          id, sessionId, agentFromCommand(command, providerId), providerId ?? null, launch.model, launch.effort,
          launch.fast ? 1 : 0, accountId ?? null, cwd ? path.basename(String(cwd)) : null, userId, iso(),
          cleanResponsible(responsible),
        )
      open.set(sessionId, id)
      return id
    },
    interaction(sessionId, chars) {
      const id = open.get(sessionId)
      if (!id) return
      connection
        .prepare('INSERT INTO agent_interactions (session_id, at, kind, chars) VALUES (?, ?, ?, ?)')
        .run(id, iso(), 'manual', Math.max(0, Math.trunc(Number(chars) || 0)))
    },
    setCliSession(sessionId, ref) {
      const id = open.get(sessionId)
      if (!id || typeof ref !== 'string' || !ref) return
      connection.prepare('UPDATE agent_sessions SET cli_session_ref = ? WHERE id = ?').run(ref, id)
    },
    end(sessionId, reason = 'exit') {
      const id = open.get(sessionId)
      if (!id) return
      open.delete(sessionId)
      endRow(id, reason)
    },
    /** Fecha o que ficou aberto (app fechado ou caído) e poda o que passou da retenção. */
    closeOpen(reason = 'app_closed') {
      open.clear()
      const info = connection
        .prepare('UPDATE agent_sessions SET ended_at = ?, ended_reason = ? WHERE ended_at IS NULL')
        .run(iso(), reason)
      const cutoff = new Date(now().getTime() - RETENTION_DAYS * 86_400_000).toISOString()
      connection.prepare('DELETE FROM agent_sessions WHERE started_at < ?').run(cutoff)
      return Number(info.changes ?? 0)
    },
    /** Uma linha por sessão, com duração de relógio, tempo ativo e número de interações. */
    listSessions({ from, to } = {}) {
      const sessions = connection
        .prepare('SELECT * FROM agent_sessions WHERE started_at >= ? AND started_at < ? ORDER BY started_at')
        .all(from ?? '0000', to ?? '9999')
      const stamps = connection.prepare('SELECT at FROM agent_interactions WHERE session_id = ? ORDER BY at')
      return sessions.map((row) => {
        const times = stamps.all(row.id).map((r) => Date.parse(r.at))
        let active = 0
        for (let i = 1; i < times.length; i += 1) {
          const gap = times[i] - times[i - 1]
          if (gap <= ACTIVE_GAP_MS) active += gap
        }
        const end = row.ended_at ? Date.parse(row.ended_at) : now().getTime()
        return {
          id: row.id, agent: row.agent, model: row.model, effort: row.effort, fast: row.fast,
          account_id: row.account_id, project: row.project, user_id: row.user_id, responsible: row.responsible ?? null,
          started_at: row.started_at, ended_at: row.ended_at, ended_reason: row.ended_reason,
          wall_ms: Math.max(0, end - Date.parse(row.started_at)), active_ms: active, interactions: times.length,
        }
      })
    },
    /** Totais por hora/dia/semana/mês/ano, agrupados por agente e modelo. */
    aggregate({ from, to, bucket = 'day' } = {}) {
      const format = BUCKETS[bucket]
      if (!format) throw new Error(`Periodo invalido: ${bucket}`)
      return connection
        .prepare(
          `SELECT strftime('${format}', s.started_at) AS period, s.agent AS agent, s.model AS model,
                  COUNT(*) AS sessions,
                  SUM((SELECT COUNT(*) FROM agent_interactions i WHERE i.session_id = s.id)) AS interactions
           FROM agent_sessions s
           WHERE s.started_at >= ? AND s.started_at < ?
           GROUP BY period, agent, model ORDER BY period, agent, model`,
        )
        .all(from ?? '0000', to ?? '9999')
        .map((row) => ({ ...row }))
    },
    /** Relatório da sessão do período: horas ativas, pausas e tempo por frente (projeto), de todos os agentes. */
    sessionReport({ from, to, pauseMs, timeZone } = {}) {
      const range = [from ?? '0000', to ?? '9999']
      // Início de sessão e texto enviado são atividade; o fim da sessão não é.
      const rows = connection
        .prepare(
          `SELECT i.at AS at, s.project AS project FROM agent_interactions i JOIN agent_sessions s ON s.id = i.session_id
           WHERE i.at >= ? AND i.at < ?
           UNION ALL SELECT started_at, project FROM agent_sessions WHERE started_at >= ? AND started_at < ?`,
        )
        .all(...range, ...range)
      const report = buildSessionReport(rows.map((row) => ({ at: Date.parse(row.at), project: row.project })), { pauseMs })
      return { report, markdown: formatSessionReportMarkdown(report, { timeZone }) }
    },
    /** Resumo do período (o dia, no painel) por pessoa responsável; lê só o registro, nada sai do app. */
    dailySummary({ from, to } = {}) {
      const sessions = this.listSessions({ from, to })
      return { generatedAt: iso(), from: from ?? null, to: to ?? null, sessions: sessions.length, people: summarizeSessions(sessions) }
    },
    /** Conteúdo exportável; nunca inclui texto de prompt (a tabela nem o guarda). */
    exportPeriod({ from, to, format = 'json' } = {}) {
      const sessions = this.listSessions({ from, to })
      if (format === 'csv') {
        return [CSV_COLUMNS.join(','), ...sessions.map((s) => CSV_COLUMNS.map((c) => csvCell(s[c])).join(','))].join('\r\n')
      }
      if (format !== 'json') throw new Error(`Formato invalido: ${format}`)
      const totals = Object.fromEntries(
        Object.keys(BUCKETS).filter((b) => b !== 'hour').map((b) => [b, this.aggregate({ from, to, bucket: b })]),
      )
      return JSON.stringify({ exportedAt: iso(), from: from ?? null, to: to ?? null, sessions, totals }, null, 2)
    },
  }
}

module.exports = { createAgentSessionLogRepository, parseLaunchArgs, summarizeSessions, ACTIVE_GAP_MS }

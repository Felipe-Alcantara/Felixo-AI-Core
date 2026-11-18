'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createStorageDatabase } = require('./sqlite-database.cjs')
const { createAgentSessionLogRepository, parseLaunchArgs } = require('./agent-session-log-repository.cjs')

function hasNodeSqlite() {
  try {
    require('node:sqlite')
    return true
  } catch {
    return false
  }
}

test('parseLaunchArgs le modelo, esforco e fast dos argumentos de launch', () => {
  assert.deepEqual(parseLaunchArgs(['--model', 'opus', '--effort', 'high']), { model: 'opus', effort: 'high', fast: false })
  assert.deepEqual(
    parseLaunchArgs(['--model', 'gpt-5', '-c', 'model_reasoning_effort=xhigh', '-c', 'service_tier=priority']),
    { model: 'gpt-5', effort: 'xhigh', fast: true },
  )
  assert.deepEqual(parseLaunchArgs(undefined), { model: null, effort: null, fast: false })
})

test(
  'registro de sessoes: uma linha por sessao, totais por periodo, fim com o app e nenhum texto',
  { skip: hasNodeSqlite() ? false : 'node:sqlite indisponível neste runtime' },
  () => {
    const databaseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-session-log-'))
    const database = createStorageDatabase({ databaseDir })
    let clock = Date.parse('2026-11-17T10:00:00.000Z')
    const repo = createAgentSessionLogRepository(database, { now: () => new Date(clock) })
    const tick = (ms) => { clock += ms }

    try {
      repo.start({ sessionId: 'pty-1', command: 'claude', args: ['--model', 'opus', '--effort', 'high'], cwd: path.join(os.tmpdir(), 'segredo', 'meu-projeto'), accountId: 'acc-1', providerId: 'claude' })
      tick(60_000)
      repo.interaction('pty-1', 40)
      tick(120_000)
      repo.interaction('pty-1', 12)
      tick(3_600_000) // pausa longa: não conta como tempo ativo
      repo.interaction('pty-1', 5)
      repo.setCliSession('pty-1', 'cli-abc')
      tick(1_000)
      repo.end('pty-1', 'killed')

      repo.start({ sessionId: 'pty-2', command: 'codex', args: ['--model', 'gpt-5'], providerId: 'codex' })
      repo.interaction('pty-2', 3)
      tick(30_000)

      const [first, second] = repo.listSessions({ from: '2026-11-17', to: '2026-11-18' })
      assert.equal(first.agent, 'claude')
      assert.equal(first.model, 'opus')
      assert.equal(first.effort, 'high')
      assert.equal(first.project, 'meu-projeto')
      assert.equal(first.interactions, 3)
      assert.equal(first.active_ms, 120_000)
      assert.equal(first.wall_ms, 3_781_000)
      assert.equal(first.ended_reason, 'killed')
      assert.equal(second.ended_at, null)

      // Fechar o app com a sessão aberta não perde o registro.
      assert.equal(repo.closeOpen('app_closed'), 1)
      assert.equal(repo.listSessions()[1].ended_reason, 'app_closed')

      const days = repo.aggregate({ bucket: 'day' })
      assert.deepEqual(days.map((r) => [r.period, r.agent, r.sessions, r.interactions]), [
        ['2026-11-17', 'claude', 1, 3],
        ['2026-11-17', 'codex', 1, 1],
      ])
      assert.throws(() => repo.aggregate({ bucket: "day'; DROP" }), /Periodo invalido/)

      const csv = repo.exportPeriod({ format: 'csv' })
      assert.equal(csv.split('\r\n').length, 3)
      const json = JSON.parse(repo.exportPeriod({ format: 'json' }))
      assert.equal(json.sessions.length, 2)
      assert.equal(Object.keys(json.totals).join(), 'day,week,month,year')
      assert.doesNotMatch(csv + JSON.stringify(json), /segredo/)
    } finally {
      database.close?.()
      fs.rmSync(databaseDir, { recursive: true, force: true })
    }
  },
)

test(
  'retencao poda sessoes com mais de dois anos',
  { skip: hasNodeSqlite() ? false : 'node:sqlite indisponível neste runtime' },
  () => {
    const databaseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-session-log-'))
    const database = createStorageDatabase({ databaseDir })
    let clock = Date.parse('2024-01-01T00:00:00.000Z')
    const repo = createAgentSessionLogRepository(database, { now: () => new Date(clock) })
    try {
      repo.start({ sessionId: 'velha', command: 'claude' })
      repo.end('velha')
      clock = Date.parse('2026-11-17T00:00:00.000Z')
      repo.closeOpen()
      assert.equal(repo.listSessions().length, 0)
    } finally {
      database.close?.()
      fs.rmSync(databaseDir, { recursive: true, force: true })
    }
  },
)

test(
  'relatorio da sessao: junta agentes, desconta pausas e divide por projeto',
  { skip: hasNodeSqlite() ? false : 'node:sqlite indisponível neste runtime' },
  () => {
    const databaseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-session-log-'))
    const database = createStorageDatabase({ databaseDir })
    let clock = Date.parse('2026-11-17T10:00:00.000Z')
    const repo = createAgentSessionLogRepository(database, { now: () => new Date(clock) })
    const tick = (min) => { clock += min * 60_000 }
    try {
      repo.start({ sessionId: 'a', command: 'claude', cwd: path.join(os.tmpdir(), 'onboarding'), providerId: 'claude' })
      tick(10)
      repo.interaction('a', 5)
      repo.start({ sessionId: 'b', command: 'codex', cwd: path.join(os.tmpdir(), 'site'), providerId: 'codex' })
      tick(10)
      repo.interaction('b', 5)
      tick(90) // pausa
      repo.interaction('a', 5)
      repo.end('a')
      const { report, markdown } = repo.sessionReport({ from: '2026-11-17', to: '2026-11-18', timeZone: 'UTC' })
      assert.equal(report.wallMs, 110 * 60_000)
      assert.equal(report.pauses.length, 1)
      assert.equal(report.activeMs, 20 * 60_000)
      assert.deepEqual(report.fronts.map((f) => [f.project, f.ms / 60_000]), [['onboarding', 10], ['site', 10]])
      assert.match(markdown, /Horas ativas: 0h20/)
      assert.equal(repo.sessionReport({ from: '2030-01-01', to: '2030-01-02' }).report, null)
    } finally {
      database.close?.()
      fs.rmSync(databaseDir, { recursive: true, force: true })
    }
  },
)

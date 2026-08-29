'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const {
  readCodexIdentity,
  readCodexLocalUsage,
} = require('./agent-usage-codex-local.cjs')

function createCodexHome() {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-codex-local-'))
  const sessionsDir = path.join(homeDir, '.codex', 'sessions', '2026', '08', '28')
  fs.mkdirSync(sessionsDir, { recursive: true })
  return { homeDir, sessionsDir }
}

function rateLimitLine({
  timestamp,
  primaryPercent,
  secondaryPercent,
  balance = '0',
}) {
  return JSON.stringify({
    timestamp,
    type: 'event_msg',
    payload: {
      type: 'token_count',
      rate_limits: {
        limit_id: 'codex',
        primary: {
          used_percent: primaryPercent,
          window_minutes: 300,
          resets_at: 1_787_966_920,
        },
        secondary: {
          used_percent: secondaryPercent,
          window_minutes: 10_080,
          resets_at: 1_788_535_712,
        },
        credits: { has_credits: false, unlimited: false, balance },
        plan_type: 'plus',
      },
    },
  })
}

function encodeIdToken(claims) {
  const part = Buffer.from(JSON.stringify(claims), 'utf8').toString('base64url')
  return `header.${part}.signature`
}

test('codex local usage reads the 5h and weekly windows with reset and plan', () => {
  const { homeDir, sessionsDir } = createCodexHome()

  try {
    fs.writeFileSync(
      path.join(sessionsDir, 'rollout-2026-08-28T20-35-02-abc.jsonl'),
      [
        JSON.stringify({ timestamp: '2026-08-28T23:35:12.992Z', type: 'session_meta' }),
        rateLimitLine({
          timestamp: '2026-08-28T23:40:00.000Z',
          primaryPercent: 11,
          secondaryPercent: 5,
        }),
        rateLimitLine({
          timestamp: '2026-08-28T23:44:18.939Z',
          primaryPercent: 27,
          secondaryPercent: 12,
        }),
        '',
      ].join('\n'),
      'utf8',
    )

    const result = readCodexLocalUsage({ homeDir })

    assert.equal(result.ok, true)
    assert.equal(result.plan, 'plus')
    // Vale o último evento do arquivo, não o primeiro que aparecer.
    assert.equal(result.collectedAt, '2026-08-28T23:44:18.939Z')
    assert.deepEqual(
      result.metrics
        .filter((metric) => metric.key !== 'credits')
        .map(({ key, label, used, remaining, unit, resetAt }) => ({
          key,
          label,
          used,
          remaining,
          unit,
          resetAt,
        })),
      [
        {
          key: 'primary',
          label: 'Últimas 5 h',
          used: 27,
          remaining: 73,
          unit: '%',
          resetAt: '2026-08-29T01:28:40.000Z',
        },
        {
          key: 'secondary',
          label: 'Últimos 7 dias',
          used: 12,
          remaining: 88,
          unit: '%',
          resetAt: '2026-09-04T15:28:32.000Z',
        },
      ],
    )
  } finally {
    fs.rmSync(homeDir, { recursive: true, force: true })
  }
})

test('codex local usage keeps a zeroed window as zero, never as unknown', () => {
  const { homeDir, sessionsDir } = createCodexHome()

  try {
    fs.writeFileSync(
      path.join(sessionsDir, 'rollout-zero.jsonl'),
      `${rateLimitLine({
        timestamp: '2026-08-28T10:00:00.000Z',
        primaryPercent: 0,
        secondaryPercent: 0,
      })}\n`,
      'utf8',
    )

    const metrics = readCodexLocalUsage({ homeDir }).metrics

    assert.equal(metrics[0].used, 0)
    assert.equal(metrics[0].remaining, 100)
    assert.equal(metrics[1].used, 0)
  } finally {
    fs.rmSync(homeDir, { recursive: true, force: true })
  }
})

test('codex local usage prefers the most recent rollout across days', () => {
  const { homeDir, sessionsDir } = createCodexHome()

  try {
    const oldRollout = path.join(sessionsDir, 'rollout-old.jsonl')
    const newRollout = path.join(sessionsDir, 'rollout-new.jsonl')

    fs.writeFileSync(
      oldRollout,
      `${rateLimitLine({
        timestamp: '2026-08-27T10:00:00.000Z',
        primaryPercent: 90,
        secondaryPercent: 90,
      })}\n`,
      'utf8',
    )
    fs.writeFileSync(
      newRollout,
      `${rateLimitLine({
        timestamp: '2026-08-28T10:00:00.000Z',
        primaryPercent: 4,
        secondaryPercent: 2,
      })}\n`,
      'utf8',
    )

    fs.utimesSync(oldRollout, new Date('2026-08-27T10:00:00Z'), new Date('2026-08-27T10:00:00Z'))
    fs.utimesSync(newRollout, new Date('2026-08-28T10:00:00Z'), new Date('2026-08-28T10:00:00Z'))

    assert.equal(readCodexLocalUsage({ homeDir }).metrics[0].used, 4)
  } finally {
    fs.rmSync(homeDir, { recursive: true, force: true })
  }
})

test('codex local usage finds the quota in a rollout larger than the tail window', () => {
  const { homeDir, sessionsDir } = createCodexHome()

  try {
    // O evento com quota fica no começo de um arquivo de ~1 MB: só é
    // encontrado se a janela de leitura crescer a partir do fim.
    const filler = `${JSON.stringify({
      timestamp: '2026-08-28T10:00:00.000Z',
      type: 'event_msg',
      payload: { type: 'agent_message', text: 'x'.repeat(400) },
    })}\n`

    fs.writeFileSync(
      path.join(sessionsDir, 'rollout-big.jsonl'),
      `${rateLimitLine({
        timestamp: '2026-08-28T09:00:00.000Z',
        primaryPercent: 42,
        secondaryPercent: 8,
      })}\n${filler.repeat(2200)}`,
      'utf8',
    )

    const result = readCodexLocalUsage({ homeDir })

    assert.equal(result.ok, true)
    assert.equal(result.metrics[0].used, 42)
  } finally {
    fs.rmSync(homeDir, { recursive: true, force: true })
  }
})

test('codex local usage reports absence instead of inventing a number', () => {
  const { homeDir, sessionsDir } = createCodexHome()

  try {
    fs.writeFileSync(
      path.join(sessionsDir, 'rollout-sem-quota.jsonl'),
      `${JSON.stringify({
        timestamp: '2026-08-28T10:00:00.000Z',
        type: 'event_msg',
        payload: { type: 'agent_message' },
      })}\n`,
      'utf8',
    )

    const result = readCodexLocalUsage({ homeDir })

    assert.equal(result.ok, false)
    assert.deepEqual(result.metrics, [])
    assert.match(result.message, /Nenhuma sessão/)
  } finally {
    fs.rmSync(homeDir, { recursive: true, force: true })
  }
})

test('codex identity reads only the account claims, never the tokens', () => {
  const { homeDir } = createCodexHome()

  try {
    fs.writeFileSync(
      path.join(homeDir, '.codex', 'auth.json'),
      JSON.stringify({
        auth_mode: 'chatgpt',
        tokens: {
          id_token: encodeIdToken({
            email: 'pessoa@example.com',
            'https://api.openai.com/auth': {
              chatgpt_account_id: 'f9652a86-8422-4e30-aa87-df3b6ce924bc',
              chatgpt_plan_type: 'plus',
            },
          }),
          access_token: 'sk-never-read-this',
          refresh_token: 'sk-never-read-this-either',
          account_id: 'f9652a86-8422-4e30-aa87-df3b6ce924bc',
        },
      }),
      'utf8',
    )

    const identity = readCodexIdentity({ homeDir })

    assert.deepEqual(identity, { identity: 'pessoa@example.com', plan: 'plus' })
    assert.doesNotMatch(JSON.stringify(identity), /sk-never-read-this/)
  } finally {
    fs.rmSync(homeDir, { recursive: true, force: true })
  }
})

test('codex identity survives a missing or unreadable auth file', () => {
  const { homeDir } = createCodexHome()

  try {
    assert.deepEqual(readCodexIdentity({ homeDir }), { identity: null, plan: null })

    fs.writeFileSync(path.join(homeDir, '.codex', 'auth.json'), 'não é json', 'utf8')
    assert.deepEqual(readCodexIdentity({ homeDir }), { identity: null, plan: null })
  } finally {
    fs.rmSync(homeDir, { recursive: true, force: true })
  }
})

test('codex local usage stays quiet when there is no codex home at all', () => {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-codex-vazio-'))

  try {
    const result = readCodexLocalUsage({ homeDir })

    assert.equal(result.ok, false)
    assert.deepEqual(result.metrics, [])
  } finally {
    fs.rmSync(homeDir, { recursive: true, force: true })
  }
})

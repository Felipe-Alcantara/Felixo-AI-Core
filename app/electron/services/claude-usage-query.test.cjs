'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const platform = require('../core/platform/index.cjs')
const {
  createClaudeUsageQuery,
  parseClaudeReset,
  parseClaudeStatusDetails,
  parseClaudeUsageOutput,
  renderClaudeTerminalOutput,
} = require('./claude-usage-query.cjs')

const NOW = Date.parse('2026-08-30T19:00:00.000Z')

const STATUS_OUTPUT = `
Status
Version: 2.1.251
Session name: /rename to add a name
Session ID: session-123
Session kind: interactive
Peer address: uds:/run/user/1000/cc-socks/session-123
cwd: /tmp/felixo-status
Login method: Claude Pro account
Organization: Felixo
Email: pessoa@example.com
Model: sonnet (claude-sonnet-5)
Setting sources: User settings
Config
Usage
Total cost: $0.0000
Total duration (API): 1s
Total duration (wall): 2s
Total code changes: 3 lines added, 1 line removed
Usage by model: sonnet 10 input, 20 output
Current session
12% used
Resets 6:50pm (America/Sao_Paulo)
Current week (all models)
100% used
Resets Sep 2, 2am (America/Sao_Paulo)
+50% weekly limits promo through Aug 31 · clau.de/cc-50-promo
What's contributing to your limits usage?
Approximate, based on local sessions on this machine—does not include other devices or claude.ai
Last 24h, these independent factors are affecting your usage:
100% of your usage was at >150k context
100% of your usage was in sessions active for 8+ hours
Usage credits
Off
Stats
`

test('parseClaudeUsageOutput conserva limites e todos os detalhes seguros do /status', () => {
  const result = parseClaudeUsageOutput(STATUS_OUTPUT, { now: () => NOW })

  assert.deepEqual(
    result.metrics.map(({ key, used, resetAt }) => ({ key, used, resetAt })),
    [
      {
        key: 'rate_limits.five_hour',
        used: 12,
        resetAt: '2026-08-30T21:50:00.000Z',
      },
      {
        key: 'rate_limits.seven_day',
        used: 100,
        resetAt: '2026-09-02T05:00:00.000Z',
      },
    ],
  )
  assert.equal(result.details.status.email, 'pessoa@example.com')
  assert.equal(result.details.status.model, 'sonnet (claude-sonnet-5)')
  assert.equal(result.details.usage.sessionStats.totalCost, '$0.0000')
  assert.equal(result.details.usage.currentWeek.used, 100)
  assert.equal(
    result.details.usage.currentWeek.resetAt,
    '2026-09-02T05:00:00.000Z',
  )
  assert.match(result.details.usage.promotion, /50% weekly limits promo/)
  assert.equal(result.details.usage.usageCredits.includes('Stats'), false)
  assert.equal(result.details.usage.usageCredits.includes('Esc to cancel'), false)
  assert.equal(result.details.usage.activity.length, 2)
})

test('parseClaudeReset respeita o fuso publicado pela CLI', () => {
  assert.equal(
    parseClaudeReset('Sep 2, 2am', NOW, 'America/Sao_Paulo'),
    '2026-09-02T05:00:00.000Z',
  )
  assert.equal(
    parseClaudeReset('6:50pm', NOW, 'America/Sao_Paulo'),
    '2026-08-30T21:50:00.000Z',
  )
})

test('mantém linhas novas do quadro Status sem depender do parser de rótulos', () => {
  const details = parseClaudeStatusDetails(
    [
      'Settings  Status   Config   Usage   Stats',
      'Version: 2.1.251',
      'New status field: value from this CLI version',
      'Esc to cancel',
      'Config',
    ].join('\n'),
    { currentSession: null, currentWeek: null, now: () => NOW },
  )

  assert.deepEqual(details.status.lines, [
    'Version: 2.1.251',
    'New status field: value from this CLI version',
    'Config',
  ])
})

test('renderiza cursor ANSI antes de interpretar os campos do Claude', () => {
  const output = [
    '\u001b[2J\u001b[H',
    'Settings',
    '\u001b[14GStatus',
    '\u001b[23GConfig',
    '\u001b[32GUsage',
    '\u001b[40GStats',
    '\r\u001b[1B',
    '\u001b[3CVersion:',
    '\u001b[22G2.1.251',
    '\r\u001b[1B',
    '\u001b[3CSession',
    '\u001b[12GID:',
    '\u001b[22Gsession-123',
  ].join('')

  const rendered = renderClaudeTerminalOutput(output)

  assert.match(rendered, /Version:\s+2\.1\.251/)
  assert.match(rendered, /Session\s+ID:\s+session-123/)
})

test('consulta Claude em PTY envia somente /status e devolve o perfil isolado', async () => {
  const writes = []
  const spawnOptions = []
  const dataListeners = []
  const exitListeners = []
  const pty = {
    write(value) {
      writes.push(value)
    },
    kill() {},
    onData(listener) {
      dataListeners.push(listener)
    },
    onExit(listener) {
      exitListeners.push(listener)
    },
  }

  const query = createClaudeUsageQuery({
    now: () => NOW,
    platform,
    spawnPty: (_command, _args, options) => {
      spawnOptions.push(options)
      setImmediate(() => {
        for (const listener of dataListeners) {
          listener(`❯\nSettings Status Config Usage Stats\n${STATUS_OUTPUT}`)
        }
      })
      return pty
    },
  })

  const result = await query({
    env: { CLAUDE_CONFIG_DIR: '/tmp/claude-profile' },
    cwd: '/tmp',
    timeoutMs: 2_000,
    startupFallbackMs: 1,
    navigationDelayMs: 1,
    resultSettleMs: 20,
  })

  assert.equal(result.ok, true)
  assert.equal(result.metrics[1].used, 100)
  assert.equal(result.details.status.email, 'pessoa@example.com')
  assert.equal(spawnOptions[0].env.CLAUDE_CONFIG_DIR, '/tmp/claude-profile')
  assert.equal(spawnOptions[0].env.CLAUDE_CODE_SKIP_PROMPT_HISTORY, '1')
  assert.equal(writes[0], '/status\r')
  assert.ok(writes.filter((value) => value === '\u001b[C').length >= 2)
  assert.equal(exitListeners.length, 1)
})

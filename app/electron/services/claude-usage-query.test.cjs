'use strict'
require('../../scripts/test-support/pasta-do-teste.cjs') // isola o temporário deste arquivo (ver pasta-do-teste.cjs)

const test = require('node:test')
const assert = require('node:assert/strict')
const {
  CLAUDE_USAGE_ARGS,
  createClaudeUsageQuery,
  parseClaudeUsageText,
} = require('./claude-usage-query.cjs')

const NOW = Date.parse('2026-11-27T12:00:00.000Z')

// Saída real do `claude -p /usage` da 2.1.332, sem os nomes de skills e plugins.
const SEM_JANELA_DE_5H = `You are currently using your subscription to power your Claude Code usage

Current week (all models): 46% used · resets Dec 2, 2am (America/Sao_Paulo)
Current week (Fable): 18% used · resets Dec 2, 2am (America/Sao_Paulo)

What's contributing to your usage?
Approximate · sessions on this machine only · shares overlap

Last 24h · 674 requests · 9 sessions
  90%  Start fresh when you switch tasks · run /clear`

const SESSAO_ZERADA = `You are currently using your subscription to power your Claude Code usage

Current session: 0% used
Current week (all models): 0% used · resets Dec 2, 11am (America/Sao_Paulo)`

// O que a CLI responde numa conta sem login: só os contadores da própria chamada.
const SEM_LOGIN = `Total cost:            $0.0000
Total duration (API):  0s
Usage:                 0 input, 0 output, 0 cache read, 0 cache write`

const resposta = (result, extra = {}) => ({
  ok: true,
  stdout: `${JSON.stringify({ type: 'result', is_error: false, num_turns: 0, result, ...extra })}\n`,
  stderr: '',
})

const consultar = (retorno, opcoes) =>
  createClaudeUsageQuery({ now: () => NOW, runCommand: async () => retorno })(opcoes)

test('só a janela semanal: a coleta vale e não inventa a de 5 horas', async () => {
  const result = await consultar(resposta(SEM_JANELA_DE_5H))

  assert.equal(result.ok, true)
  assert.deepEqual(result.metrics, [{
    key: 'rate_limits.seven_day',
    label: 'Janela de 7 dias',
    used: 46,
    limit: 100,
    remaining: 54,
    unit: '%',
    precision: 'percentage',
    resetAt: '2026-12-02T05:00:00.000Z',
  }])
  assert.equal(result.details.usage.currentSession, undefined)
  assert.equal(result.details.usage.currentWeek.resetText, 'resets Dec 2, 2am (America/Sao_Paulo)')
  assert.ok(result.details.usage.lines.includes('Current week (Fable): 18% used · resets Dec 2, 2am (America/Sao_Paulo)'))
  assert.equal(result.measuredAt, '2026-11-27T12:00:00.000Z')
})

test('janela de 5 horas sem uso vem sem reset e não herda o da semana', () => {
  const { metrics } = parseClaudeUsageText(SESSAO_ZERADA, { now: () => NOW })

  assert.deepEqual(
    metrics.map(({ key, used, resetAt }) => ({ key, used, resetAt })),
    [
      { key: 'rate_limits.five_hour', used: 0, resetAt: null },
      { key: 'rate_limits.seven_day', used: 0, resetAt: '2026-12-02T14:00:00.000Z' },
    ],
  )
})

test('reset só com horário é lido na janela de 5 horas', () => {
  const { metrics } = parseClaudeUsageText(
    'Current session: 12,5% used · resets 6:50pm (America/Sao_Paulo)',
    { now: () => NOW },
  )

  assert.equal(metrics[0].used, 12.5)
  assert.equal(metrics[0].resetAt, '2026-11-27T21:50:00.000Z')
})

test('conta sem limites, erro da CLI, resposta do modelo e saída ilegível são falha', async () => {
  const casos = [
    [resposta(SEM_LOGIN), /não informou os limites/],
    [resposta(SESSAO_ZERADA, { is_error: true }), /não informou os limites/],
    [{ ...resposta(SESSAO_ZERADA), ok: false }, /não informou os limites/],
    [resposta(SESSAO_ZERADA, { num_turns: 1 }), /sem abrir uma conversa/],
    [{ ok: false, stdout: '', stderr: "error: unknown option '--safe-mode'" }, /não respondeu/],
    [{ ok: false, timedOut: true, stdout: '' }, /tempo limite/],
    [{ ok: false, cancelled: true, stdout: '' }, /cancelada/],
  ]

  for (const [retorno, mensagem] of casos) {
    const result = await consultar(retorno)
    assert.equal(result.ok, false)
    assert.deepEqual(result.metrics, [])
    assert.match(result.message, mensagem)
  }
})

test('aviso antes do JSON não atrapalha e segredo não sai nos detalhes', async () => {
  const retorno = resposta(`${SESSAO_ZERADA}\nAPI key: sk-ant-abcdefgh12345678`)
  retorno.stdout = `Aviso da CLI\n${retorno.stdout}`

  const result = await consultar(retorno)

  assert.equal(result.ok, true)
  assert.doesNotMatch(JSON.stringify(result), /abcdefgh12345678/)
})

// Com `"verbose": true` nas configurações da pessoa, a CLI devolve a lista de eventos.
test('lê a resposta quando a CLI devolve a lista de eventos', async () => {
  const eventos = [
    { type: 'system', subtype: 'init', cwd: '/tmp' },
    { type: 'result', is_error: false, num_turns: 0, result: SESSAO_ZERADA },
  ]
  const result = await consultar({ ok: true, stdout: `${JSON.stringify(eventos)}\n`, stderr: '' })

  assert.equal(result.ok, true)
  assert.equal(result.metrics.length, 2)
})

test('chama a CLI com o perfil da conta, sem histórico, e repassa o cancelamento', async () => {
  const chamadas = []
  const { signal } = new AbortController()
  await createClaudeUsageQuery({
    now: () => NOW,
    runCommand: async (chamada) => {
      chamadas.push(chamada)
      return resposta(SESSAO_ZERADA)
    },
  })({ env: { CLAUDE_CONFIG_DIR: '/tmp/claude-profile' }, timeoutMs: 1234, signal })

  assert.equal(chamadas[0].command, 'claude')
  assert.deepEqual(chamadas[0].args, [...CLAUDE_USAGE_ARGS])
  assert.equal(chamadas[0].env.CLAUDE_CONFIG_DIR, '/tmp/claude-profile')
  assert.equal(chamadas[0].env.CLAUDE_CODE_SKIP_PROMPT_HISTORY, '1')
  assert.equal(chamadas[0].timeoutMs, 1234)
  assert.equal(chamadas[0].signal, signal)
})

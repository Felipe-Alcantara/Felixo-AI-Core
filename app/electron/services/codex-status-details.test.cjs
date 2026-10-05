'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')

const { buildCodexStatusDetails } = require('./codex-status-details.cjs')
const { normalizeSample } = require('./agent-usage-model.cjs')
const fixture = require('../__fixtures__/codex-app-server-status.json')

/** Respostas reais do Codex 0.156.1, anonimizadas (scripts/record-codex-app-server-fixture.cjs). */
function realResponses(overrides = {}) {
  return { ...structuredClone(fixture.responses), ...overrides }
}

const SCREEN = {
  ok: true,
  readAt: '2026-10-02T20:04:00.000Z',
  version: '0.156.1',
  usagePage: 'https://chatgpt.com/codex/settings/usage',
  limitsPending: false,
  lines: ['OpenAI Codex (v0.156.1)', 'Model: GPT-6-Luna (reasoning max, summaries auto)', 'Account: Plano'],
  message: null,
}

const fixedTime = () => '17:04'

test('monta conta, configuração, estado, modelos e histórico a partir das respostas reais', () => {
  const details = buildCodexStatusDetails({
    version: '0.156.1',
    responses: realResponses(),
    screen: SCREEN,
    formatTime: fixedTime,
  })

  assert.equal(details.version, '0.156.1')
  assert.equal(details.usagePage, 'https://chatgpt.com/codex/settings/usage')
  assert.deepEqual(details.account, { authMode: 'ChatGPT', plan: 'Pro' })
  assert.equal(details.configuration.model, 'GPT-6-Luna (gpt-6-luna)')
  assert.equal(details.configuration.reasoningEffort, 'max')
  // Não definido no config.toml: o painel diz que vale o padrão, nunca inventa.
  assert.equal(details.configuration.reasoningSummary, 'padrão da CLI')
  assert.equal(details.configuration.approvalPolicy, 'padrão da CLI')
  assert.equal(details.configuration.contextWindow, 'padrão do modelo')
  assert.deepEqual(details.accountState, {
    ordinaryUsage: 'liberado',
    limitReached: 'nenhum',
    spendControl: 'não atingido',
    extraCredits: 'sem créditos avulsos',
  })
  assert.equal(details.models[0], 'GPT-6-Astra (padrão)')
  assert.ok(details.models.includes('GPT-6-Luna'))
  assert.deepEqual(
    {
      lifetimeTokens: details.tokenUsage.lifetimeTokens,
      peakDailyTokens: details.tokenUsage.peakDailyTokens,
      longestTurn: details.tokenUsage.longestTurn,
      currentStreak: details.tokenUsage.currentStreak,
      longestStreak: details.tokenUsage.longestStreak,
    },
    {
      lifetimeTokens: '123.456.789 tokens',
      peakDailyTokens: '9.876.543 tokens',
      longestTurn: '1 h 16 min 7 s',
      currentStreak: '3 dias',
      longestStreak: '9 dias',
    },
  )
  // Os 14 dias mais recentes, do mais novo para o mais antigo.
  assert.equal(details.tokenUsage.recentDays.length, 14)
  assert.equal(details.tokenUsage.recentDays[0], '02/10/2026: 20.000 tokens')
  assert.deepEqual(details.lines, SCREEN.lines)
  assert.equal(details.screen, 'lida às 17:04.')
  assert.equal(details.unavailable, undefined)
})

test('nunca expõe e-mail, IDs, caminhos, instruções ou servidores MCP', () => {
  const details = buildCodexStatusDetails({
    version: '0.156.1',
    responses: realResponses(),
    screen: SCREEN,
    formatTime: fixedTime,
  })
  const text = JSON.stringify(details)

  for (const forbidden of [
    'pessoa@example.com',
    '00000000-0000-4000-8000-000000000000',
    '/home/pessoa',
    'projeto-secreto',
    'instrução privada',
    'servidor-mcp',
    'workspace',
    'chatgptAccountId',
  ]) {
    assert.ok(!text.includes(forbidden), `os detalhes não podem conter "${forbidden}"`)
  }
})

test('cada chave dos detalhes passa pela allowlist do painel sem perder nada', () => {
  const details = buildCodexStatusDetails({
    version: '0.156.1',
    responses: realResponses(),
    screen: SCREEN,
    formatTime: fixedTime,
  })

  const sample = normalizeSample({
    id: 'amostra',
    accountId: 'conta',
    providerId: 'codex',
    collectedAt: '2026-10-02T20:04:00.000Z',
    status: 'current',
    sourceKind: 'live-query',
    sourceLabel: 'Codex',
    metrics: [],
    metadata: { statusDetails: details },
  })

  assert.deepEqual(sample.metadata.statusDetails, details)
})

test('parte que não respondeu vira linha em "unavailable", sem esconder o resto', () => {
  const details = buildCodexStatusDetails({
    version: '0.156.1',
    responses: realResponses({
      'account/usage/read': { status: 'timeout' },
      'config/read': { status: 'error', message: 'config inválida' },
    }),
    screen: { ok: false, message: 'A tela do Codex não ficou pronta para receber o /status a tempo.' },
  })

  assert.equal(details.tokenUsage, undefined)
  assert.equal(details.configuration, undefined)
  assert.deepEqual(details.unavailable, [
    'Configuração: o app-server recusou (config inválida).',
    'Histórico de tokens: o app-server não respondeu a tempo nesta rodada.',
  ])
  assert.equal(
    details.screen,
    'não lida nesta rodada: A tela do Codex não ficou pronta para receber o /status a tempo.',
  )
  assert.ok(details.account, 'a conta continua aparecendo')
  assert.ok(details.lines === undefined)
})

test('modelo não configurado usa o padrão da lista e o esforço padrão dele', () => {
  const responses = realResponses()
  responses['config/read'].result.config.model = null
  responses['config/read'].result.config.model_reasoning_effort = null
  responses['config/read'].result.config.service_tier = 'priority'

  const details = buildCodexStatusDetails({ responses })

  assert.equal(details.configuration.model, 'GPT-6-Astra (padrão da CLI)')
  assert.equal(details.configuration.reasoningEffort, 'low (padrão do modelo)')
  assert.equal(details.configuration.serviceTier, 'Fast (priority)')
  assert.equal(details.screen, 'não consultada nesta rodada.')
})

test('bloqueios da conta aparecem por extenso', () => {
  const responses = realResponses()
  const rateLimits = responses['account/rateLimits/read'].result
  rateLimits.ordinaryUsageAllowed = false
  rateLimits.rateLimits.rateLimitReachedType = 'workspace_member_usage_limit_reached'
  rateLimits.rateLimits.spendControlReached = true
  rateLimits.rateLimits.individualLimit = {
    limit: '50.00',
    used: '50.00',
    remainingPercent: 0,
    resetsAt: 1_791_000_000,
  }
  rateLimits.rateLimits.credits = { hasCredits: true, unlimited: false, balance: '12.5' }

  const details = buildCodexStatusDetails({ responses })

  assert.deepEqual(details.accountState, {
    ordinaryUsage: 'bloqueado pelo serviço',
    limitReached: 'limite de uso deste membro do workspace atingido',
    spendControl: 'atingido',
    individualLimit: 'usado 50.00 de 50.00 (0% livre)',
    extraCredits: 'saldo 12.5',
  })
  assert.equal(
    details.blockingWarning,
    'O serviço bloqueou o uso comum desta conta. Limite de uso deste membro do workspace atingido. O controle de gasto da conta foi atingido.',
  )
})

test('conta liberada não ganha aviso de bloqueio', () => {
  const details = buildCodexStatusDetails({ responses: realResponses() })

  assert.equal(details.blockingWarning, undefined)
})

test('a tela lida sem os limites diz isso, em vez de fingir que leu', () => {
  const details = buildCodexStatusDetails({
    responses: realResponses(),
    screen: { ...SCREEN, limitsPending: true },
    formatTime: fixedTime,
  })

  assert.match(details.screen, /ainda não tinha os limites/)
})

'use strict'

// Os horários de reset impressos sem fuso são lidos no fuso local; fixar UTC
// deixa o resultado igual em qualquer máquina. O node --test isola o arquivo.
process.env.TZ = 'UTC'

const test = require('node:test')
const assert = require('node:assert/strict')

const {
  ELIGIBILITY_REASONS,
  classifyBilling,
  computeCapacity,
  cooldownBlocks,
  deriveRoundRobinCursor,
  detectPlanMultiplier,
  evaluateEligibility,
  evaluateMembers,
  filterMembersForKind,
  findExhaustedWindow,
  isMeasurementCurrent,
  rankCandidates,
  resolveBilling,
  resolveCooldownEnd,
  resolvePlanMultiplier,
} = require('./account-chain-policy.cjs')

const NOW = Date.parse('2026-09-28T12:00:00.000Z')
const MIN = 60 * 1000
const HOUR = 60 * MIN
const iso = (ms) => new Date(ms).toISOString()

function percent(remaining, extra = {}) {
  return { key: `janela-${remaining}`, unit: '%', used: 100 - remaining, limit: 100, remaining, resetAt: null, ...extra }
}

function currentSample(metrics, measuredAtMs = NOW - MIN) {
  return { status: 'current', collectedAt: iso(NOW - MIN), metrics, metadata: { measuredAt: iso(measuredAtMs) } }
}

function loggedIn(values = {}) {
  return { status: 'logged_in', checkedAt: iso(NOW - 2 * MIN), identityKey: null, identityStatus: 'unbound', ...values }
}

/** Um membro apto por padrão; cada teste quebra uma condição. */
function baseInput(overrides = {}) {
  return {
    chainEnabled: true,
    member: { accountId: 'claude-b', providerId: 'claude', enabled: true },
    accountStatus: 'ok',
    cooldown: null,
    loginCheck: loggedIn(),
    sample: null,
    nowMs: NOW,
    sourceAccountId: 'claude-a',
    visitedAccountIds: [],
    excludedIdentityKeys: [],
    ...overrides,
  }
}

// ── Elegibilidade ───────────────────────────────────────────────────────────

test('membro com login conferido, sem espera e fora da linhagem está apto', () => {
  assert.deepEqual(evaluateEligibility(baseInput()), { eligible: true, reason: null, reasonText: null })
})

test('cada razão de inelegibilidade, na ordem da política, com texto em pt-BR', () => {
  const cases = [
    ['cadeia-desligada', { chainEnabled: false }],
    ['membro-desabilitado', { member: { accountId: 'claude-b', providerId: 'claude', enabled: false } }],
    ['conta-removida', { accountStatus: 'removed' }],
    // A regra não cita o Gemini: fica fora quem não tem comando de login.
    ['sem-checagem-de-login', { member: { accountId: 'gemini-a', providerId: 'gemini', enabled: true } }],
    ['sem-chave', { member: { accountId: 'openia-a', providerId: 'openia', enabled: true }, accountStatus: 'missing_key' }],
    ['em-espera', { cooldown: { failureClass: 'limit', detectedAt: iso(NOW - HOUR), untilAt: iso(NOW + HOUR) } }],
    ['esgotada-pela-medicao', { sample: currentSample([percent(0, { resetAt: iso(NOW + HOUR) })]) }],
    ['login-nao-conferido', { loginCheck: null }],
    ['login-nao-conferido', { loginCheck: loggedIn({ checkedAt: iso(NOW - 16 * MIN) }) }],
    ['login-nao-conferido', { loginCheck: loggedIn({ checkedAt: 'agora há pouco' }) }],
    ['deslogada', { loginCheck: loggedIn({ status: 'logged_out' }) }],
    ['cli-ausente', { loginCheck: loggedIn({ status: 'cli_ausente' }) }],
    ['tempo-esgotado', { loginCheck: loggedIn({ status: 'tempo_esgotado' }) }],
    ['checagem-falhou', { loginCheck: loggedIn({ status: 'erro' }) }],
    ['checagem-falhou', { loginCheck: loggedIn({ status: 'unknown' }) }],
    ['identidade-diferente', { loginCheck: loggedIn({ identityStatus: 'different' }) }],
    ['identidade-duplicada', { loginCheck: loggedIn({ identityStatus: 'duplicate' }) }],
    ['identidade-duplicada', { loginCheck: loggedIn({ identityKey: 'id-x' }), excludedIdentityKeys: ['id-x'] }],
    ['origem', { sourceAccountId: 'claude-b' }],
    ['ja-visitada-na-linhagem', { visitedAccountIds: ['claude-b'] }],
  ]

  for (const [reason, overrides] of cases) {
    const result = evaluateEligibility(baseInput(overrides))
    assert.equal(result.eligible, false, reason)
    assert.equal(result.reason, reason, JSON.stringify(overrides))
    assert.equal(result.reasonText, ELIGIBILITY_REASONS[reason])
    assert.match(result.reasonText, /\S/)
  }
})

test('vale a primeira razão que bloqueia', () => {
  const result = evaluateEligibility(
    baseInput({
      member: { accountId: 'claude-a', providerId: 'claude', enabled: true },
      cooldown: { failureClass: 'auth', detectedAt: iso(NOW - MIN), untilAt: null },
      loginCheck: null,
    }),
  )

  // Em espera, sem login conferido e origem: a espera vem primeiro.
  assert.equal(result.reason, 'em-espera')
})

test('espera vencida só deixa de bloquear com checagem de login depois do vencimento', () => {
  const expired = { failureClass: 'limit', detectedAt: iso(NOW - 3 * HOUR), untilAt: iso(NOW - HOUR) }

  assert.equal(cooldownBlocks(expired, loggedIn({ checkedAt: iso(NOW - 2 * HOUR) }), NOW), true)
  assert.equal(cooldownBlocks(expired, loggedIn({ checkedAt: iso(NOW - 2 * MIN) }), NOW), false)
  assert.equal(cooldownBlocks({ ...expired, releasedAt: iso(NOW - MIN) }, null, NOW), false)

  const auth = { failureClass: 'auth', detectedAt: iso(NOW - 10 * MIN), untilAt: null }
  assert.equal(cooldownBlocks(auth, loggedIn({ checkedAt: iso(NOW - 12 * MIN) }), NOW), true)
  assert.equal(cooldownBlocks(auth, loggedIn({ checkedAt: iso(NOW - 2 * MIN) }), NOW), false)

  // Cobrança só sai pela liberação do serviço ("Já recarreguei" + checagem).
  const billing = { failureClass: 'billing', detectedAt: iso(NOW - 10 * MIN), untilAt: null }
  assert.equal(cooldownBlocks(billing, loggedIn(), NOW), true)
})

test('janela esgotada só conta em medição atual e até o reset dela', () => {
  assert.ok(findExhaustedWindow(currentSample([percent(0)]), NOW))
  assert.equal(findExhaustedWindow(currentSample([percent(0, { resetAt: iso(NOW - MIN) })]), NOW), null)
  assert.equal(findExhaustedWindow({ ...currentSample([percent(0)]), status: 'stale' }, NOW), null)
  assert.equal(findExhaustedWindow(currentSample([percent(0)], NOW - 20 * MIN), NOW), null)
})

test('identidade duplicada depende da lista: origem e membros habilitados mais acima', () => {
  const members = [
    { accountId: 'claude-a', providerId: 'claude', position: 0, enabled: true },
    { accountId: 'claude-b', providerId: 'claude', position: 1, enabled: true },
    { accountId: 'claude-c', providerId: 'claude', position: 2, enabled: true },
    { accountId: 'claude-d', providerId: 'claude', position: 3, enabled: true },
  ]
  const facts = {
    'claude-a': { accountStatus: 'ok', loginCheck: loggedIn({ identityKey: 'id-origem' }) },
    'claude-b': { accountStatus: 'ok', loginCheck: loggedIn({ identityKey: 'id-b' }) },
    'claude-c': { accountStatus: 'ok', loginCheck: loggedIn({ identityKey: 'id-b' }) },
    'claude-d': { accountStatus: 'ok', loginCheck: loggedIn({ identityKey: 'id-origem' }) },
  }

  const result = evaluateMembers({
    members,
    facts,
    chainEnabled: true,
    nowMs: NOW,
    sourceAccountId: 'claude-a',
    sourceIdentityKey: 'id-origem',
  })

  assert.deepEqual(
    result.map((item) => [item.accountId, item.reason]),
    [
      ['claude-a', 'origem'],
      ['claude-b', null],
      ['claude-c', 'identidade-duplicada'],
      ['claude-d', 'identidade-duplicada'],
    ],
  )
})

test('membro sem fatos conhecidos é tratado como removido, nunca como apto', () => {
  const [result] = evaluateMembers({
    members: [{ accountId: 'fantasma', providerId: 'codex', position: 0, enabled: true }],
    chainEnabled: true,
    nowMs: NOW,
  })

  assert.equal(result.reason, 'conta-removida')
})

test('bloco novo pela cadeia só considera o mesmo provedor; continuação considera a lista inteira', () => {
  const members = [
    { accountId: 'codex-a', providerId: 'codex' },
    { accountId: 'claude-a', providerId: 'claude' },
  ]

  assert.deepEqual(
    filterMembersForKind(members, { kind: 'launch', providerId: 'claude' }).map((m) => m.accountId),
    ['claude-a'],
  )
  assert.equal(filterMembersForKind(members, { kind: 'continuation', providerId: 'claude' }).length, 2)
})

// ── Medição e capacidade ────────────────────────────────────────────────────

test('medição sem horário válido não é atual (o painel aceitaria)', () => {
  const noTime = { status: 'current', collectedAt: undefined, metrics: [percent(50)], metadata: {} }
  const badTime = { status: 'current', collectedAt: 'ontem', metrics: [percent(50)], metadata: {} }

  assert.equal(isMeasurementCurrent(noTime, NOW), false)
  assert.equal(isMeasurementCurrent(badTime, NOW), false)
  assert.equal(isMeasurementCurrent(currentSample([percent(50)], NOW - 14 * MIN), NOW), true)
  assert.equal(isMeasurementCurrent(currentSample([percent(50)], NOW - 16 * MIN), NOW), false)
  for (const status of ['lastKnown', 'stale', 'error', 'unavailable']) {
    assert.equal(isMeasurementCurrent({ ...currentSample([percent(50)]), status }, NOW), false, status)
  }
})

test('a janela mais apertada manda na capacidade', () => {
  const capacity = computeCapacity({ sample: currentSample([percent(90), percent(5)]), multiplier: 1, nowMs: NOW })

  assert.equal(capacity.remainingPercent, 5)
  assert.equal(capacity.value, 5)
})

test('Openia mede créditos em US$: capacidade não comparável', () => {
  const sample = currentSample([{ key: 'credits', unit: 'US$', used: 0.42, limit: 5, remaining: 4.58 }])

  const capacity = computeCapacity({ sample, multiplier: 1, nowMs: NOW })

  assert.equal(capacity.value, null)
  assert.equal(capacity.reason, 'nao-comparavel')
})

test('multiplicador: CLI vence o declarado, declarado vence o padrão 1 "não declarado"', () => {
  assert.deepEqual(resolvePlanMultiplier({ planFields: ['Claude Max 20x'], declared: 5 }), {
    value: 20,
    source: 'cli',
    detected: 20,
    declared: 5,
    divergent: true,
  })
  assert.equal(resolvePlanMultiplier({ planFields: ['max'], declared: 5 }).source, 'declarado')
  assert.equal(resolvePlanMultiplier({ planFields: ['max'], declared: 5 }).value, 5)
  assert.deepEqual(resolvePlanMultiplier({ planFields: ['max'] }), {
    value: 1,
    source: 'nao_declarado',
    detected: null,
    declared: null,
    divergent: false,
  })
  // Declaração fora da faixa não vale.
  assert.equal(resolvePlanMultiplier({ declared: 0 }).source, 'nao_declarado')
  assert.equal(resolvePlanMultiplier({ declared: 500 }).source, 'nao_declarado')
})

test('a leitura de "NNx" só aceita campo de plano com fronteira e faixa', () => {
  assert.equal(detectPlanMultiplier(['default_claude_max_20x']), 20)
  assert.equal(detectPlanMultiplier(['Max 5x']), 5)
  assert.equal(detectPlanMultiplier(['Pro 1,5x']), 1.5)
  assert.equal(detectPlanMultiplier(['max']), null)
  assert.equal(detectPlanMultiplier(['0x']), null)
  assert.equal(detectPlanMultiplier(['1000x']), null)
  assert.equal(detectPlanMultiplier(['box20xl']), null)
  assert.equal(detectPlanMultiplier([null, undefined, 'plus']), null)
})

// ── O exemplo do dono, literal ──────────────────────────────────────────────

test('caso do dono: 50% com 20x (1000) > 100% com 1x (100) > 30% não declarado (30) > sem medição', () => {
  const candidate = (accountId, position, sample, multiplier) => ({
    accountId,
    position,
    capacity: computeCapacity({ sample, multiplier, nowMs: NOW }),
  })
  const candidates = [
    candidate('D', 0, null, resolvePlanMultiplier({ declared: 20 })),
    candidate('C', 1, currentSample([percent(30)]), resolvePlanMultiplier({})),
    candidate('B', 2, currentSample([percent(100)]), resolvePlanMultiplier({ declared: 1 })),
    candidate('A', 3, currentSample([percent(50)]), resolvePlanMultiplier({ declared: 20 })),
  ]

  const ranked = rankCandidates({ strategy: 'most_capacity', candidates })

  assert.deepEqual(
    ranked.map((item) => [item.accountId, item.capacity.value]),
    [
      ['A', 1000],
      ['B', 100],
      ['C', 30],
      ['D', null],
    ],
  )
  assert.equal(ranked[0].explanation, 'maior capacidade: 1000 = 50% × 20x')
  assert.equal(ranked[2].explanation, 'capacidade: 30 = 30% × 1x (multiplicador não declarado)')
  assert.equal(ranked[3].explanation, 'sem medição atual, não comparada')
})

// ── Estratégias ─────────────────────────────────────────────────────────────

const CANDIDATES = [
  { accountId: 'c', position: 2 },
  { accountId: 'a', position: 0 },
  { accountId: 'b2', position: 1 },
  { accountId: 'b1', position: 1 },
]

test('ordem manual: posição e depois id, determinístico', () => {
  const ranked = rankCandidates({ strategy: 'manual', candidates: CANDIDATES })

  assert.deepEqual(ranked.map((item) => item.accountId), ['a', 'b1', 'b2', 'c'])
  assert.equal(ranked[0].rank, 1)
  assert.equal(ranked[0].explanation, '1ª apta na ordem manual')
})

test('rodízio: primeiro apto estritamente depois do último destino, em ordem circular', () => {
  const members = [
    { accountId: 'a', position: 0 },
    { accountId: 'b1', position: 1 },
    { accountId: 'fora', position: 3 },
    { accountId: 'c', position: 2 },
  ]
  const byCursor = (cursor) =>
    rankCandidates({ strategy: 'round_robin', candidates: CANDIDATES, members, lastSpawnedAccountId: cursor }).map(
      (item) => item.accountId,
    )

  assert.deepEqual(byCursor(null), ['a', 'b1', 'b2', 'c'])
  assert.deepEqual(byCursor('a'), ['b1', 'b2', 'c', 'a'])
  assert.deepEqual(byCursor('c'), ['a', 'b1', 'b2', 'c'])
  // O cursor pode ser um membro que agora não está apto.
  assert.deepEqual(byCursor('fora'), ['a', 'b1', 'b2', 'c'])
  assert.equal(
    rankCandidates({ strategy: 'round_robin', candidates: CANDIDATES, members, lastSpawnedAccountId: 'a' })[0].explanation,
    'próxima do rodízio',
  )
})

test('cursor do rodízio vem do registro: recusa e spawn que falhou não gastam a vez', () => {
  const events = [
    { kind: 'continuation', state: 'spawned', toAccountId: 'a', spawnedAt: iso(NOW - 3 * HOUR) },
    { kind: 'launch', state: 'spawned', toAccountId: 'b1', spawnedAt: iso(NOW - 2 * HOUR) },
    { kind: 'continuation', state: 'declined', toAccountId: 'c', proposedAt: iso(NOW - HOUR) },
    { kind: 'continuation', state: 'spawn_failed', toAccountId: 'c', proposedAt: iso(NOW - 30 * MIN) },
    // Passagem manual e decisão do orquestrador não são a cadeia escolhendo.
    { kind: 'manual', state: 'spawned', toAccountId: 'c', spawnedAt: iso(NOW - MIN) },
    { kind: 'provider_switch', state: 'accepted', toAccountId: 'c', proposedAt: iso(NOW - MIN) },
  ]

  assert.equal(deriveRoundRobinCursor(events), 'b1')
  assert.equal(deriveRoundRobinCursor([]), null)
})

test('mais quota: medidos por capacidade, empate pela ordem manual, sem medição no fim', () => {
  const cap = (value) => ({ value, remainingPercent: value, multiplier: 1, multiplierSource: 'declarado' })
  const ranked = rankCandidates({
    strategy: 'most_capacity',
    candidates: [
      { accountId: 'x', position: 3, capacity: cap(80) },
      { accountId: 'y', position: 1, capacity: { value: null } },
      { accountId: 'z', position: 2, capacity: cap(80) },
      { accountId: 'w', position: 0, capacity: null },
    ],
  })

  assert.deepEqual(ranked.map((item) => item.accountId), ['z', 'x', 'w', 'y'])
})

test('assinatura antes de uso: assinatura, desconhecida, uso; ordem manual em cada grupo', () => {
  const ranked = rankCandidates({
    strategy: 'subscription_first',
    candidates: [
      { accountId: 'uso-1', position: 0, billing: { effective: 'uso' } },
      { accountId: 'desc', position: 1, billing: { effective: 'desconhecida' } },
      { accountId: 'ass-2', position: 3, billing: { effective: 'assinatura' } },
      { accountId: 'ass-1', position: 2, billing: { effective: 'assinatura' } },
      { accountId: 'sem', position: 4 },
    ],
  })

  assert.deepEqual(ranked.map((item) => item.accountId), ['ass-1', 'ass-2', 'desc', 'sem', 'uso-1'])
  assert.equal(ranked[0].explanation, 'assinatura primeiro')
})

// ── Cobrança ────────────────────────────────────────────────────────────────

test('cobrança detectada pelo método de login publicado', () => {
  assert.equal(classifyBilling({ providerId: 'openia' }).detected, 'uso')
  assert.equal(classifyBilling({ providerId: 'codex', method: 'ChatGPT' }).detected, 'assinatura')
  assert.equal(classifyBilling({ providerId: 'codex', method: 'an API key - [oculto]' }).detected, 'uso')
  assert.equal(classifyBilling({ providerId: 'codex', method: 'workload identity' }).detected, null)
  assert.equal(classifyBilling({ providerId: 'claude', method: 'claude.ai' }).detected, 'assinatura')
  for (const method of ['api_key', 'api_key_helper', 'third_party']) {
    assert.equal(classifyBilling({ providerId: 'claude', method }).detected, 'uso', method)
  }
  assert.equal(classifyBilling({ providerId: 'claude', method: 'oauth_token' }).detected, null)
  assert.equal(classifyBilling({ providerId: 'claude' }).detected, null)
  assert.equal(classifyBilling({ providerId: 'gemini', method: 'oauth' }).detected, null)
  assert.equal(
    classifyBilling({ providerId: 'claude', method: 'claude.ai', apiKeySourcePresent: true }).apiKeyWarning,
    true,
  )
})

test('declarada vence a detectada; divergência vira desconhecida; desconhecida nunca vira assinatura', () => {
  assert.equal(resolveBilling({ declared: 'uso', detected: null }).effective, 'uso')
  assert.equal(resolveBilling({ declared: null, detected: 'assinatura' }).effective, 'assinatura')
  assert.deepEqual(resolveBilling({ declared: 'assinatura', detected: 'uso' }), {
    effective: 'desconhecida',
    declared: 'assinatura',
    detected: 'uso',
    divergent: true,
  })
  assert.equal(resolveBilling({}).effective, 'desconhecida')
  assert.equal(resolveBilling({ declared: 'talvez', detected: 'quase' }).effective, 'desconhecida')
})

// ── Fim da espera ───────────────────────────────────────────────────────────

test('fim da espera: sem medição nem texto vale o padrão, 5 h no Claude e 15 min nos demais', () => {
  const claude = resolveCooldownEnd({ providerId: 'claude', failureClass: 'limit', detectedAtMs: NOW, nowMs: NOW })
  const codex = resolveCooldownEnd({ providerId: 'codex', failureClass: 'limit', detectedAtMs: NOW, nowMs: NOW })

  assert.equal(claude.untilAt, iso(NOW + 5 * HOUR))
  assert.equal(claude.untilSource, 'padrao')
  assert.equal(claude.estimated, true)
  assert.equal(codex.untilAt, iso(NOW + 15 * MIN))
})

test('fim da espera: medição e texto, vale o mais tarde e os dois voltam', () => {
  const sample = currentSample([percent(0, { resetAt: iso(NOW + 2 * HOUR) }), percent(40)])
  const later = resolveCooldownEnd({
    providerId: 'codex',
    failureClass: 'limit',
    detectedAtMs: NOW,
    nowMs: NOW,
    sample,
    resetText: 'try again in 3 hours',
  })
  const earlier = resolveCooldownEnd({
    providerId: 'codex',
    failureClass: 'limit',
    detectedAtMs: NOW,
    nowMs: NOW,
    sample,
    resetText: 'try again in 30 minutes',
  })

  assert.equal(later.untilAt, iso(NOW + 3 * HOUR))
  assert.equal(later.untilSource, 'texto')
  assert.equal(later.measuredUntilAt, iso(NOW + 2 * HOUR))
  assert.equal(earlier.untilAt, iso(NOW + 2 * HOUR))
  assert.equal(earlier.untilSource, 'medicao')
  assert.equal(earlier.textUntilAt, iso(NOW + 30 * MIN))
})

test('fim da espera: leitura a mais de 8 dias é inválida e cai para a fonte seguinte', () => {
  const far = currentSample([percent(0, { resetAt: iso(NOW + 9 * 24 * HOUR) })])

  const result = resolveCooldownEnd({ providerId: 'codex', failureClass: 'limit', detectedAtMs: NOW, nowMs: NOW, sample: far })

  assert.equal(result.untilSource, 'padrao')
  assert.equal(result.measuredUntilAt, null)
})

test('fim da espera: texto sem fuso é marcado como fuso local', () => {
  const result = resolveCooldownEnd({
    providerId: 'codex',
    failureClass: 'limit',
    detectedAtMs: NOW,
    nowMs: NOW,
    resetText: "You've hit your usage limit. Try again at Oct 2, 2026 8:04 PM.",
  })

  assert.equal(result.untilAt, '2026-10-02T20:04:00.000Z')
  assert.equal(result.untilSource, 'texto_fuso_local')
  assert.equal(result.autoResumeAt, null)
})

test('fim da espera: continuação automática do Claude marca o horário de retomada', () => {
  const result = resolveCooldownEnd({
    providerId: 'claude',
    failureClass: 'limit',
    detectedAtMs: NOW,
    nowMs: NOW,
    resetText: 'Usage limit reached · continuing automatically at 4:40pm (UTC) · esc to cancel',
  })

  assert.equal(result.untilAt, '2026-09-28T16:40:00.000Z')
  assert.equal(result.autoResumeAt, '2026-09-28T16:40:00.000Z')
})

test('login e cobrança não têm fim por relógio: saem por checagem', () => {
  for (const failureClass of ['auth', 'billing']) {
    const result = resolveCooldownEnd({ providerId: 'claude', failureClass, detectedAtMs: NOW, nowMs: NOW })
    assert.equal(result.untilAt, null)
    assert.equal(result.untilSource, 'checagem')
  }
})

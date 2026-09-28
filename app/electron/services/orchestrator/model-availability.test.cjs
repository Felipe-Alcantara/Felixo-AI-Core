const test = require('node:test')
const assert = require('node:assert/strict')
const {
  createModelAvailabilityRegistry,
  detectAvailabilityIssue,
  parseResetInfo,
} = require('./model-availability.cjs')

test('model availability detects Claude extra usage reset times', () => {
  const now = new Date('2026-05-02T15:10:00-03:00').getTime()
  const issue = detectAvailabilityIssue({
    cliType: 'claude',
    nowMs: now,
    message: "You're out of extra usage · resets 4:40pm (America/Sao_Paulo)",
  })

  assert.equal(issue.status, 'limit_reached')
  assert.equal(issue.scope, 'cli')
  assert.equal(issue.resetLabel, '4:40pm')
  assert.equal(issue.expiresAt, new Date('2026-05-02T16:40:00-03:00').getTime())
})

test('model availability registry applies cli-wide Claude limits', () => {
  const registry = createModelAvailabilityRegistry({
    now: () => new Date('2026-05-02T15:10:00-03:00'),
  })
  const model = {
    id: 'claude-sonnet',
    name: 'Claude Sonnet',
    cliType: 'claude',
  }

  registry.recordCliEvent({
    model,
    cliType: 'claude',
    cliEvent: {
      type: 'error',
      message: "You're out of extra usage · resets 4:40pm (America/Sao_Paulo)",
    },
  })

  assert.equal(registry.isModelAvailable(model), false)
  assert.equal(
    registry.getModelAvailability({
      id: 'claude-opus',
      name: 'Claude Opus',
      cliType: 'claude',
    }).status,
    'limit_reached',
  )
  assert.equal(
    registry.getModelAvailability({
      id: 'codex',
      name: 'Codex',
      cliType: 'codex',
    }).status,
    'available',
  )
})

test('model availability prunes expired limits', () => {
  let now = new Date('2026-05-02T15:10:00-03:00')
  const registry = createModelAvailabilityRegistry({ now: () => now })
  const model = {
    id: 'claude-sonnet',
    name: 'Claude Sonnet',
    cliType: 'claude',
  }

  registry.recordError({
    model,
    cliType: 'claude',
    message: "You're out of extra usage · resets 4:40pm (America/Sao_Paulo)",
  })

  now = new Date('2026-05-02T16:41:00-03:00')

  assert.equal(registry.getModelAvailability(model).status, 'available')
})

test('model availability registry notifies subscribers when a model becomes limited', () => {
  const registry = createModelAvailabilityRegistry({
    now: () => new Date('2026-05-07T10:00:00-03:00'),
  })
  const events = []
  const unsubscribe = registry.subscribe((event) => events.push(event))

  registry.recordError({
    model: { id: 'claude-sonnet', name: 'Claude Sonnet', cliType: 'claude' },
    cliType: 'claude',
    message: "You're out of extra usage · resets 4:40pm (America/Sao_Paulo)",
  })

  assert.equal(events.length, 1)
  assert.equal(events[0].type, 'limited')
  assert.equal(events[0].cliType, 'claude')
  assert.equal(events[0].status, 'limit_reached')

  // No new entry created → no duplicate notification.
  registry.recordError({
    model: { id: 'claude-sonnet', name: 'Claude Sonnet', cliType: 'claude' },
    cliType: 'claude',
    message: "You're out of extra usage · resets 4:40pm (America/Sao_Paulo)",
  })
  assert.equal(events.length, 1, 'should not re-notify for identical entry')

  unsubscribe()
  registry.clearForModel(
    { id: 'claude-sonnet', cliType: 'claude' },
    'claude',
  )
  assert.equal(events.length, 1, 'unsubscribed listener must not receive events')
})

test('model availability registry emits available event on clear', () => {
  const registry = createModelAvailabilityRegistry({
    now: () => new Date('2026-05-07T10:00:00-03:00'),
  })
  const events = []
  registry.subscribe((event) => events.push(event))

  registry.recordError({
    model: { id: 'codex-mini', cliType: 'codex' },
    cliType: 'codex',
    message: '429 too many requests',
  })
  registry.clearForModel({ id: 'codex-mini', cliType: 'codex' }, 'codex')

  assert.equal(events.length, 2)
  assert.equal(events[1].type, 'available')
  assert.equal(events[1].modelId, 'codex-mini')
})

test('parseResetInfo rolls past times into the next day', () => {
  const now = new Date('2026-05-02T17:10:00-03:00').getTime()
  const resetInfo = parseResetInfo('resets 4:40pm', now)

  assert.equal(resetInfo.expiresAt, new Date('2026-05-03T16:40:00-03:00').getTime())
})

test('sucesso de um modelo não levanta o limite que vale para a CLI inteira', () => {
  // Um limite de uso da Claude é cli-wide: vale para todos os modelos do
  // provedor, com cooldown de horas. Antes, o `done` de qualquer modelo
  // apagava também a chave de escopo CLI, então um sub-agente que terminasse
  // bem "liberava" um modelo comprovadamente esgotado — o seletor voltava a
  // escolhê-lo, tomava o mesmo erro e queimava turnos de orquestração em vez
  // de migrar de provedor.
  const registry = createModelAvailabilityRegistry()
  const opus = { id: 'opus', name: 'Opus', cliType: 'claude' }
  const haiku = { id: 'haiku', name: 'Haiku', cliType: 'claude' }

  registry.recordError({
    message: 'usage limit reached',
    cliType: 'claude',
    model: opus,
  })
  assert.equal(registry.getModelAvailability(opus).status, 'limit_reached')

  registry.recordCliEvent({
    cliEvent: { type: 'done' },
    cliType: 'claude',
    model: haiku,
  })

  assert.equal(
    registry.getModelAvailability(opus).status,
    'limit_reached',
    'o limite da CLI deveria sobreviver ao sucesso de outro modelo dela',
  )
})

test('sucesso de um modelo levanta o limite que era só daquele modelo', () => {
  // O contraponto do teste acima: um limite de escopo `model` continua sendo
  // limpo por um `done`, senão o modelo ficaria bloqueado à toa.
  const registry = createModelAvailabilityRegistry()
  const modelo = { id: 'gpt', name: 'GPT', cliType: 'codex' }

  registry.recordError({
    message: 'rate limit exceeded',
    cliType: 'codex',
    model: modelo,
  })
  assert.equal(registry.getModelAvailability(modelo).status, 'limit_reached')

  registry.recordCliEvent({
    cliEvent: { type: 'done' },
    cliType: 'codex',
    model: modelo,
  })

  assert.equal(registry.getModelAvailability(modelo).status, 'available')
})

test('reconhece o horário de reset mesmo com "at" antes da hora', () => {
  // Formato que a CLI da Claude realmente emite. O regex exigia o dígito
  // imediatamente após "reset(s)", então a preposição quebrava o casamento e
  // a UI perdia o "Reset previsto" (caía no cooldown fixo, sem rótulo).
  const now = new Date('2026-05-03T10:00:00-03:00').getTime()

  for (const mensagem of [
    'resets at 3pm',
    'Claude usage limit reached. Your limit will reset at 3pm.',
  ]) {
    const info = parseResetInfo(mensagem, now)
    assert.ok(info, `deveria reconhecer: ${mensagem}`)
    assert.equal(info.label, '3pm', 'o rótulo não deve incluir o "at"')
  }
})

test('continua reconhecendo o formato sem preposição', () => {
  const now = new Date('2026-05-03T10:00:00-03:00').getTime()

  assert.equal(parseResetInfo('resets 3pm', now).label, '3pm')
  assert.equal(parseResetInfo('resets 4:40pm', now).label, '4:40pm')
})

test('parseResetInfo calcula o horário de reset em America/Sao_Paulo, não no fuso do processo', () => {
  // Bug real: a implementação usava Date#setHours, que opera no fuso local do
  // processo Node — correto por acaso em quem desenvolve no fuso de São Paulo,
  // errado em qualquer CI rodando em UTC (a diferença observada no CI foi
  // consistentemente de 3h, o offset entre os dois). A mensagem da CLI inclui
  // o fuso explicitamente ("resets 4:40pm (America/Sao_Paulo)"), então o
  // horário sempre deve ser interpretado nesse fuso, não no do processo.
  const agoraUtc = new Date('2026-05-02T18:10:00Z').getTime() // 15:10 em SP

  const resetInfo = parseResetInfo('resets 4:40pm', agoraUtc)

  // 16:40 em São Paulo (UTC-3) é 19:40 UTC.
  assert.equal(resetInfo.expiresAt, new Date('2026-05-02T19:40:00Z').getTime())
})

// Tabela do §5.6 do plano da cadeia de contas: a disponibilidade do
// orquestrador passa a vir da taxonomia única (accounts/failure-taxonomy.cjs).
const NOW_UTC = Date.parse('2026-09-28T12:00:00Z')

function issueFor(message, cliType = 'codex') {
  return detectAvailabilityIssue({ message, cliType, nowMs: NOW_UTC })
}

test('um 429 solto deixou de ser limite; com contexto, continua sendo', () => {
  // Antes: "line 429" e "exit 429" viravam limit_reached de modelo por 15 min.
  assert.equal(issueFor('Error: failed to parse line 429'), null)
  assert.equal(issueFor('exit 429'), null)
  assert.equal(issueFor('unexpected status 429').status, 'limit_reached')
  assert.equal(issueFor('429 too many requests').status, 'limit_reached')
})

test('limite de uso, rate limit e quota continuam limit_reached com o mesmo escopo', () => {
  assert.equal(issueFor('rate limit exceeded').scope, 'model')
  assert.equal(issueFor('Quota exceeded for quota metric', 'gemini').scope, 'cli')
  assert.equal(issueFor('usage limit reached', 'claude').scope, 'cli')
  assert.equal(issueFor('rate limit exceeded', 'claude').scope, 'cli', 'limite do Claude vale para a CLI inteira')
})

test('limite do Codex por modelo fica no modelo; o da conta, na CLI, até o horário impresso', () => {
  // Antes: os dois eram cli-wide e duravam os 15 min padrão, ignorando o
  // "try again at" (formato que o leitor antigo não entendia).
  const model = issueFor('You’ve hit your usage limit for gpt-5.5-codex. Switch to another model now, or try again at 8:04 PM.')
  assert.equal(model.status, 'limit_reached')
  assert.equal(model.scope, 'model')

  const account = issueFor(
    'You’ve hit your usage limit. Upgrade to Plus to continue using Codex, or try again at Oct 2, 2026 8:04 PM.',
  )
  assert.equal(account.scope, 'cli')
  assert.equal(account.resetLabel, 'Oct 2, 2026 8:04 PM')
  assert.equal(
    account.expiresAt,
    parseResetInfo('try again at Oct 2, 2026 8:04 PM', NOW_UTC, { cliType: 'codex' }).expiresAt,
  )
})

test('o fuso impresso pela CLI vence o fuso de reserva', () => {
  // Antes: 2026-09-29T06:00Z (3h lidas em America/Sao_Paulo).
  const issue = issueFor('Claude usage limit reached · resets 3am (Europe/Lisbon)', 'claude')
  assert.equal(new Date(issue.expiresAt).toISOString(), '2026-09-29T02:00:00.000Z')
})

test('cobrança vira limit_reached da CLI inteira com motivo de crédito', () => {
  for (const message of [
    'You exceeded your current quota, please check your plan and billing details.',
    'Credit balance is too low',
    "You're out of extra usage · resets 4:40pm (America/Sao_Paulo)",
  ]) {
    const issue = issueFor(message, 'claude')
    assert.equal(issue.status, 'limit_reached', message)
    assert.equal(issue.scope, 'cli', message)
    assert.match(issue.reason, /^Sem crédito: /, message)
  }
})

test('perda de login vira no_login com prazo, e o registro a libera sozinho', () => {
  // Antes: no_login sem expiresAt — a CLI ficava fora até reiniciar o app.
  const issue = issueFor('API Error: 401 Unauthorized', 'claude')
  assert.equal(issue.status, 'no_login')
  assert.equal(issue.expiresAt, NOW_UTC + 30 * 60 * 1000)

  let now = NOW_UTC
  const registry = createModelAvailabilityRegistry({ now: () => now })
  const model = { id: 'claude-sonnet', cliType: 'claude' }
  registry.recordError({ model, cliType: 'claude', message: 'Not logged in · Please run /login' })
  assert.equal(registry.getModelAvailability(model).status, 'no_login')

  now = NOW_UTC + 31 * 60 * 1000
  assert.equal(registry.getModelAvailability(model).status, 'available')
})

test('403 continua sem efeito: pode ser login ou permissão', () => {
  assert.equal(issueFor('API Error: 403 Forbidden'), null)
})

test('capacidade do servidor é limite só do modelo, com motivo próprio', () => {
  // Antes: MODEL_CAPACITY_EXHAUSTED sem 429 era null.
  for (const message of ['429 RESOURCE_EXHAUSTED', 'MODEL_CAPACITY_EXHAUSTED: no capacity', 'API Error: 429 MODEL_CAPACITY_EXHAUSTED']) {
    const issue = issueFor(message, 'gemini')
    assert.equal(issue.status, 'limit_reached', message)
    assert.equal(issue.scope, 'model', message)
    assert.match(issue.reason, /^Capacidade do servidor: /, message)
  }
})

test('servidor, rede e tempo esgotado nunca mudam a disponibilidade', () => {
  for (const message of [
    'API Error: 529 {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}',
    'status 503 Service Unavailable',
    'stream disconnected before completion: ECONNRESET',
    'getaddrinfo ENOTFOUND api.anthropic.com',
    'claude não gerou resposta textual em 90s. A execução foi interrompida.',
  ]) {
    assert.equal(issueFor(message, 'claude'), null, message)
  }
})

test('o motivo guardado e emitido pelo registro sai redigido', () => {
  const registry = createModelAvailabilityRegistry({ now: () => NOW_UTC })
  const events = []
  registry.subscribe((event) => events.push(event))
  const model = { id: 'codex-redacao', name: 'Codex', cliType: 'codex' }

  const entry = registry.recordError({
    model,
    cliType: 'codex',
    message: 'unexpected status 429 Too Many Requests: Authorization: Bearer SENTINELA-0123456789 key sk-proj-SENTINELA0123456789',
  })

  const emitted = JSON.stringify({ entry, events, snapshot: registry.getSnapshot() })
  assert.equal(entry.status, 'limit_reached')
  assert.doesNotMatch(emitted, /SENTINELA/)
  assert.match(entry.reason, /\[oculto\]/)
})

test('a mensagem principal de limite do Claude ("You\'ve hit your …") vira limit_reached até o reset impresso', () => {
  // Antes: null — o orquestrador só percebia o limite pelo banner de
  // continuação automática, que o Claude Code só mostra em uma fase.
  const session = issueFor("You've hit your session limit · resets 4:40pm (America/Sao_Paulo)", 'claude')
  assert.equal(session.status, 'limit_reached')
  assert.equal(session.scope, 'cli')
  assert.equal(new Date(session.expiresAt).toISOString(), '2026-09-28T19:40:00.000Z')

  const weekly = issueFor("You've hit your weekly limit · resets Oct 2, 9am (America/Sao_Paulo)", 'claude')
  assert.equal(weekly.status, 'limit_reached')
  assert.equal(weekly.scope, 'cli')
  assert.equal(new Date(weekly.expiresAt).toISOString(), '2026-10-02T12:00:00.000Z')

  const opus = issueFor("You've hit your Opus limit · resets Oct 2, 9am (America/Sao_Paulo)", 'claude')
  assert.equal(opus.status, 'limit_reached')
  assert.equal(opus.scope, 'model', 'o limite semanal de um modelo fica no modelo')

  const credit = issueFor("You've hit your org's monthly spend limit · visit claude.ai/admin-settings/usage to raise it", 'claude')
  assert.equal(credit.status, 'limit_reached')
  assert.match(credit.reason, /^Sem crédito: /)

  assert.equal(issueFor("You've used 90% of your session limit · resets 4:40pm (America/Sao_Paulo)", 'claude'), null)
  assert.equal(issueFor("You've hit your fast limit", 'claude'), null)
})

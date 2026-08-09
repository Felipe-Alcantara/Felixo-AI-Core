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

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

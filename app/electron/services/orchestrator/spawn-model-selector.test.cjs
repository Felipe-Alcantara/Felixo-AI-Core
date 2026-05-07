const test = require('node:test')
const assert = require('node:assert/strict')
const {
  classifySpawnPrompt,
  createOrchestrationModel,
  resolveOrchestrationSpawnModel,
  scoreSpawnModel,
  selectBestSpawnModel,
  validateOrchestrationSpawnModel,
} = require('./spawn-model-selector.cjs')
const {
  createModelAvailabilityRegistry,
} = require('./model-availability.cjs')

const claudeOpus = {
  id: 'claude-opus',
  name: 'Claude Opus',
  command: 'claude',
  source: 'CLI local',
  cliType: 'claude',
  providerModel: 'opus',
}
const claudeSonnet = {
  id: 'claude-sonnet',
  name: 'Claude Sonnet',
  command: 'claude',
  source: 'CLI local',
  cliType: 'claude',
  providerModel: 'sonnet',
}
const codexHigh = {
  id: 'codex-5.5',
  name: 'Codex GPT-5.5',
  command: 'codex',
  source: 'CLI local',
  cliType: 'codex',
  providerModel: 'gpt-5.5',
}
const codexMini = {
  id: 'codex-mini',
  name: 'Codex Mini',
  command: 'codex',
  source: 'CLI local',
  cliType: 'codex',
  providerModel: 'gpt-5.4-mini',
}
const geminiPro = {
  id: 'gemini-pro',
  name: 'Gemini 3 Pro',
  command: 'gemini',
  source: 'CLI local',
  cliType: 'gemini',
  providerModel: 'gemini-3-pro-preview',
}

test('createOrchestrationModel builds lightweight default model per cliType', () => {
  assert.deepEqual(createOrchestrationModel('codex'), {
    id: 'orchestration-codex',
    name: 'Sub-agente codex',
    command: 'codex',
    source: 'orchestration',
    cliType: 'codex',
  })
})

test('classifySpawnPrompt detects code prompts via portuguese keywords', () => {
  assert.equal(classifySpawnPrompt('Corrigir bug no arquivo de auth'), 'code')
  assert.equal(classifySpawnPrompt('Implementar refactor da feature'), 'code')
})

test('classifySpawnPrompt detects long-context prompts', () => {
  assert.equal(classifySpawnPrompt('Resuma este documento grande'), 'long-context')
  assert.equal(classifySpawnPrompt('Pesquisa em contexto longo'), 'long-context')
})

test('classifySpawnPrompt falls back to general for non-matching prompts', () => {
  assert.equal(classifySpawnPrompt('Olá, tudo bem?'), 'general')
  assert.equal(classifySpawnPrompt(''), 'general')
  assert.equal(classifySpawnPrompt(undefined), 'general')
})

test('selectBestSpawnModel respects user preference order over scoring', () => {
  const winner = selectBestSpawnModel([claudeSonnet, claudeOpus], {
    preferredModelIds: ['claude-opus'],
    requestedCliType: 'claude',
    prompt: 'Tarefa qualquer',
  })

  assert.equal(winner.id, 'claude-opus')
})

test('scoreSpawnModel matches requested cliType heavily', () => {
  const sameType = scoreSpawnModel(claudeOpus, {
    preferredModelIds: [],
    requestedCliType: 'claude',
    prompt: '',
  })
  const otherType = scoreSpawnModel(claudeOpus, {
    preferredModelIds: [],
    requestedCliType: 'codex',
    prompt: '',
  })

  assert.ok(sameType > otherType)
})

test('resolveOrchestrationSpawnModel returns lightweight default when no model list', () => {
  const result = resolveOrchestrationSpawnModel('claude', {}, {})

  assert.equal(result.ok, true)
  assert.equal(result.model.cliType, 'claude')
  assert.equal(result.modelChoice.selectionRule, 'fallback-without-model-context')
})

test('resolveOrchestrationSpawnModel falls back across providers when requested cliType is exhausted', () => {
  const registry = createModelAvailabilityRegistry({
    now: () => new Date('2026-05-06T12:00:00-03:00'),
  })

  registry.recordError({
    model: claudeSonnet,
    cliType: 'claude',
    message: "You're out of extra usage · resets 4:40pm (America/Sao_Paulo)",
  })

  const result = resolveOrchestrationSpawnModel(
    'claude',
    {
      availableModels: [claudeSonnet, codexMini],
      orchestratorSettings: {},
      modelAvailabilityRegistry: registry,
    },
    { prompt: 'Revise este codigo.' },
  )

  assert.equal(result.ok, true)
  assert.equal(result.model.cliType, 'codex')
  assert.equal(result.modelChoice.selectionRule, 'provider-fallback')
})

test('resolveOrchestrationSpawnModel returns ok:false when all providers blocked', () => {
  const result = resolveOrchestrationSpawnModel(
    'claude',
    {
      availableModels: [claudeSonnet],
      orchestratorSettings: { blockedModelIds: ['claude-sonnet'] },
    },
    {},
  )

  assert.equal(result.ok, false)
  assert.equal(result.modelChoice.selectionRule, 'unavailable')
})

test('validateOrchestrationSpawnModel wraps result with error code on failure', () => {
  const result = validateOrchestrationSpawnModel(
    { cliType: 'claude' },
    {
      availableModels: [],
      orchestratorSettings: {},
    },
  )

  assert.equal(result.ok, false)
  assert.equal(result.code, 'SPAWN_MODEL_UNAVAILABLE')
})

test('validateOrchestrationSpawnModel returns selectedModel on success', () => {
  const result = validateOrchestrationSpawnModel(
    { cliType: 'claude', prompt: 'qualquer coisa' },
    {
      availableModels: [claudeOpus],
      orchestratorSettings: {},
    },
  )

  assert.equal(result.ok, true)
  assert.equal(result.selectedModel.id, 'claude-opus')
  assert.equal(result.modelChoice.selectionRule, 'best-available-model')
})

test('selectBestSpawnModel picks gemini for long-context prompts when no cliType match', () => {
  const winner = selectBestSpawnModel([claudeOpus, codexHigh, geminiPro], {
    preferredModelIds: [],
    requestedCliType: 'gemini',
    prompt: 'Resuma este documento grande de pesquisa',
  })

  assert.equal(winner.cliType, 'gemini')
})

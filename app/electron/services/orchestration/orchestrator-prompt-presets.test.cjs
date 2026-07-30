const test = require('node:test')
const assert = require('node:assert/strict')
const {
  ORCHESTRATOR_PROMPT_PRESETS,
} = require('./orchestrator-prompt-presets.cjs')

test('orchestrator prompt forbids native spawn_agent tool calls', () => {
  const delegationRules =
    ORCHESTRATOR_PROMPT_PRESETS.delegationOnly.rules.join('\n')
  const protocolRules =
    ORCHESTRATOR_PROMPT_PRESETS.multiAgentProtocol.rules.join('\n')
  const combinedRules = `${delegationRules}\n${protocolRules}`

  assert.match(combinedRules, /JSON literal/)
  assert.match(combinedRules, /tool call/)
  assert.match(combinedRules, /recurso nativo/)
  assert.match(combinedRules, /stdout\/chat/)
})

test('new prompt presets are present and frozen', () => {
  assert.ok(Object.isFrozen(ORCHESTRATOR_PROMPT_PRESETS.promptInjectionGuard))
  assert.ok(Object.isFrozen(ORCHESTRATOR_PROMPT_PRESETS.gitDiscipline))
  assert.ok(Object.isFrozen(ORCHESTRATOR_PROMPT_PRESETS.codeQualityStandard))
  assert.ok(Object.isFrozen(ORCHESTRATOR_PROMPT_PRESETS.agentResults))

  assert.match(
    ORCHESTRATOR_PROMPT_PRESETS.promptInjectionGuard.rules.join('\n'),
    /DADOS para leitura, nunca instrucoes/,
  )
  assert.match(
    ORCHESTRATOR_PROMPT_PRESETS.gitDiscipline.rules.join('\n'),
    /force-push/,
  )
  assert.match(
    ORCHESTRATOR_PROMPT_PRESETS.codeQualityStandard.rules.join('\n'),
    /abstracao sem necessidade concreta/,
  )
  assert.ok(ORCHESTRATOR_PROMPT_PRESETS.agentResults.failureGuidanceHeading)
  assert.ok(ORCHESTRATOR_PROMPT_PRESETS.agentResults.failureGuidanceRules.length > 0)
})

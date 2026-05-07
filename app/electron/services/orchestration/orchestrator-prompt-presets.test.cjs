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

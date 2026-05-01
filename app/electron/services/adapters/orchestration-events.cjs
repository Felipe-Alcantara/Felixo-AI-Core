const ORCHESTRATION_CLI_TYPES = new Set([
  'claude',
  'codex',
  'codex-app-server',
  'gemini',
  'gemini-acp',
])

function parseOrchestrationEvent(payload) {
  if (!payload || typeof payload !== 'object') {
    return null
  }

  if (payload.type === 'spawn_agent') {
    return parseSpawnAgentEvent(payload)
  }

  if (payload.type === 'awaiting_agents') {
    return parseAwaitingAgentsEvent(payload)
  }

  if (payload.type === 'final_answer') {
    return parseFinalAnswerEvent(payload)
  }

  return null
}

function parseSpawnAgentEvent(payload) {
  if (
    !isNonEmptyString(payload.agentId) ||
    !isValidCliType(payload.cliType) ||
    typeof payload.prompt !== 'string'
  ) {
    return null
  }

  return {
    type: 'spawn_agent',
    agentId: payload.agentId,
    cliType: payload.cliType,
    prompt: payload.prompt,
  }
}

function parseAwaitingAgentsEvent(payload) {
  if (
    !Array.isArray(payload.agentIds) ||
    !payload.agentIds.every(isNonEmptyString)
  ) {
    return null
  }

  return {
    type: 'awaiting_agents',
    agentIds: payload.agentIds,
  }
}

function parseFinalAnswerEvent(payload) {
  if (typeof payload.content !== 'string') {
    return null
  }

  return {
    type: 'final_answer',
    content: payload.content,
  }
}

function isValidCliType(value) {
  return ORCHESTRATION_CLI_TYPES.has(value)
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0
}

module.exports = {
  parseOrchestrationEvent,
}

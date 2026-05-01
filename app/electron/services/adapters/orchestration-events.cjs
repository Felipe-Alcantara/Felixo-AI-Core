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

function parseOrchestrationEventFromText(text) {
  const events = parseOrchestrationEventsFromText(text)

  if (events.length === 1) {
    return events[0]
  }

  if (events.length > 1) {
    return {
      type: 'orchestration_events',
      events,
    }
  }

  return null
}

function parseOrchestrationEventsFromText(text) {
  if (typeof text !== 'string') {
    return []
  }

  const payloadText = unwrapJsonText(text)

  if (!payloadText.startsWith('{') && !payloadText.startsWith('[')) {
    return []
  }

  const parsedAsSingleJson = parseJson(payloadText)

  if (Array.isArray(parsedAsSingleJson)) {
    return parsedAsSingleJson.map(parseOrchestrationEvent).filter(Boolean)
  }

  if (parsedAsSingleJson?.events && Array.isArray(parsedAsSingleJson.events)) {
    return parsedAsSingleJson.events.map(parseOrchestrationEvent).filter(Boolean)
  }

  const event = parseOrchestrationEvent(parsedAsSingleJson)

  if (event) {
    return [event]
  }

  return parseJsonLines(payloadText)
}

function parseJsonLines(text) {
  const events = []

  for (const line of text.split(/\r?\n/)) {
    const trimmedLine = line.trim()

    if (!trimmedLine.startsWith('{')) {
      continue
    }

    const event = parseOrchestrationEvent(parseJson(trimmedLine))

    if (event) {
      events.push(event)
    }
  }

  return events
}

function parseJson(text) {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
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

function unwrapJsonText(text) {
  const trimmed = text.trim()
  const fencedJsonMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)

  return fencedJsonMatch ? fencedJsonMatch[1].trim() : trimmed
}

module.exports = {
  parseOrchestrationEvent,
  parseOrchestrationEventFromText,
  parseOrchestrationEventsFromText,
}

const { createClaudeOptionArgs } = require('./model-options.cjs')
const {
  parseOrchestrationEvent,
  parseOrchestrationEventFromText,
} = require('./orchestration-events.cjs')

function getSpawnArgs(prompt, context = {}) {
  const args = [
    '--print',
    '--output-format',
    'stream-json',
    '--verbose',
    '--include-partial-messages',
  ]

  args.push(...createClaudeOptionArgs(context))

  if (context.threadId) {
    args.push('--session-id', context.threadId)
  }

  args.push(prompt)

  return {
    command: 'claude',
    args,
  }
}

function getResumeArgs(prompt, context = {}) {
  const providerSessionId = context.providerSessionId ?? context.threadId

  if (!providerSessionId) {
    return getSpawnArgs(prompt, context)
  }

  return {
    command: 'claude',
    args: [
      '--print',
      '--output-format',
      'stream-json',
      '--verbose',
      '--include-partial-messages',
      ...createClaudeOptionArgs(context),
      '--resume',
      providerSessionId,
      prompt,
    ],
  }
}

function getPersistentSpawnArgs(context = {}) {
  const args = [
    '--print',
    '--input-format',
    'stream-json',
    '--output-format',
    'stream-json',
    '--verbose',
    '--include-partial-messages',
  ]

  args.push(...createClaudeOptionArgs(context))

  if (context.providerSessionId) {
    args.push('--resume', context.providerSessionId)
  }

  return {
    command: 'claude',
    args,
  }
}

function createPersistentInput(prompt) {
  return `${JSON.stringify({
    type: 'user',
    message: {
      role: 'user',
      content: [
        {
          type: 'text',
          text: prompt,
        },
      ],
    },
  })}\n`
}

function canResume(context = {}) {
  return Boolean(context.providerSessionId || context.threadId)
}

function parseLine(line) {
  const payload = JSON.parse(line)
  const orchestrationEvent = parseOrchestrationEvent(payload)

  if (orchestrationEvent) {
    if (typeof payload.session_id === 'string') {
      orchestrationEvent.providerSessionId = payload.session_id
    }

    return orchestrationEvent
  }

  if (
    payload.type === 'system' &&
    payload.subtype === 'init' &&
    typeof payload.session_id === 'string'
  ) {
    return {
      type: 'session',
      providerSessionId: payload.session_id,
    }
  }

  if (payload.type === 'assistant' && payload.error) {
    return {
      type: 'error',
      message: extractClaudeAssistantText(payload) ?? 'Claude retornou um erro.',
    }
  }

  if (payload.type === 'stream_event') {
    return parseStreamEvent(payload.event)
  }

  if (payload.type === 'result') {
    if (payload.is_error) {
      return {
        type: 'error',
        message:
          typeof payload.result === 'string' && payload.result
            ? payload.result
            : 'Claude retornou um erro.',
        providerSessionId:
          typeof payload.session_id === 'string' ? payload.session_id : undefined,
      }
    }

    const result = {
      type: 'done',
      cost: payload.total_cost_usd,
      duration: payload.duration_ms,
    }

    if (typeof payload.session_id === 'string') {
      result.providerSessionId = payload.session_id
    }

    return result
  }

  if (payload.type === 'error') {
    return {
      type: 'error',
      message: payload.message ?? 'Claude retornou um erro.',
    }
  }

  return null
}

function extractClaudeAssistantText(payload) {
  const content = payload?.message?.content

  if (!Array.isArray(content)) {
    return null
  }

  const text = content
    .map((block) => (block?.type === 'text' ? block.text : ''))
    .filter((value) => typeof value === 'string' && value.trim())
    .join('\n')
    .trim()

  return text || null
}

function parseStreamEvent(event) {
  if (!event || typeof event !== 'object') {
    return null
  }

  const delta = event.delta

  if (
    event.type === 'content_block_delta' &&
    delta?.type === 'text_delta' &&
    typeof delta.text === 'string'
  ) {
    const orchestrationEvent = parseOrchestrationEventFromText(delta.text)

    if (orchestrationEvent) {
      return orchestrationEvent
    }

    return {
      type: 'text',
      text: delta.text,
    }
  }

  if (
    event.type === 'content_block_start' &&
    event.content_block?.type === 'tool_use'
  ) {
    return {
      type: 'tool_use',
      tool: event.content_block.name ?? 'tool',
      input: JSON.stringify(event.content_block.input ?? {}),
    }
  }

  return null
}

module.exports = {
  canResume,
  createPersistentInput,
  getPersistentSpawnArgs,
  getSpawnArgs,
  getResumeArgs,
  parseLine,
}

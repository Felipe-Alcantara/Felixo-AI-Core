function getSpawnArgs(prompt, context = {}) {
  const args = [
    '--print',
    '--output-format',
    'stream-json',
    '--verbose',
    '--include-partial-messages',
  ]

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
      '--resume',
      providerSessionId,
      prompt,
    ],
  }
}

function parseLine(line) {
  const payload = JSON.parse(line)

  if (payload.type === 'system' && typeof payload.session_id === 'string') {
    return {
      type: 'session',
      providerSessionId: payload.session_id,
    }
  }

  if (payload.type === 'stream_event') {
    return parseStreamEvent(payload.event)
  }

  if (payload.type === 'result') {
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
  getSpawnArgs,
  getResumeArgs,
  parseLine,
}

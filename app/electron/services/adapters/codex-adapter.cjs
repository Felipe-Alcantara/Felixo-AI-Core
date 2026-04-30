function getSpawnArgs(prompt, context = {}) {
  const args = ['exec', '--json', '--skip-git-repo-check']

  if (context.cwd) {
    args.push('--cd', context.cwd)
  }

  args.push(prompt)

  return {
    command: 'codex',
    args,
  }
}

function getResumeArgs(prompt, context = {}) {
  if (!context.providerSessionId) {
    return getSpawnArgs(prompt, context)
  }

  return {
    command: 'codex',
    args: [
      'exec',
      'resume',
      '--json',
      '--skip-git-repo-check',
      context.providerSessionId,
      prompt,
    ],
  }
}

function parseLine(line) {
  const payload = JSON.parse(line)
  const providerSessionId = extractProviderSessionId(payload)

  if (isSessionMetadata(payload) && providerSessionId) {
    return {
      type: 'session',
      providerSessionId,
    }
  }

  if (payload.type === 'item.completed') {
    const item = payload.item

    if (item?.type === 'agent_message' && typeof item.text === 'string') {
      const event = {
        type: 'text',
        text: item.text,
      }

      if (providerSessionId) {
        event.providerSessionId = providerSessionId
      }

      return event
    }

    return null
  }

  if (payload.type === 'turn.completed') {
    const event = {
      type: 'done',
    }

    if (providerSessionId) {
      event.providerSessionId = providerSessionId
    }

    return event
  }

  if (payload.type === 'error') {
    const message = payload.message ?? payload.error?.message ?? ''

    if (String(message).toLowerCase().includes('reconnect')) {
      return null
    }

    return {
      type: 'error',
      message: message || 'Codex retornou um erro.',
    }
  }

  return null
}

function isSessionMetadata(payload) {
  return (
    payload.type === 'session_meta' ||
    payload.type === 'session_configured' ||
    payload.type === 'session.started' ||
    payload.type === 'thread.started'
  )
}

function extractProviderSessionId(payload) {
  if (!payload || typeof payload !== 'object') {
    return null
  }

  const candidates = [
    payload.thread_id,
    payload.threadId,
    payload.session_id,
    payload.sessionId,
    payload.id,
    payload.payload?.thread_id,
    payload.payload?.threadId,
    payload.payload?.session_id,
    payload.payload?.sessionId,
    payload.payload?.id,
  ]

  return candidates.find((value) => typeof value === 'string' && value) ?? null
}

module.exports = {
  getSpawnArgs,
  getResumeArgs,
  parseLine,
}

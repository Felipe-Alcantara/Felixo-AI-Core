function getSpawnArgs(prompt) {
  return {
    command: 'gemini',
    args: ['--prompt', prompt, '--output-format', 'stream-json', '--skip-trust'],
  }
}

function getResumeArgs(prompt, context = {}) {
  if (!context.providerSessionId) {
    return getSpawnArgs(prompt, context)
  }

  return {
    command: 'gemini',
    args: [
      '--resume',
      context.providerSessionId,
      '--prompt',
      prompt,
      '--output-format',
      'stream-json',
      '--skip-trust',
    ],
  }
}

function parseLine(line) {
  const payload = JSON.parse(line)

  if (payload.type === 'init' && typeof payload.session_id === 'string') {
    return {
      type: 'session',
      providerSessionId: payload.session_id,
    }
  }

  if (isAssistantMessage(payload)) {
    return {
      type: 'text',
      text: payload.content,
    }
  }

  if (payload.type === 'result') {
    return {
      type: 'done',
    }
  }

  if (payload.type === 'error') {
    return {
      type: 'error',
      message: payload.message ?? 'Gemini retornou um erro.',
    }
  }

  return null
}

function isAssistantMessage(payload) {
  return (
    payload.type === 'message' &&
    (payload.role === 'model' || payload.role === 'assistant') &&
    typeof payload.content === 'string'
  )
}

module.exports = {
  getSpawnArgs,
  getResumeArgs,
  parseLine,
}

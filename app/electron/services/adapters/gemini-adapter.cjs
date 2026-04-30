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

function canResume(context = {}) {
  return Boolean(context.providerSessionId)
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

function classifyStderr(chunk) {
  if (isFatalStderr(chunk)) {
    return 'error'
  }

  const lines = createStderrLines(chunk)

  if (lines.length > 0 && lines.every(isNonFatalStderrLine)) {
    return 'info'
  }

  return 'warn'
}

function shouldSuppressStderr(chunk) {
  const lines = createStderrLines(chunk)

  return lines.length > 0 && lines.every(isVisualStderrNotice)
}

function shouldAbortOnStderr(chunk) {
  return isFatalStderr(chunk)
}

function formatStderr(chunk) {
  const text = String(chunk)

  if (isCapacityExhaustedStderr(text)) {
    return 'Gemini está sem capacidade no servidor agora (429 / MODEL_CAPACITY_EXHAUSTED). Tente novamente mais tarde ou use outro modelo.'
  }

  return text
}

function createStderrLines(chunk) {
  return String(chunk)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}

function isNonFatalStderrLine(line) {
  return isVisualStderrNotice(line) || isRipgrepFallbackNotice(line)
}

function isVisualStderrNotice(line) {
  return (
    line.includes('256-color support not detected') ||
    line.includes('Basic terminal detected') ||
    line.includes('Visual rendering will be limited')
  )
}

function isRipgrepFallbackNotice(line) {
  return line.includes('Ripgrep is not available. Falling back to GrepTool.')
}

function isFatalStderr(chunk) {
  return isCapacityExhaustedStderr(chunk)
}

function isCapacityExhaustedStderr(chunk) {
  const text = String(chunk)

  return (
    text.includes('MODEL_CAPACITY_EXHAUSTED') ||
    text.includes('No capacity available for model') ||
    (text.includes('status 429') && text.includes('RESOURCE_EXHAUSTED'))
  )
}

function isAssistantMessage(payload) {
  return (
    payload.type === 'message' &&
    (payload.role === 'model' || payload.role === 'assistant') &&
    typeof payload.content === 'string'
  )
}

module.exports = {
  canResume,
  classifyStderr,
  formatStderr,
  getSpawnArgs,
  getResumeArgs,
  parseLine,
  shouldAbortOnStderr,
  shouldSuppressStderr,
}

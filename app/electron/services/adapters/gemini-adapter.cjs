const {
  createGeminiFullAccessArgs,
  createModelOptionArgs,
} = require('./model-options.cjs')
const {
  parseOrchestrationEvent,
  parseOrchestrationEventFromText,
} = require('./orchestration-events.cjs')

function getSpawnArgs(prompt, context = {}) {
  return {
    command: 'gemini',
    args: [
      ...createModelOptionArgs(context),
      '--prompt',
      prompt,
      '--output-format',
      'stream-json',
      '--skip-trust',
      ...createGeminiFullAccessArgs(context),
    ],
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
      ...createModelOptionArgs(context),
      '--prompt',
      prompt,
      '--output-format',
      'stream-json',
      '--skip-trust',
      ...createGeminiFullAccessArgs(context),
    ],
  }
}

function canResume() {
  return false
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

  if (payload.type === 'init' && typeof payload.session_id === 'string') {
    return {
      type: 'session',
      providerSessionId: payload.session_id,
    }
  }

  if (isAssistantMessage(payload)) {
    const orchestrationEventFromText =
      parseOrchestrationEventFromText(payload.content)

    if (orchestrationEventFromText) {
      return orchestrationEventFromText
    }

    return {
      type: 'text',
      text: payload.content,
    }
  }

  if (payload.type === 'tool_use') {
    return {
      type: 'tool_use',
      tool: payload.tool_name ?? payload.name ?? 'tool',
      input: stringifyToolInput(payload.parameters ?? payload.input ?? {}),
    }
  }

  if (payload.type === 'tool_result') {
    return {
      type: 'tool_result',
      output: stringifyToolOutput(payload.output ?? payload.result ?? payload),
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

function stringifyToolInput(input) {
  if (typeof input === 'string') {
    return input
  }

  return JSON.stringify(input ?? {})
}

function stringifyToolOutput(output) {
  if (typeof output === 'string') {
    return output
  }

  return JSON.stringify(output ?? {})
}

function classifyStderr(chunk) {
  if (isRetryingCapacityStderr(chunk)) {
    return 'warn'
  }

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

  return lines.length > 0 && lines.every(isNonFatalStderrLine)
}

function shouldAbortOnStderr(chunk) {
  return isFatalStderr(chunk)
}

function formatStderr(chunk) {
  const text = String(chunk)

  if (isRetryingCapacityStderr(text)) {
    return 'Gemini encontrou capacidade indisponivel no servidor e a propria CLI esta tentando novamente.'
  }

  if (isCapacityExhaustedStderr(text)) {
    return 'Gemini está sem capacidade no servidor agora (429 / MODEL_CAPACITY_EXHAUSTED). Tente novamente mais tarde ou use outro modelo.'
  }

  if (isUnavailableToolStderr(text)) {
    return 'Gemini não conseguiu executar a alteração porque a CLI não disponibilizou a ferramenta necessária para editar arquivos ou executar comandos.'
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
  return (
    (isCapacityExhaustedStderr(chunk) && !isRetryingCapacityStderr(chunk)) ||
    isUnavailableToolStderr(chunk)
  )
}

function isCapacityExhaustedStderr(chunk) {
  const text = String(chunk)

  return (
    text.includes('MODEL_CAPACITY_EXHAUSTED') ||
    text.includes('No capacity available for model') ||
    text.includes('exhausted your capacity on this model') ||
    (text.includes('status 429') && text.includes('RESOURCE_EXHAUSTED'))
  )
}

function isRetryingCapacityStderr(chunk) {
  const text = String(chunk)

  return isCapacityExhaustedStderr(text) && /\bretrying\b/i.test(text)
}

function isUnavailableToolStderr(chunk) {
  const text = String(chunk)

  return (
    text.includes('Tool "run_shell_command" not found') ||
    (text.includes("Unauthorized tool call: 'run_shell_command'") &&
      text.includes('not available')) ||
    (text.includes("Unauthorized tool call: 'write_file'") &&
      text.includes('not available'))
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

// Helpers puros compartilhados pelos fluxos de CLI (one-shot e persistente):
// interpretação de eventos JSONL, guardas de loop, mensagens de erro e
// utilidades de sessão. Nenhuma função aqui guarda estado de processo.
const { logQaEvent } = require('./qa-logger.cjs')

const FIRST_VISIBLE_OUTPUT_TIMEOUT_MS = 120000
const MAX_TOOL_USES_WITHOUT_TEXT = 20
const PERSISTENT_SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1000
const DEFERRED_PROMPT_FALLBACK_MS = 5000
const PERSISTENT_TRAILING_OUTPUT_GRACE_MS = 5000

function parseAdapterLine(adapter, line) {
  try {
    return adapter.parseLine(line)
  } catch (error) {
    return {
      type: 'error',
      message:
        error instanceof Error
          ? `Falha ao interpretar saída da CLI: ${error.message}`
          : 'Falha ao interpretar saída da CLI.',
    }
  }
}

function createToolLoopProgressState(limit = MAX_TOOL_USES_WITHOUT_TEXT) {
  return {
    limit,
    toolUsesWithoutText: 0,
  }
}

function shouldAbortForToolLoop(progress, cliEvent) {
  if (!progress || !cliEvent || typeof cliEvent !== 'object') {
    return false
  }

  if (isTextCliEvent(cliEvent)) {
    progress.toolUsesWithoutText = 0
    return false
  }

  if (cliEvent.type !== 'tool_use') {
    return false
  }

  progress.toolUsesWithoutText += 1
  return progress.toolUsesWithoutText >= progress.limit
}

function isVisibleCliActivity(cliEvent) {
  if (!cliEvent || typeof cliEvent !== 'object') {
    return false
  }

  if (isTextCliEvent(cliEvent)) {
    return true
  }

  return cliEvent.type === 'tool_use' || cliEvent.type === 'tool_result'
}

function isTextCliEvent(cliEvent) {
  return cliEvent.type === 'text' && Boolean(String(cliEvent.text ?? '').trim())
}

function handleOrchestrationPromise(promise) {
  if (!promise || typeof promise.catch !== 'function') {
    return
  }

  promise.catch((error) => {
    logQaEvent({
      level: 'error',
      scope: 'cli:orchestration',
      message: 'Unhandled orchestration error.',
      details: {
        message: error instanceof Error ? error.message : String(error),
      },
    })
  })
}

function getAdapterStderrLevel(adapter, chunk) {
  if (typeof adapter.classifyStderr !== 'function') {
    return 'warn'
  }

  const level = adapter.classifyStderr(chunk)

  return ['debug', 'info', 'warn', 'error'].includes(level) ? level : 'warn'
}

function shouldSuppressAdapterStderr(adapter, chunk) {
  return (
    typeof adapter.shouldSuppressStderr === 'function' &&
    adapter.shouldSuppressStderr(chunk)
  )
}

function shouldAbortOnAdapterStderr(adapter, chunk) {
  return (
    typeof adapter.shouldAbortOnStderr === 'function' &&
    adapter.shouldAbortOnStderr(chunk)
  )
}

function writeOneShotStdin(childProcess, input) {
  const stdin = childProcess?.stdin

  if (!stdin || stdin.destroyed || stdin.writableEnded) {
    return false
  }

  try {
    stdin.end(input)
    return true
  } catch {
    return false
  }
}

function formatAdapterStderr(adapter, chunk) {
  if (typeof adapter.formatStderr !== 'function') {
    return String(chunk)
  }

  return String(adapter.formatStderr(chunk))
}

function normalizeCliEventMessage(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ')
}

function getPersistentCloseLogLevel({ code, didComplete }) {
  if (didComplete) {
    return 'info'
  }

  return code && code !== 0 ? 'error' : 'info'
}

function shouldSuppressPersistentTrailingOutput(
  lastRunFinalEvent,
  cliEvent,
  now = Date.now(),
) {
  if (!lastRunFinalEvent || !cliEvent || typeof cliEvent !== 'object') {
    return false
  }

  const ageMs = now - lastRunFinalEvent.endedAt

  if (ageMs < 0 || ageMs > PERSISTENT_TRAILING_OUTPUT_GRACE_MS) {
    return false
  }

  if (
    cliEvent.type === 'done' &&
    ['awaiting_agents', 'done', 'final_answer'].includes(lastRunFinalEvent.type)
  ) {
    return true
  }

  if (cliEvent.type !== 'error' || lastRunFinalEvent.type !== 'error') {
    return false
  }

  const previousMessage = normalizeCliEventMessage(lastRunFinalEvent.message)
  const nextMessage = normalizeCliEventMessage(cliEvent.message)

  return !previousMessage || !nextMessage || previousMessage === nextMessage
}

function collectThreadFamily(rootThreadId, parentMap) {
  const root = getRequiredString(rootThreadId)

  if (!root) {
    return []
  }

  const threadIds = new Set([root])
  let didAddThread = true

  while (didAddThread) {
    didAddThread = false

    for (const [childThreadId, parentThreadId] of parentMap) {
      if (threadIds.has(parentThreadId) && !threadIds.has(childThreadId)) {
        threadIds.add(childThreadId)
        didAddThread = true
      }
    }
  }

  return [...threadIds]
}

function getRequiredString(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function createModelSessionKey(model) {
  return [
    model?.cliType ?? 'unknown',
    model?.command ?? '',
    model?.id ?? '',
    model?.providerModel ?? '',
    model?.reasoningEffort ?? '',
  ].join(':')
}

function createExitErrorMessage(command, code, signal, stderrOutput) {
  const detail = stderrOutput.trim()
  const status = signal ? `sinal ${signal}` : `código ${code}`

  if (!detail) {
    return `${command} encerrou com ${status}.`
  }

  return `${command} encerrou com ${status}: ${detail}`
}

function createNonJsonStdoutMessage(command, chunk) {
  const output = String(chunk).trim().slice(0, 500)

  if (!output) {
    return `${command} retornou uma saída inesperada fora do formato JSON.`
  }

  return `${command} retornou uma saída inesperada fora do formato JSON: ${output}`
}

function createNoVisibleOutputMessage(command, timeoutMs) {
  const timeoutSeconds = Math.round(timeoutMs / 1000)

  return `${command} não gerou resposta textual em ${timeoutSeconds}s. A execução foi interrompida.`
}

function createToolLoopLimitMessage(command, maxToolUsesWithoutText) {
  return `${command} executou ${maxToolUsesWithoutText} ferramentas sem gerar resposta textual. A execução foi interrompida para evitar loop; tente reformular com um objetivo mais específico ou divida a tarefa em passos menores.`
}

function formatDuration(durationMs) {
  if (durationMs < 1000) {
    return `${Math.round(durationMs)} ms`
  }

  return `${(durationMs / 1000).toFixed(1)} s`
}

function createChunkDetails(chunk) {
  const text = String(chunk)

  return {
    bytes: Buffer.byteLength(text),
    preview: createTextPreview(text),
  }
}

function createTextPreview(value, maxLength = 1000) {
  const text = String(value ?? '')

  if (text.length <= maxLength) {
    return text
  }

  return `${text.slice(0, maxLength)}...`
}

module.exports = {
  DEFERRED_PROMPT_FALLBACK_MS,
  FIRST_VISIBLE_OUTPUT_TIMEOUT_MS,
  MAX_TOOL_USES_WITHOUT_TEXT,
  PERSISTENT_SESSION_IDLE_TIMEOUT_MS,
  PERSISTENT_TRAILING_OUTPUT_GRACE_MS,
  collectThreadFamily,
  createChunkDetails,
  createExitErrorMessage,
  createModelSessionKey,
  createNoVisibleOutputMessage,
  createNonJsonStdoutMessage,
  createTextPreview,
  createToolLoopLimitMessage,
  createToolLoopProgressState,
  formatAdapterStderr,
  formatDuration,
  getAdapterStderrLevel,
  getPersistentCloseLogLevel,
  getRequiredString,
  handleOrchestrationPromise,
  isTextCliEvent,
  isVisibleCliActivity,
  normalizeCliEventMessage,
  parseAdapterLine,
  shouldAbortForToolLoop,
  shouldAbortOnAdapterStderr,
  shouldSuppressAdapterStderr,
  shouldSuppressPersistentTrailingOutput,
  writeOneShotStdin,
}

/**
 * Terminal adapter for Codex CLI in app-server mode (JSON-RPC 2.0 over stdio/JSONL).
 *
 * The app-server protocol is persistent: the CLI stays alive and accepts
 * multiple turns via stdin. The handshake is:
 *
 *   1. initialize       →  capabilities response
 *   2. initialized      →  client notification (no response)
 *   3. thread/start     →  thread/started notification + response with threadId
 *   4. turn/start       →  turn/started + item/agentMessage/delta (N) + turn/completed
 *
 * The IPC persistent flow calls createPersistentInput at three phases:
 *   - 'initial'  →  send initialize + initialized notification
 *   - 'session'  →  send thread/start
 *   - 'prompt'   →  send turn/start
 *
 * On process reuse the adapter skips handshake and sends turn/start directly.
 *
 * Server-initiated approval requests (item/commandExecution/requestApproval,
 * item/fileChange/requestApproval, item/permissions/requestApproval) carry the
 * approve and deny answers; with "Confirmar ações sensíveis" the persistent
 * session asks the person in the chat, otherwise it approves right away.
 */

const {
  createCodexConfigOptionArgs,
  createCodexExecOptionArgs,
} = require('./model-options.cjs')

let nextRequestId = 1

function getPersistentSpawnArgs(context = {}) {
  return {
    command: 'codex',
    args: ['app-server', ...createCodexConfigOptionArgs(context)],
  }
}

function createPersistentInput(prompt, context = {}) {
  const { persistentPhase, isReusingProcess, providerSessionId } = context

  if (isReusingProcess && persistentPhase === 'initial') {
    const threadId = providerSessionId
    return {
      input: formatTurnStart(threadId, prompt),
      didStartSession: true,
      didSendPrompt: true,
    }
  }

  switch (persistentPhase) {
    case 'session':
      return {
        input: formatJsonRpc('thread/start', { cwd: context.cwd }),
        didStartSession: true,
        didSendPrompt: false,
      }

    case 'prompt': {
      const threadId = providerSessionId
      return {
        input: formatTurnStart(threadId, prompt),
        didStartSession: true,
        didSendPrompt: true,
      }
    }

    default:
      return {
        input:
          formatJsonRpc('initialize', {
            clientInfo: {
              name: 'felixo-ai-core',
              version: '1.0.0',
            },
          }) +
          formatNotification('initialized', {}),
        didStartSession: false,
        didSendPrompt: false,
      }
  }
}

function parseLine(line) {
  const payload = JSON.parse(line)

  if (payload.jsonrpc !== undefined && payload.jsonrpc !== '2.0') {
    return null
  }

  if (isServerNotification(payload)) {
    return parseServerNotification(payload)
  }

  if (isServerRequest(payload)) {
    return parseServerRequest(payload)
  }

  if (isResponse(payload)) {
    return parseResponse(payload)
  }

  if (isErrorResponse(payload)) {
    return {
      type: 'error',
      message: payload.error.message ?? 'Codex app-server retornou um erro.',
    }
  }

  return null
}

function parseServerNotification(payload) {
  switch (payload.method) {
    case 'thread/started':
      return {
        type: 'session',
        providerSessionId: extractThreadId(payload.params),
        readyForPrompt: true,
      }

    case 'item/agentMessage/delta':
      return createTextEvent(
        payload.params?.delta ?? '',
        extractStreamItemId(payload.params),
      )

    case 'item/reasoning/textDelta':
      return null

    case 'item/reasoning/summaryTextDelta':
      return null

    case 'turn/completed':
      return {
        type: 'done',
        providerSessionId: payload.params?.threadId,
      }

    case 'turn/started':
      return null

    case 'item/started':
      return null

    case 'item/completed':
      return null

    case 'error': {
      // Protocolo atual: `{ error: TurnError, threadId, turnId, willRetry }`. Com
      // `willRetry`, o próprio Codex tenta de novo: não é o fim do pedido.
      if (payload.params?.willRetry === true) {
        return null
      }
      const turnError = payload.params?.error ?? {}
      return {
        type: 'error',
        message: turnError.message ?? payload.params?.message ?? 'Codex app-server emitiu um erro.',
        ...readCodexErrorInfo(turnError.codexErrorInfo),
      }
    }

    default:
      return null
  }
}

/**
 * `codexErrorInfo` é um enum (`usageLimitExceeded`) ou um objeto de uma
 * chave com `httpStatusCode` (`{ httpConnectionFailed: { httpStatusCode: 503 } }`).
 */
function readCodexErrorInfo(info) {
  if (typeof info === 'string' && info) {
    return { failureCode: info }
  }
  if (info && typeof info === 'object') {
    const [code] = Object.keys(info)
    if (!code) return {}
    const status = info[code]?.httpStatusCode
    return { failureCode: code, ...(Number.isInteger(status) ? { httpStatus: status } : {}) }
  }
  return {}
}

function parseServerRequest(payload) {
  if (isApprovalRequest(payload.method)) {
    return {
      type: 'control',
      responseInput: formatApprovalResponse(payload, true),
      permission: {
        ...describeApprovalRequest(payload.method, payload.params ?? {}),
        denyInput: formatApprovalResponse(payload, false),
      },
    }
  }

  return null
}

/** O que a pessoa lê no card: o que o Codex quer fazer, e onde. */
function describeApprovalRequest(method, params) {
  const command = Array.isArray(params.command) ? params.command.join(' ') : params.command
  const parts = [
    typeof command === 'string' && command.trim() ? `Comando: ${command.trim()}` : null,
    typeof params.cwd === 'string' && params.cwd ? `Pasta: ${params.cwd}` : null,
    typeof params.grantRoot === 'string' && params.grantRoot ? `Pasta pedida: ${params.grantRoot}` : null,
    typeof params.reason === 'string' && params.reason.trim() ? `Motivo: ${params.reason.trim()}` : null,
  ].filter(Boolean)
  const title =
    method === 'item/commandExecution/requestApproval'
      ? 'O Codex quer rodar um comando'
      : method === 'item/fileChange/requestApproval'
        ? 'O Codex quer alterar arquivos'
        : 'O Codex pede mais permissão'
  return { title, detail: parts.join('\n') || null }
}

function parseResponse(payload) {
  const result = payload.result

  if (
    result?.capabilities ||
    result?.serverInfo ||
    result?.userAgent ||
    result?.codexHome
  ) {
    return {
      type: 'control',
      readyForSession: true,
    }
  }

  if (result?.thread || result?.threadId) {
    return {
      type: 'session',
      providerSessionId: extractThreadId(result),
      readyForPrompt: true,
    }
  }

  return null
}

function canResume() {
  return false
}

function getSpawnArgs(prompt, context = {}) {
  const args = ['exec', '--json', '--skip-git-repo-check']

  args.push(...createCodexExecOptionArgs(context))

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
      ...createCodexExecOptionArgs(context),
      context.providerSessionId,
      prompt,
    ],
  }
}

function formatTurnStart(threadId, prompt) {
  return formatJsonRpc('turn/start', {
    threadId,
    input: [{ type: 'text', text: prompt }],
  })
}

function formatJsonRpc(method, params) {
  const id = nextRequestId++
  return `${JSON.stringify({ jsonrpc: '2.0', method, id, params })}\n`
}

function formatNotification(method, params) {
  return `${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`
}

// Vocabulário do protocolo v2 (conferido com `codex app-server generate-json-schema`): comando e
// arquivo respondem `accept`/`decline`; `approved`/`denied` é o v1 e o Codex não o entende.
// Pedido de permissão extra responde com o perfil concedido ({} nega).
function formatApprovalResponse(payload, allow) {
  const result =
    payload.method === 'item/permissions/requestApproval'
      ? { permissions: allow ? (payload.params?.permissions ?? {}) : {}, scope: 'turn' }
      : { decision: allow ? 'accept' : 'decline' }
  return `${JSON.stringify({ jsonrpc: '2.0', id: payload.id, result })}
`
}

function isApprovalRequest(method) {
  return (
    method === 'item/commandExecution/requestApproval' ||
    method === 'item/fileChange/requestApproval' ||
    method === 'item/permissions/requestApproval'
  )
}

function isServerNotification(payload) {
  return typeof payload.method === 'string' && payload.id === undefined
}

function isServerRequest(payload) {
  return typeof payload.method === 'string' && payload.id !== undefined && payload.result === undefined
}

function isResponse(payload) {
  return payload.id !== undefined && payload.result !== undefined && payload.method === undefined
}

function isErrorResponse(payload) {
  return payload.id !== undefined && payload.error !== undefined
}

function extractThreadId(value) {
  return value?.threadId ?? value?.thread?.id
}

function extractStreamItemId(value) {
  const candidates = [
    value?.itemId,
    value?.item?.id,
    value?.id,
  ]

  return candidates.find(
    (candidate) => typeof candidate === 'string' && candidate,
  ) ?? undefined
}

function createTextEvent(text, streamItemId) {
  const event = {
    type: 'text',
    text,
  }

  if (streamItemId) {
    event.streamItemId = streamItemId
  }

  return event
}

function resetRequestId() {
  nextRequestId = 1
}

module.exports = {
  canResume,
  createPersistentInput,
  getPersistentSpawnArgs,
  getResumeArgs,
  getSpawnArgs,
  parseLine,
  resetRequestId,
}

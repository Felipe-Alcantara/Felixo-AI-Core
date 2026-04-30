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
 * item/fileChange/requestApproval) are auto-approved in this first version.
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
      return {
        type: 'text',
        text: payload.params?.delta ?? '',
      }

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

    case 'error':
      return {
        type: 'error',
        message: payload.params?.message ?? 'Codex app-server emitiu um erro.',
      }

    default:
      return null
  }
}

function parseServerRequest(payload) {
  if (isApprovalRequest(payload.method)) {
    const isCommand = payload.method === 'item/commandExecution/requestApproval'
    const isFile = payload.method === 'item/fileChange/requestApproval'
    const description = isCommand
      ? (payload.params?.command ?? 'Executar comando')
      : isFile
        ? (payload.params?.filePath ?? 'Modificar arquivo')
        : 'Permissão solicitada'

    return {
      type: 'control',
      requiresApproval: true,
      approvalId: String(payload.id),
      approvalType: isCommand ? 'command' : isFile ? 'file' : 'permission',
      description,
      approveInput: formatApprovalResponse(payload.id),
      denyInput: formatDenyResponse(payload.id),
    }
  }

  return null
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

function formatApprovalResponse(requestId) {
  return `${JSON.stringify({
    jsonrpc: '2.0',
    id: requestId,
    result: { decision: 'approved' },
  })}\n`
}

function formatDenyResponse(requestId) {
  return `${JSON.stringify({
    jsonrpc: '2.0',
    id: requestId,
    result: { decision: 'denied' },
  })}\n`
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

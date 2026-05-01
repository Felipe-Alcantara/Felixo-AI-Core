/**
 * Terminal adapter for Gemini CLI in ACP mode (Agent Client Protocol v1).
 *
 * ACP is a persistent protocol: the CLI stays alive and accepts multiple
 * prompts via stdin.  The handshake is:
 *
 *   1. initialize    →  agentCapabilities response
 *   2. authenticate  →  {} response           (auto-sent via responseInput)
 *   3. session/new   →  {sessionId} response
 *   4. session/prompt → session/update notifications + final response
 *
 * The IPC persistent flow calls createPersistentInput at three phases:
 *   - 'initial'  →  send initialize (session not started, prompt not sent)
 *   - 'session'  →  send session/new (triggered after authenticate succeeds)
 *   - 'prompt'   →  send session/prompt (triggered after session/new returns sessionId)
 *
 * On process reuse ('initial' with isReusingProcess=true) the adapter skips
 * initialize/authenticate/session/new and sends session/prompt directly.
 *
 * Server-to-client requests (session/request_permission) are auto-approved.
 */

const { createModelOptionArgs } = require('./model-options.cjs')

const PROTOCOL_VERSION = 1
const DEFAULT_AUTH_METHOD = 'oauth-personal'

let nextRequestId = 1

function getPersistentSpawnArgs(context = {}) {
  return {
    command: 'gemini',
    args: ['--acp', ...createModelOptionArgs(context)],
  }
}

function createPersistentInput(prompt, context = {}) {
  const { persistentPhase, isReusingProcess, providerSessionId, cwd } = context

  if (isReusingProcess && persistentPhase === 'initial') {
    return {
      input: formatSessionPrompt(providerSessionId, prompt),
      didStartSession: true,
      didSendPrompt: true,
    }
  }

  switch (persistentPhase) {
    case 'session':
      return {
        input: formatJsonRpc('session/new', {
          cwd: cwd || process.env.HOME || process.cwd(),
          mcpServers: [],
        }),
        didStartSession: true,
        didSendPrompt: false,
      }

    case 'prompt':
      return {
        input: formatSessionPrompt(providerSessionId, prompt),
        didStartSession: true,
        didSendPrompt: true,
      }

    default:
      return {
        input: formatJsonRpc('initialize', { protocolVersion: PROTOCOL_VERSION }),
        didStartSession: false,
        didSendPrompt: false,
      }
  }
}

function parseLine(line) {
  const payload = JSON.parse(line)

  if (payload.jsonrpc !== '2.0') {
    return null
  }

  if (isServerRequest(payload)) {
    return parseServerRequest(payload)
  }

  if (isNotification(payload)) {
    return parseNotification(payload)
  }

  if (isResponse(payload)) {
    return parseResponse(payload)
  }

  if (isErrorResponse(payload)) {
    return {
      type: 'error',
      message: payload.error.message ?? 'Gemini ACP retornou um erro.',
    }
  }

  return null
}

function parseNotification(payload) {
  if (payload.method === 'session/update') {
    const update = payload.params?.update
    if (update?.sessionUpdate === 'agent_message_chunk' && update?.content?.type === 'text') {
      return { type: 'text', text: update.content.text }
    }
    return null
  }

  return null
}

function parseServerRequest(payload) {
  if (payload.method === 'session/request_permission') {
    const options = payload.params?.options ?? []
    const allowOption = options.find((o) => o.kind === 'allow_once') ?? options[0]
    const optionId = allowOption?.id ?? 'allow_once'
    return {
      type: 'control',
      responseInput: formatResponse(payload.id, { outcome: 'selected', optionId }),
    }
  }

  return null
}

function parseResponse(payload) {
  const result = payload.result

  if (result?.agentCapabilities !== undefined) {
    return {
      type: 'control',
      responseInput: formatJsonRpc('authenticate', { methodId: DEFAULT_AUTH_METHOD }),
    }
  }

  if (result && isEmptyObject(result)) {
    return { type: 'control', readyForSession: true }
  }

  if (result?.sessionId) {
    return {
      type: 'session',
      providerSessionId: result.sessionId,
      readyForPrompt: true,
    }
  }

  if (result?.stopReason !== undefined) {
    return { type: 'done' }
  }

  return null
}

function canResume() {
  return false
}

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
    ],
  }
}

function formatSessionPrompt(sessionId, prompt) {
  return formatJsonRpc('session/prompt', {
    sessionId,
    prompt: [{ type: 'text', text: prompt }],
  })
}

function formatJsonRpc(method, params) {
  const id = nextRequestId++
  return `${JSON.stringify({ jsonrpc: '2.0', method, id, params })}\n`
}

function formatResponse(id, result) {
  return `${JSON.stringify({ jsonrpc: '2.0', id, result })}\n`
}

function isNotification(payload) {
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

function isEmptyObject(obj) {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) return false
  const keys = Object.keys(obj).filter((k) => k !== '_meta')
  return keys.length === 0
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

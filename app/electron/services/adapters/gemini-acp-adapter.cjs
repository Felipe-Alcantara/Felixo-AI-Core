/**
 * Terminal adapter for Gemini CLI in ACP mode (JSON-RPC 2.0 over stdio).
 *
 * ACP is a persistent protocol: the CLI stays alive and accepts multiple
 * prompts via stdin.  The handshake is:
 *
 *   1. initialize  →  capabilities response
 *   2. newSession  →  sessionId response
 *   3. prompt      →  textChunk notifications + final response
 *
 * The IPC persistent flow calls createPersistentInput at three phases:
 *   - 'initial'  →  send initialize (session not started, prompt not sent)
 *   - 'session'  →  send newSession  (session started after initialize response)
 *   - 'prompt'   →  send prompt      (prompt sent after newSession response)
 *
 * On process reuse ('initial' with isReusingProcess=true) the adapter skips
 * initialize/newSession and sends the prompt directly.
 */

let nextRequestId = 1

function getPersistentSpawnArgs() {
  return {
    command: 'gemini',
    args: ['--acp'],
  }
}

function createPersistentInput(prompt, context = {}) {
  const { persistentPhase, isReusingProcess } = context

  if (isReusingProcess && persistentPhase === 'initial') {
    return {
      input: formatJsonRpc('prompt', { text: prompt }),
      didStartSession: true,
      didSendPrompt: true,
    }
  }

  switch (persistentPhase) {
    case 'session':
      return {
        input: formatJsonRpc('newSession', {}),
        didStartSession: true,
        didSendPrompt: false,
      }

    case 'prompt':
      return {
        input: formatJsonRpc('prompt', { text: prompt }),
        didStartSession: true,
        didSendPrompt: true,
      }

    default:
      return {
        input: formatJsonRpc('initialize', {}),
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
  if (payload.method === 'textChunk' && payload.params?.text) {
    return {
      type: 'text',
      text: payload.params.text,
    }
  }

  return null
}

function parseResponse(payload) {
  const result = payload.result

  if (result.capabilities) {
    return {
      type: 'control',
      readyForSession: true,
    }
  }

  if (result.sessionId && !result.text) {
    return {
      type: 'session',
      providerSessionId: result.sessionId,
      readyForPrompt: true,
    }
  }

  if (result.text !== undefined) {
    return {
      type: 'done',
      providerSessionId: result.sessionId,
    }
  }

  if (result.cancelled) {
    return {
      type: 'done',
    }
  }

  return null
}

function canResume() {
  return false
}

function getSpawnArgs(prompt) {
  return {
    command: 'gemini',
    args: ['--prompt', prompt, '--output-format', 'stream-json', '--skip-trust'],
  }
}

function getResumeArgs(prompt, context = {}) {
  if (!context.providerSessionId) {
    return getSpawnArgs(prompt)
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

function formatJsonRpc(method, params) {
  const id = nextRequestId++
  return `${JSON.stringify({ jsonrpc: '2.0', method, id, params })}\n`
}

function isNotification(payload) {
  return typeof payload.method === 'string' && payload.id === undefined
}

function isResponse(payload) {
  return payload.id !== undefined && payload.result !== undefined
}

function isErrorResponse(payload) {
  return payload.id !== undefined && payload.error !== undefined
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

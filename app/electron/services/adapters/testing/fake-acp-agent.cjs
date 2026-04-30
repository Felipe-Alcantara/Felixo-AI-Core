#!/usr/bin/env node

/**
 * Fake persistent agent that speaks the Gemini ACP protocol (JSON-RPC 2.0).
 *
 * Reads JSON-RPC requests from stdin (one per line), emits responses and
 * notifications on stdout. Stays alive between prompts.
 *
 * Supported methods:
 *   initialize  — returns capabilities
 *   newSession  — returns a sessionId
 *   prompt      — emits text notifications + final response
 *   cancel      — acknowledges cancellation
 *
 * Usage:
 *   node fake-acp-agent.cjs
 *
 * Then write lines to stdin:
 *   {"jsonrpc":"2.0","method":"initialize","id":1}
 *   {"jsonrpc":"2.0","method":"newSession","id":2}
 *   {"jsonrpc":"2.0","method":"prompt","id":3,"params":{"text":"oi"}}
 */

const readline = require('node:readline')

const SESSION_ID = 'fake-acp-session-001'

const rl = readline.createInterface({ input: process.stdin })

rl.on('line', (line) => {
  const trimmed = line.trim()

  if (!trimmed) {
    return
  }

  let request

  try {
    request = JSON.parse(trimmed)
  } catch {
    sendError(null, -32700, 'Parse error')
    return
  }

  if (request.jsonrpc !== '2.0' || typeof request.method !== 'string') {
    sendError(request.id ?? null, -32600, 'Invalid Request')
    return
  }

  handleMethod(request)
})

rl.on('close', () => {
  process.exit(0)
})

function handleMethod(request) {
  switch (request.method) {
    case 'initialize':
      sendResult(request.id, {
        capabilities: {
          streaming: true,
          tools: false,
          sessions: true,
        },
      })
      break

    case 'newSession':
      sendResult(request.id, {
        sessionId: SESSION_ID,
      })
      break

    case 'prompt':
      handlePrompt(request)
      break

    case 'cancel':
      sendResult(request.id, { cancelled: true })
      break

    default:
      sendError(request.id, -32601, `Method not found: ${request.method}`)
  }
}

function handlePrompt(request) {
  const text = request.params?.text ?? ''
  const words = `Resposta ACP fake para: ${text}`.split(' ')

  for (const word of words) {
    sendNotification('textChunk', { text: `${word} ` })
  }

  sendResult(request.id, {
    text: `Resposta ACP fake para: ${text}`,
    sessionId: SESSION_ID,
  })
}

function sendResult(id, result) {
  writeLine({
    jsonrpc: '2.0',
    id,
    result,
  })
}

function sendError(id, code, message) {
  writeLine({
    jsonrpc: '2.0',
    id,
    error: { code, message },
  })
}

function sendNotification(method, params) {
  writeLine({
    jsonrpc: '2.0',
    method,
    params,
  })
}

function writeLine(obj) {
  process.stdout.write(`${JSON.stringify(obj)}\n`)
}

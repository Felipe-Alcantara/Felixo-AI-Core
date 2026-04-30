#!/usr/bin/env node

/**
 * Fake persistent agent that speaks the Codex app-server protocol
 * (JSON-RPC 2.0 over stdio/JSONL).
 *
 * Reads JSON-RPC requests/notifications from stdin, emits responses and
 * notifications on stdout. Stays alive between turns.
 *
 * Supported methods:
 *   initialize         — returns capabilities
 *   initialized        — client notification, ignored
 *   thread/start       — emits thread/started notification + response
 *   turn/start         — emits turn/started, agentMessage deltas, turn/completed
 *   turn/interrupt     — acknowledges interruption
 *
 * Server requests (approval) are emitted during turn/start and the client
 * must respond before the turn completes.
 *
 * Usage:
 *   node fake-codex-app-server-agent.cjs
 */

const readline = require('node:readline')

const THREAD_ID = 'fake-codex-thread-001'
let turnCounter = 0

const rl = readline.createInterface({ input: process.stdin })

rl.on('line', (line) => {
  const trimmed = line.trim()

  if (!trimmed) {
    return
  }

  let message

  try {
    message = JSON.parse(trimmed)
  } catch {
    sendError(null, -32700, 'Parse error')
    return
  }

  if (isNotification(message)) {
    handleNotification(message)
    return
  }

  if (typeof message.method !== 'string') {
    sendError(message.id ?? null, -32600, 'Invalid Request')
    return
  }

  handleRequest(message)
})

rl.on('close', () => {
  process.exit(0)
})

function handleNotification(message) {
  // initialized — acknowledge silently
}

function handleRequest(request) {
  switch (request.method) {
    case 'initialize':
      sendResult(request.id, {
        serverInfo: {
          name: 'fake-codex-app-server',
          version: '0.0.0',
        },
        capabilities: {
          threads: true,
          turns: true,
          streaming: true,
        },
      })
      break

    case 'thread/start':
      handleThreadStart(request)
      break

    case 'thread/resume':
      handleThreadStart(request)
      break

    case 'turn/start':
      handleTurnStart(request)
      break

    case 'turn/interrupt':
      sendResult(request.id, { interrupted: true })
      break

    default:
      sendError(request.id, -32601, `Method not found: ${request.method}`)
  }
}

function handleThreadStart(request) {
  sendNotification('thread/started', {
    threadId: THREAD_ID,
    thread: {
      id: THREAD_ID,
      status: 'active',
    },
  })

  sendResult(request.id, {
    threadId: THREAD_ID,
  })
}

function handleTurnStart(request) {
  turnCounter++
  const turnId = `fake-turn-${turnCounter}`
  const input = request.params?.input ?? []
  const text = input
    .filter((i) => i.type === 'text')
    .map((i) => i.text)
    .join(' ')

  sendNotification('turn/started', {
    threadId: THREAD_ID,
    turn: {
      id: turnId,
      status: 'running',
    },
  })

  const words = `Resposta Codex fake para: ${text}`.split(' ')

  for (const word of words) {
    sendNotification('item/agentMessage/delta', {
      delta: `${word} `,
      itemId: `item-${turnCounter}`,
      threadId: THREAD_ID,
      turnId,
    })
  }

  sendNotification('turn/completed', {
    threadId: THREAD_ID,
    turn: {
      id: turnId,
      status: 'completed',
    },
  })

  sendResult(request.id, {
    threadId: THREAD_ID,
    turnId,
  })
}

function sendResult(id, result) {
  writeLine({ jsonrpc: '2.0', id, result })
}

function sendError(id, code, message) {
  writeLine({ jsonrpc: '2.0', id, error: { code, message } })
}

function sendNotification(method, params) {
  writeLine({ jsonrpc: '2.0', method, params })
}

function isNotification(message) {
  return typeof message.method === 'string' && message.id === undefined
}

function writeLine(obj) {
  process.stdout.write(`${JSON.stringify(obj)}\n`)
}

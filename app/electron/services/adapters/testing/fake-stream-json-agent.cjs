#!/usr/bin/env node

/**
 * Fake persistent agent that speaks the Claude stream-json protocol.
 *
 * Reads JSONL from stdin, emits JSONL on stdout.
 * Stays alive between prompts, just like a real persistent CLI.
 *
 * Usage:
 *   node fake-stream-json-agent.cjs
 *
 * Then write lines to stdin:
 *   {"type":"user","message":{"role":"user","content":[{"type":"text","text":"oi"}]}}
 */

const readline = require('node:readline')

const SESSION_ID = 'fake-stream-json-00000000-0000-4000-8000-000000000001'

let initialized = false

const rl = readline.createInterface({ input: process.stdin })

rl.on('line', (line) => {
  const trimmed = line.trim()

  if (!trimmed) {
    return
  }

  let payload

  try {
    payload = JSON.parse(trimmed)
  } catch {
    emitError('JSON inválido recebido.')
    return
  }

  if (!initialized) {
    emitSystem()
    initialized = true
  }

  if (payload.type === 'user') {
    handleUserMessage(payload)
  }
})

rl.on('close', () => {
  process.exit(0)
})

function handleUserMessage(payload) {
  const text = extractText(payload)
  const words = `Resposta fake para: ${text}`.split(' ')

  for (const word of words) {
    emitTextDelta(`${word} `)
  }

  emitResult()
}

function extractText(payload) {
  const content = payload.message?.content

  if (Array.isArray(content)) {
    const textBlock = content.find((b) => b.type === 'text')

    return textBlock?.text ?? ''
  }

  return String(content ?? '')
}

function emitSystem() {
  writeLine({
    type: 'system',
    subtype: 'init',
    session_id: SESSION_ID,
  })
}

function emitTextDelta(text) {
  writeLine({
    type: 'stream_event',
    event: {
      type: 'content_block_delta',
      delta: {
        type: 'text_delta',
        text,
      },
    },
  })
}

function emitResult() {
  writeLine({
    type: 'result',
    total_cost_usd: 0,
    duration_ms: 0,
    session_id: SESSION_ID,
  })
}

function emitError(message) {
  writeLine({
    type: 'error',
    message,
  })
}

function writeLine(obj) {
  process.stdout.write(`${JSON.stringify(obj)}\n`)
}

/**
 * @typedef {'text_delta' | 'tool_call' | 'session' | 'status' | 'done' | 'error'} AgentEventType
 *
 * @typedef {Object} AgentEvent
 * @property {AgentEventType} type
 * @property {string} [text]
 * @property {string} [tool]
 * @property {unknown} [input]
 * @property {string} [providerSessionId]
 * @property {string} [message]
 * @property {number} [cost]
 * @property {number} [duration]
 */

/**
 * @typedef {Object} AgentSession
 * @property {() => Promise<void>} start
 * @property {(prompt: string) => AsyncIterable<AgentEvent>} sendPrompt
 * @property {() => Promise<void>} cancel
 * @property {() => Promise<void>} dispose
 */

function textDelta(text) {
  return { type: 'text_delta', text }
}

function toolCall(tool, input) {
  return { type: 'tool_call', tool, input }
}

function session(providerSessionId) {
  return { type: 'session', providerSessionId }
}

function status(message) {
  return { type: 'status', message }
}

function done(opts) {
  const event = { type: 'done' }

  if (opts?.cost !== undefined) {
    event.cost = opts.cost
  }

  if (opts?.duration !== undefined) {
    event.duration = opts.duration
  }

  if (opts?.providerSessionId !== undefined) {
    event.providerSessionId = opts.providerSessionId
  }

  return event
}

function error(message) {
  return { type: 'error', message }
}

module.exports = {
  textDelta,
  toolCall,
  session,
  status,
  done,
  error,
}

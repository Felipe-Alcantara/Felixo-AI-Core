'use strict'

/**
 * Traduz as linhas do Claude Code sem tela (`claude -p --output-format
 * stream-json --verbose --include-partial-messages --permission-prompt-tool
 * stdio`) em eventos pequenos para o bloco de conversa.
 *
 * Formato medido no Claude Code 2.1.303 (19/10/2026):
 * - `system/init`: `session_id`, `model`, `apiKeySource`.
 * - `stream_event`: deltas da resposta em andamento
 *   (`content_block_delta` + `text_delta`).
 * - `assistant`: mensagem completa, com blocos `text`, `tool_use` e
 *   `thinking`. Uma mensagem com `model: "<synthetic>"` é o próprio Claude
 *   Code avisando um erro, por exemplo "Invalid API key · Fix external API key".
 * - `user`: o `tool_result` de cada ferramenta.
 * - `control_request` com `subtype: "can_use_tool"`: pedido de permissão.
 *   O app responde com `control_response`.
 * - `result`: fim do turno, com `is_error`, `api_error_status` e
 *   `total_cost_usd`.
 *
 * Nada aqui faz E/S: entra uma linha, saem zero ou mais eventos.
 */

const MAX_TOOL_RESULT_CHARS = 4000

/** Classifica o texto de erro que o Claude Code devolve num turno. */
function classifyClaudeError({ text = '', apiErrorStatus = null } = {}) {
  const lower = String(text).toLowerCase()
  if (apiErrorStatus === 401 || lower.includes('invalid api key')) return 'auth'
  if (lower.includes('credit balance') || lower.includes('add funds')) return 'credit'
  if (apiErrorStatus === 429 || lower.includes('rate limit')) return 'rate-limit'
  if (apiErrorStatus === 529 || lower.includes('overloaded')) return 'overloaded'
  return text || apiErrorStatus ? 'other' : null
}

function textOfToolResult(content) {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .map((part) => (part?.type === 'text' && typeof part.text === 'string' ? part.text : ''))
    .filter(Boolean)
    .join('\n')
}

function truncate(text, max = MAX_TOOL_RESULT_CHARS) {
  if (typeof text !== 'string') return ''
  return text.length > max ? `${text.slice(0, max)}\n… (${text.length - max} caracteres a mais)` : text
}

function normalizeAssistantBlocks(content) {
  if (!Array.isArray(content)) return []
  const blocks = []
  for (const block of content) {
    if (block?.type === 'text' && typeof block.text === 'string' && block.text !== '') {
      blocks.push({ type: 'text', text: block.text })
    } else if (block?.type === 'tool_use' && typeof block.id === 'string') {
      blocks.push({
        type: 'tool_use',
        id: block.id,
        name: typeof block.name === 'string' ? block.name : 'ferramenta',
        input: block.input && typeof block.input === 'object' ? block.input : {},
      })
    }
  }
  return blocks
}

/**
 * @param {unknown} message - Objeto já lido de uma linha JSON.
 * @returns {Array<Record<string, unknown>>}
 */
function translateClaudeStreamMessage(message) {
  if (!message || typeof message !== 'object') return []
  const type = message.type

  if (type === 'system' && message.subtype === 'init') {
    return [
      {
        kind: 'ready',
        claudeSessionId: typeof message.session_id === 'string' ? message.session_id : null,
        model: typeof message.model === 'string' ? message.model : null,
        apiKeySource: typeof message.apiKeySource === 'string' ? message.apiKeySource : null,
      },
    ]
  }

  if (type === 'stream_event') {
    const event = message.event
    if (
      event?.type === 'content_block_delta' &&
      event.delta?.type === 'text_delta' &&
      typeof event.delta.text === 'string' &&
      message.parent_tool_use_id == null
    ) {
      return [{ kind: 'text-delta', text: event.delta.text }]
    }
    return []
  }

  if (type === 'assistant') {
    const body = message.message ?? {}
    // Resposta de subagente (Task): fica fora da conversa principal.
    if (message.parent_tool_use_id != null) return []
    if (body.model === '<synthetic>') {
      const text = normalizeAssistantBlocks(body.content)
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('\n')
      return text ? [{ kind: 'notice', text, errorKind: classifyClaudeError({ text }) }] : []
    }
    const blocks = normalizeAssistantBlocks(body.content)
    if (blocks.length === 0) return []
    return [{ kind: 'assistant-message', messageId: typeof body.id === 'string' ? body.id : null, blocks }]
  }

  if (type === 'user') {
    if (message.parent_tool_use_id != null) return []
    const content = message.message?.content
    if (!Array.isArray(content)) return []
    return content
      .filter((part) => part?.type === 'tool_result' && typeof part.tool_use_id === 'string')
      .map((part) => ({
        kind: 'tool-result',
        toolUseId: part.tool_use_id,
        isError: part.is_error === true,
        text: truncate(textOfToolResult(part.content)),
      }))
  }

  if (type === 'control_request' && message.request?.subtype === 'can_use_tool') {
    const request = message.request
    return [
      {
        kind: 'permission-request',
        requestId: typeof message.request_id === 'string' ? message.request_id : '',
        toolName: typeof request.tool_name === 'string' ? request.tool_name : 'ferramenta',
        toolUseId: typeof request.tool_use_id === 'string' ? request.tool_use_id : null,
        description: typeof request.description === 'string' ? request.description : '',
        input: request.input && typeof request.input === 'object' ? request.input : {},
      },
    ]
  }

  if (type === 'result') {
    const isError = message.is_error === true || (message.subtype && message.subtype !== 'success')
    const resultText = typeof message.result === 'string' ? message.result : ''
    const apiErrorStatus = Number.isInteger(message.api_error_status) ? message.api_error_status : null
    const interrupted = message.subtype === 'error_during_execution' && !resultText
    return [
      {
        kind: 'turn-end',
        isError: Boolean(isError) && !interrupted,
        interrupted,
        errorKind: isError && !interrupted ? classifyClaudeError({ text: resultText, apiErrorStatus }) : null,
        resultText: isError ? resultText : '',
        costUsd: typeof message.total_cost_usd === 'number' ? message.total_cost_usd : 0,
        durationMs: typeof message.duration_ms === 'number' ? message.duration_ms : null,
      },
    ]
  }

  return []
}

/**
 * Junta pedaços do stdout em linhas completas. O resto sem `\n` espera o
 * próximo pedaço.
 */
function createLineSplitter(onLine) {
  let pending = ''
  return {
    push(chunk) {
      pending += typeof chunk === 'string' ? chunk : chunk.toString('utf8')
      let index
      while ((index = pending.indexOf('\n')) !== -1) {
        const line = pending.slice(0, index).replace(/\r$/, '')
        pending = pending.slice(index + 1)
        if (line.trim()) onLine(line)
      }
    },
    flush() {
      const line = pending.trim()
      pending = ''
      if (line) onLine(line)
    },
  }
}

module.exports = {
  MAX_TOOL_RESULT_CHARS,
  classifyClaudeError,
  createLineSplitter,
  translateClaudeStreamMessage,
}

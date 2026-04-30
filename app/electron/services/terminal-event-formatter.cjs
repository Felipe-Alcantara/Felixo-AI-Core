function createStartTerminalEvent({
  command,
  cliType,
  modelName,
  cwd,
  isContinuation,
  usesNativeResume = false,
  usesPersistentProcess = false,
  reusedProcess = false,
  providerSessionId,
}) {
  const mode = createStartMode({
    isContinuation,
    usesNativeResume,
    usesPersistentProcess,
    reusedProcess,
  })
  const details = [
    `${mode.verb} ${command}.`,
  ]

  if (modelName) {
    details.push(`Modelo: ${modelName}.`)
  }

  if (cwd) {
    details.push(`Workspace: ${cwd}.`)
  }

  return {
    source: 'system',
    kind: 'lifecycle',
    severity: 'info',
    title: mode.title,
    chunk: details.join('\n'),
    metadata: compactObject({
      command,
      cliType,
      modelName,
      cwd,
      mode: mode.metadata,
      persistent: usesPersistentProcess || undefined,
      reusedProcess: reusedProcess || undefined,
      providerSessionId,
    }),
  }
}

function createTerminalEvents({
  command,
  line,
  cliEvent,
  durationMs,
}) {
  const payload = parseJson(line)
  const cliEvents = createEventsFromCliEvent(cliEvent, payload, durationMs)

  if (cliEvents.length > 0) {
    return cliEvents
  }

  if (!payload || typeof payload !== 'object') {
    return []
  }

  return createEventsFromPayload(command, payload, durationMs)
}

function createErrorTerminalEvent(message) {
  return {
    source: 'system',
    kind: 'error',
    severity: 'error',
    title: 'Erro',
    chunk: message,
  }
}

function createStderrTerminalEvent(chunk, severity = 'warn') {
  return {
    source: 'stderr',
    kind: 'stderr',
    severity,
    title: severity === 'error' ? 'Erro da CLI' : 'Aviso da CLI',
    chunk: String(chunk),
  }
}

function createEventsFromCliEvent(cliEvent, payload, durationMs) {
  if (!cliEvent || typeof cliEvent !== 'object') {
    return []
  }

  if (cliEvent.type === 'session') {
    const providerSessionId = cliEvent.providerSessionId ?? extractProviderSessionId(payload)

    return [
      {
        source: 'system',
        kind: 'lifecycle',
        severity: 'info',
        title: 'Sessão conectada',
        chunk: providerSessionId
          ? `Sessão do provedor: ${providerSessionId}`
          : 'Sessão do provedor conectada.',
        metadata: compactObject({ providerSessionId }),
      },
    ]
  }

  if (cliEvent.type === 'text') {
    if (!String(cliEvent.text ?? '').trim()) {
      return []
    }

    return [
      {
        source: 'stdout',
        kind: 'assistant',
        severity: 'info',
        title: 'Resposta',
        chunk: cliEvent.text,
      },
    ]
  }

  if (cliEvent.type === 'tool_use') {
    return [
      {
        source: 'stdout',
        kind: 'tool',
        severity: 'info',
        title: `Ferramenta: ${cliEvent.tool || 'tool'}`,
        chunk: prettifyToolPayload(cliEvent.input),
        metadata: compactObject({ tool: cliEvent.tool }),
      },
    ]
  }

  if (cliEvent.type === 'tool_result') {
    return [
      {
        source: 'stdout',
        kind: 'tool',
        severity: 'info',
        title: 'Resultado de ferramenta',
        chunk: String(cliEvent.output ?? ''),
      },
    ]
  }

  if (cliEvent.type === 'done') {
    return [createDoneEvent(payload, cliEvent, durationMs)]
  }

  if (cliEvent.type === 'error') {
    return [createErrorTerminalEvent(cliEvent.message ?? 'A CLI retornou um erro.')]
  }

  return []
}

function createEventsFromPayload(command, payload, durationMs) {
  if (payload.type === 'turn.started') {
    return [
      {
        source: 'system',
        kind: 'lifecycle',
        severity: 'info',
        title: 'Processando',
        chunk: 'A IA iniciou o turno de resposta.',
      },
    ]
  }

  if (payload.type === 'turn.completed' || payload.type === 'result') {
    return [createDoneEvent(payload, null, durationMs)]
  }

  if (payload.type === 'item.started') {
    return [createCodexItemEvent(payload.item, 'Item iniciado')]
  }

  if (payload.type === 'item.completed') {
    return [createCodexItemEvent(payload.item, 'Item concluído')]
  }

  if (payload.type === 'message' && payload.role === 'user') {
    return [
      {
        source: 'system',
        kind: 'lifecycle',
        severity: 'info',
        title: 'Prompt enviado',
        chunk: 'A CLI recebeu a mensagem e está gerando resposta.',
      },
    ]
  }

  if (payload.type === 'message' && payload.role && payload.role !== 'user') {
    return [
      {
        source: 'stdout',
        kind: 'assistant',
        severity: 'info',
        title: 'Resposta',
        chunk: String(payload.content ?? ''),
      },
    ]
  }

  if (payload.type === 'stream_event') {
    const event = payload.event

    if (event?.type === 'content_block_start') {
      return [
        {
          source: 'system',
          kind: 'lifecycle',
          severity: 'info',
          title: 'Bloco iniciado',
          chunk: formatContentBlockStart(event),
        },
      ]
    }
  }

  if (isSessionMetadata(payload)) {
    const providerSessionId = extractProviderSessionId(payload)

    return [
      {
        source: 'system',
        kind: 'lifecycle',
        severity: 'info',
        title: 'Sessão conectada',
        chunk: providerSessionId
          ? `Sessão do provedor: ${providerSessionId}`
          : `${command} conectou uma sessão.`,
        metadata: compactObject({ providerSessionId }),
      },
    ]
  }

  return []
}

function createCodexItemEvent(item, fallbackTitle) {
  if (!item || typeof item !== 'object') {
    return {
      source: 'system',
      kind: 'lifecycle',
      severity: 'info',
      title: fallbackTitle,
      chunk: 'A IA atualizou um item interno.',
    }
  }

  const itemType = item.type ? String(item.type) : 'item'

  if (itemType === 'agent_message' && typeof item.text === 'string') {
    return {
      source: 'stdout',
      kind: 'assistant',
      severity: 'info',
      title: 'Resposta',
      chunk: item.text,
    }
  }

  const toolName = item.name ?? item.tool ?? item.command
  const title = toolName ? `Ferramenta: ${toolName}` : formatItemTitle(itemType, fallbackTitle)
  const chunk = extractItemText(item) || `Tipo: ${itemType}`

  return {
    source: 'stdout',
    kind: itemType.includes('tool') || toolName ? 'tool' : 'lifecycle',
    severity: 'info',
    title,
    chunk,
    metadata: compactObject({
      itemType,
      tool: toolName,
    }),
  }
}

function createDoneEvent(payload, cliEvent, fallbackDurationMs) {
  const usage = normalizeUsage(
    payload?.usage ??
      payload?.usage_metadata ??
      payload?.usageMetadata ??
      payload?.stats,
  )
  const durationMs =
    firstNumber(
      cliEvent?.duration,
      payload?.duration_ms,
      payload?.durationMs,
      payload?.stats?.duration_ms,
      payload?.stats?.durationMs,
      fallbackDurationMs,
    )
  const costUsd = firstNumber(cliEvent?.cost, payload?.total_cost_usd, payload?.costUsd)
  const metadata = compactObject({
    durationMs,
    costUsd,
    ...usage,
  })
  const parts = []

  if (durationMs !== null) {
    parts.push(`Tempo: ${formatDuration(durationMs)}`)
  }

  if (costUsd !== null) {
    parts.push(`Custo: US$ ${formatCost(costUsd)}`)
  }

  parts.push(...formatUsageParts(usage))

  return {
    source: 'system',
    kind: 'metrics',
    severity: 'info',
    title: 'Concluído',
    chunk: parts.length > 0 ? parts.join(' · ') : 'Execução concluída.',
    metadata,
  }
}

function normalizeUsage(usage) {
  if (!usage || typeof usage !== 'object') {
    return {}
  }

  return compactObject({
    inputTokens: firstNumber(
      usage.input_tokens,
      usage.inputTokens,
      usage.prompt_tokens,
      usage.promptTokens,
      usage.promptTokenCount,
    ),
    cachedInputTokens: firstNumber(
      usage.cached_input_tokens,
      usage.cachedInputTokens,
      usage.cache_read_input_tokens,
      usage.cacheReadInputTokens,
      usage.cached,
    ),
    outputTokens: firstNumber(
      usage.output_tokens,
      usage.outputTokens,
      usage.completion_tokens,
      usage.completionTokens,
      usage.candidatesTokenCount,
    ),
    reasoningOutputTokens: firstNumber(
      usage.reasoning_output_tokens,
      usage.reasoningOutputTokens,
      usage.thoughtsTokenCount,
    ),
    totalTokens: firstNumber(usage.total_tokens, usage.totalTokens, usage.totalTokenCount),
  })
}

function createStartMode({
  isContinuation,
  usesNativeResume,
  usesPersistentProcess,
  reusedProcess,
}) {
  if (usesPersistentProcess && reusedProcess) {
    return {
      title: 'Enviando mensagem',
      verb: 'Enviando para',
      metadata: 'processo-persistente',
    }
  }

  if (usesPersistentProcess) {
    return {
      title: 'Abrindo sessão persistente',
      verb: isContinuation ? 'Retomando' : 'Abrindo',
      metadata: isContinuation ? 'processo-persistente-retomado' : 'processo-persistente',
    }
  }

  if (!isContinuation) {
    return {
      title: 'Iniciando CLI',
      verb: 'Iniciando',
      metadata: 'nova',
    }
  }

  if (usesNativeResume) {
    return {
      title: 'Retomando sessão',
      verb: 'Retomando',
      metadata: 'retomada-nativa',
    }
  }

  return {
    title: 'Continuando conversa',
    verb: 'Continuando',
    metadata: 'contexto-explicito',
  }
}

function formatUsageParts(usage) {
  const parts = []

  if (usage.inputTokens !== undefined) {
    parts.push(`Entrada: ${formatInteger(usage.inputTokens)} tokens`)
  }

  if (usage.cachedInputTokens !== undefined) {
    parts.push(`Cache: ${formatInteger(usage.cachedInputTokens)} tokens`)
  }

  if (usage.outputTokens !== undefined) {
    parts.push(`Saída: ${formatInteger(usage.outputTokens)} tokens`)
  }

  if (usage.reasoningOutputTokens !== undefined) {
    parts.push(`Raciocínio: ${formatInteger(usage.reasoningOutputTokens)} tokens`)
  }

  if (usage.totalTokens !== undefined) {
    parts.push(`Total: ${formatInteger(usage.totalTokens)} tokens`)
  }

  return parts
}

function extractItemText(item) {
  if (typeof item.text === 'string') {
    return item.text
  }

  if (typeof item.output === 'string') {
    return item.output
  }

  if (typeof item.input === 'string') {
    return item.input
  }

  if (item.input && typeof item.input === 'object') {
    return JSON.stringify(item.input, null, 2)
  }

  if (Array.isArray(item.content)) {
    const content = item.content
      .map((part) => {
        if (typeof part === 'string') {
          return part
        }

        if (part && typeof part === 'object') {
          return part.text ?? part.output ?? part.content ?? ''
        }

        return ''
      })
      .filter(Boolean)
      .join('\n')

    if (content) {
      return content
    }
  }

  const summary = Object.entries(item)
    .filter(([key, value]) => key !== 'id' && key !== 'type' && isScalar(value))
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n')

  return summary
}

function formatContentBlockStart(event) {
  const block = event.content_block

  if (block?.type === 'tool_use') {
    return `Ferramenta: ${block.name ?? 'tool'}`
  }

  return block?.type ? `Bloco: ${block.type}` : 'A IA iniciou um novo bloco.'
}

function prettifyToolPayload(value) {
  if (typeof value !== 'string') {
    return JSON.stringify(value ?? {}, null, 2)
  }

  try {
    return JSON.stringify(JSON.parse(value), null, 2)
  } catch {
    return value
  }
}

function formatItemTitle(itemType, fallbackTitle) {
  if (itemType === 'reasoning') {
    return 'Raciocínio'
  }

  if (itemType.includes('plan') || itemType.includes('task')) {
    return 'Plano de tarefas'
  }

  return fallbackTitle
}

function isSessionMetadata(payload) {
  return (
    payload.type === 'system' ||
    payload.type === 'init' ||
    payload.type === 'session_meta' ||
    payload.type === 'session_configured' ||
    payload.type === 'session.started' ||
    payload.type === 'thread.started'
  )
}

function extractProviderSessionId(payload) {
  if (!payload || typeof payload !== 'object') {
    return null
  }

  const candidates = [
    payload.thread_id,
    payload.threadId,
    payload.session_id,
    payload.sessionId,
    payload.id,
    payload.payload?.thread_id,
    payload.payload?.threadId,
    payload.payload?.session_id,
    payload.payload?.sessionId,
    payload.payload?.id,
  ]

  return candidates.find((value) => typeof value === 'string' && value) ?? null
}

function firstNumber(...values) {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value
    }

    if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) {
      return Number(value)
    }
  }

  return null
}

function compactObject(object) {
  return Object.fromEntries(
    Object.entries(object).filter(([, value]) => value !== undefined && value !== null && value !== ''),
  )
}

function parseJson(value) {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function isScalar(value) {
  return (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  )
}

function formatDuration(durationMs) {
  if (durationMs < 1000) {
    return `${Math.round(durationMs)} ms`
  }

  return `${(durationMs / 1000).toFixed(1)} s`
}

function formatCost(value) {
  return value.toFixed(4).replace(/0+$/, '').replace(/\.$/, '')
}

function formatInteger(value) {
  return new Intl.NumberFormat('pt-BR').format(value)
}

module.exports = {
  createErrorTerminalEvent,
  createStartTerminalEvent,
  createStderrTerminalEvent,
  createTerminalEvents,
}

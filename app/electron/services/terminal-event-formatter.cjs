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
  promptHint,
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
      promptHint: promptHint ? createTextPreview(promptHint, 60) : undefined,
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
    title: createStderrTitle(severity),
    chunk: String(chunk),
  }
}

function createStderrTitle(severity) {
  if (severity === 'error') {
    return 'Erro da CLI'
  }

  if (severity === 'info' || severity === 'debug') {
    return 'Info da CLI'
  }

  return 'Aviso da CLI'
}

function createOrchestrationTerminalEvent(event) {
  if (event.type === 'orchestration_agent_spawn') {
    return {
      source: 'system',
      kind: 'lifecycle',
      severity: 'info',
      title: 'Sub-agente iniciado',
      chunk: `${event.agentId} (${event.cliType}) iniciou em ${event.threadId}.`,
      metadata: compactObject({
        runId: event.runId,
        parentThreadId: event.parentThreadId,
        agentId: event.agentId,
        cliType: event.cliType,
        requestedCliType: event.requestedCliType,
        threadId: event.threadId,
      }),
    }
  }

  if (event.type === 'orchestration_model_choice') {
    const details = [
      `Agente: ${event.agentId}`,
      `CLI solicitada: ${event.requestedCliType ?? event.cliType ?? event.selectedCliType}`,
      `Modelo escolhido: ${event.selectedModelName ?? event.selectedModelId ?? event.selectedCliType}`,
      `Regra: ${event.reason ?? 'Sem motivo informado.'}`,
    ]

    if (event.providerModel) {
      details.push(`Provider model: ${event.providerModel}`)
    }

    if (event.reasoningEffort) {
      details.push(`Reasoning effort: ${event.reasoningEffort}`)
    }

    if (Number.isInteger(event.candidateCount)) {
      details.push(`Candidatos disponiveis: ${event.candidateCount}`)
    }

    if (Number.isInteger(event.blockedCount)) {
      details.push(`Modelos bloqueados ignorados: ${event.blockedCount}`)
    }

    if (Number.isInteger(event.unavailableCount)) {
      details.push(`Modelos indisponiveis ignorados: ${event.unavailableCount}`)
    }

    if (event.fallbackFromCliType) {
      details.push(`Fallback de: ${event.fallbackFromCliType}`)
    }

    return {
      source: 'system',
      kind: 'lifecycle',
      severity: 'info',
      title: 'Modelo escolhido',
      chunk: details.join('\n'),
      metadata: compactObject({
        runId: event.runId,
        parentThreadId: event.parentThreadId,
        agentId: event.agentId,
        requestedCliType: event.requestedCliType,
        selectedCliType: event.selectedCliType,
        selectedModelId: event.selectedModelId,
        selectedModelName: event.selectedModelName,
        providerModel: event.providerModel,
        reasoningEffort: event.reasoningEffort,
        selectionRule: event.selectionRule,
        candidateCount: event.candidateCount,
        blockedCount: event.blockedCount,
        unavailableCount: event.unavailableCount,
        fallbackFromCliType: event.fallbackFromCliType,
        threadId: event.threadId,
      }),
    }
  }

  if (event.type === 'orchestration_agent_result') {
    const details = [
      `${event.agentId} finalizou com status ${event.status}.`,
    ]
    const resultPreview = event.result
      ? createTextPreview(event.result, 1200)
      : ''
    const errorPreview = event.error
      ? createTextPreview(event.error, 1200)
      : ''

    if (resultPreview) {
      details.push('', 'Resultado visível do sub-agente:', resultPreview)
    }

    if (errorPreview) {
      details.push('', 'Erro do sub-agente:', errorPreview)
    }

    return {
      source: 'system',
      kind: 'lifecycle',
      severity: event.status === 'error' ? 'warn' : 'info',
      title: 'Resultado de sub-agente',
      chunk: details.join('\n'),
      metadata: {
        runId: event.runId,
        parentThreadId: event.parentThreadId,
        agentId: event.agentId,
        status: event.status,
      },
    }
  }

  if (event.type === 'orchestration_reinvoke') {
    return {
      source: 'system',
      kind: 'lifecycle',
      severity: 'info',
      title: 'Reinvocando orquestrador',
      chunk: `Turno ${event.turn} iniciado com resultados dos sub-agentes.`,
      metadata: {
        runId: event.runId,
        parentThreadId: event.parentThreadId,
        turn: event.turn,
      },
    }
  }

  if (event.type === 'orchestration_waiting_agents') {
    return {
      source: 'system',
      kind: 'lifecycle',
      severity: 'info',
      title: 'Aguardando sub-agentes',
      chunk: `${event.agentIds.length} sub-agente(s) em execucao.`,
      metadata: {
        runId: event.runId,
        parentThreadId: event.parentThreadId,
        agents: event.agentIds.length,
      },
    }
  }

  return {
    source: 'system',
    kind: 'lifecycle',
    severity: 'info',
    title: 'Orquestracao',
    chunk: 'Estado de orquestracao atualizado.',
    metadata: {
      runId: event.runId,
      parentThreadId: event.parentThreadId,
    },
  }
}

function createEventsFromCliEvent(cliEvent, payload, durationMs) {
  if (!cliEvent || typeof cliEvent !== 'object') {
    return []
  }

  const orchestrationEvents = createOrchestrationControlEvents(cliEvent)

  if (orchestrationEvents.length > 0) {
    return orchestrationEvents
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
        chunk: formatPromptSentChunk(payload.content),
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

function createOrchestrationControlEvents(cliEvent) {
  if (cliEvent.type === 'orchestration_events' && Array.isArray(cliEvent.events)) {
    return cliEvent.events.flatMap(createOrchestrationControlEvents)
  }

  if (cliEvent.type === 'spawn_agent') {
    return [
      {
        source: 'stdout',
        kind: 'lifecycle',
        severity: 'info',
        title: 'Decisão do orquestrador',
        chunk: [
          'O orquestrador pediu um sub-agente.',
          `Agente: ${cliEvent.agentId}`,
          `CLI: ${cliEvent.cliType}`,
          '',
          'Pergunta enviada ao sub-agente:',
          createTextPreview(cliEvent.prompt ?? '', 1200),
        ].join('\n'),
        metadata: compactObject({
          agentId: cliEvent.agentId,
          cliType: cliEvent.cliType,
        }),
      },
    ]
  }

  if (cliEvent.type === 'awaiting_agents') {
    return [
      {
        source: 'stdout',
        kind: 'lifecycle',
        severity: 'info',
        title: 'Orquestrador aguardando',
        chunk: `Aguardando: ${(cliEvent.agentIds ?? []).join(', ') || 'sub-agentes'}.`,
        metadata: compactObject({
          agents: Array.isArray(cliEvent.agentIds) ? cliEvent.agentIds.length : null,
        }),
      },
    ]
  }

  if (cliEvent.type === 'final_answer') {
    return [
      {
        source: 'stdout',
        kind: 'assistant',
        severity: 'info',
        title: 'Pré-resposta do orquestrador',
        chunk: cliEvent.content ?? '',
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
    parts.push(
      `Cache do provedor: ${formatInteger(usage.cachedInputTokens)} tokens`,
    )
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

function formatPromptSentChunk(content) {
  const prompt = String(content ?? '').trim()

  if (!prompt) {
    return 'A CLI recebeu a mensagem e está gerando resposta.'
  }

  if (prompt.length > 700 || prompt.includes('Use o contexto abaixo')) {
    return [
      'A CLI recebeu a mensagem e está gerando resposta.',
      'Prompt detalhado omitido no terminal por tamanho/contexto interno.',
    ].join('\n')
  }

  return [
    'A CLI recebeu a mensagem e está gerando resposta.',
    '',
    'Prompt enviado:',
    prompt,
  ].join('\n')
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

function createTextPreview(value, maxLength = 500) {
  const text = String(value ?? '')

  if (text.length <= maxLength) {
    return text
  }

  return `${text.slice(0, maxLength)}...`
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
  createOrchestrationTerminalEvent,
  createStartTerminalEvent,
  createStderrTerminalEvent,
  createTerminalEvents,
}

const test = require('node:test')
const assert = require('node:assert/strict')
const {
  createOrchestrationTerminalEvent,
  createStartTerminalEvent,
  createStderrTerminalEvent,
  createTerminalEvents,
} = require('./terminal-event-formatter.cjs')

test('terminal formatter creates a readable start event', () => {
  const event = createStartTerminalEvent({
    command: 'codex',
    cliType: 'codex',
    modelName: 'Codex',
    cwd: '/tmp/test-project',
    isContinuation: false,
  })

  assert.equal(event.kind, 'lifecycle')
  assert.equal(event.title, 'Iniciando CLI')
  assert.match(event.chunk, /Iniciando codex/)
  assert.deepEqual(event.metadata, {
    command: 'codex',
    cliType: 'codex',
    modelName: 'Codex',
    cwd: '/tmp/test-project',
    mode: 'nova',
  })
})

test('terminal formatter labels continuation without native resume distinctly', () => {
  const event = createStartTerminalEvent({
    command: 'gemini',
    cliType: 'gemini',
    modelName: 'Gemini',
    cwd: '/tmp/test-project',
    isContinuation: true,
    usesNativeResume: false,
    providerSessionId: 'session-1',
  })

  assert.equal(event.title, 'Continuando conversa')
  assert.match(event.chunk, /Continuando gemini/)
  assert.equal(event.metadata.mode, 'contexto-explicito')
})

test('terminal formatter labels persistent process reuse', () => {
  const event = createStartTerminalEvent({
    command: 'claude',
    cliType: 'claude',
    modelName: 'Claude',
    cwd: '/tmp/test-project',
    isContinuation: true,
    usesPersistentProcess: true,
    reusedProcess: true,
  })

  assert.equal(event.title, 'Enviando mensagem')
  assert.match(event.chunk, /Enviando para claude/)
  assert.equal(event.metadata.mode, 'processo-persistente')
  assert.equal(event.metadata.persistent, true)
  assert.equal(event.metadata.reusedProcess, true)
})

test('terminal formatter labels stderr info without warning copy', () => {
  assert.equal(createStderrTerminalEvent('Aviso benigno', 'info').title, 'Info da CLI')
  assert.equal(createStderrTerminalEvent('Falha', 'error').title, 'Erro da CLI')
  assert.equal(createStderrTerminalEvent('Atenção', 'warn').title, 'Aviso da CLI')
})

test('terminal formatter creates orchestration lifecycle events', () => {
  assert.deepEqual(
    createOrchestrationTerminalEvent({
      type: 'orchestration_agent_spawn',
      runId: 'run-1',
      parentThreadId: 'thread-codex-1',
      agentId: 'reviewer-1',
      cliType: 'claude',
      threadId: 'thread-reviewer-1',
    }),
    {
      source: 'system',
      kind: 'lifecycle',
      severity: 'info',
      title: 'Sub-agente iniciado',
      chunk: 'reviewer-1 (claude) iniciou em thread-reviewer-1.',
      metadata: {
        runId: 'run-1',
        parentThreadId: 'thread-codex-1',
        agentId: 'reviewer-1',
        cliType: 'claude',
        threadId: 'thread-reviewer-1',
      },
    },
  )

  assert.equal(
    createOrchestrationTerminalEvent({
      type: 'orchestration_reinvoke',
      runId: 'run-1',
      parentThreadId: 'thread-codex-1',
      turn: 2,
    }).title,
    'Reinvocando orquestrador',
  )

  const resultEvent = createOrchestrationTerminalEvent({
    type: 'orchestration_agent_result',
    runId: 'run-1',
    parentThreadId: 'thread-codex-1',
    agentId: 'gemini-1',
    status: 'completed',
    result: 'Resposta do sub-agente.',
  })

  assert.equal(resultEvent.title, 'Resultado de sub-agente')
  assert.match(resultEvent.chunk, /Resultado visível do sub-agente/)
  assert.match(resultEvent.chunk, /Resposta do sub-agente\./)

  const modelChoiceEvent = createOrchestrationTerminalEvent({
    type: 'orchestration_model_choice',
    runId: 'run-1',
    parentThreadId: 'thread-codex-1',
    agentId: 'reviewer-1',
    requestedCliType: 'claude',
    selectedCliType: 'claude',
    selectedModelId: 'claude-main',
    selectedModelName: 'Claude Main',
    providerModel: 'claude-sonnet',
    reasoningEffort: 'high',
    selectionRule: 'preferred-model',
    reason: 'Modelo preferido pelo usuario para este cliType.',
    candidateCount: 2,
    blockedCount: 1,
    threadId: 'thread-reviewer-1',
  })

  assert.equal(modelChoiceEvent.title, 'Modelo escolhido')
  assert.match(modelChoiceEvent.chunk, /Claude Main/)
  assert.match(modelChoiceEvent.chunk, /Modelo preferido/)
  assert.deepEqual(modelChoiceEvent.metadata, {
    runId: 'run-1',
    parentThreadId: 'thread-codex-1',
    agentId: 'reviewer-1',
    requestedCliType: 'claude',
    selectedCliType: 'claude',
    selectedModelId: 'claude-main',
    selectedModelName: 'Claude Main',
    providerModel: 'claude-sonnet',
    reasoningEffort: 'high',
    selectionRule: 'preferred-model',
    candidateCount: 2,
    blockedCount: 1,
    threadId: 'thread-reviewer-1',
  })
})

test('terminal formatter converts codex lifecycle JSONL into readable events', () => {
  assert.deepEqual(
    createTerminalEvents({
      command: 'codex',
      line: JSON.stringify({
        type: 'thread.started',
        thread_id: '019dde78-35b7-7233-a718-ecaf6adb14f0',
      }),
      cliEvent: {
        type: 'session',
        providerSessionId: '019dde78-35b7-7233-a718-ecaf6adb14f0',
      },
      durationMs: 12,
    }),
    [
      {
        source: 'system',
        kind: 'lifecycle',
        severity: 'info',
        title: 'Sessão conectada',
        chunk: 'Sessão do provedor: 019dde78-35b7-7233-a718-ecaf6adb14f0',
        metadata: {
          providerSessionId: '019dde78-35b7-7233-a718-ecaf6adb14f0',
        },
      },
    ],
  )

  assert.deepEqual(
    createTerminalEvents({
      command: 'codex',
      line: JSON.stringify({ type: 'turn.started' }),
      cliEvent: null,
      durationMs: 30,
    }),
    [
      {
        source: 'system',
        kind: 'lifecycle',
        severity: 'info',
        title: 'Processando',
        chunk: 'A IA iniciou o turno de resposta.',
      },
    ],
  )
})

test('terminal formatter converts codex answer and usage into readable output', () => {
  assert.deepEqual(
    createTerminalEvents({
      command: 'codex',
      line: JSON.stringify({
        type: 'item.completed',
        item: {
          type: 'agent_message',
          text: 'Oi. Como posso ajudar?',
        },
      }),
      cliEvent: {
        type: 'text',
        text: 'Oi. Como posso ajudar?',
      },
      durationMs: 120,
    }),
    [
      {
        source: 'stdout',
        kind: 'assistant',
        severity: 'info',
        title: 'Resposta',
        chunk: 'Oi. Como posso ajudar?',
      },
    ],
  )

  const [doneEvent] = createTerminalEvents({
    command: 'codex',
    line: JSON.stringify({
      type: 'turn.completed',
      usage: {
        input_tokens: 13227,
        cached_input_tokens: 11648,
        output_tokens: 10,
        reasoning_output_tokens: 0,
      },
    }),
    cliEvent: {
      type: 'done',
    },
    durationMs: 337,
  })

  assert.equal(doneEvent.kind, 'metrics')
  assert.equal(doneEvent.title, 'Concluído')
  assert.match(doneEvent.chunk, /Tempo: 337 ms/)
  assert.match(doneEvent.chunk, /Entrada: 13\.227 tokens/)
  assert.match(doneEvent.chunk, /Saída: 10 tokens/)
  assert.deepEqual(doneEvent.metadata, {
    durationMs: 337,
    inputTokens: 13227,
    cachedInputTokens: 11648,
    outputTokens: 10,
    reasoningOutputTokens: 0,
  })
})

test('terminal formatter renders orchestration control messages descriptively', () => {
  const [spawnEvent] = createTerminalEvents({
    command: 'codex',
    line: JSON.stringify({
      type: 'item.completed',
      item: {
        type: 'agent_message',
        text: '{"type":"spawn_agent","agentId":"gemini-1","cliType":"gemini","prompt":"Pergunte sobre astronomia."}',
      },
    }),
    cliEvent: {
      type: 'spawn_agent',
      agentId: 'gemini-1',
      cliType: 'gemini',
      prompt: 'Pergunte sobre astronomia.',
    },
    durationMs: 120,
  })

  assert.equal(spawnEvent.title, 'Decisão do orquestrador')
  assert.match(spawnEvent.chunk, /Pergunta enviada ao sub-agente:/)
  assert.match(spawnEvent.chunk, /Pergunte sobre astronomia\./)

  const [finalEvent] = createTerminalEvents({
    command: 'codex',
    line: JSON.stringify({
      type: 'item.completed',
      item: {
        type: 'agent_message',
        text: '{"type":"final_answer","content":"Resposta final."}',
      },
    }),
    cliEvent: {
      type: 'final_answer',
      content: 'Resposta final.',
    },
    durationMs: 120,
  })

  assert.equal(finalEvent.title, 'Pré-resposta do orquestrador')
  assert.equal(finalEvent.chunk, 'Resposta final.')
})

test('terminal formatter converts gemini user echo and stats into readable output', () => {
  assert.deepEqual(
    createTerminalEvents({
      command: 'gemini',
      line: JSON.stringify({
        type: 'message',
        role: 'user',
        content: 'Pergunta',
      }),
      cliEvent: null,
      durationMs: 20,
    }),
    [
      {
        source: 'system',
        kind: 'lifecycle',
        severity: 'info',
        title: 'Prompt enviado',
        chunk: [
          'A CLI recebeu a mensagem e está gerando resposta.',
          '',
          'Prompt enviado:',
          'Pergunta',
        ].join('\n'),
      },
    ],
  )

  const [doneEvent] = createTerminalEvents({
    command: 'gemini',
    line: JSON.stringify({
      type: 'result',
      stats: {
        total_tokens: 9772,
        input_tokens: 9585,
        output_tokens: 11,
        cached: 0,
        duration_ms: 58608,
      },
    }),
    cliEvent: {
      type: 'done',
    },
    durationMs: 65000,
  })

  assert.equal(doneEvent.kind, 'metrics')
  assert.match(doneEvent.chunk, /Tempo: 58\.6 s/)
  assert.match(doneEvent.chunk, /Entrada: 9\.585 tokens/)
  assert.match(doneEvent.chunk, /Cache do provedor: 0 tokens/)
  assert.match(doneEvent.chunk, /Saída: 11 tokens/)
  assert.match(doneEvent.chunk, /Total: 9\.772 tokens/)
  assert.deepEqual(doneEvent.metadata, {
    durationMs: 58608,
    inputTokens: 9585,
    cachedInputTokens: 0,
    outputTokens: 11,
    totalTokens: 9772,
  })
})

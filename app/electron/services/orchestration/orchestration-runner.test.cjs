const test = require('node:test')
const assert = require('node:assert/strict')
const {
  createAgentResultsPrompt,
  createOrchestrationRunner,
} = require('./orchestration-runner.cjs')

test('orchestration runner spawns sub-agents and marks jobs running', async () => {
  const spawnCalls = []
  const runner = createTestRunner({
    spawnAgent: async (params) => {
      spawnCalls.push(params)
      return { ok: true, threadId: params.threadId }
    },
  })

  const result = await runner.handleOrchestrationEvent(
    {
      type: 'spawn_agent',
      agentId: 'reviewer-1',
      cliType: 'claude',
      prompt: 'Revise as alteracoes.',
    },
    createContext(),
  )

  assert.equal(result.ok, true)
  assert.equal(spawnCalls.length, 1)
  assert.equal(spawnCalls[0].threadId, 'thread-reviewer-1')
  assert.equal(result.run.status, 'running_orchestrator')
  assert.equal(result.run.agentJobs[0].status, 'running')
  assert.equal(result.run.agentJobs[0].threadId, 'thread-reviewer-1')
  assert.deepEqual(runner.getAgentJobByThreadId('thread-reviewer-1'), {
    runId: 'run-1',
    agentId: 'reviewer-1',
  })
})

test('orchestration runner emits model choice audit events', async () => {
  const terminalEvents = []
  const runner = createTestRunner({
    validateSpawnAgent: () => ({
      ok: true,
      modelChoice: {
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
      },
    }),
    emitTerminalEvent: (event) => terminalEvents.push(event),
  })

  const result = await runner.handleOrchestrationEvent(
    createSpawnEvent(),
    createContext(),
  )

  assert.equal(result.ok, true)
  assert.equal(terminalEvents[0].type, 'orchestration_agent_spawn')
  assert.deepEqual(terminalEvents[1], {
    type: 'orchestration_model_choice',
    runId: 'run-1',
    parentThreadId: 'thread-codex-1',
    agentId: 'reviewer-1',
    requestedCliType: 'claude',
    threadId: 'thread-reviewer-1',
    selectedCliType: 'claude',
    selectedModelId: 'claude-main',
    selectedModelName: 'Claude Main',
    providerModel: 'claude-sonnet',
    reasoningEffort: 'high',
    selectionRule: 'preferred-model',
    reason: 'Modelo preferido pelo usuario para este cliType.',
    candidateCount: 2,
    blockedCount: 1,
  })
})

test('orchestration runner marks awaiting_agents runs as waiting', async () => {
  const runner = createTestRunner()

  await runner.handleOrchestrationEvent(createSpawnEvent(), createContext())
  const result = await runner.handleOrchestrationEvent(
    {
      type: 'awaiting_agents',
      agentIds: ['reviewer-1'],
    },
    createContext({ runId: 'run-1' }),
  )

  assert.equal(result.ok, true)
  assert.equal(result.run.status, 'waiting_agents')
  assert.deepEqual(result.run.turns[0].agentIds, ['reviewer-1'])
})

test('orchestration runner completes runs and forwards final_answer to chat', async () => {
  const chatEvents = []
  const runner = createTestRunner({
    sendChatEvent: (event) => chatEvents.push(event),
  })

  const result = await runner.handleOrchestrationEvent(
    {
      type: 'final_answer',
      content: 'Implementacao concluida.',
    },
    createContext(),
  )

  assert.equal(result.run.status, 'completed')
  assert.equal(result.run.finalAnswer, 'Implementacao concluida.')
  assert.deepEqual(chatEvents, [
    {
      type: 'final_answer',
      content: 'Implementacao concluida.',
      sessionId: 'session-codex-1',
      threadId: 'thread-codex-1',
      parentThreadId: 'thread-codex-1',
      runId: 'run-1',
    },
  ])
})

test('orchestration runner keeps original chat session for reinvoked final_answer', async () => {
  const chatEvents = []
  const runner = createTestRunner({
    sendChatEvent: (event) => chatEvents.push(event),
  })

  await runner.handleOrchestrationEvent(
    createSpawnEvent(),
    createContext({
      streamSessionId: 'session-parent-response',
      threadId: 'thread-codex-1',
    }),
  )
  chatEvents.length = 0

  const result = await runner.handleOrchestrationEvent(
    {
      type: 'final_answer',
      content: 'Resposta consolidada.',
    },
    createContext({
      runId: 'run-1',
      streamSessionId: 'run-1:orchestrator-turn-2',
      threadId: 'run-1:orchestrator-turn-2',
    }),
  )

  assert.equal(result.run.status, 'completed')
  assert.deepEqual(chatEvents, [
    {
      type: 'final_answer',
      content: 'Resposta consolidada.',
      sessionId: 'session-parent-response',
      threadId: 'run-1:orchestrator-turn-2',
      parentThreadId: 'thread-codex-1',
      runId: 'run-1',
    },
  ])
})

test('orchestration runner can start a new run on a completed parent thread', async () => {
  const runIds = ['run-1', 'run-2']
  const runner = createTestRunner({
    idGenerator: () => runIds.shift(),
  })

  await runner.handleOrchestrationEvent(
    {
      type: 'final_answer',
      content: 'Primeira resposta.',
    },
    createContext(),
  )

  const result = await runner.handleOrchestrationEvent(
    createSpawnEvent(),
    createContext({ streamSessionId: 'session-codex-2' }),
  )

  assert.equal(result.ok, true)
  assert.equal(result.run.runId, 'run-2')
  assert.equal(result.run.status, 'running_orchestrator')
})

test('orchestration runner resetThread clears active run cache by parent thread', async () => {
  const runIds = ['run-1', 'run-2']
  const runner = createTestRunner({
    idGenerator: () => runIds.shift(),
  })

  await runner.handleOrchestrationEvent(createSpawnEvent(), createContext())
  const reset = runner.resetThread('thread-codex-1')

  assert.deepEqual(reset.runIds, ['run-1'])
  assert.deepEqual(reset.failedRunIds, ['run-1'])
  assert.equal(runner.getRun('run-1').status, 'failed')
  assert.equal(runner.getAgentJobByThreadId('thread-reviewer-1'), null)

  const result = await runner.handleOrchestrationEvent(
    createSpawnEvent(),
    createContext({ streamSessionId: 'session-codex-2' }),
  )

  assert.equal(result.ok, true)
  assert.equal(result.run.runId, 'run-2')
})

test('orchestration runner reinvokes orchestrator after all jobs finish', async () => {
  const invokeCalls = []
  const runner = createTestRunner({
    invokeOrchestrator: async (params) => {
      invokeCalls.push(params)
      return { ok: true }
    },
  })

  await runner.handleOrchestrationEvent(createSpawnEvent(), createContext())
  await runner.handleOrchestrationEvent(
    {
      type: 'spawn_agent',
      agentId: 'researcher-1',
      cliType: 'gemini',
      prompt: 'Pesquise o contexto.',
    },
    createContext({ runId: 'run-1' }),
  )
  await runner.handleOrchestrationEvent(
    {
      type: 'awaiting_agents',
      agentIds: ['reviewer-1', 'researcher-1'],
    },
    createContext({ runId: 'run-1' }),
  )

  let result = await runner.onAgentJobCompleted({
    threadId: 'thread-reviewer-1',
    result: 'Sem riscos.',
  })
  assert.equal(invokeCalls.length, 0)
  assert.equal(result.run.status, 'waiting_agents')

  result = await runner.onAgentJobCompleted({
    threadId: 'thread-researcher-1',
    result: 'Contexto validado.',
  })

  assert.equal(result.ok, true)
  assert.equal(invokeCalls.length, 1)
  assert.equal(invokeCalls[0].run.currentTurn, 2)
  assert.match(invokeCalls[0].prompt, /Objetivo original:\nObjetivo inicial/)
  assert.match(invokeCalls[0].prompt, /`content` deve ser descritivo/)
  assert.match(invokeCalls[0].prompt, /Markdown direto, bem organizado e descritivo/)
  assert.match(invokeCalls[0].prompt, /Pergunta enviada ao sub-agente/)
  assert.match(invokeCalls[0].prompt, /Revise as alteracoes\./)
  assert.match(invokeCalls[0].prompt, /Pesquise o contexto\./)
  assert.match(invokeCalls[0].prompt, /Nao afirme que a tarefa foi feita/)
  assert.match(invokeCalls[0].prompt, /Agente reviewer-1 \(claude\)/)
  assert.match(invokeCalls[0].prompt, /Sem riscos\./)
  assert.equal(runner.getRun('run-1').status, 'running_orchestrator')
})

test('orchestration runner reinvokes orchestrator with failed job results', async () => {
  const invokeCalls = []
  const runner = createTestRunner({
    invokeOrchestrator: async (params) => {
      invokeCalls.push(params)
      return { ok: true }
    },
  })

  await runner.handleOrchestrationEvent(createSpawnEvent(), createContext())
  await runner.handleOrchestrationEvent(
    {
      type: 'awaiting_agents',
      agentIds: ['reviewer-1'],
    },
    createContext({ runId: 'run-1' }),
  )
  await runner.onAgentJobCompleted({
    threadId: 'thread-reviewer-1',
    error: 'Timeout.',
  })

  assert.equal(invokeCalls.length, 1)
  assert.match(invokeCalls[0].prompt, /Pergunta enviada ao sub-agente:\nRevise as alteracoes\./)
  assert.match(invokeCalls[0].prompt, /Status: erro/)
  assert.match(invokeCalls[0].prompt, /Mensagem:\nTimeout\./)
})

test('orchestration runner fails runs when agent limits are reached', async () => {
  const chatEvents = []
  const runner = createTestRunner({
    sendChatEvent: (event) => chatEvents.push(event),
  })

  await runner.handleOrchestrationEvent(
    createSpawnEvent(),
    createContext({ limits: { maxAgentsPerTurn: 1 } }),
  )
  const result = await runner.handleOrchestrationEvent(
    {
      type: 'spawn_agent',
      agentId: 'reviewer-2',
      cliType: 'claude',
      prompt: 'Revise tambem.',
    },
    createContext({ runId: 'run-1' }),
  )

  assert.equal(result.ok, false)
  assert.equal(result.run.status, 'failed')
  assert.equal(result.run.error, 'Limite de agentes por turno atingido.')
  assert.equal(chatEvents.some((event) => event.type === 'error'), true)
})

test('orchestration runner fails runs when spawn model is unavailable', async () => {
  const chatEvents = []
  const runner = createTestRunner({
    validateSpawnAgent: () => ({
      ok: false,
      message: 'Modelo bloqueado pelo usuario.',
      code: 'SPAWN_MODEL_UNAVAILABLE',
    }),
    sendChatEvent: (event) => chatEvents.push(event),
  })

  const result = await runner.handleOrchestrationEvent(
    createSpawnEvent(),
    createContext(),
  )

  assert.equal(result.ok, false)
  assert.equal(result.run.status, 'failed')
  assert.equal(result.run.error, 'Modelo bloqueado pelo usuario.')
  assert.equal(chatEvents.some((event) => event.type === 'error'), true)
})

test('orchestration runner fails runs when maxTurns blocks reinvocation', async () => {
  const chatEvents = []
  const invokeCalls = []
  const runner = createTestRunner({
    invokeOrchestrator: async (params) => {
      invokeCalls.push(params)
      return { ok: true }
    },
    sendChatEvent: (event) => chatEvents.push(event),
  })

  await runner.handleOrchestrationEvent(
    createSpawnEvent(),
    createContext({ limits: { maxTurns: 1 } }),
  )
  await runner.handleOrchestrationEvent(
    {
      type: 'awaiting_agents',
      agentIds: ['reviewer-1'],
    },
    createContext({ runId: 'run-1' }),
  )
  const result = await runner.onAgentJobCompleted({
    threadId: 'thread-reviewer-1',
    result: 'Sem riscos.',
  })

  assert.equal(result.ok, false)
  assert.equal(result.run.status, 'failed')
  assert.equal(result.run.error, 'Limite de turnos de orquestracao atingido.')
  assert.equal(invokeCalls.length, 0)
  assert.equal(chatEvents.some((event) => event.type === 'error'), true)
})

test('orchestration runner fails expired runs', async () => {
  const chatEvents = []
  let now = new Date('2026-05-01T12:00:00.000Z')
  const runner = createTestRunner({
    now: () => now,
    sendChatEvent: (event) => chatEvents.push(event),
  })

  await runner.handleOrchestrationEvent(
    createSpawnEvent(),
    createContext({ limits: { maxRuntimeMinutes: 1 } }),
  )

  now = new Date('2026-05-01T12:02:01.000Z')
  const failedRuns = runner.failExpiredRuns()

  assert.equal(failedRuns.length, 1)
  assert.equal(failedRuns[0].status, 'failed')
  assert.equal(failedRuns[0].error, 'Timeout de orquestracao atingido.')
  assert.equal(chatEvents.some((event) => event.type === 'error'), true)
})

test('createAgentResultsPrompt formats current turn results', () => {
  const prompt = createAgentResultsPrompt({
    originalPrompt: 'Objetivo inicial',
    currentTurn: 1,
    agentJobs: [
      {
        turn: 1,
        agentId: 'reviewer-1',
        cliType: 'claude',
        prompt: 'Revise as alteracoes.',
        status: 'completed',
        result: 'Tudo certo.',
      },
      {
        turn: 1,
        agentId: 'researcher-1',
        cliType: 'gemini',
        prompt: 'Pesquise o contexto.',
        status: 'error',
        error: 'Timeout.',
      },
      {
        turn: 2,
        agentId: 'future-1',
        cliType: 'codex',
        prompt: 'Ignorar prompt.',
        status: 'completed',
        result: 'Ignorar.',
      },
    ],
  })

  assert.match(prompt, /Objetivo original:\nObjetivo inicial/)
  assert.match(prompt, /Pergunta enviada ao sub-agente:\nRevise as alteracoes\./)
  assert.match(prompt, /Pergunta enviada ao sub-agente:\nPesquise o contexto\./)
  assert.match(prompt, /Status: concluido/)
  assert.match(prompt, /Resultado:\nTudo certo\./)
  assert.match(prompt, /Status: erro/)
  assert.doesNotMatch(prompt, /Ignorar/)
  assert.match(prompt, /Se algum agente falhou:/)
})

test('createAgentResultsPrompt omits failure guidance when every job completed', () => {
  const prompt = createAgentResultsPrompt({
    originalPrompt: 'Objetivo inicial',
    currentTurn: 1,
    agentJobs: [
      {
        turn: 1,
        agentId: 'reviewer-1',
        cliType: 'claude',
        prompt: 'Revise as alteracoes.',
        status: 'completed',
        result: 'Tudo certo.',
      },
    ],
  })

  assert.doesNotMatch(prompt, /Se algum agente falhou:/)
})

test('orchestration runner re-spawns sub-agent on mid-task quota error', async () => {
  const spawnCalls = []
  const validateCalls = []
  const terminalEvents = []
  const runner = createTestRunner({
    spawnAgent: async (params) => {
      spawnCalls.push(params)
      return { ok: true, threadId: params.threadId }
    },
    validateSpawnAgent: (params) => {
      validateCalls.push(params)
      // First call (initial spawn): keep claude. Subsequent (fallback): switch to codex.
      if (validateCalls.length === 1) {
        return {
          ok: true,
          modelChoice: { selectionRule: 'best-available-model', selectedCliType: 'claude' },
          selectedModel: { id: 'claude-main', cliType: 'claude' },
        }
      }
      return {
        ok: true,
        modelChoice: {
          selectionRule: 'provider-fallback',
          selectedCliType: 'codex',
          fallbackFromCliType: 'claude',
        },
        selectedModel: { id: 'codex-main', cliType: 'codex' },
      }
    },
    emitTerminalEvent: (event) => terminalEvents.push(event),
  })

  await runner.handleOrchestrationEvent(createSpawnEvent(), createContext())

  const waiting = await runner.onAgentJobCompleted({
    runId: 'run-1',
    agentId: 'reviewer-1',
    error: "You're out of extra usage · resets 4:40pm (America/Sao_Paulo)",
    partialOutput: 'Revisei até o arquivo X.',
  })

  // Claude → Codex troca de provedor: pergunta antes, sem re-spawn sozinho.
  assert.equal(waiting.ok, true)
  assert.equal(waiting.awaitingConfirmation, true)
  assert.equal(spawnCalls.length, 1, 'nada roda antes da resposta da pessoa')
  assert.equal(waiting.run.agentJobs[0].status, 'running', 'o job não falha enquanto espera')

  const result = await acceptPendingSwitch(runner)

  assert.equal(result.ok, true)
  assert.equal(result.outcome, 'accepted')
  assert.equal(spawnCalls.length, 2, 'agent should be re-spawned')
  assert.equal(spawnCalls[1].event.cliType, 'codex')
  assert.match(spawnCalls[1].event.prompt, /Tarefa original do sub-agente/)
  assert.match(spawnCalls[1].event.prompt, /Revisei até o arquivo X\./)
  const fallbackEvent = terminalEvents.find(
    (event) => event.type === 'orchestration_agent_fallback',
  )
  assert.ok(fallbackEvent, 'should emit orchestration_agent_fallback event')
  assert.equal(fallbackEvent.previousCliType, 'claude')
  assert.equal(fallbackEvent.nextCliType, 'codex')
})

test('orchestration runner stops fallback after max attempts', async () => {
  const spawnCalls = []
  const runner = createTestRunner({
    spawnAgent: async (params) => {
      spawnCalls.push(params)
      return { ok: true, threadId: params.threadId }
    },
    validateSpawnAgent: () => ({
      ok: true,
      modelChoice: { selectionRule: 'provider-fallback', fallbackFromCliType: 'claude' },
      selectedModel: { id: 'fallback', cliType: 'codex' },
    }),
    maxAgentFallbackAttempts: 1,
  })

  await runner.handleOrchestrationEvent(createSpawnEvent(), createContext())
  // O spawn inicial pediu claude e o seletor ofereceu codex: a pessoa aceita.
  await acceptPendingSwitch(runner)

  await runner.onAgentJobCompleted({
    runId: 'run-1',
    agentId: 'reviewer-1',
    error: 'rate limit exceeded',
  })
  // Second consecutive failure: should give up and mark job as error.
  const result = await runner.onAgentJobCompleted({
    runId: 'run-1',
    agentId: 'reviewer-1',
    error: 'rate limit exceeded',
  })

  assert.equal(spawnCalls.length, 2, 'only one re-spawn allowed')
  assert.ok(!result.respawned)
})

test('orchestration runner does not re-spawn on non-quota errors', async () => {
  const spawnCalls = []
  const runner = createTestRunner({
    spawnAgent: async (params) => {
      spawnCalls.push(params)
      return { ok: true, threadId: params.threadId }
    },
  })

  await runner.handleOrchestrationEvent(createSpawnEvent(), createContext())

  const result = await runner.onAgentJobCompleted({
    runId: 'run-1',
    agentId: 'reviewer-1',
    error: 'TypeError: cannot read property foo of undefined',
  })

  assert.equal(spawnCalls.length, 1, 'unrelated errors should not trigger fallback')
  assert.ok(!result.respawned)
})

test('orchestration runner blocks final_answer without spawn when prompt requires delegation', async () => {
  const invokeCalls = []
  const runner = createTestRunner({
    invokeOrchestrator: async (params) => {
      invokeCalls.push(params)
      return { ok: true }
    },
  })

  // Bypass spawn entirely: orchestrator goes straight for final_answer.
  const result = await runner.handleOrchestrationEvent(
    { type: 'final_answer', content: 'Aqui esta a resposta.' },
    createContext({ originalPrompt: 'Crie um arquivo de exemplo no projeto' }),
  )

  assert.equal(result.ok, true)
  assert.equal(result.rejected, true)
  assert.equal(invokeCalls.length, 1, 'guard should re-invoke orchestrator')
  assert.match(invokeCalls[0].prompt, /spawn_agent/)
})

test('orchestration runner allows final_answer for trivial prompts', async () => {
  const invokeCalls = []
  const sentChatEvents = []
  const runner = createTestRunner({
    invokeOrchestrator: async (params) => {
      invokeCalls.push(params)
      return { ok: true }
    },
    sendChatEvent: (event) => sentChatEvents.push(event),
  })

  const result = await runner.handleOrchestrationEvent(
    { type: 'final_answer', content: 'Oi! Como posso ajudar?' },
    createContext({ originalPrompt: 'oi' }),
  )

  assert.equal(result.ok, true)
  assert.notEqual(result.rejected, true)
  assert.equal(invokeCalls.length, 0)
  assert.ok(
    sentChatEvents.some((event) => event.type === 'final_answer'),
    'trivial greetings should pass through',
  )
})

test('orchestration runner allows final_answer when at least one agent was spawned', async () => {
  const invokeCalls = []
  const runner = createTestRunner({
    invokeOrchestrator: async (params) => {
      invokeCalls.push(params)
      return { ok: true }
    },
  })

  await runner.handleOrchestrationEvent(createSpawnEvent(), createContext())
  await runner.onAgentJobCompleted({
    runId: 'run-1',
    agentId: 'reviewer-1',
    result: 'ok',
  })

  const result = await runner.handleOrchestrationEvent(
    { type: 'final_answer', content: 'Concluído.' },
    createContext({ originalPrompt: 'analise o auth.py em detalhe' }),
  )

  assert.equal(result.ok, true)
  assert.notEqual(result.rejected, true)
})

test('orchestration runner does not loop forever on guard rejection', async () => {
  const runner = createTestRunner({
    maxDelegationGuardAttempts: 1,
    invokeOrchestrator: async () => ({ ok: true }),
  })

  // First final_answer triggers guard.
  const first = await runner.handleOrchestrationEvent(
    { type: 'final_answer', content: 'pulei a delegacao' },
    createContext({ originalPrompt: 'crie um arquivo' }),
  )
  assert.equal(first.rejected, true)

  // Orchestrator stubbornly insists on final_answer again. Guard should
  // give up after maxDelegationGuardAttempts and let it through.
  const second = await runner.handleOrchestrationEvent(
    { type: 'final_answer', content: 'estou insistindo' },
    createContext({ originalPrompt: 'crie um arquivo' }),
  )
  assert.notEqual(second.rejected, true)
})

test('orchestration runner spreads simultaneous fallbacks across providers', async () => {
  // Setup: Codex and Gemini are both candidates for fallback. After two redirects
  // to Codex (default threshold), the third agent should be sent to Gemini.
  const spawnCalls = []
  const fallbackEvents = []
  const claudeModel = {
    id: 'claude-main', name: 'Claude Main', cliType: 'claude', command: 'claude', source: 'CLI local',
  }
  const codexModel = {
    id: 'codex-main', name: 'Codex Main', cliType: 'codex', command: 'codex', source: 'CLI local',
  }
  const geminiModel = {
    id: 'gemini-main', name: 'Gemini Main', cliType: 'gemini', command: 'gemini', source: 'CLI local',
  }
  const availableModels = [claudeModel, codexModel, geminiModel]

  const runner = createTestRunner({
    fallbackLoadThreshold: 2,
    spawnAgent: async (params) => {
      spawnCalls.push(params)
      return { ok: true, threadId: params.threadId }
    },
    validateSpawnAgent: ({ event }) => {
      // Initial spawn for each agent: keep claude. Mid-task fallback (and its
      // revalidation on accept): redirect to codex.
      const isFallbackCall = /Tarefa original do sub-agente/.test(event.prompt)
      return isFallbackCall
        ? {
            ok: true,
            modelChoice: { selectionRule: 'provider-fallback', fallbackFromCliType: 'claude' },
            selectedModel: codexModel,
          }
        : {
            ok: true,
            modelChoice: { selectionRule: 'best-available-model', selectedCliType: 'claude' },
            selectedModel: claudeModel,
          }
    },
    emitTerminalEvent: (event) => {
      if (event.type === 'orchestration_agent_fallback') fallbackEvents.push(event)
    },
  })

  const ctx = createContext({
    availableModels,
    orchestratorSettings: {},
  })

  // Spawn 3 agents and trigger a quota error on each.
  for (const agentId of ['a1', 'a2', 'a3']) {
    await runner.handleOrchestrationEvent(
      { type: 'spawn_agent', agentId, cliType: 'claude', prompt: 'tarefa' },
      ctx,
    )
    await runner.onAgentJobCompleted({
      runId: 'run-1',
      agentId,
      error: "You're out of extra usage · resets 4:40pm",
    })
    // Sair do Claude é troca de provedor: cada uma é aceita explicitamente.
    await acceptPendingSwitch(runner)
  }

  assert.equal(fallbackEvents.length, 3)
  assert.equal(fallbackEvents[0].nextCliType, 'codex')
  assert.equal(fallbackEvents[1].nextCliType, 'codex')
  assert.equal(
    fallbackEvents[2].nextCliType,
    'gemini',
    'after threshold, runner must spread to gemini',
  )
  assert.equal(fallbackEvents[2].spreadFromCliType, 'codex')
})

test('orchestration runner relays availability registry events to terminal', async () => {
  const terminalEvents = []
  const subscribers = []
  const fakeRegistry = {
    subscribe(listener) {
      subscribers.push(listener)
      return () => {}
    },
    getModelAvailability: () => ({ status: 'available' }),
  }
  const runner = createTestRunner({
    emitTerminalEvent: (event) => terminalEvents.push(event),
  })

  await runner.handleOrchestrationEvent(
    createSpawnEvent(),
    createContext({ modelAvailabilityRegistry: fakeRegistry }),
  )

  assert.equal(subscribers.length, 1, 'runner should subscribe once per registry')

  subscribers[0]({
    type: 'limited',
    cliType: 'claude',
    modelId: 'claude-sonnet',
    status: 'limit_reached',
  })

  const availabilityEvent = terminalEvents.find(
    (event) => event.type === 'orchestration_model_availability',
  )
  assert.ok(availabilityEvent)
  assert.equal(availabilityEvent.cliType, 'claude')
  assert.equal(availabilityEvent.modelId, 'claude-sonnet')
})

async function acceptPendingSwitch(runner) {
  const pending = runner.listProviderSwitches()
  assert.equal(pending.length, 1, 'deveria haver exatamente uma troca esperando a pessoa')
  return runner.resolveProviderSwitch({ decisionId: pending[0].decisionId, accept: true })
}

function createTestRunner(options = {}) {
  const now = options.now ?? (() => new Date('2026-05-01T12:00:00.000Z'))
  const idGenerator = options.idGenerator ?? (() => 'run-1')

  return createOrchestrationRunner({
    ...options,
    now,
    storeOptions: {
      idGenerator,
      now,
    },
    createThreadId: (_run, event) => `thread-${event.agentId}`,
  })
}

function createContext(overrides = {}) {
  return {
    parentThreadId: 'thread-codex-1',
    streamSessionId: 'session-codex-1',
    orchestratorModel: {
      id: 'codex',
      name: 'Codex',
      cliType: 'codex',
    },
    originalPrompt: 'Objetivo inicial',
    ...overrides,
  }
}

function createSpawnEvent(overrides = {}) {
  return {
    type: 'spawn_agent',
    agentId: 'reviewer-1',
    cliType: 'claude',
    prompt: 'Revise as alteracoes.',
    ...overrides,
  }
}

test('checkOrchestratorDoneWithoutSpawn re-invokes when orchestrator answered with free text', async () => {
  const invokeCalls = []
  const runner = createTestRunner({
    invokeOrchestrator: async (params) => {
      invokeCalls.push(params)
      return { ok: true }
    },
  })

  // Simulate the bridge: orchestrator emitted only text, no structured event,
  // and the stream just ended.
  const result = await runner.checkOrchestratorDoneWithoutSpawn({
    threadId: 'thread-codex-1',
    context: createContext({
      originalPrompt: 'Crie um arquivo de exemplo no projeto',
    }),
  })

  assert.equal(result?.rejected, true)
  assert.equal(invokeCalls.length, 1)
  assert.match(invokeCalls[0].prompt, /spawn_agent/)
})

test('shouldGuardOrchestratorDoneWithoutSpawn only guards pending direct work', async () => {
  const runner = createTestRunner()

  assert.equal(
    runner.shouldGuardOrchestratorDoneWithoutSpawn({
      threadId: 'thread-codex-1',
      context: createContext({
        originalPrompt: 'Crie um arquivo de exemplo no projeto',
      }),
    }),
    true,
  )

  await runner.handleOrchestrationEvent(
    createSpawnEvent(),
    createContext({ originalPrompt: 'Crie um arquivo' }),
  )

  assert.equal(
    runner.shouldGuardOrchestratorDoneWithoutSpawn({
      threadId: 'thread-codex-1',
      context: createContext({ originalPrompt: 'Crie um arquivo' }),
    }),
    false,
  )
})

test('checkOrchestratorDoneWithoutSpawn is a no-op for trivial prompts', async () => {
  const invokeCalls = []
  const runner = createTestRunner({
    invokeOrchestrator: async (params) => {
      invokeCalls.push(params)
      return { ok: true }
    },
  })

  const result = await runner.checkOrchestratorDoneWithoutSpawn({
    threadId: 'thread-codex-1',
    context: createContext({ originalPrompt: 'oi' }),
  })

  // Greeting → no rejection, no extra invoke.
  assert.notEqual(result?.rejected, true)
  assert.equal(invokeCalls.length, 0)
})

test('checkOrchestratorDoneWithoutSpawn skips when at least one agent already spawned', async () => {
  const invokeCalls = []
  const runner = createTestRunner({
    invokeOrchestrator: async (params) => {
      invokeCalls.push(params)
      return { ok: true }
    },
  })

  await runner.handleOrchestrationEvent(
    createSpawnEvent(),
    createContext({ originalPrompt: 'Crie um arquivo' }),
  )

  const result = await runner.checkOrchestratorDoneWithoutSpawn({
    threadId: 'thread-codex-1',
    context: createContext({ originalPrompt: 'Crie um arquivo' }),
  })

  assert.notEqual(result?.rejected, true)
  assert.equal(invokeCalls.length, 0, 'guard must not fire when spawn already happened')
})

test('mid-task fallback propaga o cliType do agente que falhou', async () => {
  // `locatedJob` carrega apenas { runId, agentId }, então a detecção de
  // disponibilidade recebia `cliType: undefined`.
  //
  // Hoje isso não muda comportamento observável: o retorno da detecção só é
  // testado por `if (!issue)`, e nenhuma mensagem de limite deixa de ser
  // reconhecida por falta de cliType — o provedor afeta apenas o scope e o
  // cooldown do objeto, que ali são descartados. O registro persistido
  // também não dependia disso, porque `recordError` refaz a detecção por
  // conta própria com o cliType certo.
  //
  // O teste existe para que a informação continue chegando inteira: no dia
  // em que a decisão passar a olhar o scope (ex.: "limite da CLI toda →
  // migra de provedor; limite do modelo → tenta outro modelo"), o campo
  // precisa estar preenchido, e um undefined silencioso levaria à escolha
  // errada sem nada falhar.
  const recordedErrors = []
  const runner = createTestRunner({
    spawnAgent: async (params) => ({ ok: true, threadId: params.threadId }),
    validateSpawnAgent: () => ({
      ok: true,
      modelChoice: { selectionRule: 'best-available-model', selectedCliType: 'claude' },
      selectedModel: { id: 'claude-main', cliType: 'claude' },
    }),
  })

  await runner.handleOrchestrationEvent(
    createSpawnEvent(),
    createContext({
      modelAvailabilityRegistry: {
        recordError: (params) => recordedErrors.push(params),
      },
    }),
  )

  const result = await runner.onAgentJobCompleted({
    runId: 'run-1',
    agentId: 'reviewer-1',
    error: 'rate limit exceeded',
  })

  assert.deepEqual(
    recordedErrors.map((entry) => entry.cliType),
    ['claude'],
    'o provedor do agente que falhou deveria chegar ao registro de disponibilidade',
  )
  assert.equal(result.ok, true)
})

test('respawn de fallback usa uma thread nova, soltando a do processo que falhou', async () => {
  // O processo anterior recebe SIGTERM com carência, então seu `close` ainda
  // pode emitir um erro depois do respawn. Enquanto o threadId antigo
  // apontasse para o mesmo job, esse evento atrasado era indistinguível do
  // resultado da nova tentativa: dispararia outro fallback, ou marcaria como
  // falho um job que o respawn ainda estava executando.
  const spawnCalls = []
  const validateCalls = []
  const runner = createTestRunner({
    spawnAgent: async (params) => {
      spawnCalls.push(params)
      return { ok: true, threadId: params.threadId }
    },
    validateSpawnAgent: () => {
      validateCalls.push(1)
      return validateCalls.length === 1
        ? {
            ok: true,
            modelChoice: { selectionRule: 'best-available-model', selectedCliType: 'claude' },
            selectedModel: { id: 'claude-main', cliType: 'claude' },
          }
        : {
            ok: true,
            modelChoice: { selectionRule: 'provider-fallback', selectedCliType: 'codex' },
            selectedModel: { id: 'codex-main', cliType: 'codex' },
          }
    },
  })

  await runner.handleOrchestrationEvent(createSpawnEvent(), createContext())

  const waiting = await runner.onAgentJobCompleted({
    runId: 'run-1',
    agentId: 'reviewer-1',
    error: "You're out of extra usage · resets 4:40pm",
  })

  assert.equal(waiting.awaitingConfirmation, true)
  assert.equal(
    runner.getAgentJobByThreadId('thread-reviewer-1'),
    null,
    'enquanto a pessoa decide, um evento atrasado do processo que falhou não acha o job',
  )

  const result = await acceptPendingSwitch(runner)

  assert.equal(result.spawned, true)

  const threadNova = spawnCalls[1].threadId
  assert.notEqual(
    threadNova,
    'thread-reviewer-1',
    'a tentativa nova não pode reusar a thread do processo que falhou',
  )
  assert.equal(
    runner.getAgentJobByThreadId('thread-reviewer-1'),
    null,
    'a thread antiga deve ser solta, para eventos atrasados não acharem o job',
  )
  assert.deepEqual(runner.getAgentJobByThreadId(threadNova), {
    runId: 'run-1',
    agentId: 'reviewer-1',
  })
})


// ── Troca de provedor com confirmação (decisão 7 do dono) ──────────────────

const CLAUDE_MODEL = { id: 'claude-main', name: 'Claude Main', cliType: 'claude' }
const CODEX_MODEL = { id: 'codex-main', name: 'Codex Main', cliType: 'codex' }
const CODEX_APP_SERVER_MODEL = {
  id: 'codex-app',
  name: 'Codex App Server',
  cliType: 'codex-app-server',
}
const GEMINI_MODEL = { id: 'gemini-main', name: 'Gemini Main', cliType: 'gemini' }

function choice(model, selectionRule, extra = {}) {
  return {
    ok: true,
    selectedModel: model,
    modelChoice: {
      selectionRule,
      selectedCliType: model.cliType,
      reason: `Regra ${selectionRule}.`,
      ...extra,
    },
  }
}

function createSwitchHarness(options = {}) {
  const calls = {
    spawn: [],
    invoke: [],
    chat: [],
    terminal: [],
    records: [],
  }
  let clock = new Date('2026-05-01T12:00:00.000Z')
  let decisionCounter = 0
  const runner = createTestRunner({
    now: () => clock,
    createDecisionId: () => `decision-${(decisionCounter += 1)}`,
    spawnAgent: async (params) => {
      calls.spawn.push(params)
      return { ok: true, threadId: params.threadId }
    },
    invokeOrchestrator: async (params) => {
      calls.invoke.push(params)
      return { ok: true }
    },
    sendChatEvent: (event) => calls.chat.push(event),
    emitTerminalEvent: (event) => calls.terminal.push(event),
    recordSwitchDecision: (record) => calls.records.push(record),
    ...options,
  })

  return {
    runner,
    calls,
    advance(ms) {
      clock = new Date(clock.getTime() + ms)
    },
  }
}

function flushAsync() {
  return new Promise((resolve) => setImmediate(resolve))
}

test('provider-fallback no spawn inicial pergunta e não chama spawnAgent', async () => {
  const { runner, calls } = createSwitchHarness({
    validateSpawnAgent: () =>
      choice(CODEX_MODEL, 'provider-fallback', { fallbackFromCliType: 'claude' }),
  })

  const result = await runner.handleOrchestrationEvent(createSpawnEvent(), createContext())

  assert.equal(result.ok, true)
  assert.equal(result.awaitingConfirmation, true)
  assert.equal(calls.spawn.length, 0, 'nenhum processo sobe antes da resposta')
  assert.equal(result.run.agentJobs[0].status, 'pending')

  const request = calls.chat.find((event) => event.type === 'provider_switch_request')
  assert.ok(request, 'o chat recebe o pedido de confirmação')
  assert.equal(request.decisionId, 'decision-1')
  assert.equal(request.kind, 'initial')
  assert.equal(request.fromCliType, 'claude')
  assert.equal(request.toCliType, 'codex')
  assert.equal(request.toModelName, 'Codex Main')
  assert.equal(request.rule, 'provider-fallback')
  assert.equal(request.sessionId, 'session-codex-1')
  assert.equal(request.threadId, 'thread-codex-1')
  assert.equal(request.expiresAt, '2026-05-01T12:10:00.000Z')
  assert.equal('payload' in request, false, 'estado interno não sai do main')
  assert.ok(
    calls.terminal.some((event) => event.type === 'orchestration_provider_switch_request'),
  )
  assert.equal(
    calls.terminal.some((event) => event.type === 'orchestration_agent_spawn'),
    false,
    'o log não diz que o sub-agente iniciou antes de iniciar',
  )
  assert.deepEqual(
    runner.listProviderSwitches().map((entry) => entry.decisionId),
    ['decision-1'],
  )
})

test('aceite gera um spawn só; aceite duplo recebe DECISION_NOT_PENDING', async () => {
  const { runner, calls } = createSwitchHarness({
    validateSpawnAgent: () =>
      choice(CODEX_MODEL, 'provider-fallback', { fallbackFromCliType: 'claude' }),
  })
  await runner.handleOrchestrationEvent(createSpawnEvent(), createContext())

  const [first, second] = await Promise.all([
    runner.resolveProviderSwitch({ decisionId: 'decision-1', accept: true }),
    runner.resolveProviderSwitch({ decisionId: 'decision-1', accept: true }),
  ])

  assert.equal(first.ok, true)
  assert.equal(first.outcome, 'accepted')
  assert.deepEqual(
    { ok: second.ok, code: second.code },
    { ok: false, code: 'DECISION_NOT_PENDING' },
  )
  assert.equal(calls.spawn.length, 1)
  assert.equal(calls.spawn[0].event.cliType, 'codex')
  assert.equal(runner.getRun('run-1').agentJobs[0].status, 'running')
  assert.deepEqual(
    calls.records.map((record) => [record.decisionId, record.state, record.outcome]),
    [['decision-1', 'accepted', 'accepted']],
  )
  assert.equal(calls.records[0].decidedAt, '2026-05-01T12:00:00.000Z')
  const resolved = calls.chat.find((event) => event.type === 'provider_switch_resolved')
  assert.equal(resolved.outcome, 'accepted')
  assert.equal(runner.listProviderSwitches().length, 0)
})

test('recusa no spawn inicial falha o job e reinvoca o orquestrador', async () => {
  const { runner, calls } = createSwitchHarness({
    validateSpawnAgent: () =>
      choice(CODEX_MODEL, 'last-resort', { fallbackFromCliType: 'claude' }),
  })
  await runner.handleOrchestrationEvent(createSpawnEvent(), createContext())
  await runner.handleOrchestrationEvent(
    { type: 'awaiting_agents', agentIds: ['reviewer-1'] },
    createContext({ runId: 'run-1' }),
  )

  const result = await runner.resolveProviderSwitch({ decisionId: 'decision-1', accept: false })

  assert.equal(result.ok, true)
  assert.equal(result.outcome, 'refused')
  assert.equal(calls.spawn.length, 0, 'last-resort em outra família também não roda sozinho')
  const job = runner.getRun('run-1').agentJobs[0]
  assert.equal(job.status, 'error')
  assert.match(job.error, /claude → codex recusada pela pessoa/)
  assert.equal(calls.invoke.length, 1, 'o orquestrador recebe o resultado e decide')
  assert.match(calls.invoke[0].prompt, /recusada pela pessoa/)
  assert.deepEqual(
    calls.records.map((record) => record.state),
    ['refused'],
  )
})

test('meio da tarefa: pergunta, conta a tentativa só no aceite e a recusa segue com o erro original', async () => {
  const { runner, calls } = createSwitchHarness({
    validateSpawnAgent: ({ event }) =>
      /Tarefa original do sub-agente/.test(event.prompt)
        ? choice(CODEX_MODEL, 'provider-fallback', { fallbackFromCliType: 'claude' })
        : choice(CLAUDE_MODEL, 'best-available-model'),
  })
  await runner.handleOrchestrationEvent(createSpawnEvent(), createContext())
  await runner.handleOrchestrationEvent(
    { type: 'awaiting_agents', agentIds: ['reviewer-1'] },
    createContext({ runId: 'run-1' }),
  )
  const originalError = "You're out of extra usage · resets 4:40pm"

  const waiting = await runner.onAgentJobCompleted({
    runId: 'run-1',
    agentId: 'reviewer-1',
    error: originalError,
  })

  assert.equal(waiting.awaitingConfirmation, true)
  assert.equal(calls.spawn.length, 1)
  assert.equal(runner.getFallbackLoad('run-1', 'codex'), 0, 'carga só anda no aceite')
  assert.equal(runner.agentFallbackAttempts.get('run-1:reviewer-1'), undefined)
  assert.equal(
    calls.terminal.some((event) => event.type === 'orchestration_agent_fallback'),
    false,
  )
  assert.equal(runner.listProviderSwitches()[0].kind, 'mid-task')

  const refused = await runner.resolveProviderSwitch({ decisionId: 'decision-1', accept: false })

  assert.equal(refused.outcome, 'refused')
  assert.equal(calls.spawn.length, 1, 'nenhum provedor foi trocado')
  const job = runner.getRun('run-1').agentJobs[0]
  assert.equal(job.status, 'error')
  assert.equal(job.error, originalError)
  assert.equal(calls.invoke.length, 1)
  assert.equal(runner.agentFallbackAttempts.get('run-1:reviewer-1'), undefined)
})

test('meio da tarefa: aceite re-spawna no destino e conta a tentativa', async () => {
  const { runner, calls } = createSwitchHarness({
    validateSpawnAgent: ({ event }) =>
      /Tarefa original do sub-agente/.test(event.prompt)
        ? choice(CODEX_MODEL, 'provider-fallback', { fallbackFromCliType: 'claude' })
        : choice(CLAUDE_MODEL, 'best-available-model'),
  })
  await runner.handleOrchestrationEvent(createSpawnEvent(), createContext())
  await runner.onAgentJobCompleted({
    runId: 'run-1',
    agentId: 'reviewer-1',
    error: 'rate limit exceeded',
  })

  const accepted = await runner.resolveProviderSwitch({ decisionId: 'decision-1', accept: true })

  assert.equal(accepted.outcome, 'accepted')
  assert.equal(accepted.spawned, true)
  assert.equal(calls.spawn.length, 2)
  assert.equal(calls.spawn[1].event.cliType, 'codex')
  assert.equal(runner.getFallbackLoad('run-1', 'codex'), 1)
  assert.equal(runner.agentFallbackAttempts.get('run-1:reviewer-1'), 1)
  assert.deepEqual(calls.records.map((record) => record.state), ['accepted'])
})

test('codex → codex-app-server e last-resort na mesma família não perguntam', async () => {
  const transport = createSwitchHarness({
    validateSpawnAgent: () =>
      choice(CODEX_APP_SERVER_MODEL, 'provider-fallback', { fallbackFromCliType: 'codex' }),
  })
  const viaTransport = await transport.runner.handleOrchestrationEvent(
    createSpawnEvent({ cliType: 'codex' }),
    createContext(),
  )
  assert.equal(viaTransport.awaitingConfirmation, undefined)
  assert.equal(transport.calls.spawn.length, 1)
  assert.equal(transport.calls.spawn[0].event.cliType, 'codex-app-server')

  const lastResort = createSwitchHarness({
    validateSpawnAgent: () => choice(CLAUDE_MODEL, 'last-resort', { fallbackFromCliType: 'claude' }),
  })
  await lastResort.runner.handleOrchestrationEvent(createSpawnEvent(), createContext())
  assert.equal(lastResort.calls.spawn.length, 1)
  assert.equal(lastResort.runner.listProviderSwitches().length, 0)
  assert.equal(
    lastResort.calls.chat.some((event) => event.type === 'provider_switch_request'),
    false,
  )
})

test('failExpiredRuns vence a decisão sem resposta como recusa', async () => {
  const { runner, calls, advance } = createSwitchHarness({
    validateSpawnAgent: () =>
      choice(CODEX_MODEL, 'provider-fallback', { fallbackFromCliType: 'claude' }),
  })
  await runner.handleOrchestrationEvent(createSpawnEvent(), createContext())

  advance(9 * 60 * 1000)
  runner.failExpiredRuns()
  assert.equal(runner.listProviderSwitches().length, 1, 'antes do prazo nada vence')

  advance(60 * 1000)
  const failedRuns = runner.failExpiredRuns()
  await flushAsync()

  assert.equal(failedRuns.length, 0, 'o run segue vivo; só a decisão venceu')
  assert.equal(runner.listProviderSwitches().length, 0)
  assert.equal(calls.spawn.length, 0, 'nenhum provedor foi trocado')
  const job = runner.getRun('run-1').agentJobs[0]
  assert.equal(job.status, 'error')
  assert.match(job.error, /sem resposta no prazo/)
  assert.deepEqual(
    calls.records.map((record) => [record.state, record.outcome]),
    [['refused', 'expired']],
  )
  const late = await runner.resolveProviderSwitch({ decisionId: 'decision-1', accept: true })
  assert.equal(late.code, 'DECISION_NOT_PENDING')
  assert.equal(calls.spawn.length, 0)
})

test('o prazo da decisão não passa do prazo do run', async () => {
  const { runner, calls } = createSwitchHarness({
    validateSpawnAgent: () =>
      choice(CODEX_MODEL, 'provider-fallback', { fallbackFromCliType: 'claude' }),
  })
  await runner.handleOrchestrationEvent(
    createSpawnEvent(),
    createContext({ limits: { maxRuntimeMinutes: 4 } }),
  )

  const request = calls.chat.find((event) => event.type === 'provider_switch_request')
  assert.equal(request.expiresAt, '2026-05-01T12:04:00.000Z')
})

test('resposta depois do fim do run devolve RUN_FINISHED e não roda nada', async () => {
  const { runner, calls, advance } = createSwitchHarness({
    validateSpawnAgent: () =>
      choice(CODEX_MODEL, 'provider-fallback', { fallbackFromCliType: 'claude' }),
  })
  await runner.handleOrchestrationEvent(createSpawnEvent(), createContext())

  advance(21 * 60 * 1000)
  const result = await runner.resolveProviderSwitch({ decisionId: 'decision-1', accept: true })

  assert.deepEqual({ ok: result.ok, code: result.code }, { ok: false, code: 'RUN_FINISHED' })
  assert.equal(calls.spawn.length, 0)
  assert.deepEqual(calls.records.map((record) => record.state), ['refused'])
})

test('cli:stop na conversa cancela a decisão sem reinvocar o orquestrador', async () => {
  const { runner, calls } = createSwitchHarness({
    validateSpawnAgent: () =>
      choice(CODEX_MODEL, 'provider-fallback', { fallbackFromCliType: 'claude' }),
  })
  await runner.handleOrchestrationEvent(createSpawnEvent(), createContext())

  const cancelled = runner.cancelProviderSwitchesForThread('thread-codex-1')
  await flushAsync()

  assert.deepEqual(cancelled, ['decision-1'])
  assert.equal(runner.listProviderSwitches().length, 0)
  assert.equal(runner.getRun('run-1').agentJobs[0].status, 'error')
  assert.equal(calls.invoke.length, 0, 'a pessoa parou: o orquestrador não volta sozinho')
  assert.equal(calls.spawn.length, 0)
  const resolved = calls.chat.find((event) => event.type === 'provider_switch_resolved')
  assert.equal(resolved.outcome, 'cancelled')
  assert.deepEqual(runner.cancelProviderSwitchesForThread('outra-thread'), [])
})

test('fim do run (reset da thread) limpa as decisões dele', async () => {
  const { runner, calls } = createSwitchHarness({
    validateSpawnAgent: () =>
      choice(CODEX_MODEL, 'provider-fallback', { fallbackFromCliType: 'claude' }),
  })
  await runner.handleOrchestrationEvent(createSpawnEvent(), createContext())

  runner.resetThread('thread-codex-1')

  assert.equal(runner.listProviderSwitches().length, 0)
  const resolved = calls.chat.find((event) => event.type === 'provider_switch_resolved')
  assert.equal(resolved.outcome, 'run_finished')
  assert.equal(resolved.sessionId, 'session-codex-1')
  const late = await runner.resolveProviderSwitch({ decisionId: 'decision-1', accept: true })
  assert.equal(late.code, 'DECISION_NOT_PENDING')
  assert.equal(calls.spawn.length, 0)
})

test('aceite com destino que mudou de família vira superseded e faz nova pergunta', async () => {
  let target = CODEX_MODEL
  const { runner, calls } = createSwitchHarness({
    validateSpawnAgent: () =>
      choice(target, 'provider-fallback', { fallbackFromCliType: 'claude' }),
  })
  await runner.handleOrchestrationEvent(createSpawnEvent(), createContext())

  target = GEMINI_MODEL
  const result = await runner.resolveProviderSwitch({ decisionId: 'decision-1', accept: true })

  assert.equal(result.ok, true)
  assert.equal(result.outcome, 'superseded')
  assert.equal(result.nextDecisionId, 'decision-2')
  assert.equal(calls.spawn.length, 0, 'aceitar Codex não autoriza rodar no Gemini')
  const pending = runner.listProviderSwitches()
  assert.deepEqual(
    pending.map((entry) => [entry.decisionId, entry.toCliType]),
    [['decision-2', 'gemini']],
  )
  assert.equal(calls.records.length, 0, 'superseded não é uma resposta registrada')

  await runner.resolveProviderSwitch({ decisionId: 'decision-2', accept: true })
  assert.equal(calls.spawn.length, 1)
  assert.equal(calls.spawn[0].event.cliType, 'gemini')
  assert.deepEqual(calls.records.map((record) => record.decisionId), ['decision-2'])
})

test('aceite quando o provedor original voltou roda nele, sem trocar', async () => {
  let target = CODEX_MODEL
  const { runner, calls } = createSwitchHarness({
    validateSpawnAgent: () =>
      target === CODEX_MODEL
        ? choice(CODEX_MODEL, 'provider-fallback', { fallbackFromCliType: 'claude' })
        : choice(CLAUDE_MODEL, 'best-available-model'),
  })
  await runner.handleOrchestrationEvent(createSpawnEvent(), createContext())

  target = CLAUDE_MODEL
  const result = await runner.resolveProviderSwitch({ decisionId: 'decision-1', accept: true })

  assert.equal(result.outcome, 'superseded')
  assert.equal(calls.spawn.length, 1)
  assert.equal(calls.spawn[0].event.cliType, 'claude')
  assert.equal(runner.getRun('run-1').agentJobs[0].cliType, 'claude')
  assert.equal(calls.records.length, 0)
})

test('o motivo da troca sai redigido no chat e no registro', async () => {
  const { runner, calls } = createSwitchHarness({
    validateSpawnAgent: () =>
      choice(CODEX_MODEL, 'provider-fallback', {
        fallbackFromCliType: 'claude',
        reason: 'Claude falhou: Authorization: Bearer abcdef123456 e sk-proj1234567890',
      }),
  })
  await runner.handleOrchestrationEvent(createSpawnEvent(), createContext())
  await runner.resolveProviderSwitch({ decisionId: 'decision-1', accept: false })

  const request = calls.chat.find((event) => event.type === 'provider_switch_request')
  for (const text of [request.reason, calls.records[0].reason]) {
    assert.doesNotMatch(text, /abcdef123456|sk-proj1234567890/)
    assert.match(text, /\[oculto\]/)
  }
})

test('uma falha ao gravar o registro não trava a decisão', async () => {
  const { runner, calls } = createSwitchHarness({
    validateSpawnAgent: () =>
      choice(CODEX_MODEL, 'provider-fallback', { fallbackFromCliType: 'claude' }),
    recordSwitchDecision: () => {
      throw new Error('disco cheio')
    },
  })
  await runner.handleOrchestrationEvent(createSpawnEvent(), createContext())

  const result = await runner.resolveProviderSwitch({ decisionId: 'decision-1', accept: true })

  assert.equal(result.ok, true)
  assert.equal(calls.spawn.length, 1)
})

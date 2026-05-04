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
})

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

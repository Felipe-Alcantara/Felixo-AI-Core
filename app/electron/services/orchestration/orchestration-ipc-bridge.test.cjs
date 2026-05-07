const test = require('node:test')
const assert = require('node:assert/strict')
const {
  appendOutput,
  consumeOutput,
  createOrchestrationIpcBridge,
  isOrchestrationCliEvent,
  shouldGuardOrchestratorDoneWithoutSpawn,
  shouldSuppressOrchestratorDone,
} = require('./orchestration-ipc-bridge.cjs')
const {
  createOrchestrationRunner,
} = require('./orchestration-runner.cjs')

test('orchestration IPC bridge delegates orchestration events to runner', async () => {
  const spawnCalls = []
  const runner = createRunner({
    spawnAgent: async (params) => {
      spawnCalls.push(params)
      return { ok: true, threadId: params.threadId }
    },
  })
  const bridge = createOrchestrationIpcBridge({ runner })

  const result = bridge.handleCliEvent({
    cliEvent: {
      type: 'spawn_agent',
      agentId: 'reviewer-1',
      cliType: 'claude',
      prompt: 'Revise.',
    },
    streamSessionId: 'session-orchestrator-1',
    threadId: 'thread-orchestrator-1',
    context: createContext(),
  })

  assert.equal(result.handled, true)
  await result.promise
  assert.equal(spawnCalls.length, 1)
  assert.equal(runner.getRun('run-1').agentJobs[0].status, 'running')
})

test('orchestration IPC bridge completes agent jobs from text and done events', async () => {
  const invokeCalls = []
  const runner = createRunner({
    invokeOrchestrator: async (params) => {
      invokeCalls.push(params)
      return { ok: true }
    },
  })
  const bridge = createOrchestrationIpcBridge({ runner })

  await bridge.handleCliEvent({
    cliEvent: {
      type: 'spawn_agent',
      agentId: 'reviewer-1',
      cliType: 'claude',
      prompt: 'Revise.',
    },
    streamSessionId: 'session-orchestrator-1',
    threadId: 'thread-orchestrator-1',
    context: createContext(),
  }).promise
  await bridge.handleCliEvent({
    cliEvent: {
      type: 'awaiting_agents',
      agentIds: ['reviewer-1'],
    },
    streamSessionId: 'session-orchestrator-1',
    threadId: 'thread-orchestrator-1',
    context: createContext({ runId: 'run-1' }),
  }).promise

  assert.equal(
    bridge.handleCliEvent({
      cliEvent: { type: 'text', text: 'Resultado parcial.' },
      streamSessionId: 'session-agent-1',
      threadId: 'thread-reviewer-1',
      context: { role: 'agent' },
    }).handled,
    false,
  )

  const doneResult = bridge.handleCliEvent({
    cliEvent: { type: 'done' },
    streamSessionId: 'session-agent-1',
    threadId: 'thread-reviewer-1',
    context: { role: 'agent' },
  })

  assert.equal(doneResult.handled, false)
  await doneResult.promise
  assert.equal(invokeCalls.length, 1)
  assert.match(invokeCalls[0].prompt, /Resultado parcial\./)
})

test('orchestration IPC bridge suppresses orchestrator done while run is active', async () => {
  const runner = createRunner()
  const bridge = createOrchestrationIpcBridge({ runner })

  await bridge.handleCliEvent({
    cliEvent: {
      type: 'spawn_agent',
      agentId: 'reviewer-1',
      cliType: 'claude',
      prompt: 'Revise.',
    },
    streamSessionId: 'session-orchestrator-1',
    threadId: 'thread-orchestrator-1',
    context: createContext(),
  }).promise

  assert.equal(shouldSuppressOrchestratorDone(runner, 'thread-orchestrator-1'), true)
  assert.equal(
    bridge.handleCliEvent({
      cliEvent: { type: 'done' },
      streamSessionId: 'session-orchestrator-1',
      threadId: 'thread-orchestrator-1',
      context: createContext({ runId: 'run-1' }),
    }).handled,
    true,
  )
})

test('orchestration IPC bridge guards direct-text done when delegation is required', async () => {
  const invokeCalls = []
  const runner = createRunner({
    invokeOrchestrator: async (params) => {
      invokeCalls.push(params)
      return { ok: true }
    },
  })
  const bridge = createOrchestrationIpcBridge({ runner })

  const result = bridge.handleCliEvent({
    cliEvent: { type: 'done' },
    streamSessionId: 'session-orchestrator-1',
    threadId: 'thread-orchestrator-1',
    context: createContext({
      originalPrompt: 'Crie um arquivo de exemplo no projeto',
    }),
  })

  assert.equal(result.handled, true)
  await result.promise
  assert.equal(invokeCalls.length, 1)
  assert.match(invokeCalls[0].prompt, /spawn_agent/)
})

test('orchestration IPC bridge lets trivial direct-text done complete normally', async () => {
  const invokeCalls = []
  const runner = createRunner({
    invokeOrchestrator: async (params) => {
      invokeCalls.push(params)
      return { ok: true }
    },
  })
  const bridge = createOrchestrationIpcBridge({ runner })

  const result = bridge.handleCliEvent({
    cliEvent: { type: 'done' },
    streamSessionId: 'session-orchestrator-1',
    threadId: 'thread-orchestrator-1',
    context: createContext({ originalPrompt: 'oi' }),
  })

  assert.equal(result.handled, false)
  await result.promise
  assert.equal(invokeCalls.length, 0)
})

test('orchestration IPC bridge classifies orchestration event types', () => {
  assert.equal(isOrchestrationCliEvent({ type: 'spawn_agent' }), true)
  assert.equal(isOrchestrationCliEvent({ type: 'awaiting_agents' }), true)
  assert.equal(isOrchestrationCliEvent({ type: 'final_answer' }), true)
  assert.equal(isOrchestrationCliEvent({ type: 'orchestration_events' }), true)
  assert.equal(isOrchestrationCliEvent({ type: 'text' }), false)
})

test('orchestration IPC bridge exposes guard decision helper', () => {
  const runner = createRunner()

  assert.equal(
    shouldGuardOrchestratorDoneWithoutSpawn({
      runner,
      threadId: 'thread-orchestrator-1',
      context: createContext({
        originalPrompt: 'Analise este projeto e corrija os problemas',
      }),
    }),
    true,
  )
  assert.equal(
    shouldGuardOrchestratorDoneWithoutSpawn({
      runner,
      threadId: 'thread-orchestrator-1',
      context: createContext({ originalPrompt: 'oi' }),
    }),
    false,
  )
})

test('orchestration IPC bridge delegates batched orchestration events', async () => {
  const runner = createRunner()
  const bridge = createOrchestrationIpcBridge({ runner })

  const result = bridge.handleCliEvent({
    cliEvent: {
      type: 'orchestration_events',
      events: [
        {
          type: 'spawn_agent',
          agentId: 'reviewer-1',
          cliType: 'claude',
          prompt: 'Revise.',
        },
        {
          type: 'awaiting_agents',
          agentIds: ['reviewer-1'],
        },
      ],
    },
    streamSessionId: 'session-orchestrator-1',
    threadId: 'thread-orchestrator-1',
    context: createContext(),
  })

  assert.equal(result.handled, true)
  await result.promise
  assert.equal(runner.getRun('run-1').status, 'waiting_agents')
})

test('orchestration IPC bridge appends and consumes output buffers', () => {
  const buffers = new Map()

  appendOutput(buffers, 'thread-1', 'Oi')
  appendOutput(buffers, 'thread-1', ', tudo bem.')

  assert.equal(consumeOutput(buffers, 'thread-1'), 'Oi, tudo bem.')
  assert.equal(consumeOutput(buffers, 'thread-1'), '')
})

function createRunner(options = {}) {
  return createOrchestrationRunner({
    ...options,
    storeOptions: {
      idGenerator: () => 'run-1',
      now: () => new Date('2026-05-01T12:00:00.000Z'),
    },
    now: () => new Date('2026-05-01T12:00:00.000Z'),
    createThreadId: (_run, event) => `thread-${event.agentId}`,
  })
}

function createContext(overrides = {}) {
  return {
    parentThreadId: 'thread-orchestrator-1',
    streamSessionId: 'session-orchestrator-1',
    targetWebContents: { send() {}, isDestroyed: () => false },
    orchestratorModel: {
      id: 'codex',
      name: 'Codex',
      cliType: 'codex',
    },
    originalPrompt: 'Objetivo inicial',
    ...overrides,
  }
}

test('orchestration IPC bridge fires guard early when only text arrives within timeout', async () => {
  const aborted = []
  const invokeCalls = []
  const runner = createRunner({
    invokeOrchestrator: async (params) => {
      invokeCalls.push(params)
      return { ok: true }
    },
  })
  const bridge = createOrchestrationIpcBridge({
    runner,
    abortStream: (sid) => aborted.push(sid),
    freeTextTimeoutMs: 30,
  })

  bridge.handleCliEvent({
    cliEvent: { type: 'text', text: 'Vou responder direto: a prioridade...' },
    streamSessionId: 'session-orchestrator-1',
    threadId: 'thread-orchestrator-1',
    context: createContext({
      originalPrompt: 'Crie um arquivo de exemplo no projeto',
    }),
  })

  await new Promise((resolve) => setTimeout(resolve, 80))

  assert.deepEqual(aborted, ['session-orchestrator-1'])
  assert.equal(invokeCalls.length, 1)
  assert.match(invokeCalls[0].prompt, /spawn_agent/)
})

test('orchestration IPC bridge does NOT fire early guard if structured event arrives in time', async () => {
  const aborted = []
  const invokeCalls = []
  const runner = createRunner({
    spawnAgent: async (params) => ({ ok: true, threadId: params.threadId }),
    invokeOrchestrator: async (params) => {
      invokeCalls.push(params)
      return { ok: true }
    },
  })
  const bridge = createOrchestrationIpcBridge({
    runner,
    abortStream: (sid) => aborted.push(sid),
    freeTextTimeoutMs: 50,
  })

  // Free text arrives first (preamble before JSON)
  bridge.handleCliEvent({
    cliEvent: { type: 'text', text: 'Vou delegar essa tarefa...' },
    streamSessionId: 'session-orchestrator-1',
    threadId: 'thread-orchestrator-1',
    context: createContext({ originalPrompt: 'Crie um arquivo' }),
  })

  // Structured event arrives within the window
  await new Promise((resolve) => setTimeout(resolve, 10))
  await bridge.handleCliEvent({
    cliEvent: {
      type: 'spawn_agent',
      agentId: 'reviewer-1',
      cliType: 'claude',
      prompt: 'Crie o arquivo.',
    },
    streamSessionId: 'session-orchestrator-1',
    threadId: 'thread-orchestrator-1',
    context: createContext({ originalPrompt: 'Crie um arquivo' }),
  }).promise

  // Wait past the timeout to confirm it would have fired
  await new Promise((resolve) => setTimeout(resolve, 80))

  assert.deepEqual(aborted, [], 'must not abort when structured event arrives in time')
  assert.equal(invokeCalls.length, 0)
})

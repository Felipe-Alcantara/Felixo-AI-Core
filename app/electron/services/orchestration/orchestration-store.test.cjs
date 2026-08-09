const test = require('node:test')
const assert = require('node:assert/strict')
const {
  OrchestrationLimitError,
  createOrchestrationStore,
} = require('./orchestration-store.cjs')

test('orchestration store creates, gets, updates and lists runs', () => {
  const store = createTestStore()
  const run = store.create(createRunParams())

  assert.equal(run.runId, 'run-1')
  assert.equal(run.status, 'running_orchestrator')
  assert.equal(run.currentTurn, 1)
  assert.deepEqual(run.agentJobs, [])
  assert.equal(store.list().length, 1)

  run.status = 'failed'
  assert.equal(store.get('run-1').status, 'running_orchestrator')

  const updatedRun = store.update('run-1', { status: 'waiting_agents' })
  assert.equal(updatedRun.status, 'waiting_agents')
  assert.equal(updatedRun.createdAt, '2026-05-01T12:00:00.000Z')
  assert.equal(updatedRun.updatedAt, '2026-05-01T12:00:01.000Z')
})

test('orchestration store tracks agent job state transitions', () => {
  const store = createTestStore()
  store.create(createRunParams())

  let run = store.createAgentJob('run-1', {
    agentId: 'reviewer-1',
    cliType: 'claude',
    prompt: 'Revise as alteracoes.',
  })

  assert.equal(run.agentJobs[0].status, 'pending')
  assert.equal(run.agentJobs[0].turn, 1)

  run = store.startAgentJob('run-1', 'reviewer-1', {
    threadId: 'thread-claude-1',
  })
  assert.equal(run.agentJobs[0].status, 'running')
  assert.equal(run.agentJobs[0].threadId, 'thread-claude-1')
  assert.equal(run.agentJobs[0].startedAt, '2026-05-01T12:00:02.000Z')

  run = store.completeAgentJob('run-1', 'reviewer-1', {
    result: 'Sem riscos encontrados.',
  })
  assert.equal(run.agentJobs[0].status, 'completed')
  assert.equal(run.agentJobs[0].result, 'Sem riscos encontrados.')
  assert.equal(run.agentJobs[0].error, null)
})

test('orchestration store records failed agent jobs', () => {
  const store = createTestStore()
  store.create(createRunParams())
  store.createAgentJob('run-1', {
    agentId: 'researcher-1',
    cliType: 'gemini',
    prompt: 'Pesquise o contexto.',
  })

  const run = store.failAgentJob('run-1', 'researcher-1', {
    error: 'Timeout.',
  })

  assert.equal(run.agentJobs[0].status, 'error')
  assert.equal(run.agentJobs[0].result, null)
  assert.equal(run.agentJobs[0].error, 'Timeout.')
})

test('orchestration store marks waiting turns and advances with max turn limit', () => {
  const store = createTestStore({ limits: { maxTurns: 2 } })
  store.create(createRunParams())
  store.createAgentJob('run-1', {
    agentId: 'reviewer-1',
    cliType: 'claude',
    prompt: 'Revise.',
  })

  let run = store.markWaitingForAgents('run-1', ['reviewer-1'])
  assert.equal(run.status, 'waiting_agents')
  assert.deepEqual(run.turns, [
    {
      turn: 1,
      agentIds: ['reviewer-1'],
      orchestratorResponse: 'awaiting_agents',
    },
  ])

  run = store.advanceTurn('run-1')
  assert.equal(run.status, 'running_orchestrator')
  assert.equal(run.currentTurn, 2)
  assert.throws(
    () => store.advanceTurn('run-1'),
    (error) =>
      error instanceof OrchestrationLimitError &&
      error.code === 'MAX_TURNS_REACHED',
  )
})

test('orchestration store enforces agent limits', () => {
  const store = createTestStore({
    limits: {
      maxAgentsPerTurn: 1,
      maxTotalAgents: 2,
    },
  })
  store.create(createRunParams())
  store.createAgentJob('run-1', {
    agentId: 'reviewer-1',
    cliType: 'claude',
    prompt: 'Revise.',
  })

  assert.throws(
    () =>
      store.createAgentJob('run-1', {
        agentId: 'reviewer-2',
        cliType: 'claude',
        prompt: 'Revise tambem.',
      }),
    (error) =>
      error instanceof OrchestrationLimitError &&
      error.code === 'MAX_AGENTS_PER_TURN_REACHED',
  )

  store.advanceTurn('run-1')
  store.createAgentJob('run-1', {
    agentId: 'researcher-1',
    cliType: 'gemini',
    prompt: 'Pesquise.',
  })

  store.advanceTurn('run-1')
  assert.throws(
    () =>
      store.createAgentJob('run-1', {
        agentId: 'researcher-2',
        cliType: 'gemini',
        prompt: 'Pesquise tambem.',
      }),
    (error) =>
      error instanceof OrchestrationLimitError &&
      error.code === 'MAX_TOTAL_AGENTS_REACHED',
  )
})

test('orchestration store completes and fails runs', () => {
  const store = createTestStore()
  store.create(createRunParams())

  let run = store.completeRun('run-1', 'Resposta final.')
  assert.equal(run.status, 'completed')
  assert.equal(run.finalAnswer, 'Resposta final.')

  assert.throws(
    () =>
      store.createAgentJob('run-1', {
        agentId: 'reviewer-1',
        cliType: 'claude',
        prompt: 'Revise.',
      }),
    /Run ja finalizado/,
  )

  const failedStore = createTestStore({ idGenerator: createIdGenerator('run-2') })
  failedStore.create(createRunParams())
  run = failedStore.failRun('run-2', 'Erro no orquestrador.')
  assert.equal(run.status, 'failed')
  assert.equal(run.error, 'Erro no orquestrador.')
})

function createTestStore(options = {}) {
  return createOrchestrationStore({
    idGenerator: options.idGenerator ?? createIdGenerator('run-1'),
    now: createClock(),
    limits: options.limits,
  })
}

function createRunParams() {
  return {
    parentThreadId: 'thread-codex-1',
    orchestratorCliType: 'codex',
    orchestratorModel: {
      id: 'codex',
      name: 'Codex',
      cliType: 'codex',
    },
    originalPrompt: 'Implemente a tarefa.',
  }
}

function createIdGenerator(runId) {
  return () => runId
}

function createClock() {
  let index = 0
  const timestamps = [
    '2026-05-01T12:00:00.000Z',
    '2026-05-01T12:00:01.000Z',
    '2026-05-01T12:00:02.000Z',
    '2026-05-01T12:00:03.000Z',
    '2026-05-01T12:00:04.000Z',
    '2026-05-01T12:00:05.000Z',
    '2026-05-01T12:00:06.000Z',
    '2026-05-01T12:00:07.000Z',
  ]

  return () => {
    const timestamp = timestamps[Math.min(index, timestamps.length - 1)]
    index += 1
    return new Date(timestamp)
  }
}

test('runs finalizados são descartados quando passam do teto', () => {
  // Sem teto, `runs` cresce por toda a vida do processo Electron: cada run
  // guarda o prompt original, todos os agentJobs com prompt+resultado e a
  // resposta final. Uma sessão longa com muitas orquestrações retinha dezenas
  // de MB que só saíam com o restart do app.
  const store = createOrchestrationStore({ maxCompletedRuns: 2 })

  const criados = []
  for (let i = 0; i < 4; i += 1) {
    const run = store.create({
      parentThreadId: `thread-${i}`,
      originalPrompt: `objetivo ${i}`,
      orchestratorCliType: 'claude',
    })
    criados.push(run.runId)
    store.completeRun(run.runId, `resposta ${i}`)
  }

  const vivos = store.list().map((run) => run.runId)
  assert.equal(vivos.length, 2, 'deveria manter apenas os mais recentes')
  assert.deepEqual(vivos, criados.slice(-2))
})

test('um run em andamento nunca é descartado pelo teto', () => {
  // O teto só pode alcançar runs terminais: descartar um run vivo perderia o
  // estado de uma orquestração ainda em execução.
  const store = createOrchestrationStore({ maxCompletedRuns: 1 })

  const emAndamento = store.create({
    parentThreadId: 'thread-vivo',
    originalPrompt: 'ainda rodando',
    orchestratorCliType: 'claude',
  })

  for (let i = 0; i < 3; i += 1) {
    const run = store.create({
      parentThreadId: `thread-${i}`,
      originalPrompt: `objetivo ${i}`,
      orchestratorCliType: 'claude',
    })
    store.completeRun(run.runId, 'ok')
  }

  const vivos = store.list().map((run) => run.runId)
  assert.ok(
    vivos.includes(emAndamento.runId),
    'o run em andamento deveria sobreviver ao descarte',
  )
})

const test = require('node:test')
const assert = require('node:assert/strict')
const {
  getAdapterSpawnArgs,
} = require('./orchestrator/cli-execution-planner.cjs')
const {
  collectThreadFamily,
  createOrchestrationModel,
  createOrchestrationStatusResponse,
} = require('./ipc-handlers.cjs')
const {
  createOrchestrationTerminalEvent,
} = require('./terminal-event-formatter.cjs')

test('ipc handlers use spawn args when native resume is disabled', () => {
  const adapter = {
    getSpawnArgs(prompt) {
      return {
        command: 'gemini',
        args: ['--prompt', prompt],
      }
    },
    getResumeArgs(prompt) {
      return {
        command: 'gemini',
        args: ['--resume', 'provider-session-id', '--prompt', prompt],
      }
    },
  }

  assert.deepEqual(
    getAdapterSpawnArgs(adapter, 'Continua', {
      isContinuation: true,
      usesNativeResume: false,
    }),
    {
      command: 'gemini',
      args: ['--prompt', 'Continua'],
    },
  )
})

test('ipc handlers use resume args when native resume is enabled', () => {
  const adapter = {
    getSpawnArgs(prompt) {
      return {
        command: 'claude',
        args: ['--print', prompt],
      }
    },
    getResumeArgs(prompt) {
      return {
        command: 'claude',
        args: ['--resume', 'provider-session-id', prompt],
      }
    },
  }

  assert.deepEqual(
    getAdapterSpawnArgs(adapter, 'Continua', {
      isContinuation: true,
      usesNativeResume: true,
    }),
    {
      command: 'claude',
      args: ['--resume', 'provider-session-id', 'Continua'],
    },
  )
})

test('ipc handlers create lightweight models for orchestration sub-agents', () => {
  assert.deepEqual(createOrchestrationModel('claude'), {
    id: 'orchestration-claude',
    name: 'Sub-agente claude',
    command: 'claude',
    source: 'orchestration',
    cliType: 'claude',
  })
})

test('ipc handlers format orchestration terminal events', () => {
  const event = createOrchestrationTerminalEvent({
    type: 'orchestration_agent_spawn',
    runId: 'run-1',
    parentThreadId: 'thread-codex-1',
    agentId: 'reviewer-1',
    cliType: 'claude',
    threadId: 'thread-reviewer-1',
  })

  assert.equal(event.kind, 'lifecycle')
  assert.equal(event.title, 'Sub-agente iniciado')
  assert.match(event.chunk, /reviewer-1/)
  assert.deepEqual(event.metadata, {
    runId: 'run-1',
    parentThreadId: 'thread-codex-1',
    agentId: 'reviewer-1',
    cliType: 'claude',
    threadId: 'thread-reviewer-1',
  })
})

test('ipc handlers create orchestration status responses', () => {
  const run = {
    runId: 'run-1',
    status: 'waiting_agents',
  }
  const runner = {
    getRun(runId) {
      return runId === 'run-1' ? run : null
    },
    getRunByThreadId(threadId) {
      return threadId === 'thread-codex-1' ? run : null
    },
    listRuns() {
      return [run]
    },
  }

  assert.deepEqual(createOrchestrationStatusResponse(runner, { runId: 'run-1' }), {
    ok: true,
    run,
  })
  assert.deepEqual(
    createOrchestrationStatusResponse(runner, {
      threadId: 'thread-codex-1',
    }),
    {
      ok: true,
      run,
    },
  )
  assert.deepEqual(createOrchestrationStatusResponse(runner, {}), {
    ok: true,
    runs: [run],
  })
  assert.deepEqual(
    createOrchestrationStatusResponse(runner, { runId: 'missing' }),
    {
      ok: false,
      message: 'Run de orquestracao nao encontrado.',
    },
  )
})

test('ipc handlers collect thread family recursively for reset', () => {
  const parents = new Map([
    ['run-1:orchestrator-turn-2', 'thread-parent'],
    ['run-1:gemini-1', 'thread-parent'],
    ['run-1:gemini-1:tool', 'run-1:gemini-1'],
    ['other-child', 'other-parent'],
  ])

  assert.deepEqual(collectThreadFamily('thread-parent', parents), [
    'thread-parent',
    'run-1:orchestrator-turn-2',
    'run-1:gemini-1',
    'run-1:gemini-1:tool',
  ])
})

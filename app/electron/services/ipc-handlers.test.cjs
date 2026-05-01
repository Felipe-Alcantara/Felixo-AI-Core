const test = require('node:test')
const assert = require('node:assert/strict')
const {
  getAdapterSpawnArgs,
} = require('./orchestrator/cli-execution-planner.cjs')
const {
  createOrchestrationModel,
  createOrchestrationTerminalEvent,
} = require('./ipc-handlers.cjs')

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

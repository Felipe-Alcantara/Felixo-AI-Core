const test = require('node:test')
const assert = require('node:assert/strict')
const {
  getAdapterSpawnArgs,
} = require('./orchestrator/cli-execution-planner.cjs')

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

const test = require('node:test')
const assert = require('node:assert/strict')
const {
  choosePersistentPrompt,
  createCliExecutionPlan,
  normalizePersistentInput,
  shouldUsePersistentProcess,
} = require('./cli-execution-planner.cjs')

test('planner selects persistent process before native resume', () => {
  const adapter = {
    getPersistentSpawnArgs() {
      return { command: 'claude', args: [] }
    },
    createPersistentInput(prompt) {
      return `${prompt}\n`
    },
    getResumeArgs(prompt) {
      return { command: 'claude', args: ['--resume', prompt] }
    },
    canResume() {
      return true
    },
  }

  assert.deepEqual(
    createCliExecutionPlan({
      adapter,
      context: { isContinuation: true, providerSessionId: 'session-1' },
      prompt: 'full prompt',
      resumePrompt: 'short prompt',
    }),
    {
      mode: 'persistent-process',
      spawnPrompt: 'full prompt',
      usesNativeResume: false,
      usesPersistentProcess: true,
    },
  )
})

test('planner uses native resume only when adapter can resume', () => {
  const adapter = {
    getSpawnArgs(prompt) {
      return { command: 'gemini', args: ['--prompt', prompt] }
    },
    getResumeArgs(prompt) {
      return { command: 'gemini', args: ['--resume', prompt] }
    },
    canResume(context) {
      return Boolean(context.providerSessionId)
    },
  }

  assert.deepEqual(
    createCliExecutionPlan({
      adapter,
      context: { isContinuation: true, providerSessionId: 'session-1' },
      prompt: 'full prompt',
      resumePrompt: 'short prompt',
    }),
    {
      mode: 'native-resume',
      spawnPrompt: 'short prompt',
      usesNativeResume: true,
      usesPersistentProcess: false,
    },
  )

  assert.equal(
    createCliExecutionPlan({
      adapter,
      context: { isContinuation: true },
      prompt: 'full prompt',
      resumePrompt: 'short prompt',
    }).mode,
    'one-shot',
  )
})

test('persistent prompt is shortened after process reuse or native session capture', () => {
  const adapter = {
    canResume(context) {
      return Boolean(context.providerSessionId)
    },
  }

  assert.equal(
    choosePersistentPrompt({
      adapter,
      isReusingProcess: true,
      context: { isContinuation: true },
      prompt: 'full prompt',
      resumePrompt: 'short prompt',
    }),
    'short prompt',
  )

  assert.equal(
    choosePersistentPrompt({
      adapter,
      isReusingProcess: false,
      context: { isContinuation: true, providerSessionId: 'session-1' },
      prompt: 'full prompt',
      resumePrompt: 'short prompt',
    }),
    'short prompt',
  )
})

test('planner normalizes string and staged persistent input contracts', () => {
  assert.deepEqual(normalizePersistentInput('line\n'), {
    input: 'line\n',
    didStartSession: true,
    didSendPrompt: true,
  })

  assert.deepEqual(
    normalizePersistentInput({
      input: 'line\n',
      didStartSession: true,
      didSendPrompt: false,
    }),
    {
      input: 'line\n',
      didStartSession: true,
      didSendPrompt: false,
    },
  )

  assert.throws(
    () => normalizePersistentInput({ didStartSession: true }),
    /entrada inválida/,
  )
})

test('planner detects persistent-capable adapters', () => {
  assert.equal(
    shouldUsePersistentProcess({
      getPersistentSpawnArgs() {},
      createPersistentInput() {},
    }),
    true,
  )

  assert.equal(shouldUsePersistentProcess({ getPersistentSpawnArgs() {} }), false)
})

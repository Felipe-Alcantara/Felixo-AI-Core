const test = require('node:test')
const assert = require('node:assert/strict')
const adapter = require('./gemini-adapter.cjs')

test('gemini adapter skips workspace trust prompt', () => {
  const spawnArgs = adapter.getSpawnArgs('Oi')

  assert.equal(spawnArgs.command, 'gemini')
  assert.deepEqual(spawnArgs.args, [
    '--prompt',
    'Oi',
    '--output-format',
    'stream-json',
    '--skip-trust',
  ])
})

test('gemini adapter passes provider model when configured', () => {
  const spawnArgs = adapter.getSpawnArgs('Oi', {
    model: {
      providerModel: 'gemini-3-pro-preview',
      reasoningEffort: 'high',
    },
  })

  assert.equal(spawnArgs.command, 'gemini')
  assert.deepEqual(spawnArgs.args, [
    '--model',
    'gemini-3-pro-preview',
    '--prompt',
    'Oi',
    '--output-format',
    'stream-json',
    '--skip-trust',
  ])
})

test('gemini adapter builds resume args for an existing provider session', () => {
  const spawnArgs = adapter.getResumeArgs('Continua', {
    providerSessionId: '00000000-0000-4000-8000-000000000001',
  })

  assert.equal(spawnArgs.command, 'gemini')
  assert.deepEqual(spawnArgs.args, [
    '--resume',
    '00000000-0000-4000-8000-000000000001',
    '--prompt',
    'Continua',
    '--output-format',
    'stream-json',
    '--skip-trust',
  ])
})

test('gemini adapter enables native resume after provider session capture', () => {
  assert.equal(
    adapter.canResume({
      providerSessionId: '00000000-0000-4000-8000-000000000001',
    }),
    true,
  )
  assert.equal(
    adapter.canResume({
      threadId: '00000000-0000-4000-8000-000000000002',
    }),
    false,
  )
  assert.equal(adapter.canResume({}), false)
})

test('gemini adapter parses init session metadata', () => {
  const event = adapter.parseLine(
    JSON.stringify({
      type: 'init',
      session_id: '00000000-0000-4000-8000-000000000001',
      model: 'gemini-3-pro-preview',
    }),
  )

  assert.deepEqual(event, {
    type: 'session',
    providerSessionId: '00000000-0000-4000-8000-000000000001',
  })
})

test('gemini adapter parses model messages', () => {
  const event = adapter.parseLine(
    JSON.stringify({
      type: 'message',
      role: 'model',
      content: 'Hello',
    }),
  )

  assert.deepEqual(event, {
    type: 'text',
    text: 'Hello',
  })
})

test('gemini adapter parses assistant delta messages', () => {
  const event = adapter.parseLine(
    JSON.stringify({
      type: 'message',
      role: 'assistant',
      content: 'Olá',
      delta: true,
    }),
  )

  assert.deepEqual(event, {
    type: 'text',
    text: 'Olá',
  })
})

test('gemini adapter parses result as done', () => {
  const event = adapter.parseLine(
    JSON.stringify({
      type: 'result',
    }),
  )

  assert.deepEqual(event, {
    type: 'done',
  })
})

test('gemini adapter parses orchestration spawn_agent events', () => {
  const event = adapter.parseLine(
    JSON.stringify({
      type: 'spawn_agent',
      agentId: 'reviewer-1',
      cliType: 'gemini-acp',
      prompt: 'Revise as alteracoes.',
    }),
  )

  assert.deepEqual(event, {
    type: 'spawn_agent',
    agentId: 'reviewer-1',
    cliType: 'gemini-acp',
    prompt: 'Revise as alteracoes.',
  })
})

test('gemini adapter parses orchestration awaiting_agents events', () => {
  const event = adapter.parseLine(
    JSON.stringify({
      type: 'awaiting_agents',
      agentIds: ['reviewer-1', 'researcher-2'],
    }),
  )

  assert.deepEqual(event, {
    type: 'awaiting_agents',
    agentIds: ['reviewer-1', 'researcher-2'],
  })
})

test('gemini adapter parses orchestration final_answer events', () => {
  const event = adapter.parseLine(
    JSON.stringify({
      type: 'final_answer',
      content: 'Fluxo concluido.',
    }),
  )

  assert.deepEqual(event, {
    type: 'final_answer',
    content: 'Fluxo concluido.',
  })
})

test('gemini adapter parses orchestration events embedded as assistant JSON text', () => {
  const event = adapter.parseLine(
    JSON.stringify({
      type: 'message',
      role: 'model',
      content: '```json\n{"type":"awaiting_agents","agentIds":["reviewer-1"]}\n```',
    }),
  )

  assert.deepEqual(event, {
    type: 'awaiting_agents',
    agentIds: ['reviewer-1'],
  })
})

test('gemini adapter classifies known non-fatal stderr notices', () => {
  const colorNotice =
    'Warning: 256-color support not detected. Using a terminal with at least 256-color support is recommended for a better visual experience.\n'
  const basicTerminalNotice =
    'Warning: Basic terminal detected (TERM=dumb). Visual rendering will be limited. For the best experience, use a terminal emulator with truecolor support.\n'
  const ripgrepNotice = 'Ripgrep is not available. Falling back to GrepTool.\n'

  assert.equal(adapter.classifyStderr(colorNotice), 'info')
  assert.equal(adapter.classifyStderr(basicTerminalNotice), 'info')
  assert.equal(adapter.classifyStderr(ripgrepNotice), 'info')
  assert.equal(adapter.shouldSuppressStderr(colorNotice), true)
  assert.equal(adapter.shouldSuppressStderr(basicTerminalNotice), true)
  assert.equal(adapter.shouldSuppressStderr(ripgrepNotice), true)
  assert.equal(adapter.classifyStderr(`${ripgrepNotice}real error\n`), 'warn')
})

test('gemini adapter treats model capacity exhaustion as fatal stderr', () => {
  const capacityError =
    'Attempt 1 failed with status 429. Retrying with backoff... _GaxiosError: [{"error":{"code":429,"message":"No capacity available for model gemini-3-flash-preview on the server","status":"RESOURCE_EXHAUSTED","details":[{"reason":"MODEL_CAPACITY_EXHAUSTED"}]}}]\n'

  assert.equal(adapter.classifyStderr(capacityError), 'error')
  assert.equal(adapter.shouldAbortOnStderr(capacityError), true)
  assert.equal(
    adapter.formatStderr(capacityError),
    'Gemini está sem capacidade no servidor agora (429 / MODEL_CAPACITY_EXHAUSTED). Tente novamente mais tarde ou use outro modelo.',
  )
})

test('gemini adapter treats retry capacity messages as fatal stderr', () => {
  const capacityError =
    'Attempt 1 failed: You have exhausted your capacity on this model. Your quota will reset after 6s.. Retrying after 6413ms...\n'

  assert.equal(adapter.classifyStderr(capacityError), 'error')
  assert.equal(adapter.shouldAbortOnStderr(capacityError), true)
})

test('gemini adapter treats unavailable edit tools as fatal stderr', () => {
  const toolError =
    'Error executing tool run_shell_command: Tool "run_shell_command" not found. Did you mean one of: "update_topic", "grep_search", "invoke_agent"?\n'
  const unauthorizedWrite =
    "[LocalAgentExecutor] Blocked call: Unauthorized tool call: 'write_file' is not available to this agent.\n"

  assert.equal(adapter.classifyStderr(toolError), 'error')
  assert.equal(adapter.shouldAbortOnStderr(toolError), true)
  assert.equal(adapter.classifyStderr(unauthorizedWrite), 'error')
  assert.equal(adapter.shouldAbortOnStderr(unauthorizedWrite), true)
  assert.equal(
    adapter.formatStderr(toolError),
    'Gemini não conseguiu executar a alteração porque a CLI não disponibilizou a ferramenta necessária para editar arquivos ou executar comandos.',
  )
})

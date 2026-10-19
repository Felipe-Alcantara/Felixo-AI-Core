'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { PassThrough } = require('node:stream')
const {
  buildClaudeApiArgs,
  createClaudeApiSessionManager,
} = require('./claude-api-session-manager.cjs')
const { translateClaudeStreamMessage, createLineSplitter, classifyClaudeError } = require('./claude-stream-events.cjs')

function fakeChild() {
  const child = new EventEmitter()
  child.stdin = new PassThrough()
  child.stdout = new PassThrough()
  child.stderr = new PassThrough()
  child.exitCode = null
  child.written = []
  child.stdin.on('data', (chunk) => {
    for (const line of chunk.toString('utf8').split('\n').filter(Boolean)) child.written.push(JSON.parse(line))
  })
  child.kill = () => {
    child.exitCode = 0
    child.emit('close', null, 'SIGTERM')
  }
  child.say = (obj) => child.stdout.write(`${JSON.stringify(obj)}\n`)
  return child
}

function setup({ valid = true } = {}) {
  const spawned = []
  const events = []
  const manager = createClaudeApiSessionManager({
    spawnProcess: (command, args, options) => {
      const child = fakeChild()
      spawned.push({ command, args, options, child })
      return child
    },
    validateAccount: () => (valid ? { ok: true } : { ok: false, message: 'Conta sem chave.' }),
    buildAccountEnv: () => ({ ANTHROPIC_API_KEY: 'sk-teste', CLAUDE_CONFIG_DIR: '/perfil' }),
    emit: (sessionId, event) => events.push({ sessionId, ...event }),
    newRequestId: () => 'req-fixo',
  })
  return { manager, spawned, events }
}

const tick = () => new Promise((resolve) => setImmediate(resolve))

test('argumentos: sem Yolo pede permissão pelo stdio; com Yolo pula; modelo e retomada só se válidos', () => {
  const semYolo = buildClaudeApiArgs({ model: 'claude-sonnet-5-5', effort: 'high' })
  assert.deepEqual(semYolo.slice(0, 7), ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--include-partial-messages'])
  assert.ok(semYolo.includes('--permission-prompt-tool'))
  assert.deepEqual(semYolo.slice(-4), ['--model', 'claude-sonnet-5-5', '--effort', 'high'])
  const comYolo = buildClaudeApiArgs({ yolo: true, model: 'x; rm -rf /', effort: 'turbo', resumeSessionId: '../etc' })
  assert.deepEqual(comYolo.slice(7), ['--permission-mode', 'bypassPermissions'])
  assert.ok(buildClaudeApiArgs({ resumeSessionId: '1b763539-ed0a-41c1-af33-b54382ca6328' }).includes('--resume'))
})

test('o processo só nasce no primeiro envio, com o ambiente da conta e a pasta do projeto', async () => {
  const { manager, spawned, events } = setup()
  assert.deepEqual(manager.start({ sessionId: 'bloco-1', accountId: 'conta', cwd: '/projeto', model: 'claude-haiku-5-5' }), { ok: true })
  assert.equal(spawned.length, 0)
  assert.equal(manager.send('bloco-1', 'oi').ok, true)
  assert.equal(spawned.length, 1)
  const [{ command, options, child }] = spawned
  assert.equal(command, 'claude')
  assert.equal(options.cwd, '/projeto')
  assert.equal(options.env.ANTHROPIC_API_KEY, 'sk-teste')
  await tick()
  assert.deepEqual(child.written[0], { type: 'user', message: { role: 'user', content: 'oi' } })

  child.say({ type: 'system', subtype: 'init', session_id: '1b763539-ed0a-41c1-af33-b54382ca6328', model: 'claude-haiku-5-5', apiKeySource: 'ANTHROPIC_API_KEY' })
  child.say({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Ol' } } })
  child.say({ type: 'assistant', message: { id: 'm1', model: 'claude-haiku-5-5', content: [{ type: 'text', text: 'Olá' }] } })
  child.say({ type: 'result', subtype: 'success', is_error: false, total_cost_usd: 0.002, duration_ms: 900 })
  await tick()
  assert.deepEqual(events.map((e) => e.kind), ['ready', 'text-delta', 'assistant-message', 'turn-end'])
  assert.equal(events.at(-1).costUsd, 0.002)
  assert.equal(manager.describe('bloco-1').claudeSessionId, '1b763539-ed0a-41c1-af33-b54382ca6328')
})

test('pedido de permissão espera a resposta do bloco e só aceita o pedido aberto', async () => {
  const { manager, spawned, events } = setup()
  manager.start({ sessionId: 'b', accountId: 'c', cwd: '/p' })
  manager.send('b', 'crie um arquivo')
  const { child } = spawned[0]
  child.say({ type: 'control_request', request_id: 'r1', request: { subtype: 'can_use_tool', tool_name: 'Write', tool_use_id: 't1', description: 'ola.txt', input: { file_path: '/p/ola.txt', content: 'oi' } } })
  await tick()
  const pedido = events.find((e) => e.kind === 'permission-request')
  assert.equal(pedido.toolName, 'Write')
  assert.equal(manager.respondPermission('b', 'outro', { allow: true }).ok, false)
  assert.equal(manager.respondPermission('b', 'r1', { allow: true, input: pedido.input }).ok, true)
  assert.equal(manager.respondPermission('b', 'r1', { allow: true }).ok, false, 'a mesma resposta não vale duas vezes')
  await tick()
  assert.deepEqual(child.written.at(-1), {
    type: 'control_response',
    response: { subtype: 'success', request_id: 'r1', response: { behavior: 'allow', updatedInput: { file_path: '/p/ola.txt', content: 'oi' } } },
  })
})

test('negar manda o motivo; interromper manda o pedido de interrupção', async () => {
  const { manager, spawned } = setup()
  manager.start({ sessionId: 'b', accountId: 'c', cwd: '/p' })
  manager.send('b', 'x')
  const { child } = spawned[0]
  child.say({ type: 'control_request', request_id: 'r2', request: { subtype: 'can_use_tool', tool_name: 'Bash', input: { command: 'rm -rf /' } } })
  await tick()
  manager.respondPermission('b', 'r2', { allow: false })
  manager.interrupt('b')
  await tick()
  assert.equal(child.written[1].response.response.behavior, 'deny')
  assert.deepEqual(child.written[2], { type: 'control_request', request_id: 'req-fixo', request: { subtype: 'interrupt' } })
})

test('conta inválida ou bloco sem pasta não abre', () => {
  const { manager } = setup({ valid: false })
  assert.deepEqual(manager.start({ sessionId: 'b', accountId: 'c', cwd: '/p' }), { ok: false, message: 'Conta sem chave.' })
  const ok = setup().manager
  assert.equal(ok.start({ sessionId: 'b', accountId: 'c', cwd: '' }).ok, false)
  assert.equal(ok.start({ sessionId: '../x', accountId: 'c', cwd: '/p' }).ok, false)
  assert.equal(ok.send('nao-existe', 'oi').ok, false)
})

test('processo que cai no meio do turno avisa com o stderr; o próximo envio reabre com --resume', async () => {
  const { manager, spawned, events } = setup()
  manager.start({ sessionId: 'b', accountId: 'c', cwd: '/p' })
  manager.send('b', 'oi')
  const first = spawned[0].child
  first.say({ type: 'system', subtype: 'init', session_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' })
  first.stderr.write('falhou feio\n')
  await tick()
  first.exitCode = 1
  first.emit('close', 1, null)
  const saida = events.find((e) => e.kind === 'process-exit')
  assert.match(saida.message, /falhou feio/)
  manager.send('b', 'de novo')
  assert.equal(spawned.length, 2)
  assert.ok(spawned[1].args.includes('--resume'))
  assert.equal(spawned[1].args[spawned[1].args.indexOf('--resume') + 1], 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')
})

test('fechar o bloco mata o processo sem anunciar erro', async () => {
  const { manager, spawned, events } = setup()
  manager.start({ sessionId: 'b', accountId: 'c', cwd: '/p' })
  manager.send('b', 'oi')
  manager.stop('b')
  await tick()
  assert.equal(spawned[0].child.exitCode, 0)
  assert.equal(events.some((e) => e.kind === 'process-exit'), false)
  assert.equal(manager.describe('b'), null)
})

test('CLI ausente vira mensagem de instalação', () => {
  const { manager, spawned, events } = setup()
  manager.start({ sessionId: 'b', accountId: 'c', cwd: '/p' })
  manager.send('b', 'oi')
  spawned[0].child.emit('error', Object.assign(new Error('spawn claude ENOENT'), { code: 'ENOENT' }))
  assert.match(events.at(-1).message, /não foi encontrado/)
})

test('tradução: erro de chave, falta de saldo, aviso sintético, interrupção e subagente', () => {
  const chave = translateClaudeStreamMessage({ type: 'result', subtype: 'success', is_error: true, api_error_status: 401, result: 'Invalid API key · Fix external API key' })
  assert.equal(chave[0].errorKind, 'auth')
  assert.equal(classifyClaudeError({ text: 'Credit balance is too low · Add funds' }), 'credit')
  const aviso = translateClaudeStreamMessage({ type: 'assistant', message: { model: '<synthetic>', content: [{ type: 'text', text: 'Invalid API key' }] } })
  assert.deepEqual(aviso, [{ kind: 'notice', text: 'Invalid API key', errorKind: 'auth' }])
  const parou = translateClaudeStreamMessage({ type: 'result', subtype: 'error_during_execution', total_cost_usd: 0 })
  assert.equal(parou[0].interrupted, true)
  assert.equal(parou[0].isError, false)
  assert.deepEqual(translateClaudeStreamMessage({ type: 'assistant', parent_tool_use_id: 'x', message: { content: [{ type: 'text', text: 'sub' }] } }), [])
  const resultado = translateClaudeStreamMessage({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't', content: [{ type: 'text', text: 'ok' }] }] } })
  assert.deepEqual(resultado, [{ kind: 'tool-result', toolUseId: 't', isError: false, text: 'ok' }])
})

test('linhas chegam em pedaços quebrados e com CRLF', () => {
  const linhas = []
  const splitter = createLineSplitter((l) => linhas.push(l))
  splitter.push('{"a":')
  splitter.push('1}\r\n{"b"')
  splitter.push(':2}\n')
  splitter.push('{"c":3}')
  splitter.flush()
  assert.deepEqual(linhas, ['{"a":1}', '{"b":2}', '{"c":3}'])
})

test('borda IPC repassa só campos conhecidos e recusa formato errado', async () => {
  const { registerClaudeApiIpcHandlers } = require('./claude-api-ipc-handlers.cjs')
  const handlers = new Map()
  const calls = []
  registerClaudeApiIpcHandlers({
    ipcMain: { handle: (channel, fn) => handlers.set(channel, fn) },
    manager: {
      start: (p) => (calls.push(['start', p]), { ok: true }),
      send: (s, t) => (calls.push(['send', s, t]), { ok: true }),
      respondPermission: (s, r, d) => (calls.push(['perm', s, r, d]), { ok: true }),
      interrupt: () => ({ ok: true }),
      stop: () => {
        throw new Error('quebrou\nstack')
      },
    },
  })
  assert.deepEqual(await handlers.get('claude-api:start')(null, 'x'), { ok: false, message: 'Pedido inválido.' })
  await handlers.get('claude-api:start')(null, { sessionId: 'b', accountId: 'c', cwd: '/p', yolo: 'true', extra: 1 })
  assert.equal(calls[0][1].yolo, false)
  assert.equal('extra' in calls[0][1], false)
  await handlers.get('claude-api:respond-permission')(null, { sessionId: 'b', requestId: 'r', allow: true, input: { a: 1 } })
  assert.deepEqual(calls[1][3], { allow: true, input: { a: 1 }, message: undefined })
  assert.deepEqual(await handlers.get('claude-api:stop')(null, 'b'), { ok: false, message: 'quebrou' })
  assert.deepEqual(await handlers.get('claude-api:send')(null, { sessionId: 'b' }), { ok: false, message: 'Pedido inválido.' })
})

test('start repetido com o id da sessão não reabre o processo; trocar o modelo reabre', () => {
  const { manager, spawned } = setup()
  manager.start({ sessionId: 'b', accountId: 'c', cwd: '/p', model: 'claude-haiku-5-5' })
  manager.send('b', 'oi')
  const again = manager.start({ sessionId: 'b', accountId: 'c', cwd: '/p', model: 'claude-haiku-5-5', resumeSessionId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' })
  assert.equal(again.alreadyRunning, true)
  assert.equal(spawned[0].child.exitCode, null)
  manager.start({ sessionId: 'b', accountId: 'c', cwd: '/p', model: 'claude-sonnet-5-5' })
  assert.equal(spawned[0].child.exitCode, 0)
})

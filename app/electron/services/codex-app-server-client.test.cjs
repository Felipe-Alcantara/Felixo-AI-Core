'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')
const { EventEmitter } = require('node:events')

const {
  readCodexVersion,
  runCodexAppServerSession,
} = require('./codex-app-server-client.cjs')

/**
 * App-server falso: responde `initialize` e, para cada método, o que o mapa
 * mandar — `{ result }`, `{ error }`, `{ never: true }` (não responde) ou
 * `{ exit: true }` (o processo sai). As respostas chegam fora de ordem quando
 * `delayMs` difere, como no app-server de verdade.
 */
function fakeAppServer({ initialize = { userAgent: 'felixo-ai-core/0.156.1 (Linux; x86_64)' }, answers = {} } = {}) {
  const child = new EventEmitter()
  child.written = []
  child.spawnOptions = null
  child.stdout = new EventEmitter()
  child.stdout.setEncoding = () => {}
  child.kill = () => {
    child.killed = true
  }
  // Sem atraso, a resposta sai numa microtask: chega antes de qualquer timer,
  // como a resposta já pronta de um processo de verdade, e o teste não
  // disputa a ordem com o timeout quando a máquina está carregada.
  const reply = (payload, delayMs = 0) => {
    const emit = () => child.stdout.emit('data', `${JSON.stringify(payload)}\n`)
    if (delayMs > 0) {
      setTimeout(emit, delayMs)
    } else {
      queueMicrotask(emit)
    }
  }

  child.stdin = {
    write: (data) => {
      const message = JSON.parse(data)
      child.written.push(message)
      if (message.method === 'initialize') {
        reply({ id: message.id, result: initialize })
        return
      }
      const answer = answers[message.method] ?? { never: true }
      if (answer.never) {
        return
      }
      if (answer.exit) {
        queueMicrotask(() => child.emit('exit', 1))
        return
      }
      reply(
        answer.error
          ? { id: message.id, error: { message: answer.error } }
          : { id: message.id, result: answer.result ?? {} },
        answer.delayMs ?? 0,
      )
    },
  }
  return child
}

function spawnWith(child) {
  return (command, args, options) => {
    child.command = command
    child.args = args
    child.spawnOptions = options
    return child
  }
}

const REQUESTS = [
  { method: 'account/rateLimits/read', required: true },
  { method: 'account/read', params: { refreshToken: false } },
  { method: 'account/usage/read' },
]

test('manda todos os pedidos depois do initialize e junta as respostas por método', async () => {
  const child = fakeAppServer({
    answers: {
      'account/rateLimits/read': { result: { rateLimits: {} }, delayMs: 15 },
      'account/read': { result: { account: { type: 'chatgpt' } } },
      'account/usage/read': { result: { summary: {} }, delayMs: 5 },
    },
  })

  const session = await runCodexAppServerSession({ spawnProcess: spawnWith(child), requests: REQUESTS })

  assert.equal(session.ok, true)
  assert.equal(session.reason, null)
  assert.deepEqual(child.written.map((message) => message.method), [
    'initialize',
    'account/rateLimits/read',
    'account/read',
    'account/usage/read',
  ])
  assert.deepEqual(child.written[2].params, { refreshToken: false })
  assert.deepEqual(session.responses['account/read'], { status: 'ok', result: { account: { type: 'chatgpt' } } })
  assert.equal(session.responses['account/rateLimits/read'].status, 'ok')
  assert.equal(child.command, 'codex')
  assert.deepEqual(child.args, ['app-server', '--stdio'])
  assert.equal(child.killed, true)
})

test('pedido opcional sem resposta vira timeout depois da folga, sem derrubar a sessão', async () => {
  const child = fakeAppServer({
    answers: {
      'account/rateLimits/read': { result: { rateLimits: {} } },
      'account/read': { result: {} },
      'account/usage/read': { never: true },
    },
  })

  const startedAt = Date.now()
  const session = await runCodexAppServerSession({
    spawnProcess: spawnWith(child),
    requests: REQUESTS,
    optionalGraceMs: 40,
    timeoutMs: 5_000,
  })

  assert.equal(session.ok, true)
  assert.deepEqual(session.responses['account/usage/read'], { status: 'timeout' })
  assert.ok(Date.now() - startedAt < 2_000, 'a folga curta decide, não o timeout geral')
})

test('opcional recusado fica registrado com a mensagem do servidor', async () => {
  const child = fakeAppServer({
    answers: {
      'account/rateLimits/read': { result: {} },
      'account/read': { error: 'conta indisponível' },
      'account/usage/read': { result: {} },
    },
  })

  const session = await runCodexAppServerSession({ spawnProcess: spawnWith(child), requests: REQUESTS })

  assert.equal(session.ok, true)
  assert.deepEqual(session.responses['account/read'], { status: 'error', message: 'conta indisponível' })
})

test('obrigatório recusado encerra na hora com a mensagem do servidor', async () => {
  const child = fakeAppServer({
    answers: {
      'account/rateLimits/read': { error: 'sessão não autenticada' },
      'account/read': { never: true },
      'account/usage/read': { never: true },
    },
  })

  const session = await runCodexAppServerSession({
    spawnProcess: spawnWith(child),
    requests: REQUESTS,
    timeoutMs: 5_000,
  })

  assert.equal(session.ok, false)
  assert.equal(session.reason, 'server-error')
  assert.equal(session.message, 'sessão não autenticada')
})

test('obrigatório sem resposta até o timeout falha com a mensagem de timeout', async () => {
  const child = fakeAppServer({ answers: { 'account/read': { result: {} } } })

  const session = await runCodexAppServerSession({
    spawnProcess: spawnWith(child),
    requests: REQUESTS,
    timeoutMs: 30,
    timeoutMessage: 'demorou demais',
  })

  assert.equal(session.ok, false)
  assert.equal(session.reason, 'timeout')
  assert.equal(session.message, 'demorou demais')
  assert.equal(session.responses['account/read'].status, 'ok', 'o que chegou continua disponível')
})

test('processo que sai antes do obrigatório falha como saída antecipada', async () => {
  const child = fakeAppServer({ answers: { 'account/rateLimits/read': { exit: true } } })

  const session = await runCodexAppServerSession({ spawnProcess: spawnWith(child), requests: REQUESTS })

  assert.equal(session.ok, false)
  assert.equal(session.reason, 'exit')
  assert.match(session.message, /encerrou antes de responder/)
})

test('initialize recusado e spawn que falha devolvem o motivo, sem lançar', async () => {
  const refusing = fakeAppServer()
  refusing.stdin.write = (data) => {
    const message = JSON.parse(data)
    queueMicrotask(() =>
      refusing.stdout.emit('data', `${JSON.stringify({ id: message.id, error: { message: 'versão incompatível' } })}\n`),
    )
  }

  const initialize = await runCodexAppServerSession({ spawnProcess: spawnWith(refusing), requests: REQUESTS })
  assert.equal(initialize.ok, false)
  assert.equal(initialize.reason, 'initialize')
  assert.equal(initialize.message, 'versão incompatível')

  const spawn = await runCodexAppServerSession({
    spawnProcess: () => {
      throw new Error('ENOENT')
    },
    requests: REQUESTS,
  })
  assert.equal(spawn.ok, false)
  assert.equal(spawn.reason, 'spawn')
})

test('cada conta abre o app-server com o próprio perfil e sem a chave herdada do app', async () => {
  const previousKey = process.env.OPENAI_API_KEY
  process.env.OPENAI_API_KEY = 'chave-do-ambiente-do-app'
  try {
    const envs = []
    for (const codexHome of ['/perfis/conta-a', '/perfis/conta-b']) {
      const child = fakeAppServer({ answers: { 'account/rateLimits/read': { result: {} } } })
      await runCodexAppServerSession({
        spawnProcess: spawnWith(child),
        accountEnv: { CODEX_HOME: codexHome },
        requests: [{ method: 'account/rateLimits/read', required: true }],
      })
      envs.push(child.spawnOptions.env)
    }

    assert.deepEqual(envs.map((env) => env.CODEX_HOME), ['/perfis/conta-a', '/perfis/conta-b'])
    assert.ok(envs.every((env) => env.OPENAI_API_KEY === undefined))
  } finally {
    if (previousKey === undefined) {
      delete process.env.OPENAI_API_KEY
    } else {
      process.env.OPENAI_API_KEY = previousKey
    }
  }
})

test('readCodexVersion lê a versão do userAgent do initialize', () => {
  assert.equal(readCodexVersion({ userAgent: 'felixo-ai-core/0.156.1 (Linux Mint 22.3.0; x86_64) xterm' }), '0.156.1')
  assert.equal(readCodexVersion({ userAgent: 'felixo-ai-core/0.157.0-alpha.2 (Windows)' }), '0.157.0-alpha.2')
  assert.equal(readCodexVersion({ userAgent: 'sem versão' }), null)
  assert.equal(readCodexVersion(null), null)
})

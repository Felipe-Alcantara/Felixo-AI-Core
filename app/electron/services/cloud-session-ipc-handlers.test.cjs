'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { registerCloudSessionIpcHandlers } = require('./cloud-session-ipc-handlers.cjs')

const ID = 'session_01EXEMPLO0000000000000000'
const URL_OK = `https://claude.ai/code/${ID}?from=cli&m=0`

function setup({ service: serviceOverrides = {}, shell: shellOverrides = {} } = {}) {
  const handlers = new Map()
  const calls = []
  const opened = []
  const service = {
    launch: async (params) => {
      calls.push(['launch', params])
      return { ok: true, session: { id: ID, url: URL_OK, title: 'Tarefa' } }
    },
    followUp: async (params) => {
      calls.push(['followUp', params])
      return { ok: true }
    },
    ...serviceOverrides,
  }
  const shell = {
    openExternal: async (url) => {
      opened.push(url)
    },
    ...shellOverrides,
  }
  registerCloudSessionIpcHandlers({ ipcMain: { handle: (channel, fn) => handlers.set(channel, fn) }, service, shell })
  const invoke = (channel, payload) => handlers.get(channel)({}, payload)
  return { handlers, calls, opened, invoke }
}

test('registra os três canais do agente na nuvem', () => {
  const { handlers } = setup()

  assert.deepEqual([...handlers.keys()].sort(), [
    'cloud-session:follow-up',
    'cloud-session:launch',
    'cloud-session:open',
  ])
})

test('launch repassa só os campos conhecidos e devolve o resultado do serviço', async () => {
  const { invoke, calls } = setup()

  const result = await invoke('cloud-session:launch', {
    nodeId: 'no-1',
    task: 'Corrigir',
    cwd: '/tmp/x',
    accountId: 'conta-a',
    env: { ANTHROPIC_API_KEY: 'x' },
    command: 'rm -rf /',
  })

  assert.equal(result.ok, true)
  assert.deepEqual(calls, [['launch', { nodeId: 'no-1', task: 'Corrigir', cwd: '/tmp/x', accountId: 'conta-a' }]])
})

test('launch sem conta repassa accountId indefinido', async () => {
  const { invoke, calls } = setup()

  await invoke('cloud-session:launch', { nodeId: 'no-1', task: 'T', cwd: '/tmp/x', accountId: null })

  assert.equal(calls[0][1].accountId, undefined)
})

test('launch recusa payload com tipo errado sem chamar o serviço', async () => {
  const { invoke, calls } = setup()
  const invalidos = [
    undefined,
    null,
    'texto',
    [],
    {},
    { nodeId: '', task: 'T', cwd: '/tmp/x' },
    { nodeId: 'no-1', task: 42, cwd: '/tmp/x' },
    { nodeId: 'no-1', task: 'T', cwd: ['/tmp/x'] },
    { nodeId: 'no-1', task: 'T', cwd: '/tmp/x', accountId: 7 },
    { nodeId: 'x'.repeat(300), task: 'T', cwd: '/tmp/x' },
  ]

  for (const payload of invalidos) {
    const result = await invoke('cloud-session:launch', payload)

    assert.equal(result.ok, false, `deveria recusar ${JSON.stringify(payload)}`)
    assert.equal(result.code, 'invalid-input')
  }
  assert.equal(calls.length, 0)
})

test('launch transforma exceção do serviço em erro sem stack', async () => {
  const { invoke } = setup({
    service: {
      launch: async () => {
        throw new Error('quebrou por dentro\n    at Object.<anonymous> (x.js:1:1)')
      },
    },
  })

  const result = await invoke('cloud-session:launch', { nodeId: 'no-1', task: 'T', cwd: '/tmp/x' })

  assert.equal(result.ok, false)
  assert.equal(result.code, 'unknown')
  assert.doesNotMatch(result.message, /at Object/)
})

test('follow-up repassa os campos normalizados e recusa payload inválido', async () => {
  const { invoke, calls } = setup()

  const ok = await invoke('cloud-session:follow-up', {
    nodeId: 'no-1',
    sessionId: ID,
    text: 'oi',
    cwd: '/tmp/x',
    accountId: 'conta-a',
    extra: 'ignorado',
  })
  const ruim = await invoke('cloud-session:follow-up', { nodeId: 'no-1', sessionId: 5, text: 'oi', cwd: '/tmp/x' })

  assert.equal(ok.ok, true)
  assert.deepEqual(calls, [
    ['followUp', { nodeId: 'no-1', sessionId: ID, text: 'oi', cwd: '/tmp/x', accountId: 'conta-a' }],
  ])
  assert.deepEqual({ ok: ruim.ok, code: ruim.code }, { ok: false, code: 'invalid-input' })
})

test('open abre no navegador só o link de sessão do claude.ai/code', async () => {
  const { invoke, opened } = setup()

  const result = await invoke('cloud-session:open', { url: URL_OK })

  assert.deepEqual(result, { ok: true })
  assert.deepEqual(opened, [URL_OK])
})

test('open recusa qualquer outro endereço e nunca chama o navegador', async () => {
  const { invoke, opened } = setup()
  const maus = [
    `http://claude.ai/code/${ID}`,
    `https://claude.ai.evil.example/code/${ID}`,
    `https://evil.example/?x=https://claude.ai/code/${ID}`,
    'https://claude.ai/',
    'file:///C:/Windows/System32/calc.exe',
    'javascript:alert(1)',
    '',
    undefined,
    42,
  ]

  for (const url of maus) {
    const result = await invoke('cloud-session:open', { url })

    assert.equal(result.ok, false, `deveria recusar ${JSON.stringify(url)}`)
    assert.equal(result.code, 'invalid-input')
  }
  assert.equal((await invoke('cloud-session:open', undefined)).ok, false)
  assert.deepEqual(opened, [])
})

test('open devolve erro quando o navegador não abre', async () => {
  const { invoke } = setup({
    shell: {
      openExternal: async () => {
        throw new Error('sem navegador')
      },
    },
  })

  const result = await invoke('cloud-session:open', { url: URL_OK })

  assert.deepEqual({ ok: result.ok, code: result.code }, { ok: false, code: 'unknown' })
})

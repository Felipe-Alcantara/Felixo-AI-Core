const test = require('node:test')
const assert = require('node:assert/strict')

const { decidePermissionRequest, registerSessionSecurity } = require('./session-security.cjs')

test('esquema externo só abre programa do sistema se a política aprovar', () => {
  assert.equal(decidePermissionRequest('openExternal', { externalURL: 'mailto:pessoa@example.com' }), true)

  for (const externalURL of [
    'vscode://file/C:/projeto/arquivo.ts',
    'ms-msdt:/id',
    'search-ms:query=x',
    'file:///C:/Windows/System32/calc.exe',
    'smb://servidor/compartilhamento',
    'steam://run/1',
    '',
    undefined,
  ]) {
    assert.equal(decidePermissionRequest('openExternal', { externalURL }), false, String(externalURL))
  }
  assert.equal(decidePermissionRequest('openExternal', undefined), false)
})

test('as outras permissões continuam com o padrão do Electron', () => {
  for (const permission of ['media', 'notifications', 'clipboard-sanitized-write', 'fullscreen']) {
    assert.equal(decidePermissionRequest(permission, {}), true, permission)
  }
})

function fakeSession() {
  return {
    handler: null,
    setPermissionRequestHandler(handler) {
      this.handler = handler
    },
  }
}

function fakeApp() {
  const listeners = new Map()
  let ready
  const readyPromise = new Promise((resolve) => {
    ready = resolve
  })
  return {
    ready,
    on(event, listener) {
      listeners.set(event, listener)
    },
    emit(event, ...args) {
      listeners.get(event)?.(...args)
    },
    whenReady: () => readyPromise,
  }
}

test('protege a sessão padrão no ready e cada partição criada depois, uma vez só', async () => {
  const app = fakeApp()
  const defaultSession = fakeSession()
  const logs = []
  registerSessionSecurity(app, { defaultSession }, { warn: (line) => logs.push(line) })

  const partition = fakeSession()
  app.emit('session-created', partition)
  assert.equal(typeof partition.handler, 'function')
  assert.equal(defaultSession.handler, null, 'a padrão só existe depois do ready')

  app.emit('session-created', defaultSession)
  const first = defaultSession.handler
  app.ready()
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(defaultSession.handler, first, 'não registra de novo a mesma sessão')

  const answers = []
  partition.handler(null, 'openExternal', (granted) => answers.push(granted), {
    externalURL: 'vscode://file/C:/Users/pessoa/SEGREDO.ts',
  })
  partition.handler(null, 'openExternal', (granted) => answers.push(granted), {
    externalURL: 'mailto:pessoa@example.com',
  })
  assert.deepEqual(answers, [false, true])
  assert.equal(logs.length, 1)
  assert.doesNotMatch(logs[0], /SEGREDO/)
})

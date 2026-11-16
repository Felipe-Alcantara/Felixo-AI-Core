const test = require('node:test')
const assert = require('node:assert/strict')

const { classifySession, decidePermissionRequest, registerSessionSecurity } = require('./session-security.cjs')

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


function fakeSession(storagePath = null) {
  return {
    storagePath,
    handler: null,
    checkHandler: null,
    setPermissionRequestHandler(handler) {
      this.handler = handler
    },
    setPermissionCheckHandler(handler) {
      this.checkHandler = handler
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

test('a sessão do app concede como antes; a de um perfil do navegador pergunta pelo broker; a desconhecida nega', async () => {
  const app = fakeApp()
  const defaultSession = fakeSession('/home/p/.config/felixo')
  const site = fakeSession('/home/p/.config/felixo/Partitions/felixo-webview-trabalho')
  const outra = fakeSession('/home/p/.config/felixo/Partitions/outra')
  const pedidos = []
  let broker = null
  registerSessionSecurity(app, { defaultSession }, { warn: () => {} }, { getSitePermissions: () => broker })
  for (const target of [site, outra]) app.emit('session-created', target)
  app.ready()
  await new Promise((resolve) => setImmediate(resolve))

  assert.deepEqual(classifySession(site, defaultSession), { kind: 'site', profileId: 'trabalho' })
  assert.deepEqual(classifySession(defaultSession, defaultSession), { kind: 'app' })
  assert.deepEqual(classifySession(outra, defaultSession), { kind: 'other' })

  const answers = []
  const responder = (granted) => answers.push(granted)
  defaultSession.handler({ id: 1 }, 'media', responder, { mediaTypes: ['audio'] })
  assert.equal(defaultSession.checkHandler(null, 'media', 'app://felixo', { mediaType: 'audio' }), true, 'o ditado continua')
  site.handler({ id: 2 }, 'media', responder, { mediaTypes: ['audio'] })
  outra.handler({ id: 3 }, 'notifications', responder, {})
  assert.deepEqual(answers, [true, false, false], 'sem broker, site nega; outra sessão nega')
  assert.equal(outra.checkHandler(null, 'notifications', 'https://x.com', {}), false)

  broker = {
    request: (params) => pedidos.push(params),
    check: ({ profileId, permission }) => profileId === 'trabalho' && permission === 'geolocation',
  }
  site.handler({ id: 4 }, 'geolocation', responder, { requestingUrl: 'https://mapa.exemplo.com/' })
  assert.equal(pedidos.length, 1)
  assert.equal(pedidos[0].profileId, 'trabalho')
  assert.equal(pedidos[0].permission, 'geolocation')
  assert.equal(site.checkHandler(null, 'geolocation', 'https://mapa.exemplo.com/', {}), true)
  assert.equal(site.checkHandler(null, 'notifications', 'https://mapa.exemplo.com/', {}), false)

  // openExternal segue a política de URL em qualquer sessão, sem passar pelo broker.
  site.handler({ id: 5 }, 'openExternal', responder, { externalURL: 'mailto:pessoa@example.com' })
  assert.equal(answers.at(-1), true)
  assert.equal(pedidos.length, 1)
})

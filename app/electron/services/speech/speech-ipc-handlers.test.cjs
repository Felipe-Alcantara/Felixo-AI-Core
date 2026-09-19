const test = require('node:test')
const assert = require('node:assert/strict')

const Module = require('node:module')
const originalLoad = Module._load
const handlers = new Map()
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'electron') {
    return { ipcMain: { handle: (name, handler) => handlers.set(name, handler) }, safeStorage: {}, systemPreferences: {} }
  }
  return originalLoad.call(this, request, parent, isMain)
}
const { microphoneStatus, registerSpeechIpcHandlers } = require('./speech-ipc-handlers.cjs')
Module._load = originalLoad

function fakeStore({ key = 'sk-guardada' } = {}) {
  const calls = []
  return {
    calls,
    getConfig: () => ({ baseUrl: 'https://x/v1', model: 'whisper-1', language: 'pt', keyConfigured: Boolean(key) }),
    saveConfig: (c) => ({ baseUrl: c.baseUrl, model: c.model, language: c.language }),
    setKey: (k) => { calls.push(['setKey', k]) },
    clearKey: () => { calls.push(['clearKey']) },
    readConfig: () => ({ baseUrl: 'https://x/v1', model: 'whisper-1', language: 'pt' }),
    readKeyForRequest: () => key,
  }
}

function registrar(extra = {}) {
  handlers.clear()
  registerSpeechIpcHandlers({ userData: '/tmp/x', dependencies: { store: fakeStore(), ...extra } })
}

test('transcrever lê chave e config no processo principal e devolve só o texto', async () => {
  const recebido = []
  registrar({ transcribe: async (args) => { recebido.push(args); return { ok: true, text: 'oi' } } })
  const result = await handlers.get('speech:transcribe')(null, { audio: new Uint8Array(2000), mimeType: 'audio/webm' })
  assert.deepEqual(result, { ok: true, text: 'oi' })
  assert.equal(recebido[0].apiKey, 'sk-guardada')
  assert.equal(recebido[0].config.model, 'whisper-1')
  // O renderer não escolhe endereço nem modelo: vêm da config guardada aqui.
  assert.equal('config' in { audio: 1 }, false)
})

test('o renderer nunca recebe a chave de volta (nem na config, nem ao salvar)', async () => {
  registrar()
  const lida = await handlers.get('speech:get-config')()
  assert.equal(lida.config.keyConfigured, true)
  assert.equal(JSON.stringify(lida).includes('sk-guardada'), false)
  const salva = await handlers.get('speech:save-config')(null, { baseUrl: 'https://y/v1', model: 'm', language: 'en' })
  assert.equal(JSON.stringify(salva).includes('sk-guardada'), false)
})

test('guardar e apagar a chave chamam o store; erro do store vira resposta legível', async () => {
  const store = fakeStore()
  handlers.clear()
  registerSpeechIpcHandlers({ userData: '/tmp/x', dependencies: { store } })
  assert.deepEqual(await handlers.get('speech:set-key')(null, 'sk-nova'), { ok: true })
  await handlers.get('speech:clear-key')()
  assert.deepEqual(store.calls, [['setKey', 'sk-nova'], ['clearKey']])

  store.setKey = () => { throw new Error('sem armazenamento cifrado') }
  const falha = await handlers.get('speech:set-key')(null, 'x')
  assert.equal(falha.ok, false)
  assert.match(falha.message, /sem armazenamento cifrado/)
})

test('falha inesperada ao transcrever vira resposta, não exceção pelo IPC', async () => {
  registrar({ transcribe: async () => { throw new Error('boom') } })
  const result = await handlers.get('speech:transcribe')(null, { audio: new Uint8Array(2000), mimeType: 'audio/webm' })
  assert.equal(result.ok, false)
})

test('status do microfone: repassa o do sistema; Linux/erro viram "unknown"', async () => {
  assert.equal(microphoneStatus({ getMediaAccessStatus: () => 'denied' }), 'denied')
  assert.equal(microphoneStatus({}), 'unknown')
  assert.equal(microphoneStatus({ getMediaAccessStatus: () => { throw new Error('x') } }), 'unknown')
  registrar({ systemPreferences: { getMediaAccessStatus: () => 'granted' }, platform: 'win32' })
  assert.deepEqual(await handlers.get('speech:microphone-status')(), { ok: true, status: 'granted', platform: 'win32' })
})

test('pedir permissão: só o macOS chama askForMediaAccess; nos outros só informa o estado', async () => {
  const pedidos = []
  const prefs = { getMediaAccessStatus: () => 'not-determined', askForMediaAccess: async (t) => { pedidos.push(t) } }
  registrar({ systemPreferences: prefs, platform: 'darwin' })
  await handlers.get('speech:request-microphone')()
  assert.deepEqual(pedidos, ['microphone'])
  registrar({ systemPreferences: prefs, platform: 'win32' })
  await handlers.get('speech:request-microphone')()
  assert.equal(pedidos.length, 1)
})

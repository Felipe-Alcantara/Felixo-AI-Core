'use strict'

const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const { createGpuInfoWatcher } = require('../core/gpu-info-watcher.cjs')
const { persistGpuPreference, readGpuPreferenceState } = require('../core/gpu-preference.cjs')
const { prepareGpuStart } = require('../core/gpu-start-guard.cjs')
const { CHANGE_CHANNEL, createGpuPreferenceSession } = require('./gpu-preference-session.cjs')

const TWO_GPUS = Object.freeze({
  gpuDevice: [
    { active: true, vendorId: 0x10de, deviceId: 0x134f },
    { active: false, vendorId: 0x8086, deviceId: 0x1916 },
  ],
})

const profiles = []
test.after(() => {
  for (const profile of profiles) fs.rmSync(profile, { recursive: true, force: true })
})

function setup({
  preference = 'dedicada',
  featureStatus = { gpu_compositing: 'enabled', vulkan: 'enabled_on' },
  gpuInfo = TWO_GPUS,
  gpuInfoReady = true,
  gpuInfoTimeoutMs = 1_000,
  platformName = 'linux',
} = {}) {
  const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-gpu-session-'))
  profiles.push(userDataPath)
  persistGpuPreference({ userDataPath, preference })
  const gpuStart = prepareGpuStart({ userDataPath, platformName, environment: {} })

  const app = new EventEmitter()
  // Criado antes do "whenReady", como no main.cjs.
  const gpuInfoWatcher = createGpuInfoWatcher(app)
  if (gpuInfoReady) app.emit('gpu-info-update')
  app.status = featureStatus
  app.getGPUFeatureStatus = () => app.status
  app.getGPUInfo = async () => gpuInfo
  const handlers = new Map()
  const ipcMain = { handle: (channel, handler) => handlers.set(channel, handler) }
  const sent = []
  const webContents = new EventEmitter()
  webContents.send = (channel, payload) => sent.push({ channel, payload })
  const window = { isDestroyed: () => false, webContents }
  const logs = []
  const session = createGpuPreferenceSession({
    app,
    ipcMain,
    userDataPath,
    gpuStart,
    gpuInfoWatcher,
    gpuInfoTimeoutMs,
    platformName,
    getMainWindow: () => window,
    log: (entry) => logs.push(entry),
  })
  session.register()
  session.watchWindow(window)
  return { app, handlers, logs, sent, session, userDataPath, webContents }
}

async function flush() {
  for (let index = 0; index < 5; index += 1) await new Promise((resolve) => setImmediate(resolve))
}

test('janela carregada com a GPU saudável confirma o início e apaga o marcador', async () => {
  const { session, userDataPath, webContents } = setup()
  assert.equal(readGpuPreferenceState(userDataPath).pendingStart.preference, 'dedicada')

  webContents.emit('did-finish-load')
  await flush()

  assert.equal((await session.describe()).sessionOutcome, 'healthy')
  assert.equal(readGpuPreferenceState(userDataPath).pendingStart, null)
  assert.equal(readGpuPreferenceState(userDataPath).preference, 'dedicada')
})

test('janela que carrega antes de a GPU responder não reverte por um status que ainda não vale', async () => {
  // Medido em 26/09/2026: o did-finish-load pode chegar antes do
  // gpu-info-update, com o status ainda no padrão `disabled_software`.
  const { app, session, userDataPath, webContents } = setup({ featureStatus: { gpu_compositing: 'disabled_software' }, gpuInfoReady: false })

  webContents.emit('did-finish-load')
  await flush()
  assert.equal(readGpuPreferenceState(userDataPath).preference, 'dedicada')
  assert.equal((await session.describe()).sessionOutcome, 'pending')

  app.status = { gpu_compositing: 'enabled', vulkan: 'enabled_on' }
  app.emit('gpu-info-update')
  await flush()

  assert.equal((await session.describe()).sessionOutcome, 'healthy')
  assert.deepEqual(readGpuPreferenceState(userDataPath), { preference: 'dedicada', pendingStart: null, pendingRelaunch: null, fallback: null })
})

test('GPU que nunca responde deixa o marcador para o próximo início decidir', async () => {
  const { session, userDataPath, webContents } = setup({ featureStatus: { gpu_compositing: 'disabled_software' }, gpuInfoReady: false, gpuInfoTimeoutMs: 20 })
  webContents.emit('did-finish-load')
  await new Promise((resolve) => setTimeout(resolve, 60))
  await flush()
  assert.equal((await session.describe()).sessionOutcome, 'pending')
  assert.equal(readGpuPreferenceState(userDataPath).pendingStart.preference, 'dedicada')
})

test('GPU desligada ao carregar volta para Automático e avisa a interface', async () => {
  const { sent, session, userDataPath, webContents } = setup({ featureStatus: { gpu_compositing: 'disabled_software' } })

  webContents.emit('did-finish-load')
  await flush()

  const state = readGpuPreferenceState(userDataPath)
  assert.equal(state.preference, 'auto')
  assert.equal(state.fallback.reason, 'gpu-disabled')
  assert.equal((await session.describe()).sessionOutcome, 'reverted')
  assert.equal(sent.at(-1).channel, CHANGE_CHANNEL)
  assert.equal(sent.at(-1).payload.fallback.reason, 'gpu-disabled')
})

test('GPU que desliga no meio da sessão também reverte, uma vez só', async () => {
  const { app, logs, userDataPath, webContents } = setup()
  webContents.emit('did-finish-load')
  await flush()

  app.status = { gpu_compositing: 'disabled_software', vulkan: 'disabled_off' }
  app.emit('gpu-info-update')
  app.emit('gpu-info-update')
  await flush()

  assert.equal(readGpuPreferenceState(userDataPath).preference, 'auto')
  assert.equal(logs.filter((entry) => entry.message === 'reverted-to-auto').length, 1)
})

test('queda do processo de GPU reverte; saída limpa ou de outro processo não', async () => {
  const { app, userDataPath } = setup()
  app.emit('child-process-gone', {}, { type: 'Utility', reason: 'crashed' })
  app.emit('child-process-gone', {}, { type: 'GPU', reason: 'killed' })
  assert.equal(readGpuPreferenceState(userDataPath).preference, 'dedicada')

  app.emit('child-process-gone', {}, { type: 'GPU', reason: 'crashed', exitCode: 139 })
  const state = readGpuPreferenceState(userDataPath)
  assert.equal(state.preference, 'auto')
  assert.deepEqual([state.fallback.reason, state.fallback.detail], ['gpu-process-gone', 'crashed (código 139)'])
})

test('Automático não vigia a GPU nem reverte nada', async () => {
  const { app, session, userDataPath, webContents } = setup({ preference: 'auto', featureStatus: { gpu_compositing: 'disabled_software' } })
  webContents.emit('did-finish-load')
  app.emit('child-process-gone', {}, { type: 'GPU', reason: 'crashed' })
  await flush()
  assert.equal((await session.describe()).sessionOutcome, 'not-guarded')
  assert.equal(readGpuPreferenceState(userDataPath).fallback, null)
})

test('descreve preferência salva, aplicada e as placas, e salva pela IPC com validação', async () => {
  const { handlers, session } = setup()
  const status = await session.describe()
  assert.equal(status.preference, 'dedicada')
  assert.equal(status.applied, 'dedicada')
  assert.equal(status.multipleGpus, true)
  assert.deepEqual(status.devices, [
    { vendorId: 0x10de, deviceId: 0x134f },
    { vendorId: 0x8086, deviceId: 0x1916 },
  ])

  const saved = await handlers.get('graphics:set-gpu-preference')({}, 'integrada')
  assert.deepEqual([saved.ok, saved.preference, saved.requiresRestart], [true, 'integrada', true])
  const refused = await handlers.get('graphics:set-gpu-preference')({}, 'turbo')
  assert.equal(refused.ok, false)
  assert.match(refused.message, /Placa de vídeo inválida/)
  assert.equal((await session.describe()).preference, 'integrada')
  assert.equal((await session.describe()).applied, 'dedicada')
})

test('aviso reconhecido pela IPC some do estado', async () => {
  const { handlers, session, webContents } = setup({ featureStatus: { gpu_compositing: 'disabled_software' } })
  webContents.emit('did-finish-load')
  await flush()
  assert.ok((await session.describe()).fallback)
  await handlers.get('graphics:acknowledge-gpu-fallback')({})
  assert.equal((await session.describe()).fallback, null)
})

test('uma placa só não mostra a escolha', async () => {
  const { session } = setup({ gpuInfo: { gpuDevice: [{ vendorId: 0x106b, deviceId: 0 }] } })
  assert.equal((await session.describe()).multipleGpus, false)
})

test('Windows com uma placa e o WARP que o sistema sempre lista não mostra a escolha', async () => {
  // Formato do Windows 8+: o "Microsoft Basic Render Driver" (0x1414:0x8c)
  // entra no gpuDevice ao lado da placa real, e às vezes uma NPU também.
  const gpuDevice = [
    { vendorId: 0x8086, deviceId: 0x3e9b, gpuPreference: 0 },
    { vendorId: 0x1414, deviceId: 0x8c, gpuPreference: 0 },
    { vendorId: 0x8086, deviceId: 0x7d1d, gpuPreference: 0 },
  ]
  const { session } = setup({ platformName: 'win32', gpuInfo: { gpuDevice } })
  const status = await session.describe()
  assert.equal(status.multipleGpus, false)
  assert.equal(status.devices.some((device) => device.vendorId === 0x1414), false)
})

test('Windows com integrada e dedicada marcadas pelo Chromium mostra a escolha', async () => {
  const gpuDevice = [
    { vendorId: 0x10de, deviceId: 0x1f91, gpuPreference: 3 },
    { vendorId: 0x8086, deviceId: 0x3e9b, gpuPreference: 2 },
    { vendorId: 0x1414, deviceId: 0x8c, gpuPreference: 0 },
  ]
  const { session } = setup({ platformName: 'win32', gpuInfo: { gpuDevice } })
  const status = await session.describe()
  assert.equal(status.multipleGpus, true)
  assert.deepEqual(status.devices, [
    { vendorId: 0x10de, deviceId: 0x1f91 },
    { vendorId: 0x8086, deviceId: 0x3e9b },
  ])
})

test('macOS com NVIDIA descreve a Dedicada como indisponível, sem esconder a escolha', async () => {
  const gpuDevice = [
    { vendorId: 0x8086, deviceId: 0x3e9b, gpuPreference: 2 },
    { vendorId: 0x10de, deviceId: 0x1f91, gpuPreference: 3 },
  ]
  const { session } = setup({ platformName: 'darwin', preference: 'auto', gpuInfo: { gpuDevice } })
  const status = await session.describe()
  assert.equal(status.multipleGpus, true)
  assert.deepEqual(status.unavailablePreferences, { dedicada: 'macos-nvidia-forced-low-power' })
})

test('sem a lista de placas (getGPUInfo recusado) nada fica indisponível por placa', async () => {
  const { app, session } = setup({ preference: 'auto' })
  app.getGPUInfo = async () => {
    throw new Error('GPU access not allowed')
  }
  const status = await session.describe()
  assert.deepEqual([status.multipleGpus, status.unavailablePreferences], [false, {}])
})

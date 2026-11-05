'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const { persistGpuPreference, readGpuPreferenceState } = require('./gpu-preference.cjs')
const { startGpuPreference } = require('./gpu-launch.cjs')

/** O que o `prime-run` (ou o "abrir com a placa dedicada") deixa no ambiente. */
const PRIME_RUN_ENV = Object.freeze({
  __NV_PRIME_RENDER_OFFLOAD: '1',
  __GLX_VENDOR_LIBRARY_NAME: 'nvidia',
  __VK_LAYER_NV_optimus: 'NVIDIA_only',
})
const clock = () => '2026-09-26T12:00:00.000Z'

const profiles = []
test.after(() => {
  for (const profile of profiles) fs.rmSync(profile, { recursive: true, force: true })
})

function profileWith(preference) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-gpu-launch-'))
  profiles.push(profile)
  if (preference) persistGpuPreference({ userDataPath: profile, preference })
  return profile
}

/**
 * O `app.exit()` do Electron encerra o processo na hora: nada depois dele roda.
 * O falso lança isto para o teste enxergar o que ficaria sem rodar (um `exit`
 * que só registra deixa passar uma gravação posta depois dele).
 */
class AppExit extends Error {
  constructor(code) {
    super(`app.exit(${code})`)
    this.code = code
  }
}

/** `app` do Electron só com o que o início da GPU usa, registrando a ordem das chamadas. */
function fakeApp(events) {
  const switches = new Map()
  return {
    isPackaged: true,
    switches,
    commandLine: {
      appendSwitch(name, value) {
        switches.set(name, value)
        events.push(`switch --${name}`)
      },
      getSwitchValue: (name) => switches.get(name) ?? '',
    },
    exit(code) {
      events.push(`exit ${code}`)
      throw new AppExit(code)
    },
    relaunch() {
      throw new Error('o app.relaunch() real não pode ser chamado no teste')
    },
    releaseSingleInstanceLock() {
      events.push('release-lock')
    },
    requestSingleInstanceLock() {
      events.push('request-lock')
      return this.lockAvailable ?? true
    },
  }
}

function start({ preference, environment, relaunchResult = { ok: true, method: 'appimage', detail: null }, lockAvailable, ...rest }) {
  const events = []
  const app = fakeApp(events)
  app.lockAvailable = lockAvailable
  const userDataPath = profileWith(preference)
  const relaunchCalls = []
  // `result` é `null` quando o processo saiu: o `exit` real não devolve nada.
  let result = null
  let exited = false
  try {
    result = startGpuPreference({
      app,
      userDataPath,
      environment,
      platformName: 'linux',
      now: clock,
      relaunch: ({ environment: childEnvironment }) => {
        // O ambiente como estava no instante do relançamento.
        relaunchCalls.push({ ...childEnvironment })
        events.push('relaunch')
        return relaunchResult
      },
      ...rest,
    })
  } catch (error) {
    if (!(error instanceof AppExit)) throw error
    exited = true
  }
  return { app, events, exited, relaunchCalls, result, userDataPath }
}

test('Integrada com o prime-run: o ambiente é limpo e marcado ANTES de relançar, e o processo sai', () => {
  const environment = { ...PRIME_RUN_ENV, HOME: '/home/pessoa' }
  const { events, exited, relaunchCalls } = start({ preference: 'integrada', environment })

  assert.equal(exited, true)
  assert.deepEqual(events, ['release-lock', 'relaunch', 'exit 0'])
  assert.deepEqual(relaunchCalls, [{ HOME: '/home/pessoa', FELIXO_GPU_ENV_SANITIZED: '1' }])
  // As variáveis do prime-run saíram do ambiente deste processo, antes de relançar.
  assert.deepEqual(environment, { HOME: '/home/pessoa', FELIXO_GPU_ENV_SANITIZED: '1' })
})

test('o pid do relançado vai para o pedido antes de o processo sair', () => {
  const environment = { ...PRIME_RUN_ENV }
  const { events, exited, userDataPath } = start({
    preference: 'integrada',
    environment,
    relaunchResult: { ok: true, method: 'appimage', detail: null, pid: 4242 },
  })
  assert.equal(exited, true)
  assert.deepEqual(events, ['release-lock', 'relaunch', 'exit 0'])
  // O `exit` real encerra o processo na hora: o pid tem de estar gravado ANTES dele.
  // Uma abertura enquanto ele nasce reconhece o relançamento em andamento por ele.
  assert.deepEqual(readGpuPreferenceState(userDataPath).pendingRelaunch, {
    preference: 'integrada',
    startedAt: clock(),
    pid: 4242,
  })
})

test('fora do relançamento a marca sai do process.env: terminais e apps abertos pelo Felixo não a herdam', () => {
  // O processo relançado nasce com a marca; depois de decidir, ela sai.
  const relaunched = { FELIXO_GPU_ENV_SANITIZED: '1', HOME: '/home/pessoa' }
  const child = start({ preference: 'integrada', environment: relaunched })
  assert.equal(child.result.exiting, false)
  assert.equal(child.result.gpuStart.applied, 'integrada')
  assert.deepEqual(relaunched, { HOME: '/home/pessoa' })
  assert.deepEqual(child.relaunchCalls, [])

  // Automático e Dedicada também.
  const auto = { FELIXO_GPU_ENV_SANITIZED: '1' }
  start({ environment: auto })
  assert.deepEqual(auto, {})

  const dedicada = { FELIXO_GPU_ENV_SANITIZED: '1' }
  const dedicated = start({ preference: 'dedicada', environment: dedicada })
  assert.deepEqual(dedicada, {})
  assert.equal(dedicated.app.switches.get('use-angle'), 'vulkan')
  assert.deepEqual(dedicated.events.filter((event) => event === 'relaunch' || event.startsWith('exit')), [])
})

test('o relançado apaga o APPIMAGE_EXTRACT_AND_RUN que o relançamento pôs: terminais abertos por ele não o herdam', () => {
  const relaunched = {
    FELIXO_GPU_ENV_SANITIZED: '1',
    FELIXO_APPIMAGE_EXTRACT_AND_RUN_ADDED: '1',
    APPIMAGE_EXTRACT_AND_RUN: '1',
    HOME: '/home/pessoa',
  }
  const child = start({ preference: 'integrada', environment: relaunched })
  assert.equal(child.exited, false)
  assert.deepEqual(relaunched, { HOME: '/home/pessoa' })

  // A que a pessoa já tinha (sem a marca) continua no ambiente.
  const owned = { FELIXO_GPU_ENV_SANITIZED: '1', APPIMAGE_EXTRACT_AND_RUN: '1' }
  start({ environment: owned })
  assert.deepEqual(owned, { APPIMAGE_EXTRACT_AND_RUN: '1' })
})

test('relançamento recusado: não sai, apaga a marca e segue no Automático com o motivo', () => {
  const environment = { ...PRIME_RUN_ENV }
  const { events, result, userDataPath } = start({
    preference: 'integrada',
    environment,
    relaunchResult: { ok: false, method: 'appimage', detail: 'o Felixo.AppImage não abriu' },
  })

  assert.equal(result.exiting, false)
  assert.deepEqual(events, ['release-lock', 'relaunch', 'request-lock'])
  // Este processo segue aberto no Automático: os terminais e CLIs abertos por
  // ele herdam o ambiente com que a pessoa abriu o app, sem a marca.
  assert.deepEqual(environment, { ...PRIME_RUN_ENV })
  assert.deepEqual(result.gpuLaunch.unsetEnv, [])
  assert.deepEqual(result.gpuLaunch.restoredEnv, Object.keys(PRIME_RUN_ENV))
  assert.equal(result.gpuStart.applied, 'auto')
  assert.equal(result.gpuStart.relaunchFailure, 'appimage: o Felixo.AppImage não abriu')
  assert.equal(readGpuPreferenceState(userDataPath).fallback.reason, 'relaunch-failed')
})

test('relançamento recusado e a trava já é de outra abertura: este processo sai e ela fica', () => {
  const { events, exited } = start({
    preference: 'integrada',
    environment: { ...PRIME_RUN_ENV },
    relaunchResult: { ok: false, method: 'appimage', detail: 'o Felixo.AppImage não abriu' },
    lockAvailable: false,
  })
  assert.equal(exited, true)
  assert.deepEqual(events, ['release-lock', 'relaunch', 'request-lock', 'exit 0'])
})

test('release smoke (sem perfil) não grava nada nem relança, mesmo com o prime-run', () => {
  const environment = { ...PRIME_RUN_ENV }
  const events = []
  const result = startGpuPreference({ app: fakeApp(events), userDataPath: '', environment, platformName: 'linux' })
  assert.equal(result.exiting, false)
  assert.equal(result.gpuStart.applied, 'auto')
  assert.deepEqual(events, [])
  assert.deepEqual(environment, { ...PRIME_RUN_ENV })
})

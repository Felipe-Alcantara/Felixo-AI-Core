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
    },
    relaunch() {
      throw new Error('o app.relaunch() real não pode ser chamado no teste')
    },
  }
}

function start({ preference, environment, relaunchResult = { ok: true, method: 'appimage', detail: null }, ...rest }) {
  const events = []
  const app = fakeApp(events)
  const userDataPath = profileWith(preference)
  const relaunchCalls = []
  const result = startGpuPreference({
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
  return { app, events, relaunchCalls, result, userDataPath }
}

test('Integrada com o prime-run: o ambiente é limpo e marcado ANTES de relançar, e o processo sai', () => {
  const environment = { ...PRIME_RUN_ENV, HOME: '/home/pessoa' }
  const { events, relaunchCalls, result } = start({ preference: 'integrada', environment })

  assert.equal(result.exiting, true)
  assert.deepEqual(events, ['relaunch', 'exit 0'])
  assert.deepEqual(relaunchCalls, [{ HOME: '/home/pessoa', FELIXO_GPU_ENV_SANITIZED: '1' }])
  assert.deepEqual(result.gpuLaunch.unsetEnv, Object.keys(PRIME_RUN_ENV))
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

test('relançamento recusado: não sai, apaga a marca e segue no Automático com o motivo', () => {
  const environment = { ...PRIME_RUN_ENV }
  const { events, result, userDataPath } = start({
    preference: 'integrada',
    environment,
    relaunchResult: { ok: false, method: 'appimage', detail: 'o Felixo.AppImage não abriu' },
  })

  assert.equal(result.exiting, false)
  assert.deepEqual(events, ['relaunch'])
  // Este processo segue aberto no Automático: os terminais e CLIs abertos por
  // ele herdam o ambiente com que a pessoa abriu o app, sem a marca.
  assert.deepEqual(environment, { ...PRIME_RUN_ENV })
  assert.deepEqual(result.gpuLaunch.unsetEnv, [])
  assert.deepEqual(result.gpuLaunch.restoredEnv, Object.keys(PRIME_RUN_ENV))
  assert.equal(result.gpuStart.applied, 'auto')
  assert.equal(result.gpuStart.relaunchFailure, 'appimage: o Felixo.AppImage não abriu')
  assert.equal(readGpuPreferenceState(userDataPath).fallback.reason, 'relaunch-failed')
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

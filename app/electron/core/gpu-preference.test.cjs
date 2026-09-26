'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const {
  GPU_ENV_SANITIZED_FLAG,
  GPU_PREFERENCE_FILE,
  acknowledgeGpuFallback,
  applyGpuLaunchPlan,
  buildGpuLaunchPlan,
  describeGpuPreferenceSupport,
  listDedicatedGpuForcingEnv,
  normalizeGpuPreference,
  persistGpuPreference,
  readGpuPreferenceState,
  writeGpuPreferenceState,
} = require('./gpu-preference.cjs')

/** O que o `prime-run` e o "abrir com a placa dedicada" do desktop exportam. */
const PRIME_RUN_ENV = Object.freeze({
  __NV_PRIME_RENDER_OFFLOAD: '1',
  __GLX_VENDOR_LIBRARY_NAME: 'nvidia',
  __VK_LAYER_NV_optimus: 'NVIDIA_only',
})

const profiles = []
test.after(() => {
  for (const profile of profiles) fs.rmSync(profile, { recursive: true, force: true })
})

function tempProfile() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-gpu-preference-'))
  profiles.push(profile)
  return profile
}

function fakeCommandLine(initial = {}) {
  const switches = new Map(Object.entries(initial))
  const calls = []
  return {
    calls,
    switches,
    appendSwitch(name, value) {
      calls.push(value === undefined ? [name] : [name, value])
      switches.set(name, value ?? '')
    },
    getSwitchValue(name) {
      return switches.get(name) ?? ''
    },
  }
}

test('aceita só auto, integrada e dedicada, sem diferenciar caixa', () => {
  assert.equal(normalizeGpuPreference(' Dedicada '), 'dedicada')
  assert.equal(normalizeGpuPreference('integrada'), 'integrada')
  assert.equal(normalizeGpuPreference('auto'), 'auto')
  assert.equal(normalizeGpuPreference('hardware'), null)
  assert.equal(normalizeGpuPreference(1), null)
  assert.equal(normalizeGpuPreference(null), null)
})

test('Linux, Windows e macOS têm mecanismo; outros sistemas ficam indisponíveis com motivo', () => {
  assert.equal(describeGpuPreferenceSupport('linux').mechanism, 'angle-vulkan')
  assert.equal(describeGpuPreferenceSupport('win32').mechanism, 'chromium-gpu-switch')
  assert.equal(describeGpuPreferenceSupport('darwin').mechanism, 'chromium-gpu-switch')
  const freebsd = describeGpuPreferenceSupport('freebsd')
  assert.equal(freebsd.supported, false)
  assert.match(freebsd.reason, /não tem um jeito confiável/)
})

test('Automático não aplica nada em nenhum sistema', () => {
  for (const platformName of ['linux', 'win32', 'darwin']) {
    const plan = buildGpuLaunchPlan({ preference: 'auto', platformName, environment: { ...PRIME_RUN_ENV } })
    assert.deepEqual(plan.switches, [])
    assert.deepEqual(plan.enableFeatures, [])
    assert.deepEqual(plan.unsetEnv, [])
    assert.equal(plan.relaunch, false)
  }
})

test('Dedicada no Linux liga o ANGLE sobre Vulkan e não mexe no ambiente', () => {
  const plan = buildGpuLaunchPlan({ preference: 'dedicada', platformName: 'linux', environment: {} })
  assert.deepEqual(plan.switches, [{ name: 'use-angle', value: 'vulkan' }])
  assert.deepEqual(plan.enableFeatures, ['Vulkan', 'VulkanFromANGLE', 'DefaultANGLEVulkan'])
  assert.equal(plan.expectVulkan, true)
  // Medido: o processo de GPU nasce do zygote, criado antes do main.cjs, e não
  // herda o que o main grava em process.env. Gravar só vazaria para os
  // terminais abertos pelo app.
  assert.deepEqual(plan.setEnv, {})
  assert.deepEqual(plan.unsetEnv, [])
  assert.equal(plan.relaunch, false)
})

test('Integrada no Linux sem variáveis forçando a dedicada é o GL padrão, sem mudança', () => {
  const plan = buildGpuLaunchPlan({ preference: 'integrada', platformName: 'linux', environment: { PATH: '/usr/bin' } })
  assert.deepEqual(plan.switches, [])
  assert.deepEqual(plan.unsetEnv, [])
  assert.equal(plan.relaunch, false)
})

test('Integrada no Linux com as variáveis do prime-run limpa o ambiente e relança uma vez', () => {
  const plan = buildGpuLaunchPlan({ preference: 'integrada', platformName: 'linux', environment: { ...PRIME_RUN_ENV } })
  assert.deepEqual(plan.unsetEnv, ['__NV_PRIME_RENDER_OFFLOAD', '__GLX_VENDOR_LIBRARY_NAME', '__VK_LAYER_NV_optimus'])
  assert.deepEqual(plan.setEnv, { [GPU_ENV_SANITIZED_FLAG]: '1' })
  assert.equal(plan.relaunch, true)
})

test('o processo já relançado nunca relança de novo, mesmo se o ambiente voltar sujo', () => {
  const plan = buildGpuLaunchPlan({
    preference: 'integrada',
    platformName: 'linux',
    environment: { ...PRIME_RUN_ENV, [GPU_ENV_SANITIZED_FLAG]: '1' },
  })
  assert.equal(plan.relaunch, false)
  assert.deepEqual(plan.notes, ['forcing-env-after-relaunch'])
})

test('com o dev server do Vite o relançamento é pulado e fica anotado', () => {
  const plan = buildGpuLaunchPlan({
    preference: 'integrada',
    platformName: 'linux',
    environment: { ...PRIME_RUN_ENV },
    isDevelopment: true,
  })
  assert.equal(plan.relaunch, false)
  assert.deepEqual(plan.notes, ['relaunch-skipped-in-development'])
})

test('Windows e macOS usam os workarounds de GPU do Chromium', () => {
  for (const platformName of ['win32', 'darwin']) {
    assert.deepEqual(
      buildGpuLaunchPlan({ preference: 'dedicada', platformName }).switches,
      [{ name: 'force_high_performance_gpu' }],
    )
    assert.deepEqual(
      buildGpuLaunchPlan({ preference: 'integrada', platformName }).switches,
      [{ name: 'force_low_power_gpu' }],
    )
  }
})

test('sistema sem mecanismo não recebe plano', () => {
  const plan = buildGpuLaunchPlan({ preference: 'dedicada', platformName: 'freebsd' })
  assert.deepEqual(plan.switches, [])
  assert.equal(plan.relaunch, false)
})

test('só conta como forçando a dedicada o valor que realmente força', () => {
  assert.deepEqual(listDedicatedGpuForcingEnv({ ...PRIME_RUN_ENV }), [
    '__NV_PRIME_RENDER_OFFLOAD',
    '__GLX_VENDOR_LIBRARY_NAME',
    '__VK_LAYER_NV_optimus',
  ])
  assert.deepEqual(
    listDedicatedGpuForcingEnv({
      __NV_PRIME_RENDER_OFFLOAD: '0',
      __GLX_VENDOR_LIBRARY_NAME: 'mesa',
      __VK_LAYER_NV_optimus: 'non_NVIDIA_only',
      DRI_PRIME: '0',
    }),
    [],
  )
  assert.deepEqual(
    listDedicatedGpuForcingEnv({
      DRI_PRIME: '1',
      __EGL_VENDOR_LIBRARY_FILENAMES: '/usr/share/glvnd/egl_vendor.d/10_nvidia.json',
      __NV_PRIME_RENDER_OFFLOAD_PROVIDER: 'NVIDIA-G0',
    }),
    ['__NV_PRIME_RENDER_OFFLOAD_PROVIDER', '__EGL_VENDOR_LIBRARY_FILENAMES', 'DRI_PRIME'],
  )
})

test('aplica os switches e mescla --enable-features com o que já veio na linha de comando', () => {
  const commandLine = fakeCommandLine({ 'enable-features': 'MinhaFeature,Vulkan' })
  const plan = buildGpuLaunchPlan({ preference: 'dedicada', platformName: 'linux' })
  const applied = applyGpuLaunchPlan(plan, { commandLine, environment: {} })

  assert.deepEqual(commandLine.calls, [
    ['use-angle', 'vulkan'],
    ['enable-features', 'MinhaFeature,Vulkan,VulkanFromANGLE,DefaultANGLEVulkan'],
  ])
  assert.deepEqual(applied.switches, [
    '--use-angle=vulkan',
    '--enable-features=MinhaFeature,Vulkan,VulkanFromANGLE,DefaultANGLEVulkan',
  ])
})

test('aplica switch sem valor e limpa só as variáveis presentes', () => {
  const commandLine = fakeCommandLine()
  const windowsPlan = buildGpuLaunchPlan({ preference: 'dedicada', platformName: 'win32' })
  assert.deepEqual(applyGpuLaunchPlan(windowsPlan, { commandLine, environment: {} }).switches, [
    '--force_high_performance_gpu',
  ])
  assert.deepEqual(commandLine.calls, [['force_high_performance_gpu']])

  const environment = { __NV_PRIME_RENDER_OFFLOAD: '1', PATH: '/usr/bin' }
  const linuxPlan = buildGpuLaunchPlan({ preference: 'integrada', platformName: 'linux', environment })
  const applied = applyGpuLaunchPlan(linuxPlan, { commandLine: fakeCommandLine(), environment })
  assert.deepEqual(applied.unsetEnv, ['__NV_PRIME_RENDER_OFFLOAD'])
  assert.deepEqual(environment, { PATH: '/usr/bin', [GPU_ENV_SANITIZED_FLAG]: '1' })
})

test('perfil sem arquivo, corrompido ou com valor desconhecido lê Automático', () => {
  const profile = tempProfile()
  assert.deepEqual(readGpuPreferenceState(profile), { preference: 'auto', pendingStart: null, pendingRelaunch: null, fallback: null })

  fs.writeFileSync(path.join(profile, GPU_PREFERENCE_FILE), '{ corrompido')
  assert.equal(readGpuPreferenceState(profile).preference, 'auto')

  fs.writeFileSync(
    path.join(profile, GPU_PREFERENCE_FILE),
    JSON.stringify({
      preference: 'turbo',
      pendingStart: { preference: 'auto' },
      pendingRelaunch: { preference: 'turbo' },
      fallback: { from: 'dedicada', reason: 'x' },
    }),
  )
  assert.deepEqual(readGpuPreferenceState(profile), { preference: 'auto', pendingStart: null, pendingRelaunch: null, fallback: null })
  assert.equal(readGpuPreferenceState('').preference, 'auto')
})

test('salvar a preferência valida, resolve o aviso e preserva o marcador da sessão', () => {
  const profile = tempProfile()
  writeGpuPreferenceState(profile, {
    preference: 'auto',
    pendingStart: { preference: 'dedicada', startedAt: '2026-09-26T10:00:00.000Z' },
    pendingRelaunch: { preference: 'integrada', startedAt: '2026-09-26T09:00:00.000Z' },
    fallback: { from: 'dedicada', reason: 'gpu-disabled', at: '2026-09-26T10:00:05.000Z' },
  })

  const saved = persistGpuPreference({ userDataPath: profile, preference: 'Integrada' })
  assert.equal(saved.preference, 'integrada')
  assert.equal(saved.fallback, null)
  assert.deepEqual(saved.pendingStart, { preference: 'dedicada', startedAt: '2026-09-26T10:00:00.000Z' })
  assert.deepEqual(saved.pendingRelaunch, { preference: 'integrada', startedAt: '2026-09-26T09:00:00.000Z' })
  assert.throws(() => persistGpuPreference({ userDataPath: profile, preference: 'hardware' }), /Placa de vídeo inválida/)
  assert.throws(() => persistGpuPreference({ userDataPath: '', preference: 'auto' }), /Pasta de dados/)
  assert.equal(fs.existsSync(path.join(profile, `${GPU_PREFERENCE_FILE}.tmp`)), false)
})

test('reconhecer o aviso de volta automática apaga só o aviso', () => {
  const profile = tempProfile()
  writeGpuPreferenceState(profile, {
    preference: 'auto',
    fallback: { from: 'dedicada', reason: 'previous-start-unfinished', at: '2026-09-26T10:00:05.000Z' },
  })
  const state = acknowledgeGpuFallback({ userDataPath: profile })
  assert.deepEqual(state, { preference: 'auto', pendingStart: null, pendingRelaunch: null, fallback: null })
})

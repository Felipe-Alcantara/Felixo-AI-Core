'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const { GPU_PREFERENCE_FILE, persistGpuPreference, readGpuPreferenceState } = require('./gpu-preference.cjs')
const {
  confirmGpuStart,
  evaluateGpuStartHealth,
  prepareGpuStart,
  revertGpuPreference,
} = require('./gpu-start-guard.cjs')

const HEALTHY_VULKAN = Object.freeze({ gpu_compositing: 'enabled', vulkan: 'enabled_on' })
const clock = () => '2026-09-26T12:00:00.000Z'

const profiles = []
test.after(() => {
  for (const profile of profiles) fs.rmSync(profile, { recursive: true, force: true })
})

function tempProfile() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-gpu-guard-'))
  profiles.push(profile)
  return profile
}

function profileWith(preference) {
  const profile = tempProfile()
  persistGpuPreference({ userDataPath: profile, preference })
  return profile
}

function prepare(profile, overrides = {}) {
  return prepareGpuStart({
    userDataPath: profile,
    platformName: 'linux',
    environment: {},
    now: clock,
    ...overrides,
  })
}

test('Automático não grava marcador nem cria arquivo', () => {
  const profile = tempProfile()
  const start = prepare(profile)
  assert.equal(start.applied, 'auto')
  assert.equal(start.guarded, false)
  assert.equal(start.plan, null)
  assert.equal(fs.existsSync(path.join(profile, GPU_PREFERENCE_FILE)), false)
})

test('Dedicada grava o marcador de início pendente antes de aplicar', () => {
  const profile = profileWith('dedicada')
  const start = prepare(profile)
  assert.equal(start.applied, 'dedicada')
  assert.equal(start.guarded, true)
  assert.equal(start.plan.expectVulkan, true)
  assert.deepEqual(readGpuPreferenceState(profile).pendingStart, {
    preference: 'dedicada',
    startedAt: clock(),
  })
})

test('início anterior com dedicada que não terminou volta para Automático antes de aplicar', () => {
  const profile = profileWith('dedicada')
  prepare(profile) // início que travou: ninguém confirmou a GPU

  const next = prepare(profile)
  assert.equal(next.requested, 'auto')
  assert.equal(next.applied, 'auto')
  assert.equal(next.plan, null)
  assert.equal(next.revertedFromPreviousStart.reason, 'previous-start-unfinished')
  const state = readGpuPreferenceState(profile)
  assert.equal(state.preference, 'auto')
  assert.equal(state.pendingStart, null)
  assert.deepEqual(state.fallback, {
    from: 'dedicada',
    reason: 'previous-start-unfinished',
    at: clock(),
    detail: `início de ${clock()}`,
  })
})

test('a volta automática respeita uma escolha feita depois daquele início', () => {
  const profile = profileWith('dedicada')
  prepare(profile)
  persistGpuPreference({ userDataPath: profile, preference: 'integrada' })

  const next = prepare(profile, { platformName: 'win32' })
  assert.equal(next.requested, 'integrada')
  assert.equal(next.applied, 'integrada')
  assert.equal(readGpuPreferenceState(profile).fallback.from, 'dedicada')
})

test('com rasterização por software a preferência fica salva e não se aplica', () => {
  const profile = profileWith('dedicada')
  const start = prepare(profile, { softwareRendering: true })
  assert.equal(start.applied, 'auto')
  assert.equal(start.notApplied, 'software-rendering')
  assert.equal(readGpuPreferenceState(profile).pendingStart, null)
})

test('sistema sem mecanismo não aplica e diz o motivo', () => {
  const profile = profileWith('dedicada')
  const start = prepare(profile, { platformName: 'freebsd' })
  assert.equal(start.notApplied, 'unsupported-platform')
  assert.equal(readGpuPreferenceState(profile).pendingStart, null)
})

test('perfil sem escrita não aplica a escolha: sem marcador não há rede de segurança', () => {
  const profile = profileWith('dedicada')
  const readOnly = {
    ...fs,
    writeFileSync() {
      throw Object.assign(new Error('somente leitura'), { code: 'EROFS' })
    },
  }
  const start = prepare(profile, { fileSystem: readOnly })
  assert.equal(start.applied, 'auto')
  assert.equal(start.plan, null)
  assert.equal(start.notApplied, 'profile-unwritable')
})

test('Integrada com ambiente do prime-run pede relançamento sem gravar marcador', () => {
  const profile = profileWith('integrada')
  const start = prepare(profile, { environment: { __NV_PRIME_RENDER_OFFLOAD: '1' } })
  assert.equal(start.relaunch, true)
  assert.equal(start.guarded, false)
  assert.equal(readGpuPreferenceState(profile).pendingStart, null)
})

test('Integrada no Linux sem variáveis forçando não muda a GPU e não é guardada', () => {
  const profile = profileWith('integrada')
  const start = prepare(profile)
  assert.equal(start.applied, 'integrada')
  assert.equal(start.guarded, false)
  assert.equal(readGpuPreferenceState(profile).pendingStart, null)
})

test('Integrada no Windows muda a GPU e é guardada', () => {
  const profile = profileWith('integrada')
  const start = prepare(profile, { platformName: 'win32' })
  assert.equal(start.guarded, true)
  assert.equal(readGpuPreferenceState(profile).pendingStart.preference, 'integrada')
})

test('veredito da GPU: compositing desligado ou Vulkan ausente na dedicada são falha', () => {
  assert.deepEqual(evaluateGpuStartHealth({ featureStatus: { gpu_compositing: 'enabled' } }), {
    healthy: true,
    reason: null,
    detail: null,
  })
  assert.deepEqual(evaluateGpuStartHealth({ featureStatus: { gpu_compositing: 'disabled_software' } }), {
    healthy: false,
    reason: 'gpu-disabled',
    detail: 'gpu_compositing=disabled_software',
  })
  assert.equal(
    evaluateGpuStartHealth({ featureStatus: { gpu_compositing: 'enabled', vulkan: 'disabled_off' }, expectVulkan: true }).reason,
    'vulkan-unavailable',
  )
  assert.equal(evaluateGpuStartHealth({ featureStatus: HEALTHY_VULKAN, expectVulkan: true }).healthy, true)
  assert.equal(evaluateGpuStartHealth({ featureStatus: null }).healthy, null)
  assert.equal(evaluateGpuStartHealth({ featureStatus: {} }).reason, 'gpu-disabled')
})

test('GPU saudável apaga o marcador e mantém a Dedicada', () => {
  const profile = profileWith('dedicada')
  prepare(profile)
  const outcome = confirmGpuStart({
    userDataPath: profile,
    appliedPreference: 'dedicada',
    featureStatus: HEALTHY_VULKAN,
    expectVulkan: true,
    now: clock,
  })
  assert.equal(outcome.status, 'healthy')
  assert.deepEqual(readGpuPreferenceState(profile), { preference: 'dedicada', pendingStart: null, fallback: null })

  // O início seguinte aplica de novo, sem volta automática.
  assert.equal(prepare(profile).applied, 'dedicada')
})

test('GPU que subiu desligada nesta sessão volta para Automático no próximo início', () => {
  const profile = profileWith('dedicada')
  prepare(profile)
  const outcome = confirmGpuStart({
    userDataPath: profile,
    appliedPreference: 'dedicada',
    featureStatus: { gpu_compositing: 'disabled_software', vulkan: 'disabled_off' },
    expectVulkan: true,
    now: clock,
  })
  assert.equal(outcome.status, 'reverted')
  const state = readGpuPreferenceState(profile)
  assert.equal(state.preference, 'auto')
  assert.equal(state.pendingStart, null)
  assert.equal(state.fallback.reason, 'gpu-disabled')
  assert.equal(prepare(profile).applied, 'auto')
})

test('sem como avaliar a GPU o marcador fica, e o próximo início trata como não confirmado', () => {
  const profile = profileWith('dedicada')
  prepare(profile)
  const outcome = confirmGpuStart({ userDataPath: profile, appliedPreference: 'dedicada', featureStatus: undefined })
  assert.equal(outcome.status, 'unknown')
  assert.equal(readGpuPreferenceState(profile).pendingStart.preference, 'dedicada')
})

test('queda do processo de GPU depois do início também volta para Automático', () => {
  const profile = profileWith('dedicada')
  prepare(profile)
  confirmGpuStart({ userDataPath: profile, appliedPreference: 'dedicada', featureStatus: HEALTHY_VULKAN, expectVulkan: true })

  const outcome = revertGpuPreference({
    userDataPath: profile,
    failedPreference: 'dedicada',
    reason: 'gpu-process-gone',
    detail: 'crashed',
    now: clock,
  })
  assert.equal(outcome.state.preference, 'auto')
  assert.deepEqual(outcome.state.fallback, { from: 'dedicada', reason: 'gpu-process-gone', at: clock(), detail: 'crashed' })
})

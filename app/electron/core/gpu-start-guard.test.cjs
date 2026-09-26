'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const { GPU_PREFERENCE_FILE, persistGpuPreference, readGpuPreferenceState } = require('./gpu-preference.cjs')
const {
  RELAUNCH_GRACE_MS,
  abandonGpuRelaunch,
  confirmGpuStart,
  evaluateGpuStartHealth,
  prepareGpuStart,
  recordGpuRelaunchChild,
  revertGpuPreference,
} = require('./gpu-start-guard.cjs')

const HEALTHY_VULKAN = Object.freeze({ gpu_compositing: 'enabled', vulkan: 'enabled_on' })
/** O que o `prime-run` (ou o "abrir com a placa dedicada") deixa no ambiente. */
const PRIME_RUN_ENV = Object.freeze({
  __NV_PRIME_RENDER_OFFLOAD: '1',
  __GLX_VENDOR_LIBRARY_NAME: 'nvidia',
  __VK_LAYER_NV_optimus: 'NVIDIA_only',
})
const clock = () => '2026-09-26T12:00:00.000Z'
/** Relógio `ms` milissegundos depois de `clock`. */
const after = (ms) => () => new Date(Date.parse(clock()) + ms).toISOString()
const noProcessAlive = () => false

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
    isProcessAlive: noProcessAlive,
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

test('Integrada com ambiente do prime-run grava o pedido de relançamento antes de relançar', () => {
  const profile = profileWith('integrada')
  const start = prepare(profile, { environment: { ...PRIME_RUN_ENV } })
  assert.equal(start.relaunch, true)
  assert.equal(start.guarded, false)
  const state = readGpuPreferenceState(profile)
  assert.equal(state.pendingStart, null)
  assert.deepEqual(state.pendingRelaunch, { preference: 'integrada', startedAt: clock() })
})

test('relançado que nunca nasceu: passado o prazo, a abertura seguinte volta para Automático, avisa e não relança de novo', () => {
  // Medido em 26/09/2026: no AppImage o app.relaunch() antes do whenReady não
  // traz o app de volta, e cada abertura parte do mesmo ambiente, sem a marca.
  const profile = profileWith('integrada')
  assert.equal(prepare(profile, { environment: { ...PRIME_RUN_ENV } }).relaunch, true)

  const later = after(RELAUNCH_GRACE_MS + 1_000)
  const next = prepare(profile, { environment: { ...PRIME_RUN_ENV }, now: later })
  assert.equal(next.relaunch, false)
  assert.equal(next.requested, 'auto')
  assert.equal(next.applied, 'auto')
  assert.equal(next.revertedFromPreviousStart.reason, 'relaunch-failed')
  assert.deepEqual(readGpuPreferenceState(profile), {
    preference: 'auto',
    pendingStart: null,
    pendingRelaunch: null,
    fallback: { from: 'integrada', reason: 'relaunch-failed', at: later(), detail: `relançamento de ${clock()}` },
  })

  // Sem laço: a terceira abertura segue no Automático, sem relançar.
  const third = prepare(profile, { environment: { ...PRIME_RUN_ENV }, now: later })
  assert.equal(third.relaunch, false)
  assert.equal(third.applied, 'auto')
})

test('abertura durante o relançamento (relançado ainda nascendo) não reverte nem grava nada', () => {
  // A pessoa clica de novo no ícone enquanto o AppImage relançado ainda monta:
  // nenhuma janela apareceu, e essa abertura não tem a marca.
  const profile = profileWith('integrada')
  assert.equal(prepare(profile, { environment: { ...PRIME_RUN_ENV } }).relaunch, true)
  recordGpuRelaunchChild({ userDataPath: profile, pid: 4242 })
  const pending = readGpuPreferenceState(profile)
  assert.deepEqual(pending.pendingRelaunch, { preference: 'integrada', startedAt: clock(), pid: 4242 })

  const alive = (pid) => pid === 4242
  const second = prepare(profile, { environment: { ...PRIME_RUN_ENV }, now: after(2_000), isProcessAlive: alive })
  assert.equal(second.relaunch, false)
  assert.equal(second.requested, 'integrada')
  assert.equal(second.applied, 'auto')
  assert.equal(second.plan, null)
  assert.equal(second.notApplied, 'relaunch-in-progress')
  assert.equal(second.revertedFromPreviousStart, null)
  assert.deepEqual(readGpuPreferenceState(profile), pending)

  // O relançado nasce depois e assume o pedido, como sempre.
  const relaunched = prepare(profile, { environment: { FELIXO_GPU_ENV_SANITIZED: '1' }, now: after(3_000) })
  assert.equal(relaunched.applied, 'integrada')
  assert.deepEqual(readGpuPreferenceState(profile), { preference: 'integrada', pendingStart: null, pendingRelaunch: null, fallback: null })
})

test('relançamento em andamento: vale o prazo curto sem pid, e o pid vivo depois dele', () => {
  // Sem pid (app.relaunch() fora do AppImage não o devolve): só o prazo conta.
  const withoutPid = profileWith('integrada')
  prepare(withoutPid, { environment: { ...PRIME_RUN_ENV } })
  assert.equal(
    prepare(withoutPid, { environment: { ...PRIME_RUN_ENV }, now: after(RELAUNCH_GRACE_MS - 1_000) }).notApplied,
    'relaunch-in-progress',
  )
  assert.equal(readGpuPreferenceState(withoutPid).preference, 'integrada')

  // Com o pid do relançado ainda vivo, mesmo depois do prazo (AppImage lento).
  const slow = profileWith('integrada')
  prepare(slow, { environment: { ...PRIME_RUN_ENV } })
  recordGpuRelaunchChild({ userDataPath: slow, pid: 4242 })
  const later = prepare(slow, { environment: { ...PRIME_RUN_ENV }, now: after(90_000), isProcessAlive: () => true })
  assert.equal(later.notApplied, 'relaunch-in-progress')
  assert.equal(readGpuPreferenceState(slow).fallback, null)

  // Passado o prazo e com o pid morto, o relançado não nasceu: volta.
  const dead = prepare(slow, { environment: { ...PRIME_RUN_ENV }, now: after(90_000) })
  assert.equal(dead.revertedFromPreviousStart.reason, 'relaunch-failed')
  assert.equal(readGpuPreferenceState(slow).preference, 'auto')
})

test('um pid reaproveitado por outro processo não prende a escolha para sempre', () => {
  const profile = profileWith('integrada')
  prepare(profile, { environment: { ...PRIME_RUN_ENV } })
  recordGpuRelaunchChild({ userDataPath: profile, pid: 4242 })
  const muchLater = prepare(profile, { environment: { ...PRIME_RUN_ENV }, now: after(60 * 60_000), isProcessAlive: () => true })
  assert.equal(muchLater.revertedFromPreviousStart.reason, 'relaunch-failed')
})

test('o pid só é anotado num pedido que ainda existe', () => {
  const profile = profileWith('integrada')
  prepare(profile, { environment: { ...PRIME_RUN_ENV } })
  // O relançado já nasceu e apagou o pedido antes de o pai anotar o pid.
  prepare(profile, { environment: { FELIXO_GPU_ENV_SANITIZED: '1' } })
  assert.equal(recordGpuRelaunchChild({ userDataPath: profile, pid: 4242 }), false)
  assert.equal(readGpuPreferenceState(profile).pendingRelaunch, null)
  assert.equal(recordGpuRelaunchChild({ userDataPath: profile, pid: undefined }), false)
})

test('o processo relançado assume o pedido e o apaga; a próxima abertura relança de novo sem voltar', () => {
  const profile = profileWith('integrada')
  prepare(profile, { environment: { ...PRIME_RUN_ENV } })

  // O relançado nasce com o ambiente limpo e a marca.
  const relaunched = prepare(profile, { environment: { FELIXO_GPU_ENV_SANITIZED: '1' } })
  assert.equal(relaunched.relaunch, false)
  assert.equal(relaunched.applied, 'integrada')
  assert.equal(relaunched.revertedFromPreviousStart, null)
  assert.deepEqual(readGpuPreferenceState(profile), {
    preference: 'integrada',
    pendingStart: null,
    pendingRelaunch: null,
    fallback: null,
  })

  // Outra abertura pelo prime-run, dias depois: relança de novo, sem aviso.
  const again = prepare(profile, { environment: { ...PRIME_RUN_ENV } })
  assert.equal(again.relaunch, true)
  assert.equal(readGpuPreferenceState(profile).fallback, null)
})

test('relançamento recusado na hora: este processo segue no Automático e a escolha volta com aviso', () => {
  const profile = profileWith('integrada')
  const start = prepare(profile, { environment: { ...PRIME_RUN_ENV } })

  const abandoned = abandonGpuRelaunch({ userDataPath: profile, start, detail: 'o .AppImage não abriu', now: clock })
  assert.equal(abandoned.relaunch, false)
  assert.equal(abandoned.applied, 'auto')
  assert.equal(abandoned.relaunchFailure, 'o .AppImage não abriu')
  assert.ok(abandoned.plan.notes.includes('relaunch-failed'))
  assert.deepEqual(readGpuPreferenceState(profile), {
    preference: 'auto',
    pendingStart: null,
    pendingRelaunch: null,
    fallback: { from: 'integrada', reason: 'relaunch-failed', at: clock(), detail: 'o .AppImage não abriu' },
  })
  // A abertura seguinte não trata como relançamento perdido de novo.
  assert.equal(prepare(profile, { environment: { ...PRIME_RUN_ENV } }).revertedFromPreviousStart, null)
})

test('pedido de relançamento sem perfil gravável não relança: fica no Automático', () => {
  const profile = profileWith('integrada')
  const readOnly = {
    ...fs,
    writeFileSync() {
      throw Object.assign(new Error('somente leitura'), { code: 'EROFS' })
    },
  }
  const start = prepare(profile, { environment: { ...PRIME_RUN_ENV }, fileSystem: readOnly })
  assert.equal(start.relaunch, false)
  assert.equal(start.notApplied, 'profile-unwritable')
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
  assert.deepEqual(readGpuPreferenceState(profile), {
    preference: 'dedicada',
    pendingStart: null,
    pendingRelaunch: null,
    fallback: null,
  })

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

'use strict'

/**
 * @module gpu-start-guard
 * Rede de segurança da preferência de placa de vídeo.
 *
 * Escolher a GPU mexe em como o Chromium sobe, e a Dedicada é experimental:
 * medido em 26/09/2026, um caminho errado (o offload da NVIDIA pelo GLX)
 * derruba o GL do Chromium. Por isso todo início que muda a GPU grava antes
 * um marcador de "início pendente" e só o apaga quando o app ficou pronto,
 * a janela carregou e a GPU subiu ligada. Se o início anterior não chegou lá
 * (travou, caiu ou a GPU subiu desligada), o próximo volta para Automático
 * ANTES de aplicar qualquer coisa, e a interface avisa.
 */

const fs = require('node:fs')
const {
  buildGpuLaunchPlan,
  describeGpuPreferenceSupport,
  readGpuPreferenceState,
  writeGpuPreferenceState,
} = require('./gpu-preference.cjs')
const { isIncompatibleFeatureStatus } = require('./graphics-signal.cjs')

function defaultNow() {
  return new Date().toISOString()
}

function planChangesGpu(plan) {
  return Boolean(plan) && (plan.switches.length > 0 || plan.enableFeatures.length > 0)
}

/**
 * Decide a preferência deste início, antes de `app.whenReady()`.
 *
 * @param {object} options
 * @param {string} options.userDataPath
 * @param {string} [options.platformName]
 * @param {Record<string, string | undefined>} [options.environment]
 * @param {boolean} [options.softwareRendering] - Com `disable-gpu` não há GPU
 *   para escolher; a preferência fica salva e não se aplica.
 * @param {boolean} [options.isDevelopment]
 * @param {() => string} [options.now]
 * @param {typeof fs} [options.fileSystem]
 * @returns {{
 *   requested: 'auto' | 'integrada' | 'dedicada',
 *   applied: 'auto' | 'integrada' | 'dedicada',
 *   plan: ReturnType<typeof buildGpuLaunchPlan> | null,
 *   guarded: boolean,
 *   relaunch: boolean,
 *   notApplied: 'software-rendering' | 'unsupported-platform' | 'profile-unwritable' | null,
 *   revertedFromPreviousStart: object | null,
 * }}
 */
function prepareGpuStart(options = {}) {
  try {
    return decideGpuStart(options)
  } catch {
    // Sem conseguir gravar o marcador, aplicar a escolha seria tirar a rede
    // de segurança: este início fica no Automático.
    return {
      requested: 'auto',
      applied: 'auto',
      plan: null,
      guarded: false,
      relaunch: false,
      notApplied: 'profile-unwritable',
      revertedFromPreviousStart: null,
    }
  }
}

function decideGpuStart({
  userDataPath,
  platformName = process.platform,
  environment = process.env,
  softwareRendering = false,
  isDevelopment = false,
  now = defaultNow,
  fileSystem = fs,
} = {}) {
  let state = readGpuPreferenceState(userDataPath, fileSystem)
  let revertedFromPreviousStart = null

  if (state.pendingStart) {
    const failed = state.pendingStart.preference
    revertedFromPreviousStart = {
      from: failed,
      reason: 'previous-start-unfinished',
      at: now(),
      detail: state.pendingStart.startedAt ? `início de ${state.pendingStart.startedAt}` : null,
    }
    state = writeGpuPreferenceState(
      userDataPath,
      {
        // Uma escolha feita depois daquele início continua valendo.
        preference: state.preference === failed ? 'auto' : state.preference,
        pendingStart: null,
        fallback: revertedFromPreviousStart,
      },
      fileSystem,
    )
  }

  const requested = state.preference
  const result = {
    requested,
    applied: 'auto',
    plan: null,
    guarded: false,
    relaunch: false,
    notApplied: null,
    revertedFromPreviousStart,
  }
  if (requested === 'auto') return result
  if (softwareRendering) return { ...result, notApplied: 'software-rendering' }
  if (!describeGpuPreferenceSupport(platformName).supported) {
    return { ...result, notApplied: 'unsupported-platform' }
  }

  const plan = buildGpuLaunchPlan({ preference: requested, platformName, environment, isDevelopment })
  if (plan.relaunch) {
    // Sem marcador: quem decide de novo, e aplica, é o processo relançado.
    return { ...result, plan, relaunch: true }
  }

  const guarded = planChangesGpu(plan)
  if (guarded) {
    writeGpuPreferenceState(
      userDataPath,
      { ...state, pendingStart: { preference: requested, startedAt: now() } },
      fileSystem,
    )
  }
  return { ...result, applied: requested, plan, guarded }
}

/**
 * Veredito puro sobre a GPU desta sessão, a partir de
 * `app.getGPUFeatureStatus()`.
 *
 * - `gpu_compositing` desligado ou bloqueado: a GPU subiu desligada.
 * - Dedicada no Linux pede Vulkan; se o Chromium caiu para o GL, a janela
 *   voltou para a integrada sem dizer, e isso também é falha da escolha.
 *
 * @returns {{ healthy: boolean | null, reason: 'gpu-disabled' | 'vulkan-unavailable' | null, detail: string | null }}
 */
function evaluateGpuStartHealth({ featureStatus, expectVulkan = false } = {}) {
  if (!featureStatus || typeof featureStatus !== 'object' || Array.isArray(featureStatus)) {
    return { healthy: null, reason: null, detail: null }
  }
  const compositing = featureStatus.gpu_compositing
  if (typeof compositing !== 'string' || isIncompatibleFeatureStatus(compositing)) {
    return { healthy: false, reason: 'gpu-disabled', detail: `gpu_compositing=${compositing ?? 'ausente'}` }
  }
  if (expectVulkan) {
    const vulkan = featureStatus.vulkan
    if (typeof vulkan !== 'string' || !vulkan.trim().toLowerCase().startsWith('enabled')) {
      return { healthy: false, reason: 'vulkan-unavailable', detail: `vulkan=${vulkan ?? 'ausente'}` }
    }
  }
  return { healthy: true, reason: null, detail: null }
}

/**
 * Volta para Automático no próximo início e registra o aviso. Só troca a
 * preferência se ela ainda for a que falhou: uma escolha nova, feita nesta
 * sessão, é respeitada.
 */
function revertGpuPreference({
  userDataPath,
  failedPreference,
  reason,
  detail = null,
  now = defaultNow,
  fileSystem = fs,
} = {}) {
  const current = readGpuPreferenceState(userDataPath, fileSystem)
  const state = writeGpuPreferenceState(
    userDataPath,
    {
      preference: current.preference === failedPreference ? 'auto' : current.preference,
      pendingStart: null,
      fallback: { from: failedPreference, reason, at: now(), detail },
    },
    fileSystem,
  )
  return { status: 'reverted', state }
}

/**
 * Fecha o início guardado: com a GPU saudável, apaga o marcador; sem ela,
 * volta para Automático. Se não der para avaliar, deixa o marcador — o
 * próximo início trata como não confirmado, que é o lado seguro.
 */
function confirmGpuStart({
  userDataPath,
  appliedPreference,
  featureStatus,
  expectVulkan = false,
  now = defaultNow,
  fileSystem = fs,
} = {}) {
  const verdict = evaluateGpuStartHealth({ featureStatus, expectVulkan })
  if (verdict.healthy === null) return { status: 'unknown', verdict }
  if (!verdict.healthy) {
    return {
      ...revertGpuPreference({
        userDataPath,
        failedPreference: appliedPreference,
        reason: verdict.reason,
        detail: verdict.detail,
        now,
        fileSystem,
      }),
      verdict,
    }
  }
  const current = readGpuPreferenceState(userDataPath, fileSystem)
  const state = writeGpuPreferenceState(userDataPath, { ...current, pendingStart: null }, fileSystem)
  return { status: 'healthy', state, verdict }
}

module.exports = {
  confirmGpuStart,
  evaluateGpuStartHealth,
  prepareGpuStart,
  revertGpuPreference,
}

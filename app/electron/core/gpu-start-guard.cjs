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
 *
 * O relançamento com o ambiente limpo (Integrada no Linux com variáveis que
 * forçam a dedicada) tem a sua própria rede: antes de sair, o app grava
 * `pendingRelaunch`; o processo relançado, que nasce com
 * `FELIXO_GPU_ENV_SANITIZED=1`, o apaga. Uma abertura SEM essa marca que ainda
 * encontra o pedido sabe que o relançado nunca nasceu (medido em 26/09/2026:
 * no AppImage, o `app.relaunch()` antes do `whenReady` não traz o app de
 * volta) e volta para Automático em vez de relançar de novo.
 */

const fs = require('node:fs')
const {
  GPU_ENV_SANITIZED_FLAG,
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
 *   relaunchFailure: string | null,
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
      relaunchFailure: null,
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
        pendingRelaunch: state.pendingRelaunch,
        fallback: revertedFromPreviousStart,
      },
      fileSystem,
    )
  }

  if (state.pendingRelaunch) {
    if (environment[GPU_ENV_SANITIZED_FLAG] === '1') {
      // Este é o processo relançado: o relançamento deu certo.
      state = writeGpuPreferenceState(userDataPath, { ...state, pendingRelaunch: null }, fileSystem)
    } else {
      const failed = state.pendingRelaunch.preference
      revertedFromPreviousStart = {
        from: failed,
        reason: 'relaunch-failed',
        at: now(),
        detail: state.pendingRelaunch.startedAt ? `relançamento de ${state.pendingRelaunch.startedAt}` : null,
      }
      state = writeGpuPreferenceState(
        userDataPath,
        {
          preference: state.preference === failed ? 'auto' : state.preference,
          pendingStart: null,
          pendingRelaunch: null,
          fallback: revertedFromPreviousStart,
        },
        fileSystem,
      )
    }
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
    relaunchFailure: null,
  }
  if (requested === 'auto') return result
  if (softwareRendering) return { ...result, notApplied: 'software-rendering' }
  if (!describeGpuPreferenceSupport(platformName).supported) {
    return { ...result, notApplied: 'unsupported-platform' }
  }

  const plan = buildGpuLaunchPlan({ preference: requested, platformName, environment, isDevelopment })
  if (plan.relaunch) {
    // Quem decide de novo, e aplica, é o processo relançado. O pedido gravado
    // antes de sair é o que deixa a abertura seguinte perceber se ele nunca
    // nasceu.
    writeGpuPreferenceState(
      userDataPath,
      { ...state, pendingRelaunch: { preference: requested, startedAt: now() } },
      fileSystem,
    )
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
 * O relançamento que `prepareGpuStart` pediu nem começou (o `app.relaunch()`
 * recusou ou o `.AppImage` não abriu). Em vez de o app fechar sem reabrir,
 * este processo segue no Automático, e a escolha volta para Automático com o
 * aviso.
 *
 * @param {object} options
 * @param {string} options.userDataPath
 * @param {ReturnType<typeof prepareGpuStart>} options.start - O início que pediu o relançamento.
 * @param {string | null} [options.detail] - Por que o relançamento falhou.
 * @returns {ReturnType<typeof prepareGpuStart>} O início deste processo, agora no Automático.
 */
function abandonGpuRelaunch({ userDataPath, start, detail = null, now = defaultNow, fileSystem = fs } = {}) {
  try {
    revertGpuPreference({
      userDataPath,
      failedPreference: start.requested,
      reason: 'relaunch-failed',
      detail,
      now,
      fileSystem,
    })
  } catch {
    // Sem gravar, o pedido de relançamento continua no perfil, e a próxima
    // abertura volta para Automático pelo mesmo caminho.
  }
  const plan = start.plan ? { ...start.plan, relaunch: false, notes: [...start.plan.notes, 'relaunch-failed'] } : null
  return { ...start, applied: 'auto', plan, guarded: false, relaunch: false, relaunchFailure: detail ?? 'sem detalhe' }
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
  abandonGpuRelaunch,
  confirmGpuStart,
  evaluateGpuStartHealth,
  prepareGpuStart,
  revertGpuPreference,
}

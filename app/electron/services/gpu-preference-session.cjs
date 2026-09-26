'use strict'

/**
 * @module gpu-preference-session
 * A parte da preferência de placa de vídeo que vive depois de
 * `app.whenReady()`: confirma que a GPU escolhida subiu saudável, volta para
 * Automático se ela falhar durante a sessão, responde a interface e avisa
 * quando algo muda.
 *
 * A decisão de ANTES do whenReady (marcador, plano, relançamento) mora em
 * `electron/core/gpu-start-guard.cjs`; aqui só entram os eventos do Electron.
 */

const {
  acknowledgeGpuFallback,
  describeGpuPreferenceSupport,
  persistGpuPreference,
  readGpuPreferenceState,
} = require('../core/gpu-preference.cjs')
const { confirmGpuStart, evaluateGpuStartHealth, revertGpuPreference } = require('../core/gpu-start-guard.cjs')
const { DEFAULT_GPU_INFO_TIMEOUT_MS } = require('../core/gpu-info-watcher.cjs')
const { describeGpuDevices } = require('../core/gpu-devices.cjs')

/** Motivos do `child-process-gone` que apontam para a GPU, e não para memória ou para quem matou o processo. */
const GPU_FAILURE_EXIT_REASONS = Object.freeze(['crashed', 'launch-failed', 'abnormal-exit'])
const CHANGE_CHANNEL = 'graphics:gpu-preference-changed'

/**
 * @param {object} options
 * @param {import('electron').App} options.app
 * @param {import('electron').IpcMain} options.ipcMain
 * @param {string} options.userDataPath
 * @param {ReturnType<typeof import('../core/gpu-start-guard.cjs').prepareGpuStart>} options.gpuStart
 * @param {ReturnType<typeof import('../core/gpu-info-watcher.cjs').createGpuInfoWatcher>} options.gpuInfoWatcher -
 *   Criado antes do whenReady: diz quando o status da GPU passa a valer.
 * @param {number} [options.gpuInfoTimeoutMs]
 * @param {string} [options.platformName]
 * @param {() => (import('electron').BrowserWindow | null | undefined)} options.getMainWindow
 * @param {(entry: object) => void} [options.log]
 */
function createGpuPreferenceSession({
  app,
  ipcMain,
  userDataPath,
  gpuStart,
  gpuInfoWatcher,
  gpuInfoTimeoutMs = DEFAULT_GPU_INFO_TIMEOUT_MS,
  platformName = process.platform,
  getMainWindow,
  log = () => {},
}) {
  const support = describeGpuPreferenceSupport(platformName)
  const expectVulkan = Boolean(gpuStart.plan?.expectVulkan)
  const appliedPreference = gpuStart.applied
  // Só quem mudou a GPU neste início tem o que confirmar ou reverter.
  const watchesHealth = appliedPreference !== 'auto' && Boolean(gpuStart.guarded)
  let sessionOutcome = gpuStart.guarded ? 'pending' : 'not-guarded'
  let windowLoaded = false
  let devicesPromise = null

  function readDevices() {
    if (!devicesPromise) {
      // `getGPUInfo('basic')` lista as placas de forma confiável, mas no Linux
      // o `active` e o renderer vêm da coleta do navegador, antes do processo
      // de GPU (medido em 26/09/2026: sempre a NVIDIA como ativa). Por isso só
      // as placas e se há escolha saem daqui (sem o WARP do Windows nem outros
      // renderizadores por software: ver `core/gpu-devices.cjs`); a GPU em uso
      // a interface lê pelo WebGL.
      devicesPromise = Promise.resolve()
        .then(() => app.getGPUInfo('basic'))
        .then((gpuInfo) => describeGpuDevices(gpuInfo, platformName))
        .catch(() => ({ devices: [], multipleGpus: false }))
    }
    return devicesPromise
  }

  async function describe() {
    const state = readGpuPreferenceState(userDataPath)
    const { devices, multipleGpus } = await readDevices()
    return {
      preference: state.preference,
      applied: appliedPreference,
      notApplied: gpuStart.notApplied ?? null,
      sessionOutcome,
      supported: support.supported,
      unsupportedReason: support.reason,
      fallback: state.fallback,
      devices,
      multipleGpus,
    }
  }

  async function notifyRenderer() {
    const window = getMainWindow()
    if (!window || window.isDestroyed()) return
    window.webContents.send(CHANGE_CHANNEL, await describe())
  }

  function revert(reason, detail) {
    if (!watchesHealth || sessionOutcome === 'reverted') return
    revertGpuPreference({ userDataPath, failedPreference: appliedPreference, reason, detail })
    sessionOutcome = 'reverted'
    log({
      level: 'warn',
      scope: 'graphics:gpu-preference',
      message: 'reverted-to-auto',
      details: { preference: appliedPreference, reason, detail },
    })
    void notifyRenderer()
  }

  /**
   * Fecha o início pendente com o status da GPU. Só roda com a janela
   * carregada e com a GPU já tendo respondido (`gpu-info-update`): antes
   * disso o status é o padrão `disabled_software` e mentiria.
   */
  function settlePendingStart() {
    const outcome = confirmGpuStart({
      userDataPath,
      appliedPreference,
      featureStatus: app.getGPUFeatureStatus(),
      expectVulkan,
    })
    if (outcome.status === 'healthy') {
      sessionOutcome = 'healthy'
      log({ level: 'info', scope: 'graphics:gpu-preference', message: 'start-confirmed', details: { preference: appliedPreference } })
    } else if (outcome.status === 'reverted') {
      sessionOutcome = 'reverted'
      log({
        level: 'warn',
        scope: 'graphics:gpu-preference',
        message: 'reverted-to-auto',
        details: { preference: appliedPreference, reason: outcome.verdict.reason, detail: outcome.verdict.detail },
      })
      void notifyRenderer()
    }
  }

  /**
   * Janela carregada: é o "app pronto + janela carregada" do marcador. Se a
   * GPU não responder no prazo, o marcador fica, e o próximo início trata
   * como não confirmado — um `gpu-info-update` tardio ainda confirma.
   */
  async function confirmStart() {
    if (!watchesHealth || sessionOutcome !== 'pending') return sessionOutcome
    windowLoaded = true
    const ready = await gpuInfoWatcher.wait(gpuInfoTimeoutMs)
    if (!ready) {
      log({ level: 'warn', scope: 'graphics:gpu-preference', message: 'gpu-info-timeout', details: { preference: appliedPreference, timeoutMs: gpuInfoTimeoutMs } })
      return sessionOutcome
    }
    if (sessionOutcome === 'pending') settlePendingStart()
    return sessionOutcome
  }

  function onGpuInfoUpdate() {
    if (!watchesHealth || sessionOutcome === 'reverted') return
    if (sessionOutcome === 'pending') {
      if (windowLoaded) settlePendingStart()
      return
    }
    const verdict = evaluateGpuStartHealth({ featureStatus: app.getGPUFeatureStatus(), expectVulkan })
    if (verdict.healthy === false) revert(verdict.reason, verdict.detail)
  }

  function onChildProcessGone(_event, details) {
    if (details?.type !== 'GPU' || !GPU_FAILURE_EXIT_REASONS.includes(details.reason)) return
    revert('gpu-process-gone', `${details.reason} (código ${details.exitCode ?? '?'})`)
  }

  function register() {
    ipcMain.handle('graphics:set-gpu-preference', (_event, preference) => {
      try {
        const state = persistGpuPreference({ userDataPath, preference })
        log({ level: 'info', scope: 'graphics:gpu-preference', message: 'saved', details: { preference: state.preference } })
        return {
          ok: true,
          preference: state.preference,
          requiresRestart: true,
          message: 'Placa de vídeo salva. Ela vale a partir da próxima abertura do Felixo.',
        }
      } catch (error) {
        return {
          ok: false,
          message: error instanceof Error ? error.message : 'Não foi possível salvar a placa de vídeo.',
        }
      }
    })
    ipcMain.handle('graphics:acknowledge-gpu-fallback', () => {
      acknowledgeGpuFallback({ userDataPath })
      return { ok: true }
    })
    app.on('gpu-info-update', onGpuInfoUpdate)
    app.on('child-process-gone', onChildProcessGone)
  }

  /** Liga a confirmação ao carregamento da janela principal. */
  function watchWindow(window) {
    if (!watchesHealth || !window) return
    window.webContents.once('did-finish-load', () => {
      confirmStart().catch(() => {})
    })
  }

  return { confirmStart, describe, register, watchWindow }
}

module.exports = {
  CHANGE_CHANNEL,
  GPU_FAILURE_EXIT_REASONS,
  createGpuPreferenceSession,
}

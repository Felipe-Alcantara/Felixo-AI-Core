'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { detectGpuIncompatibility } = require('./graphics-signal.cjs')

const GRAPHICS_RECOMMENDATION_FILE = 'graphics-recommendation.json'
// Lembra qual sinal a pessoa já recusou, pra um boot seguinte com o MESMO
// problema (driver continua igual) não voltar a incomodar — só um sinal
// genuinamente diferente (outra feature desligada) justifica perguntar de novo.
const GRAPHICS_DISMISSED_SIGNAL_FILE = 'graphics-dismissed-signal.json'
// Quanto tempo depois do primeiro `gpu-info-update` o status ainda pode mudar.
// Medido em 26/09/2026 (Electron 41.10.7, --use-angle=d3d11): o segundo evento
// chegou 41 ms depois do primeiro, trocando `enabled` por `disabled_software`.
const GPU_STATUS_SETTLE_MS = 2_000

/**
 * @module graphics-recommendation
 * Persiste, num arquivo separado de `graphics-mode.json`, uma recomendação
 * de modo compatível baseada em sinal real de GPU — nunca o modo aplicado
 * em si. `graphics-mode.json` continua sendo só o que a pessoa escolheu (ou
 * a heurística automática de memória); esta recomendação é só uma sugestão
 * pendente de aceite, mostrada nas Configurações (fatia seguinte).
 */

function getRecommendationPath(userDataPath) {
  if (typeof userDataPath !== 'string' || !userDataPath.trim()) return null
  return path.join(userDataPath, GRAPHICS_RECOMMENDATION_FILE)
}

/** @returns {{ reason: 'gpu-feature-disabled', disabledFeatures: string[], detectedAt: string } | null} */
function readGraphicsRecommendation(userDataPath, fileSystem = fs) {
  const filePath = getRecommendationPath(userDataPath)
  if (!filePath) return null

  try {
    const payload = JSON.parse(fileSystem.readFileSync(filePath, 'utf8'))
    if (!payload || typeof payload !== 'object' || payload.reason !== 'gpu-feature-disabled') {
      return null
    }
    return {
      reason: payload.reason,
      disabledFeatures: Array.isArray(payload.disabledFeatures) ? payload.disabledFeatures : [],
      detectedAt: typeof payload.detectedAt === 'string' ? payload.detectedAt : null,
    }
  } catch {
    return null
  }
}

function persistGraphicsRecommendation({ userDataPath, reason, disabledFeatures, detectedAt, fileSystem = fs }) {
  const filePath = getRecommendationPath(userDataPath)
  if (!filePath) throw new Error('Pasta de dados do app indisponível.')

  const payload = { reason, disabledFeatures, detectedAt }
  fileSystem.mkdirSync(path.dirname(filePath), { recursive: true })
  fileSystem.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  return payload
}

function clearGraphicsRecommendation(userDataPath, fileSystem = fs) {
  const filePath = getRecommendationPath(userDataPath)
  if (!filePath) return
  try {
    fileSystem.rmSync(filePath, { force: true })
  } catch {
    // Já não havia recomendação nenhuma — idempotente.
  }
}

function getDismissedSignalPath(userDataPath) {
  if (typeof userDataPath !== 'string' || !userDataPath.trim()) return null
  return path.join(userDataPath, GRAPHICS_DISMISSED_SIGNAL_FILE)
}

function readDismissedSignal(userDataPath, fileSystem = fs) {
  const filePath = getDismissedSignalPath(userDataPath)
  if (!filePath) return null
  try {
    const payload = JSON.parse(fileSystem.readFileSync(filePath, 'utf8'))
    return Array.isArray(payload?.disabledFeatures) ? payload.disabledFeatures : null
  } catch {
    return null
  }
}

function persistDismissedSignal({ userDataPath, disabledFeatures, fileSystem = fs }) {
  const filePath = getDismissedSignalPath(userDataPath)
  if (!filePath) return
  fileSystem.mkdirSync(path.dirname(filePath), { recursive: true })
  fileSystem.writeFileSync(
    filePath,
    `${JSON.stringify({ disabledFeatures }, null, 2)}\n`,
    'utf8',
  )
}

/** Mesmo conjunto de features, independente da ordem. */
function sameFeatureSet(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
  const sortedA = [...a].sort()
  const sortedB = [...b].sort()
  return sortedA.every((feature, index) => feature === sortedB[index])
}

/**
 * Recusa a recomendação pendente (a pessoa escolheu "manter GPU normal"):
 * limpa a recomendação em si e grava qual sinal foi recusado, pra
 * `evaluateGpuAfterReady` não voltar a incomodar com o MESMO problema.
 */
function dismissGraphicsRecommendation(userDataPath, fileSystem = fs) {
  const current = readGraphicsRecommendation(userDataPath, fileSystem)
  clearGraphicsRecommendation(userDataPath, fileSystem)
  if (current) {
    persistDismissedSignal({ userDataPath, disabledFeatures: current.disabledFeatures, fileSystem })
  }
}

/**
 * Roda DEPOIS de `app.whenReady()` — é o primeiro momento em que
 * `app.getGPUFeatureStatus()` existe. Nunca aplica `disable-gpu` na sessão
 * corrente (o processo Chromium já decidiu isso no boot, antes de
 * whenReady) nem sobrescreve `graphics-mode.json`: só persiste uma
 * recomendação, pra próxima abertura mostrar e a pessoa decidir.
 *
 * O primeiro `gpu-info-update` não é o veredito: a GPU pode cair para
 * software logo depois dele. Com `onGpuInfoUpdate`, o status é lido de novo
 * a cada evento durante `settleMs` e mais uma vez no fim da janela (o status
 * final). Um sinal de incompatibilidade em qualquer leitura grava a
 * recomendação na hora, e uma leitura saudável depois, dentro da janela, não
 * a apaga; a recomendação antiga só é limpa no fim, se a janela inteira foi
 * saudável.
 *
 * @param {object} options
 * @param {string} options.userDataPath
 * @param {() => (Record<string, string> | Promise<Record<string, string>>)} [options.getGPUFeatureStatus] -
 *   Tipicamente `() => app.getGPUFeatureStatus()`; injetável pra teste.
 * @param {() => Promise<boolean>} [options.waitForGpuInfo] - Espera o
 *   `gpu-info-update` (ver `gpu-info-watcher.cjs`). Antes dele o status é o
 *   padrão `disabled_software` (medido em 26/09/2026) e viraria uma
 *   recomendação falsa; sem resposta no prazo, não avalia.
 * @param {(listener: () => void) => (() => void)} [options.onGpuInfoUpdate] -
 *   Assina os `gpu-info-update` seguintes e devolve a função que cancela.
 *   Sem ela, o status é lido uma vez só.
 * @param {number} [options.settleMs] - A janela depois do primeiro evento.
 * @param {boolean} [options.alreadyUsingSoftwareRendering] - Se a sessão já
 *   está em software (manual ou heurística de memória) — nesse caso não há
 *   nada a recomendar, e uma recomendação antiga (de antes da troca) é limpa.
 * @param {() => string} [options.now]
 * @param {typeof fs} [options.fileSystem]
 * @returns {Promise<{ evaluated: boolean, recommended: boolean, recommendation?: object, dismissed?: boolean }>}
 */
async function evaluateGpuAfterReady({
  userDataPath,
  getGPUFeatureStatus,
  waitForGpuInfo,
  onGpuInfoUpdate,
  settleMs = GPU_STATUS_SETTLE_MS,
  alreadyUsingSoftwareRendering = false,
  now = () => new Date().toISOString(),
  fileSystem = fs,
} = {}) {
  if (alreadyUsingSoftwareRendering) {
    clearGraphicsRecommendation(userDataPath, fileSystem)
    return { evaluated: false, recommended: false }
  }

  if (typeof getGPUFeatureStatus !== 'function') {
    return { evaluated: false, recommended: false }
  }

  if (typeof waitForGpuInfo === 'function' && !(await waitForGpuInfo())) {
    return { evaluated: false, recommended: false }
  }

  const seen = { healthy: false, dismissed: false, recommendation: null }
  async function readStatusOnce() {
    let featureStatus
    try {
      featureStatus = await getGPUFeatureStatus()
    } catch {
      // Uma falha ao consultar a GPU não é, em si, um sinal de incompatibilidade
      // — só significa que não dá pra avaliar agora. Não mexe na recomendação
      // existente (pode já ter sido detectada num boot anterior).
      return
    }
    const signal = detectGpuIncompatibility({ featureStatus })
    if (!signal.incompatible) {
      seen.healthy = true
      return
    }
    // Mesmo sinal que a pessoa já recusou explicitamente — fica quieto. Só um
    // sinal DIFERENTE (outra feature quebrou) justifica perguntar de novo.
    const dismissedFeatures = readDismissedSignal(userDataPath, fileSystem)
    if (dismissedFeatures && sameFeatureSet(dismissedFeatures, signal.disabledFeatures)) {
      seen.dismissed = true
      return
    }
    seen.recommendation = persistGraphicsRecommendation({
      userDataPath,
      reason: signal.reason,
      disabledFeatures: signal.disabledFeatures,
      detectedAt: now(),
      fileSystem,
    })
  }

  await readStatusOnce()
  if (typeof onGpuInfoUpdate === 'function' && settleMs > 0) {
    // Uma leitura por vez, na ordem dos eventos.
    let readings = Promise.resolve()
    const stop = onGpuInfoUpdate(() => {
      readings = readings.then(readStatusOnce)
    })
    await new Promise((resolve) => setTimeout(resolve, settleMs))
    if (typeof stop === 'function') stop()
    readings = readings.then(readStatusOnce)
    await readings
  }

  if (seen.recommendation) return { evaluated: true, recommended: true, recommendation: seen.recommendation }
  if (seen.dismissed) return { evaluated: true, recommended: false, dismissed: true }
  if (!seen.healthy) return { evaluated: false, recommended: false }
  clearGraphicsRecommendation(userDataPath, fileSystem)
  return { evaluated: true, recommended: false }
}

module.exports = {
  GPU_STATUS_SETTLE_MS,
  GRAPHICS_DISMISSED_SIGNAL_FILE,
  GRAPHICS_RECOMMENDATION_FILE,
  clearGraphicsRecommendation,
  dismissGraphicsRecommendation,
  evaluateGpuAfterReady,
  getDismissedSignalPath,
  getRecommendationPath,
  persistGraphicsRecommendation,
  readDismissedSignal,
  readGraphicsRecommendation,
}

'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { detectGpuIncompatibility } = require('./graphics-signal.cjs')

const GRAPHICS_RECOMMENDATION_FILE = 'graphics-recommendation.json'
// Lembra qual sinal a pessoa já recusou, pra um boot seguinte com o MESMO
// problema (driver continua igual) não voltar a incomodar — só um sinal
// genuinamente diferente (outra feature desligada) justifica perguntar de novo.
const GRAPHICS_DISMISSED_SIGNAL_FILE = 'graphics-dismissed-signal.json'

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
 * @param {object} options
 * @param {string} options.userDataPath
 * @param {() => (Record<string, string> | Promise<Record<string, string>>)} [options.getGPUFeatureStatus] -
 *   Tipicamente `() => app.getGPUFeatureStatus()`; injetável pra teste.
 * @param {boolean} [options.alreadyUsingSoftwareRendering] - Se a sessão já
 *   está em software (manual ou heurística de memória) — nesse caso não há
 *   nada a recomendar, e uma recomendação antiga (de antes da troca) é limpa.
 * @param {() => string} [options.now]
 * @param {typeof fs} [options.fileSystem]
 * @returns {Promise<{ evaluated: boolean, recommended: boolean, recommendation?: object }>}
 */
async function evaluateGpuAfterReady({
  userDataPath,
  getGPUFeatureStatus,
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

  let featureStatus
  try {
    featureStatus = await getGPUFeatureStatus()
  } catch {
    // Uma falha ao consultar a GPU não é, em si, um sinal de incompatibilidade
    // — só significa que não dá pra avaliar agora. Não mexe na recomendação
    // existente (pode já ter sido detectada num boot anterior).
    return { evaluated: false, recommended: false }
  }

  const signal = detectGpuIncompatibility({ featureStatus })
  if (!signal.incompatible) {
    clearGraphicsRecommendation(userDataPath, fileSystem)
    return { evaluated: true, recommended: false }
  }

  // Mesmo sinal que a pessoa já recusou explicitamente — fica quieto. Só um
  // sinal DIFERENTE (outra feature quebrou) justifica perguntar de novo.
  const dismissedFeatures = readDismissedSignal(userDataPath, fileSystem)
  if (dismissedFeatures && sameFeatureSet(dismissedFeatures, signal.disabledFeatures)) {
    return { evaluated: true, recommended: false, dismissed: true }
  }

  const recommendation = persistGraphicsRecommendation({
    userDataPath,
    reason: signal.reason,
    disabledFeatures: signal.disabledFeatures,
    detectedAt: now(),
    fileSystem,
  })
  return { evaluated: true, recommended: true, recommendation }
}

module.exports = {
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

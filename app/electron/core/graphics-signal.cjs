'use strict'

/**
 * @module graphics-signal
 * Sinal PURO de GPU/driver incompatível — recebe o dado já coletado de
 * `app.getGPUFeatureStatus()` (Electron), nunca chama a API do Electron em
 * si. Isso mantém a decisão testável sem um processo Electron real e evita
 * misturar este sinal observado com a heurística de memória de
 * `graphics-mode.cjs` (`automaticLowEnd`) — os dois continuam sendo causas
 * distintas para o mesmo efeito (sugerir modo compatível), nunca a mesma
 * checagem disfarçada de duas.
 */

// As três features cujo estado degradado é o sinal mais confiável de que o
// driver/GPU está sendo recusado pelo Chromium (blacklist ou falha real),
// não só uma preferência de economia de energia. `video_decode`/`vulkan`
// desligados sozinhos são comuns em hardware saudável e não entram aqui.
const CRITICAL_GPU_FEATURES = Object.freeze(['gpu_compositing', 'webgl', 'rasterization'])

/**
 * Um status de feature do Chromium indica que a GPU foi recusada quando
 * começa com "disabled" (disabled, disabled_off, disabled_software, ...),
 * é "blocklisted" (ou a grafia antiga "blacklisted") ou
 * "unavailable_software" (o Chromium queria usar a GPU, não conseguiu, e
 * nem o fallback via software está disponível). Checar por prefixo/whitelist
 * pequena em vez de uma lista fechada de strings exatas porque o texto
 * exato desses status já mudou entre versões do Chromium.
 */
function isIncompatibleFeatureStatus(status) {
  if (typeof status !== 'string' || !status) return false
  const normalized = status.trim().toLowerCase()
  return (
    normalized.startsWith('disabled') ||
    normalized === 'blocklisted' ||
    normalized === 'blacklisted' ||
    normalized === 'unavailable_software'
  )
}

/**
 * @param {object} [options]
 * @param {Record<string, string>} [options.featureStatus] - O retorno bruto
 *   de `app.getGPUFeatureStatus()`.
 * @returns {{
 *   incompatible: boolean,
 *   reason: 'gpu-feature-disabled' | null,
 *   disabledFeatures: string[],
 * }}
 */
function detectGpuIncompatibility({ featureStatus } = {}) {
  if (!featureStatus || typeof featureStatus !== 'object' || Array.isArray(featureStatus)) {
    return { incompatible: false, reason: null, disabledFeatures: [] }
  }

  const disabledFeatures = CRITICAL_GPU_FEATURES.filter((feature) =>
    isIncompatibleFeatureStatus(featureStatus[feature]),
  )

  return {
    incompatible: disabledFeatures.length > 0,
    reason: disabledFeatures.length > 0 ? 'gpu-feature-disabled' : null,
    disabledFeatures,
  }
}

module.exports = {
  CRITICAL_GPU_FEATURES,
  detectGpuIncompatibility,
  isIncompatibleFeatureStatus,
}

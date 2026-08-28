'use strict'

/**
 * Estado persistido da última varredura feita pelo comando do agente.
 *
 * O shim `felixo` inicia um processo Node novo a cada chamada, então o estado
 * em memória do serviço não atravessa `varrer` → `estado`. Este arquivo fica ao
 * lado dos relatórios e só contém o plano de leitura; não é uma autorização de
 * escrita nem substitui o plano que o painel revisa antes de executar.
 */

const path = require('node:path')
const { readJsonFile, writeJsonFile } = require('../services/fetch-all/json-file-store.cjs')

const STATE_FILE = 'fetch-all-agent-state.json'

/**
 * @param {string} reportsDir
 * @returns {string}
 */
function buildAgentScanStatePath(reportsDir) {
  return path.join(reportsDir, STATE_FILE)
}

/**
 * @param {object} options
 * @param {string} options.reportsDir
 * @param {object} options.plan
 * @param {string} [options.scanMode]
 * @param {string} [options.scannedAt]
 * @returns {Promise<string>}
 */
async function saveAgentScanState({ reportsDir, plan, scanMode = '', scannedAt = new Date().toISOString() }) {
  const filePath = buildAgentScanStatePath(reportsDir)

  await writeJsonFile(filePath, {
    plan,
    scanMode,
    scannedAt,
  })

  return filePath
}

/**
 * @param {object} options
 * @param {string} options.reportsDir
 * @returns {Promise<{ plan: object, scanMode: string, scannedAt: string }|null>}
 */
async function loadAgentScanState({ reportsDir }) {
  const data = await readJsonFile(buildAgentScanStatePath(reportsDir))

  if (!data || typeof data !== 'object' || !isPlan(data.plan)) {
    return null
  }

  return {
    plan: data.plan,
    scanMode: typeof data.scanMode === 'string' ? data.scanMode : '',
    scannedAt: typeof data.scannedAt === 'string' ? data.scannedAt : '',
  }
}

/**
 * Keep malformed external JSON from becoming a plan the command presents as
 * trustworthy. The individual repository entries remain intentionally open:
 * the Fetch All analyzer owns their detailed shape.
 *
 * @param {unknown} plan
 * @returns {boolean}
 */
function isPlan(plan) {
  return Boolean(
    plan &&
      typeof plan === 'object' &&
      Array.isArray(plan.upToDate) &&
      Array.isArray(plan.toPull) &&
      Array.isArray(plan.toPush) &&
      Array.isArray(plan.problems) &&
      Number.isFinite(plan.total),
  )
}

module.exports = {
  STATE_FILE,
  buildAgentScanStatePath,
  isPlan,
  loadAgentScanState,
  saveAgentScanState,
}

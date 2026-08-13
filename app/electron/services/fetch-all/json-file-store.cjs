/**
 * @module fetch-all/json-file-store
 * Leitura e escrita de um JSON local resistente a interrupção.
 *
 * A gravação usa arquivo temporário + rename para o destino nunca ficar pela
 * metade se o app for fechado no meio, e a leitura trata arquivo ausente ou
 * corrompido como "sem dado" — nenhum dos dois é erro para quem chama.
 */

const fsp = require('node:fs/promises')
const path = require('node:path')

/**
 * Lê um JSON do disco.
 *
 * @param {string} filePath
 * @returns {Promise<unknown|null>} O conteúdo, ou `null` se ausente/ilegível.
 */
async function readJsonFile(filePath) {
  try {
    return JSON.parse(await fsp.readFile(filePath, 'utf8'))
  } catch {
    return null
  }
}

/**
 * Grava um JSON de forma atômica, criando o diretório se preciso.
 *
 * @param {string} filePath
 * @param {unknown} payload
 * @returns {Promise<void>}
 */
async function writeJsonFile(filePath, payload) {
  const tempPath = `${filePath}.${process.pid}.tmp`

  await fsp.mkdir(path.dirname(filePath), { recursive: true })
  await fsp.writeFile(tempPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  await fsp.rename(tempPath, filePath)
}

module.exports = {
  readJsonFile,
  writeJsonFile,
}

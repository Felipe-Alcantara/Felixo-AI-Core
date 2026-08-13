/**
 * @module fetch-all/scan-cache
 * Cache da última varredura completa, para reexecuções rápidas.
 *
 * Guarda a lista de repositórios encontrados e as raízes varridas. Numa nova
 * execução dá para pular a varredura do disco e ir direto à análise: os
 * repositórios apagados são descartados na hora, mas repositórios novos só
 * aparecem numa varredura completa — por isso a varredura rápida é sempre uma
 * escolha explícita, nunca o padrão silencioso.
 */

const fs = require('node:fs')
const path = require('node:path')
const { readJsonFile, writeJsonFile } = require('./json-file-store.cjs')

const CACHE_FILE = 'fetch-all-scan-cache.json'

/**
 * Cria o repositório do cache de varredura.
 *
 * @param {object} options
 * @param {string} options.cacheDir - Diretório de cache do app.
 * @returns {{
 *   filePath: string,
 *   load: () => Promise<{ scannedAt: string, roots: string[], repos: string[] }|null>,
 *   save: (roots: string[], repos: string[]) => Promise<void>,
 * }}
 */
function createScanCache({ cacheDir }) {
  if (typeof cacheDir !== 'string' || !cacheDir.trim()) {
    throw new Error('Diretório de cache inválido.')
  }

  const filePath = path.join(cacheDir, CACHE_FILE)

  return {
    filePath,
    async load() {
      return parseCache(await readJsonFile(filePath))
    },
    async save(roots, repos) {
      await writeJsonFile(filePath, {
        scannedAt: new Date().toISOString(),
        roots: [...roots],
        repos: [...repos],
      })
    },
  }
}

/**
 * Valida o conteúdo lido do disco; cache inválido é o mesmo que cache ausente.
 *
 * @param {unknown} data
 * @returns {{ scannedAt: string, roots: string[], repos: string[] }|null}
 */
function parseCache(data) {
  if (!data || typeof data !== 'object') return null

  const { scannedAt, roots, repos } = data
  const isStringList = (value) =>
    Array.isArray(value) && value.every((item) => typeof item === 'string')

  if (typeof scannedAt !== 'string' || !isStringList(roots) || !isStringList(repos)) {
    return null
  }

  return { scannedAt, roots, repos }
}

/**
 * Indica se o cache foi feito exatamente sobre as raízes que serão varridas.
 *
 * @param {{ roots: string[] }} cache
 * @param {string[]} roots
 * @returns {boolean}
 */
function cacheMatchesRoots(cache, roots) {
  const left = [...cache.roots].sort()
  const right = [...roots].sort()

  return left.length === right.length && left.every((item, index) => item === right[index])
}

/**
 * Repositórios do cache que ainda existem no disco.
 *
 * @param {{ repos: string[] }} cache
 * @returns {string[]}
 */
function cachedReposStillOnDisk(cache) {
  return cache.repos.filter((repoPath) => fs.existsSync(path.join(repoPath, '.git')))
}

module.exports = {
  CACHE_FILE,
  cacheMatchesRoots,
  cachedReposStillOnDisk,
  createScanCache,
  parseCache,
}

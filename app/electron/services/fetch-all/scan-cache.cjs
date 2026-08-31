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
const CACHE_VERSION = 2

/**
 * Cria o repositório do cache de varredura.
 *
 * @param {object} options
 * @param {string} options.cacheDir - Diretório de cache do app.
 * @returns {{
 *   filePath: string,
 *   load: () => Promise<{ scannedAt: string, roots: string[], repos: string[], cacheKey?: string }|null>,
 *   save: (roots: string[], repos: string[], context?: object) => Promise<void>,
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
    async save(roots, repos, context = {}) {
      await writeJsonFile(filePath, {
        cacheVersion: CACHE_VERSION,
        scannedAt: new Date().toISOString(),
        roots: [...roots],
        repos: [...repos],
        cacheKey: createScanCacheKey({ roots, ...context }),
      })
    },
  }
}

/**
 * Valida o conteúdo lido do disco; cache inválido é o mesmo que cache ausente.
 *
 * @param {unknown} data
 * @returns {{ scannedAt: string, roots: string[], repos: string[], cacheKey?: string }|null}
 */
function parseCache(data) {
  if (!data || typeof data !== 'object') return null

  const { cacheVersion, scannedAt, roots, repos, cacheKey } = data
  const isStringList = (value) =>
    Array.isArray(value) && value.every((item) => typeof item === 'string')

  if (
    typeof scannedAt !== 'string' ||
    !isStringList(roots) ||
    !isStringList(repos) ||
    (cacheVersion !== undefined && cacheVersion !== CACHE_VERSION) ||
    (cacheKey !== undefined && typeof cacheKey !== 'string')
  ) {
    return null
  }

  return {
    scannedAt,
    roots,
    repos,
    ...(cacheKey === undefined ? {} : { cacheKey }),
  }
}

/**
 * Cria uma chave estável para o ambiente da varredura.
 *
 * Além das raízes, a chave inclui tudo que muda o conjunto que o scanner pode
 * visitar. Assim, mudar uma exclusão, um caminho ignorado, uma montagem virtual
 * ou a lista de discos locais nunca reaproveita uma lista de repositórios velha.
 *
 * @param {object} [context]
 * @param {string[]} [context.roots]
 * @param {string[]} [context.excludeDirs]
 * @param {string[]} [context.ignoredPaths]
 * @param {string[]} [context.skipPaths]
 * @param {string[]} [context.availableRoots]
 * @returns {string}
 */
function createScanCacheKey({
  roots = [],
  excludeDirs = [],
  ignoredPaths = [],
  skipPaths = [],
  availableRoots = [],
} = {}) {
  const normalize = (values, lower = false) =>
    [...new Set(
      (Array.isArray(values) ? values : [])
        .filter((value) => typeof value === 'string')
        .map((value) => {
          const trimmed = value.trim()
          return lower ? trimmed.toLowerCase() : trimmed
        })
        .filter(Boolean),
    )].sort()

  return JSON.stringify({
    version: CACHE_VERSION,
    roots: normalize(roots),
    excludeDirs: normalize(excludeDirs, true),
    ignoredPaths: normalize(ignoredPaths),
    skipPaths: normalize(skipPaths),
    availableRoots: normalize(availableRoots),
  })
}

/**
 * Indica se o cache foi feito exatamente sobre as raízes que serão varridas.
 *
 * @param {{ roots: string[] }} cache
 * @param {string[]} roots
 * @param {object} [context] - Se fornecido, compara o ambiente completo.
 * @returns {boolean}
 */
function cacheMatchesRoots(cache, roots, context) {
  if (!cache || !Array.isArray(cache.roots)) return false

  if (context !== undefined) {
    return (
      typeof cache?.cacheKey === 'string' &&
      cache.cacheKey === createScanCacheKey({ roots, ...context })
    )
  }

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
  CACHE_VERSION,
  CACHE_FILE,
  cacheMatchesRoots,
  cachedReposStillOnDisk,
  createScanCache,
  createScanCacheKey,
  parseCache,
}

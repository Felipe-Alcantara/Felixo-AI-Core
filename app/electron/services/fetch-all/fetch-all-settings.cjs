/**
 * @module fetch-all/fetch-all-settings
 * Configuração da ferramenta Fetch All, validada e persistida em disco.
 *
 * Guarda apenas escolhas da pessoa sobre *onde* varrer: raízes, nomes de pasta
 * excluídos e caminhos ignorados. Nenhuma credencial passa por aqui — o git
 * usa as credenciais já configuradas em cada repositório.
 */

const path = require('node:path')
const { DEFAULT_EXCLUDE_DIRS } = require('./repo-scanner.cjs')
const { readJsonFile, writeJsonFile } = require('./json-file-store.cjs')

const SETTINGS_FILE = 'fetch-all-settings.json'
const MAX_LIST_ENTRIES = 500
const MAX_ANALYZE_WORKERS = 32

/** Configuração usada quando ainda não há nada salvo. */
const DEFAULT_SETTINGS = Object.freeze({
  /** Vazio exige confirmação antes de considerar todos os discos locais. */
  scanRoots: [],
  excludeDirs: [...DEFAULT_EXCLUDE_DIRS],
  /** Caminhos absolutos que a pessoa mandou ignorar, com os repositórios dentro. */
  ignoredPaths: [],
  analyzeWorkers: 8,
})

/**
 * Valida uma lista de textos não vazios vinda de fora.
 *
 * @param {unknown} value
 * @param {string[]} fallback
 * @returns {string[]}
 */
function normalizeStringList(value, fallback) {
  if (!Array.isArray(value)) return [...fallback]

  const entries = value
    .filter((item) => typeof item === 'string' && item.trim())
    .map((item) => item.trim())

  return [...new Set(entries)].slice(0, MAX_LIST_ENTRIES)
}

/**
 * Normaliza caminhos absolutos, descartando o que não for utilizável.
 *
 * @param {unknown} value
 * @returns {string[]}
 */
function normalizePathList(value) {
  const entries = normalizeStringList(value, []).map((item) => path.resolve(item))

  return [...new Set(entries)].sort()
}

/**
 * Aplica os padrões e valida o que veio salvo ou da interface.
 *
 * Os nomes excluídos padrão são sempre mesclados de volta: eles existem para
 * evitar varrer pastas de sistema e caches, e perdê-los num arquivo antigo
 * tornaria a varredura lenta sem a pessoa pedir.
 *
 * @param {unknown} settings
 * @returns {{ scanRoots: string[], excludeDirs: string[], ignoredPaths: string[], analyzeWorkers: number }}
 */
function normalizeSettings(settings) {
  const source = settings && typeof settings === 'object' ? settings : {}
  const savedExcludes = normalizeStringList(source.excludeDirs, DEFAULT_EXCLUDE_DIRS)
  const workers = Number(source.analyzeWorkers)

  return {
    scanRoots: normalizePathList(source.scanRoots),
    excludeDirs: [...new Set([...savedExcludes, ...DEFAULT_EXCLUDE_DIRS])],
    ignoredPaths: normalizePathList(source.ignoredPaths),
    analyzeWorkers:
      Number.isInteger(workers) && workers >= 1 && workers <= MAX_ANALYZE_WORKERS
        ? workers
        : DEFAULT_SETTINGS.analyzeWorkers,
  }
}

/**
 * Cria o repositório de configuração da ferramenta.
 *
 * @param {object} options
 * @param {string} options.configDir - Diretório de configuração do app.
 * @returns {{ filePath: string, load: () => Promise<object>, save: (settings: unknown) => Promise<object> }}
 */
function createFetchAllSettingsStore({ configDir }) {
  if (typeof configDir !== 'string' || !configDir.trim()) {
    throw new Error('Diretório de configuração inválido.')
  }

  const filePath = path.join(configDir, SETTINGS_FILE)

  return {
    filePath,
    async load() {
      return normalizeSettings(await readJsonFile(filePath))
    },
    async save(settings) {
      const normalized = normalizeSettings(settings)

      await writeJsonFile(filePath, normalized)

      return normalized
    },
  }
}

module.exports = {
  DEFAULT_SETTINGS,
  SETTINGS_FILE,
  createFetchAllSettingsStore,
  normalizePathList,
  normalizeSettings,
}

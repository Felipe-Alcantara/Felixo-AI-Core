/**
 * @module app-paths
 * Central path resolver for Felixo AI Core.
 *
 * Resolves all user-data, config, cache, logs, temp and internal asset paths
 * in a cross-platform way, adapting to both development and packaged modes.
 *
 * Usage:
 *   const { getAppPaths } = require('./app-paths.cjs')
 *   const paths = getAppPaths()
 *   paths.userData   // ~/.config/felixo-ai-core (Linux)
 *   paths.logs       // ~/.config/felixo-ai-core/logs (Linux)
 *   paths.config     // ~/.config/felixo-ai-core/config (Linux)
 *   paths.cache      // ~/.cache/felixo-ai-core (Linux)
 *   paths.temp       // /tmp/felixo-ai-core (Linux)
 *   paths.assets     // <app>/public (dev) or <app>/dist (packaged)
 */

const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')

const APP_NAME = 'felixo-ai-core'

/**
 * Try to load Electron app. Returns null in non-Electron environments (tests).
 * @returns {{ isPackaged: boolean, getPath: (name: string) => string } | null}
 */
function tryLoadElectronApp() {
  try {
    return require('electron').app
  } catch {
    return null
  }
}

/**
 * Resolve all application paths based on the current platform and mode.
 *
 * @param {object} [options] - Optional overrides for testing.
 * @param {object} [options.electronApp] - Electron app object override.
 * @returns {{
 *   userData: string,
 *   config: string,
 *   logs: string,
 *   cache: string,
 *   temp: string,
 *   database: string,
 *   exports: string,
 *   notes: string,
 *   reports: string,
 *   assets: string,
 *   appRoot: string,
 *   isPackaged: boolean,
 *   platform: string,
 * }}
 */
function getAppPaths(options = {}) {
  const electronApp = options.electronApp || tryLoadElectronApp()
  const isPackaged = electronApp?.isPackaged ?? false
  const platform = process.platform

  const userData = electronApp
    ? electronApp.getPath('userData')
    : path.join(os.homedir(), '.config', APP_NAME)

  const logs = safeGetPath(electronApp, 'logs', path.join(userData, 'logs'))
  const cache = safeGetPath(
    electronApp,
    'sessionData',
    path.join(getCacheBase(), APP_NAME),
  )
  const temp = path.join(os.tmpdir(), APP_NAME)

  const config = path.join(userData, 'config')
  const database = path.join(userData, 'database')
  const exports = path.join(userData, 'exports')
  const notes = path.join(userData, 'notes')
  const reports = path.join(userData, 'reports')

  const appRoot = path.join(__dirname, '..')
  const assets = isPackaged
    ? path.join(appRoot, '..', 'dist')
    : path.join(appRoot, '..', 'public')

  return {
    userData,
    config,
    logs,
    cache,
    temp,
    database,
    exports,
    notes,
    reports,
    assets,
    appRoot,
    isPackaged,
    platform,
  }
}

/**
 * Ensure a directory exists, creating it recursively if needed.
 * Safe to call on paths that already exist.
 *
 * @param {string} dirPath - Absolute path to ensure.
 * @returns {string} The same dirPath for chaining.
 */
function ensureDir(dirPath) {
  if (!dirPath || typeof dirPath !== 'string') {
    throw new Error('ensureDir requires a non-empty string path.')
  }

  fs.mkdirSync(dirPath, { recursive: true })
  return dirPath
}

/**
 * Initialize all user-data directories. Call once at app startup.
 *
 * @param {object} [options] - Optional overrides for testing.
 * @returns {ReturnType<typeof getAppPaths>}
 */
function initAppPaths(options = {}) {
  const paths = getAppPaths(options)

  ensureDir(paths.userData)
  ensureDir(paths.config)
  ensureDir(paths.logs)
  ensureDir(paths.cache)
  ensureDir(paths.database)
  ensureDir(paths.exports)
  ensureDir(paths.notes)
  ensureDir(paths.reports)

  return paths
}

/**
 * Safely try to use app.getPath, falling back to a default.
 *
 * @param {object | null} electronApp - Electron app object.
 * @param {string} name - Electron path name.
 * @param {string} fallback - Fallback path.
 * @returns {string}
 */
function safeGetPath(electronApp, name, fallback) {
  if (!electronApp) return fallback

  try {
    return electronApp.getPath(name)
  } catch {
    return fallback
  }
}

/**
 * Get the platform-appropriate cache base directory.
 *
 * @returns {string}
 */
function getCacheBase() {
  if (process.platform === 'win32') {
    return process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local')
  }

  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Caches')
  }

  return process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache')
}

module.exports = {
  APP_NAME,
  ensureDir,
  getAppPaths,
  getCacheBase,
  initAppPaths,
}

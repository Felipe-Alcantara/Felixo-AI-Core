/**
 * @module platform
 * Platform adapter factory.
 *
 * Detects the current OS and exports the matching adapter.
 * All other modules should `require('./platform/index.cjs')` instead of
 * checking `process.platform` directly.
 *
 * To get an adapter for a specific platform (useful in tests):
 *   const { getAdapter } = require('./platform/index.cjs')
 *   const win = getAdapter('win32')
 */

const adapters = {
  linux: () => require('./linux.cjs'),
  darwin: () => require('./darwin.cjs'),
  win32: () => require('./win32.cjs'),
}

/**
 * Get the adapter for a specific platform name.
 * Falls back to the base (Linux-like) adapter for unknown platforms.
 *
 * @param {string} platformName
 * @returns {typeof import('./base.cjs')}
 */
function getAdapter(platformName) {
  const loader = adapters[platformName]
  return loader ? loader() : require('./base.cjs')
}

/** The adapter for the current process platform. */
const current = getAdapter(process.platform)

module.exports = {
  ...current,
  getAdapter,
}

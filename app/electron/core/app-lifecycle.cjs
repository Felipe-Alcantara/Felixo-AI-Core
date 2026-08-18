/**
 * Decide whether closing the last window should terminate Electron.
 *
 * macOS keeps packaged applications alive in the Dock by convention. The
 * development process is different: its Vite server belongs to the same
 * start-up session and must be released when the last window closes, or the
 * next `npm run dev` inherits a stale port.
 *
 * @param {object} options
 * @param {string} options.platformName
 * @param {boolean} options.isDevelopment
 * @returns {boolean}
 */
function shouldQuitWhenAllWindowsClosed({ platformName, isDevelopment }) {
  return platformName !== 'darwin' || Boolean(isDevelopment)
}

module.exports = { shouldQuitWhenAllWindowsClosed }

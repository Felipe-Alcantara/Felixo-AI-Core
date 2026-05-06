/**
 * @module shell-adapter
 * Cross-platform shell detection and command execution helpers.
 *
 * Delegates all platform-specific behaviour to the adapters in ./platform/.
 */

const platform = require('./platform/index.cjs')

/**
 * Detect the default shell for the given (or current) platform.
 *
 * @param {object} [options]
 * @param {string} [options.platform] - Override platform detection.
 * @param {Record<string, string>} [options.env] - Override environment.
 * @returns {{ shell: string, shellArgs: string[], platform: string }}
 */
function detectDefaultShell(options = {}) {
  const adapter = resolveAdapter(options.platform)
  const env = options.env || process.env
  const shell = env.FELIXO_SHELL || adapter.getDefaultShell(env)
  const shellArgs = adapter.getShellArgs(shell)

  return { shell, shellArgs, platform: adapter.name }
}

/**
 * Escape a path or argument for safe use in shell commands.
 *
 * @param {string} arg - Argument to escape.
 * @param {string} [platformName] - Override platform detection.
 * @returns {string}
 */
function escapeShellArg(arg, platformName) {
  const adapter = resolveAdapter(platformName)
  return adapter.escapeArg(arg)
}

/**
 * Get the platform-specific signal for terminating a process tree.
 *
 * @param {string} [platformName] - Override platform detection.
 * @returns {{ signal: string, canKillGroup: boolean }}
 */
function getTerminationStrategy(platformName) {
  const adapter = resolveAdapter(platformName)
  return adapter.getTerminationStrategy()
}

/**
 * Build a cross-platform spawn options object.
 *
 * @param {object} options
 * @param {string} options.cwd - Working directory.
 * @param {Record<string, string>} [options.env] - Environment variables.
 * @returns {object} Options suitable for cross-spawn.
 */
function buildSpawnOptions({ cwd, env }) {
  return {
    cwd,
    env: env || process.env,
    detached: platform.shouldDetachProcess(),
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  }
}

/**
 * Get known differences and limitations per platform.
 *
 * @param {string} [platformName] - Override platform detection.
 * @returns {object}
 */
function getPlatformInfo(platformName) {
  const adapter = resolveAdapter(platformName)
  return adapter.getPlatformInfo()
}

// -- internal helpers --------------------------------------------------------

function resolveAdapter(platformName) {
  if (!platformName || platformName === process.platform) {
    return platform
  }

  return platform.getAdapter(platformName)
}

module.exports = {
  buildSpawnOptions,
  detectDefaultShell,
  escapeShellArg,
  getPlatformInfo,
  getTerminationStrategy,
}

/**
 * @module shell-adapter
 * Cross-platform shell detection and command execution helpers.
 *
 * Provides a consistent interface for detecting the default shell,
 * building shell-safe arguments, and handling platform-specific
 * differences in process management.
 */

const os = require('node:os')
const path = require('node:path')

/**
 * Detect the default shell for the current platform.
 *
 * @param {object} [options]
 * @param {string} [options.platform] - Override platform detection.
 * @param {Record<string, string>} [options.env] - Override environment.
 * @returns {{ shell: string, shellArgs: string[], platform: string }}
 */
function detectDefaultShell(options = {}) {
  const platform = options.platform || process.platform
  const env = options.env || process.env

  if (platform === 'win32') {
    const pwsh = env.FELIXO_SHELL || findPowerShell(env) || 'cmd.exe'
    const shellArgs = pwsh.toLowerCase().includes('powershell') || pwsh.toLowerCase().includes('pwsh')
      ? ['-NoProfile', '-NonInteractive', '-Command']
      : ['/d', '/s', '/c']
    return { shell: pwsh, shellArgs, platform }
  }

  if (platform === 'darwin') {
    const shell = env.FELIXO_SHELL || env.SHELL || '/bin/zsh'
    return { shell, shellArgs: ['-c'], platform }
  }

  // Linux and other Unix
  const shell = env.FELIXO_SHELL || env.SHELL || '/bin/bash'
  return { shell, shellArgs: ['-c'], platform }
}

/**
 * Try to find PowerShell 7+ (pwsh) or fall back to Windows PowerShell.
 *
 * @param {Record<string, string>} env
 * @returns {string | null}
 */
function findPowerShell(env) {
  const programFiles = env.ProgramFiles || 'C:\\Program Files'
  const candidates = [
    path.join(programFiles, 'PowerShell', '7', 'pwsh.exe'),
    'pwsh.exe',
    'powershell.exe',
  ]

  for (const candidate of candidates) {
    try {
      // Check if in PATH or absolute path exists
      if (path.isAbsolute(candidate)) {
        const fs = require('node:fs')
        if (fs.existsSync(candidate)) return candidate
      } else {
        return candidate // Will be resolved via PATH
      }
    } catch {
      continue
    }
  }

  return null
}

/**
 * Escape a path or argument for safe use in shell commands.
 * Handles spaces, special characters, and platform-specific quoting.
 *
 * @param {string} arg - Argument to escape.
 * @param {string} [platform] - Override platform detection.
 * @returns {string}
 */
function escapeShellArg(arg, platform) {
  const currentPlatform = platform || process.platform

  if (!arg) return '""'

  if (currentPlatform === 'win32') {
    // Windows: use double quotes, escape internal double quotes
    if (/[" &|<>^%]/.test(arg)) {
      return `"${arg.replace(/"/g, '\\"')}"`
    }
    return arg
  }

  // Unix: use single quotes, escape internal single quotes
  if (/[' "&|<>()$`\\!#*?[\]{}~;]/.test(arg) || arg.includes(' ')) {
    return `'${arg.replace(/'/g, "'\\''")}'`
  }

  return arg
}

/**
 * Get the platform-specific signal for terminating a process tree.
 *
 * @param {string} [platform] - Override platform detection.
 * @returns {{ signal: string, canKillGroup: boolean }}
 */
function getTerminationStrategy(platform) {
  const currentPlatform = platform || process.platform

  if (currentPlatform === 'win32') {
    return {
      signal: 'SIGTERM',
      canKillGroup: false,
      notes: 'Windows uses TerminateProcess. No process group kill available via Node.js signals.',
    }
  }

  return {
    signal: 'SIGTERM',
    canKillGroup: true,
    notes: 'Unix supports process group kill via -pid negative PID.',
  }
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
  const platform = process.platform

  return {
    cwd,
    env: env || process.env,
    detached: platform !== 'win32',
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  }
}

/**
 * Get known differences and limitations per platform.
 *
 * @param {string} [platform] - Override platform detection.
 * @returns {object}
 */
function getPlatformInfo(platform) {
  const currentPlatform = platform || process.platform

  const info = {
    linux: {
      defaultShell: '/bin/bash',
      pathSeparator: ':',
      supportsProcessGroups: true,
      supportsAnsiColors: true,
      notes: [
        'Most CLIs work natively.',
        'Permissions are file-based (chmod).',
        'AppImage may have restricted PATH.',
      ],
    },
    darwin: {
      defaultShell: '/bin/zsh',
      pathSeparator: ':',
      supportsProcessGroups: true,
      supportsAnsiColors: true,
      notes: [
        'Zsh is the default shell since macOS Catalina.',
        'Gatekeeper may block unsigned apps.',
        'Homebrew installs to /opt/homebrew on Apple Silicon.',
      ],
    },
    win32: {
      defaultShell: 'cmd.exe',
      pathSeparator: ';',
      supportsProcessGroups: false,
      supportsAnsiColors: true, // Windows 10+ Terminal
      notes: [
        'CMD uses different quoting rules.',
        'PowerShell is recommended over CMD.',
        'Process group termination requires alternative approach.',
        'PATH uses semicolon separator.',
        'CLIs may use .exe, .cmd, or .ps1 extensions.',
      ],
    },
  }

  return info[currentPlatform] || info.linux
}

module.exports = {
  buildSpawnOptions,
  detectDefaultShell,
  escapeShellArg,
  getPlatformInfo,
  getTerminationStrategy,
}

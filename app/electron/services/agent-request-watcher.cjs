'use strict'

const fs = require('node:fs')

/**
 * Watches the single request folder shared by agent-facing commands.
 *
 * @param {string} folder
 * @param {() => void} onChange
 * @returns {import('node:fs').FSWatcher|null}
 */
function observeAgentRequests(folder, onChange) {
  try {
    fs.mkdirSync(folder, { recursive: true })
    const watcher = fs.watch(folder, { persistent: false }, () => onChange())
    watcher.on('error', () => {})
    return watcher
  } catch {
    return null
  }
}

module.exports = { observeAgentRequests }

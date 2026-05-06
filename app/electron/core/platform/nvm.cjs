/**
 * @module platform/nvm
 * Shared NVM node version directory scanner.
 *
 * Used by cli-process-manager to discover Node.js binaries installed
 * via NVM on any Unix platform.
 */

const fs = require('node:fs')
const path = require('node:path')

/**
 * List NVM node bin directories, newest first.
 * @param {string} nodeVersionsPath - e.g. ~/.nvm/versions/node
 * @returns {string[]}
 */
function getNvmNodeBinCandidates(nodeVersionsPath) {
  try {
    return fs
      .readdirSync(nodeVersionsPath, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(nodeVersionsPath, entry.name, 'bin'))
      .filter((candidate) => directoryExists(candidate))
      .sort()
      .reverse()
  } catch {
    return []
  }
}

function directoryExists(candidate) {
  try {
    return fs.statSync(candidate).isDirectory()
  } catch {
    return false
  }
}

module.exports = { getNvmNodeBinCandidates }

'use strict'

const RELEASE_SMOKE_ARG = '--release-smoke'

function isReleaseSmokeProcess({ argv = process.argv, env = process.env } = {}) {
  return Array.isArray(argv) && argv.includes(RELEASE_SMOKE_ARG)
    || env?.FELIXO_RELEASE_SMOKE === '1'
}

module.exports = {
  RELEASE_SMOKE_ARG,
  isReleaseSmokeProcess,
}

'use strict'

/**
 * Names shared by the Electron writer and the standalone `felixo` reader.
 * This module must stay Node-only: the reader runs with Electron disabled.
 */

const CONTEXT_FILE_PREFIX = 'felixo-context-'
const CONTEXT_FILE_SUFFIX = '.txt'

module.exports = { CONTEXT_FILE_PREFIX, CONTEXT_FILE_SUFFIX }

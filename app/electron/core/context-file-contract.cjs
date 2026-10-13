'use strict'

/**
 * Names shared by the Electron writer and the standalone `felixo` reader.
 * This module must stay Node-only: the reader runs with Electron disabled.
 */

const CONTEXT_FILE_PREFIX = 'felixo-context-'
const CONTEXT_FILE_SUFFIX = '.txt'
/**
 * Subfolder, inside the context folder, that keeps the artifacts of sessions
 * that already ended. The agent conversation outlives its process (it is resumed
 * by id) and may ask for the same name again, so the reader falls back to it.
 */
const CONTEXT_EXPIRED_DIRNAME = 'expired'

module.exports = { CONTEXT_EXPIRED_DIRNAME, CONTEXT_FILE_PREFIX, CONTEXT_FILE_SUFFIX }

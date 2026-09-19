'use strict'

/**
 * Nome da partição do Electron de um perfil do navegador interno.
 *
 * Fica num módulo próprio (sem Electron) porque o id entra num nome de
 * partição — e o que o renderer manda nunca pode escolher a partição de
 * outro lugar (ex.: a do perfil Padrão, ou uma sem `persist:`).
 */
const DEFAULT_PROFILE_ID = 'default'
const DEFAULT_PARTITION = 'persist:felixo-webview'
const PARTITION_PREFIX = 'persist:felixo-webview-'
const PROFILE_ID_PATTERN = /^[a-z0-9][a-z0-9-]{2,39}$/

function isValidProfileId(id) {
  return typeof id === 'string' && PROFILE_ID_PATTERN.test(id) && id !== DEFAULT_PROFILE_ID
}

function partitionForProfile(id) {
  if (id === DEFAULT_PROFILE_ID) return DEFAULT_PARTITION
  if (!isValidProfileId(id)) {
    throw new Error('ID de perfil de navegador invalido.')
  }
  return `${PARTITION_PREFIX}${id}`
}

module.exports = {
  DEFAULT_PARTITION,
  DEFAULT_PROFILE_ID,
  PARTITION_PREFIX,
  isValidProfileId,
  partitionForProfile,
}

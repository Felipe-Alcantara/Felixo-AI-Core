'use strict'

const { ipcMain, session } = require('electron')
const { toErrorResult } = require('./ipc-result.cjs')
const { createWebviewProfilesRepository } = require('./storage/webview-profiles-repository.cjs')
const { isValidProfileId, partitionForProfile } = require('./webview-profile-partition.cjs')

/**
 * Perfis do navegador interno. Excluir um perfil apaga a sessão dele (cookies,
 * localStorage…): sem isso os logins ficariam num diretório de partição sem
 * dono, sem nenhum jeito de a pessoa removê-los depois.
 *
 * @param {{ database: unknown, clearProfileStorage?: (partition: string) => Promise<void> }} options
 */
function registerWebviewProfilesIpcHandlers(options = {}) {
  const repository = createWebviewProfilesRepository(options.database)
  const clearProfileStorage =
    options.clearProfileStorage ??
    (async (partition) => {
      const target = session.fromPartition(partition)
      await target.clearStorageData()
      await target.clearCache()
    })

  ipcMain.handle('webview-profiles:list', () => {
    try {
      return { ok: true, profiles: repository.list() }
    } catch (error) {
      return toErrorResult(error, 'Nao foi possivel carregar os perfis do navegador.')
    }
  })

  ipcMain.handle('webview-profiles:save', (_event, profile) => {
    try {
      return { ok: true, profile: repository.save(profile) }
    } catch (error) {
      return toErrorResult(error, 'Nao foi possivel salvar o perfil do navegador.')
    }
  })

  ipcMain.handle('webview-profiles:delete', async (_event, profileId) => {
    try {
      // Limpa a sessão ANTES de tirar o perfil da lista: se a limpeza falhar o
      // perfil continua existindo e a pessoa pode tentar de novo, em vez de
      // sobrar uma sessão logada que nenhuma tela alcança.
      // O Padrão é a sessão que já existia: excluí-lo apagaria o login de todos
      // os blocos antigos. `isValidProfileId` recusa 'default' de propósito.
      if (!isValidProfileId(profileId)) {
        throw new Error('O perfil Padrao nao pode ser excluido.')
      }
      await clearProfileStorage(partitionForProfile(profileId))
      return { ok: true, deleted: repository.delete(profileId) }
    } catch (error) {
      return toErrorResult(error, 'Nao foi possivel excluir o perfil do navegador.')
    }
  })

  return { repository }
}

module.exports = { registerWebviewProfilesIpcHandlers }

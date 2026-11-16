'use strict'

const { ipcMain } = require('electron')
const { toErrorResult } = require('./ipc-result.cjs')
const { DEFAULT_PROFILE_ID, isValidProfileId } = require('./webview-profile-partition.cjs')
const { PERMISSION_LABELS, siteOrigin } = require('./webview-site-permissions.cjs')

const isProfileId = (value) => value === DEFAULT_PROFILE_ID || isValidProfileId(value)

/**
 * Canais da faixa de permissão (bloco Página Web) e das listas de revogação
 * (menu do perfil e Configurações). O renderer só responde pedidos que o main
 * criou e só revoga: conceder sem um pedido pendente não existe.
 *
 * @param {{ getBroker: () => ReturnType<typeof import('./webview-site-permissions.cjs').createSitePermissionBroker> | null }} options
 */
function registerWebviewSitePermissionsIpcHandlers({ getBroker }) {
  const broker = () => {
    const current = getBroker()
    if (!current) throw new Error('Permissoes de sites indisponiveis.')
    return current
  }

  ipcMain.handle('webview-permissions:pending', () => {
    try {
      return { ok: true, pending: broker().listPending() }
    } catch (error) {
      return toErrorResult(error, 'Nao foi possivel ler os pedidos de permissao.')
    }
  })

  ipcMain.handle('webview-permissions:respond', (_event, params) => {
    try {
      if (typeof params?.id !== 'string' || typeof params?.allow !== 'boolean') {
        return { ok: false, message: 'Resposta de permissao invalida.' }
      }
      return broker().respond({ id: params.id, allow: params.allow })
    } catch (error) {
      return toErrorResult(error, 'Nao foi possivel responder o pedido de permissao.')
    }
  })

  ipcMain.handle('webview-permissions:list', (_event, params) => {
    try {
      const profileId = params?.profileId
      if (profileId !== undefined && !isProfileId(profileId)) return { ok: false, message: 'Perfil invalido.' }
      return { ok: true, decisions: broker().listDecisions(profileId) }
    } catch (error) {
      return toErrorResult(error, 'Nao foi possivel listar as permissoes dos sites.')
    }
  })

  ipcMain.handle('webview-permissions:revoke', (_event, params) => {
    try {
      const { profileId, origin, permission } = params ?? {}
      if (!isProfileId(profileId) || siteOrigin(origin) !== origin) {
        return { ok: false, message: 'Site ou perfil invalido.' }
      }
      if (permission !== undefined && !Object.hasOwn(PERMISSION_LABELS, permission)) {
        return { ok: false, message: 'Permissao invalida.' }
      }
      return broker().revoke({ profileId, origin, permission })
    } catch (error) {
      return toErrorResult(error, 'Nao foi possivel revogar a permissao.')
    }
  })
}

module.exports = { registerWebviewSitePermissionsIpcHandlers }

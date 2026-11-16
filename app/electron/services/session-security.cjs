'use strict'

const {
  classifyExternalUrl,
  describeExternalUrlForLog,
} = require('./external-url-policy.cjs')
const { profileIdFromStoragePath } = require('./webview-site-permissions.cjs')

/**
 * Permissão `openExternal` de todas as sessões do app (a padrão e as
 * partições dos perfis do navegador interno).
 *
 * Quando uma página tenta navegar para um esquema que o Chromium não trata
 * (`vscode:`, `ms-msdt:`, `search-ms:`...), o Electron pede esta permissão
 * e, sem handler, a concede: o sistema abre o programa daquele esquema. Isto
 * é o mesmo que um `shell.openExternal` que não passa por
 * `external-links.cjs`, então vale a mesma política. Um redirecionamento de
 * uma página web para um esquema desses cai aqui também.
 *
 * As outras permissões dependem da sessão (ver `registerSessionSecurity`):
 * a do app concede, como antes; a de um site pergunta à pessoa.
 *
 * @param {string} permission
 * @param {{ externalURL?: string } | undefined} details
 * @returns {boolean}
 */
function decidePermissionRequest(permission, details) {
  if (permission !== 'openExternal') return true
  return classifyExternalUrl(details?.externalURL).ok
}

/**
 * De quem é a sessão: um perfil do navegador interno (site), o app (a sessão
 * padrão, do renderer) ou outra (nega). Lida no pedido, não no registro: a
 * padrão só existe depois do ready.
 *
 * @returns {{ kind: 'site', profileId: string } | { kind: 'app' } | { kind: 'other' }}
 */
function classifySession(target, defaultSession) {
  const profileId = profileIdFromStoragePath(target?.storagePath)
  if (profileId) return { kind: 'site', profileId }
  return target && target === defaultSession ? { kind: 'app' } : { kind: 'other' }
}

/**
 * @param {import('electron').App} electronApp
 * @param {{ defaultSession: import('electron').Session }} electronSession
 * @param {{ warn: (message: string) => void }} [logger]
 * @param {{ getSitePermissions?: () => ReturnType<typeof import('./webview-site-permissions.cjs').createSitePermissionBroker> | null }} [options]
 *   O broker nasce depois do banco; até lá, pedido de site é negado.
 */
function registerSessionSecurity(electronApp, electronSession, logger = console, options = {}) {
  const hardened = new WeakSet()
  const getSitePermissions = options.getSitePermissions ?? (() => null)

  const harden = (target) => {
    if (!target || hardened.has(target)) return
    hardened.add(target)
    target.setPermissionRequestHandler((webContents, permission, callback, details) => {
      if (permission === 'openExternal') {
        const granted = decidePermissionRequest(permission, details)
        if (!granted) {
          logger.warn(
            `[session-security] esquema externo recusado: ${describeExternalUrlForLog(details?.externalURL)}`,
          )
        }
        return callback(granted)
      }
      const owner = classifySession(target, electronSession.defaultSession)
      if (owner.kind === 'app') return callback(true)
      const broker = owner.kind === 'site' ? getSitePermissions() : null
      if (!broker) return callback(false)
      return broker.request({ webContents, permission, details, profileId: owner.profileId, callback })
    })
    // Sem este handler o Electron responde "concedido" a toda consulta
    // (`navigator.permissions.query`, `Notification.permission`), e o site
    // usaria a API sem pedir. Sem decisão o estado é "negado": o Electron não
    // tem "perguntar", mas o pedido ainda chega ao handler acima (medido).
    target.setPermissionCheckHandler?.((_webContents, permission, requestingOrigin, details) => {
      if (permission === 'openExternal') return true
      const owner = classifySession(target, electronSession.defaultSession)
      if (owner.kind === 'app') return true
      const broker = owner.kind === 'site' ? getSitePermissions() : null
      return Boolean(broker?.check({ profileId: owner.profileId, permission, requestingOrigin, details }))
    })
  }

  // Partições nascem sob demanda (um bloco "Página Web" com perfil novo): o
  // evento cobre as que ainda não existem. A padrão só existe depois do ready.
  electronApp.on('session-created', harden)
  void electronApp.whenReady().then(() => harden(electronSession.defaultSession))
}

module.exports = {
  classifySession,
  decidePermissionRequest,
  registerSessionSecurity,
}

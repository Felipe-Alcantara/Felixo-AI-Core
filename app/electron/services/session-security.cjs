'use strict'

const {
  classifyExternalUrl,
  describeExternalUrlForLog,
} = require('./external-url-policy.cjs')

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
 * As outras permissões continuam com o padrão do Electron (conceder); mudar
 * câmera, microfone ou notificação está fora do escopo desta barreira.
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
 * @param {import('electron').App} electronApp
 * @param {{ defaultSession: import('electron').Session }} electronSession
 * @param {{ warn: (message: string) => void }} [logger]
 */
function registerSessionSecurity(electronApp, electronSession, logger = console) {
  const hardened = new WeakSet()

  const harden = (target) => {
    if (!target || hardened.has(target)) return
    hardened.add(target)
    target.setPermissionRequestHandler((_webContents, permission, callback, details) => {
      const granted = decidePermissionRequest(permission, details)
      if (!granted) {
        logger.warn(
          `[session-security] esquema externo recusado: ${describeExternalUrlForLog(details?.externalURL)}`,
        )
      }
      callback(granted)
    })
  }

  // Partições nascem sob demanda (um bloco "Página Web" com perfil novo): o
  // evento cobre as que ainda não existem. A padrão só existe depois do ready.
  electronApp.on('session-created', harden)
  void electronApp.whenReady().then(() => harden(electronSession.defaultSession))
}

module.exports = {
  decidePermissionRequest,
  registerSessionSecurity,
}

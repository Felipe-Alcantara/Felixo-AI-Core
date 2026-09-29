const { shell } = require('electron')
const {
  classifyExternalUrl,
  describeExternalUrlForLog,
} = require('./external-url-policy.cjs')

/**
 * `setWindowOpenHandler` da janela principal. Todo `window.open` e todo link
 * `target="_blank"` do renderer chega aqui — inclusive os que conteúdo externo
 * (saída de CLI, Markdown de agente) consegue provocar — e nenhum vira janela:
 * ou sai pelo opener abaixo, com a política aplicada, ou morre aqui.
 */
function denyExternalWindowOpen(details) {
  // O opener já registrou a recusa; o `catch` só impede que ela vire uma
  // rejeição sem dono no processo principal.
  openExternalUrl(details?.url).catch(() => {})
  return { action: 'deny' }
}

/**
 * Único caminho do app até o `shell.openExternal`. Recusa tudo que a política
 * não aprova, e a recusa (log e mensagem de erro) leva só esquema e host: a
 * URL inteira pode ter token de convite, link assinado ou senha.
 *
 * @param {unknown} url
 * @param {{ openExternal: (url: string) => Promise<void> }} [electronShell]
 * @param {{ warn: (message: string) => void }} [logger]
 * @returns {Promise<void>}
 */
async function openExternalUrl(url, electronShell = shell, logger = console) {
  const decision = classifyExternalUrl(url)
  if (!decision.ok) {
    const message = `Link externo recusado (${decision.reason}): ${describeExternalUrlForLog(url)}`
    logger.warn(`[external-links] ${message}`)
    throw new Error(message)
  }

  return electronShell.openExternal(decision.url)
}

module.exports = {
  denyExternalWindowOpen,
  openExternalUrl,
}

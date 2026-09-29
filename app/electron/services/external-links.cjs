const { shell } = require('electron')
const {
  classifyExternalUrl,
  describeExternalUrlForLog,
} = require('./external-url-policy.cjs')
const { platformShell } = require('./linux-xdg-open.cjs')

/**
 * Canal pelo qual o processo principal avisa a janela de que um link não
 * abriu. Sem ele, "Abrir no navegador" fechava o menu e, se o sistema não
 * tinha navegador padrão (ou recusou), nada mais acontecia.
 */
const EXTERNAL_OPEN_FAILED_CHANNEL = 'external-links:open-failed'

/** Código do erro de recusa da política, para quem precisa separá-la da falha do sistema. */
const EXTERNAL_URL_REFUSED = 'EXTERNAL_URL_REFUSED'

/**
 * Handler de `setWindowOpenHandler` da janela principal. Todo `window.open` e
 * todo link `target="_blank"` do renderer chega aqui — inclusive os que
 * conteúdo externo (saída de CLI, Markdown de agente) consegue provocar — e
 * nenhum vira janela: ou sai pelo opener abaixo, com a política aplicada, ou
 * morre aqui.
 *
 * A abertura é assíncrona e o handler precisa responder na hora. Quando ela
 * falha, `notify` recebe o que a janela precisa para avisar a pessoa (ver
 * `describeExternalOpenFailure`).
 *
 * @param {object} [options]
 * @param {(failure: ReturnType<typeof describeExternalOpenFailure>) => void} [options.notify]
 * @param {(url: unknown) => Promise<void>} [options.open]
 * @returns {(details: { url?: unknown } | undefined) => { action: 'deny' }}
 */
function createExternalWindowOpenHandler({ notify = () => {}, open = (url) => openExternalUrl(url) } = {}) {
  return (details) => {
    const url = details?.url
    Promise.resolve()
      .then(() => open(url))
      .catch((error) => {
        // O aviso não pode virar uma rejeição sem dono no processo principal.
        try {
          notify(describeExternalOpenFailure(url, error))
        } catch {
          // A janela pode ter fechado no meio: não há mais quem avisar.
        }
      })
    return { action: 'deny' }
  }
}

/** O handler sem aviso, para quem não tem janela para avisar. */
const denyExternalWindowOpen = createExternalWindowOpenHandler()

/**
 * O que a janela recebe quando um link não abre. `recusado` é a política (o
 * motivo vai junto, legível); `falhou` é o sistema, que não entregou o
 * endereço a um navegador. A URL volta como veio, para o "Copiar link" do
 * aviso: vai só para a janela que pediu a abertura, nunca para log.
 *
 * @param {unknown} url
 * @param {unknown} error
 * @returns {{ url: string, kind: 'recusado' | 'falhou', reason?: string }}
 */
function describeExternalOpenFailure(url, error) {
  const text = typeof url === 'string' ? url : ''
  if (error && typeof error === 'object' && error.code === EXTERNAL_URL_REFUSED) {
    return { url: text, kind: 'recusado', reason: String(error.reason ?? '') }
  }
  return { url: text, kind: 'falhou' }
}

/**
 * Único caminho do app até o `shell.openExternal`. Recusa tudo que a política
 * não aprova, e a recusa (log e mensagem de erro) leva só esquema e host: a
 * URL inteira pode ter token de convite, link assinado ou senha. A falha do
 * sistema (sem navegador padrão, handler quebrado) segue a mesma regra no log.
 *
 * Sem `electronShell`, abre pelo shell da plataforma: no Linux, o que roda o
 * `xdg-open` e sabe quando ele falhou (`linux-xdg-open.cjs`); nos outros, o do
 * Electron.
 *
 * @param {unknown} url
 * @param {{ openExternal: (url: string) => Promise<void> }} [electronShell]
 * @param {{ warn: (message: string) => void }} [logger]
 * @returns {Promise<void>}
 */
async function openExternalUrl(url, electronShell = platformShell(shell), logger = console) {
  const decision = classifyExternalUrl(url)
  if (!decision.ok) {
    const message = `Link externo recusado (${decision.reason}): ${describeExternalUrlForLog(url)}`
    logger.warn(`[external-links] ${message}`)
    const error = new Error(message)
    error.code = EXTERNAL_URL_REFUSED
    error.reason = decision.reason
    throw error
  }

  try {
    return await electronShell.openExternal(decision.url)
  } catch (error) {
    // A mensagem do sistema pode repetir a URL inteira: no log, só o tipo.
    logger.warn(
      `[external-links] O sistema não abriu o link (${error?.name ?? 'Error'}): ${describeExternalUrlForLog(decision.url)}`,
    )
    throw error
  }
}

module.exports = {
  EXTERNAL_OPEN_FAILED_CHANNEL,
  EXTERNAL_URL_REFUSED,
  createExternalWindowOpenHandler,
  denyExternalWindowOpen,
  describeExternalOpenFailure,
  openExternalUrl,
}

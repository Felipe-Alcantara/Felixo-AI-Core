/**
 * Regra dos embeds do Excalidraw (decisão de 17/11/2026: a lista inteira dele
 * volta, com os 14 domínios). Duas barreiras andam juntas:
 *
 * - `frame-src` da CSP do build (`scripts/renderer-csp.cjs`): só os hosts dos
 *   frames. O `script-src` do documento principal continua sem host remoto.
 * - `isExcalidrawEmbedLink`: o que o Excalidraw aceita montar. Responde sempre
 *   boolean; um `undefined` faria o Excalidraw cair na lista embutida dele.
 *
 * Script de terceiro nunca roda com a origem do app. O Excalidraw monta X,
 * Reddit e Gist como `srcdoc` com `<script src>` do site e, em X e Reddit,
 * com `allow-same-origin`: o script herdaria a origem do app. Por isso esses
 * três não passam pelo frame padrão: `isolatedEmbedSrc` aponta o frame para a
 * página de embed do próprio site (outra origem) e `ISOLATED_EMBED_SANDBOX`
 * não tem `allow-same-origin` nem `allow-top-navigation`.
 */

/** Os 14 domínios da lista do Excalidraw 0.18 (iguais a `EXCALIDRAW_EMBED_LINK_HOSTS` da CSP). */
export const EXCALIDRAW_EMBED_LINK_HOSTS = [
  'youtube.com',
  'youtu.be',
  'vimeo.com',
  'player.vimeo.com',
  'figma.com',
  'link.excalidraw.com',
  'gist.github.com',
  'twitter.com',
  'x.com',
  '*.simplepdf.eu',
  'stackblitz.com',
  'val.town',
  'giphy.com',
  'reddit.com',
] as const

/** Sem `allow-same-origin` (origem opaca) e sem `allow-top-navigation`. */
export const ISOLATED_EMBED_SANDBOX =
  'allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation allow-downloads'

const LINK_HOSTS = new Set<string>(EXCALIDRAW_EMBED_LINK_HOSTS)

// Mesmas expressões do Excalidraw 0.18.1 (não ancoradas, de propósito): se o
// Excalidraw escolheria o `srcdoc` para um link, este módulo também isola.
const TWEET = /(?:https?:\/\/)?(?:(?:w){3}\.)?(?:twitter|x)\.com\/[^/]+\/status\/(\d+)/
const REDDIT =
  /^(?:http(?:s)?:\/\/)?(?:www\.)?reddit\.com\/r\/([a-zA-Z0-9_]+)\/comments\/([a-zA-Z0-9_]+)\/([a-zA-Z0-9_]+)\/?(?:\?[^#\s]*)?(?:#[^\s]*)?$/
const GIST = /^https:\/\/gist\.github\.com\/([\w_-]+)\/([\w_-]+)/

/** Link `https` cujo host (sem `www.`) é um dos 14 domínios da lista. */
export function isExcalidrawEmbedLink(link: string | null | undefined): boolean {
  if (!link) return false
  let url: URL
  try {
    url = new URL(link)
  } catch {
    return false
  }
  if (url.protocol !== 'https:') return false
  const host = url.hostname.replace(/^www\./, '')
  return LINK_HOSTS.has(host) || LINK_HOSTS.has(host.replace(/^[^.]+/, '*'))
}

/**
 * Página de embed do próprio site para os links que o Excalidraw montaria
 * como `srcdoc` com script (X, Reddit e Gist); `null` para os demais, que
 * seguem no frame padrão do Excalidraw (iframe simples de outra origem).
 */
export function isolatedEmbedSrc(
  link: string | null | undefined,
  theme: 'light' | 'dark',
): string | null {
  if (!link) return null
  const tweet = TWEET.exec(link)
  if (tweet) return `https://platform.twitter.com/embed/Tweet.html?dnt=true&theme=${theme}&id=${tweet[1]}`
  const reddit = REDDIT.exec(link)
  if (reddit) {
    return `https://embed.reddit.com/r/${reddit[1]}/comments/${reddit[2]}/${reddit[3]}/?embed=true&theme=${theme}`
  }
  const gist = GIST.exec(link)
  // shortcut: o gist vai pela versão HTML (.pibb), sem o script de widget; não medido no Electron.
  if (gist) return `https://gist.github.com/${gist[1]}/${gist[2]}.pibb`
  return null
}

'use strict'

/**
 * Content-Security-Policy do renderer empacotado.
 *
 * O app instalado abre `dist/index.html` por `file://` (`loadFile` em
 * `electron/windows/main-window.cjs`): não existe servidor HTTP no meio para
 * mandar a política num header, então ela vai numa
 * `<meta http-equiv="Content-Security-Policy">` que o plugin do Vite injeta no
 * HTML final do build (ver `vite.config.ts`). Este módulo é a parte pura e
 * testável: monta a política e calcula o hash de cada `<script>` inline a
 * partir do HTML que de fato vai para o disco.
 *
 * O hash nunca é escrito à mão porque um hash desatualizado não quebra o
 * build: quebra o boot em silêncio. O script inline do `index.html` é o que
 * liga o botão "Recarregar interface" do fallback de boot; bloqueado pela CSP,
 * o botão continua na tela e simplesmente não faz nada, justamente na situação
 * (chunk que falhou, máquina lenta) em que ele é a única saída.
 */

const { createHash } = require('node:crypto')

/**
 * Diretivas fixas. O `script-src` recebe os hashes do HTML em
 * `buildRendererCsp`; o resto não depende do conteúdo.
 *
 * Medido no Electron do projeto com o renderer do build (file://):
 * - `'self'` sob `file://` casa com QUALQUER URL `file:`, inclusive fora de
 *   `dist/` (script, módulo e imagem de outra pasta carregaram). É o limite da
 *   origem `file://`, não desta política; o que a política garante é que nada
 *   inline sem hash e nada de `eval` roda, e que a única origem de rede é a
 *   das fontes do Excalidraw, só em `font-src` (ver abaixo).
 * - `frame-src` não controla `<webview>`: o bloco "Página Web" continua
 *   carregando com `frame-src 'none'`. O isolamento do webview é do processo
 *   principal (`will-attach-webview`), não desta política.
 *
 * `frame-ancestors`, `report-uri` e `sandbox` ficam de fora porque o navegador
 * os ignora quando a política vem por `<meta>`.
 */
const RENDERER_CSP_DIRECTIVES = Object.freeze([
  // Base para tudo que não tem diretiva própria: só o próprio build.
  ['default-src', ["'self'"]],
  // Chunks do Vite (dist/assets) + scripts inline por hash. Sem
  // 'unsafe-inline' e sem 'unsafe-eval': o bundle não usa `eval` nem
  // `new Function`, e um <script> que chegue por conteúdo externo (Markdown,
  // saída de CLI, cena colada) não roda.
  ['script-src', ["'self'"]],
  // 'unsafe-inline' é inevitável aqui: o <style> do index.html, o do
  // CanvasAmbientLayer e as folhas que o xterm e o Excalidraw injetam em
  // tempo de execução têm conteúdo dinâmico, que não dá para hashear no build.
  // Estilo não executa código; o risco que sobra é visual.
  ['style-src', ["'self'", "'unsafe-inline'"]],
  // data: → imagem inline do Markdown (MIME raster e limite de tamanho
  // checados em markdown-image-src.ts) e ícones da UI; blob: → prévia de
  // imagem colada no Composer (URL.createObjectURL); file: → imagem relativa
  // do Markdown, que `toFileUrl` resolve para file://. Hoje o 'self' já cobre
  // file: (ver acima), mas fica explícito para essa dependência não sumir se o
  // renderer um dia trocar de esquema. Sem http(s): a imagem remota já é
  // recusada no renderer, e a CSP é a segunda barreira contra request de
  // rastreio disparado por conteúdo.
  ['img-src', ["'self'", 'data:', 'blob:', 'file:']],
  // https://esm.sh: sem `window.EXCALIDRAW_ASSET_PATH`, o Excalidraw registra
  // as fontes do desenho (Excalifont, Xiaolai, …) apontando para o CDN dele.
  // Liberado SÓ aqui, por três motivos: mantém o comportamento de hoje (o
  // texto do desenho continua com a fonte certa), fonte não executa código, e
  // servir essas fontes pelo próprio build (cerca de 14 MB a mais no pacote) é
  // uma task de acompanhamento. `connect-src` continua fechado de propósito: o
  // `fetch` das mesmas fontes no export do Excalidraw fica bloqueado, e o
  // export cai no fallback dele.
  ['font-src', ["'self'", 'data:', 'https://esm.sh']],
  // A única mídia do renderer é o som de notificação empacotado
  // (`new Audio('./sounds/notification.mp3')`); o microfone do ditado vem de
  // getUserMedia, que a CSP não governa.
  ['media-src', ["'self'"]],
  // O renderer não fala com a rede: tudo que é remoto passa por IPC no
  // processo principal.
  ['connect-src', ["'self'"]],
  // Worker de subset de fontes do Excalidraw (arquivo do build) e o worker
  // blob: do pica, que o Excalidraw usa para reduzir imagem inserida.
  ['worker-src', ["'self'", 'blob:']],
  ['object-src', ["'none'"]],
  // Sem <base>: um <base href> injetado mudaria para onde apontam todos os
  // caminhos relativos dos chunks.
  ['base-uri', ["'none'"]],
  // Nenhum <form> do app navega; todos tratam o submit em JS. Um submit
  // "de verdade" recarregaria o renderer por cima dos terminais vivos.
  ['form-action', ["'none'"]],
  ['frame-src', ["'none'"]],
])

const CSP_META_PATTERN = /<meta\b[^>]*http-equiv\s*=\s*["']?content-security-policy["']?[^>]*>/i
// Comentário vem primeiro na alternância: no ponto em que um `<!--` começa, o
// comentário inteiro é consumido e um <script> comentado não entra no hash.
const SCRIPT_OR_COMMENT_PATTERN = /<!--[\s\S]*?-->|<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi
const SRC_ATTRIBUTE_PATTERN = /(?:^|\s)src\s*=/i

/**
 * Texto de cada `<script>` inline (sem `src`), na ordem do documento.
 *
 * @param {string} html
 * @returns {string[]}
 */
function extractInlineScripts(html) {
  const scripts = []
  for (const match of html.matchAll(SCRIPT_OR_COMMENT_PATTERN)) {
    const attributes = match[1]
    if (attributes === undefined) continue
    if (SRC_ATTRIBUTE_PATTERN.test(attributes)) continue
    scripts.push(match[2])
  }
  return scripts
}

/**
 * Fonte CSP (`'sha256-…'`) do texto de um script inline.
 *
 * O navegador calcula o hash DEPOIS do pré-processamento da entrada HTML, que
 * troca CRLF e CR soltos por LF. O `index.html` deste repositório sai do
 * checkout do Windows com CRLF (e o build mistura CRLF com LF), então hashear
 * o texto cru daria um hash que nunca bate e o script seria bloqueado.
 *
 * @param {string} scriptText
 * @returns {string}
 */
function hashInlineScript(scriptText) {
  const normalized = scriptText.replace(/\r\n?/g, '\n')
  const digest = createHash('sha256').update(normalized, 'utf8').digest('base64')
  return `'sha256-${digest}'`
}

/**
 * @param {string} html
 * @returns {string[]} hashes únicos, na ordem em que os scripts aparecem
 */
function hashInlineScripts(html) {
  return [...new Set(extractInlineScripts(html).map(hashInlineScript))]
}

/**
 * Monta a política para um HTML: as diretivas fixas mais os hashes dos
 * scripts inline dele no `script-src`.
 *
 * @param {string} html
 * @returns {{ policy: string, scriptHashes: string[] }}
 */
function buildRendererCsp(html) {
  const scriptHashes = hashInlineScripts(html)
  const policy = RENDERER_CSP_DIRECTIVES.map(([name, sources]) => {
    const values = name === 'script-src' ? [...sources, ...scriptHashes] : sources
    return `${name} ${values.join(' ')}`
  }).join('; ')
  return { policy, scriptHashes }
}

function escapeAttribute(value) {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}

/**
 * Devolve o HTML com a `<meta>` da CSP logo depois do `<meta charset>`.
 *
 * A posição importa: uma política em `<meta>` só vale para o que vem DEPOIS
 * dela no documento. O charset continua primeiro porque o navegador só o
 * procura no começo do arquivo.
 *
 * @param {string} html
 * @returns {string}
 */
function injectRendererCsp(html) {
  if (CSP_META_PATTERN.test(html)) {
    // Duas políticas se somam (o navegador aplica a interseção): uma meta
    // antiga esquecida no index.html bloquearia o que esta aqui libera.
    throw new Error('[renderer-csp] o HTML já tem uma meta Content-Security-Policy.')
  }
  const { policy } = buildRendererCsp(html)
  const meta = `<meta http-equiv="Content-Security-Policy" content="${escapeAttribute(policy)}" />`
  const anchor = /<meta\s+charset\s*=[^>]*>/i.exec(html) ?? /<head\b[^>]*>/i.exec(html)
  if (!anchor) {
    throw new Error('[renderer-csp] o HTML não tem <head> para receber a meta da CSP.')
  }
  const insertAt = anchor.index + anchor[0].length
  return `${html.slice(0, insertAt)}\n    ${meta}${html.slice(insertAt)}`
}

/**
 * Confere um HTML já com a CSP: a meta existe, vem antes de qualquer script,
 * estilo ou link, e o `script-src` dela contém o hash de todo script inline
 * que o documento tem agora. Vazio quando está tudo certo.
 *
 * Existe para rodar sobre o arquivo que o bundle vai gravar, depois de todas
 * as transformações do Vite: se algo mexer num script inline depois da
 * injeção, o build falha em vez de publicar um boot que não funciona.
 *
 * @param {string} html
 * @returns {string[]}
 */
function verifyRendererCsp(html) {
  const meta = CSP_META_PATTERN.exec(html)
  if (!meta) return ['nenhuma meta Content-Security-Policy no HTML']

  const problems = []
  const firstResource = /<(?:script|style|link)\b/i.exec(html)
  if (firstResource && firstResource.index < meta.index) {
    problems.push('a meta da CSP vem depois de um <script>, <style> ou <link>, que ficaria sem política')
  }

  const content = /\bcontent\s*=\s*"([^"]*)"/i.exec(meta[0])?.[1] ?? ''
  const policy = content.replace(/&quot;/g, '"').replace(/&amp;/g, '&')
  const scriptSrc = policy
    .split(';')
    .map((directive) => directive.trim().split(/\s+/))
    .find(([name]) => name === 'script-src')
  if (!scriptSrc) {
    problems.push('a política não tem script-src')
    return problems
  }
  for (const hash of hashInlineScripts(html)) {
    if (!scriptSrc.includes(hash)) {
      problems.push(`script inline sem hash na política: ${hash}`)
    }
  }
  return problems
}

module.exports = {
  RENDERER_CSP_DIRECTIVES,
  buildRendererCsp,
  extractInlineScripts,
  hashInlineScript,
  hashInlineScripts,
  injectRendererCsp,
  verifyRendererCsp,
}

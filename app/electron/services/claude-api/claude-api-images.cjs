'use strict'

/**
 * Imagens coladas no bloco do Claude por chave de API.
 *
 * O bloco manda a imagem dentro da mensagem, em base64, como a API da
 * Anthropic recebe (`{ type: 'image', source: { type: 'base64', ... } }`).
 * Medido em 21/10/2026 com o Claude Code 2.1.306: `claude -p --input-format
 * stream-json` aceita esse bloco e o modelo descreve a imagem.
 *
 * O renderer já reduz e converte a imagem antes de mandar. Aqui é a borda de
 * confiança: só passa tipo da lista, base64 válido, bytes que começam como o
 * tipo declarado e tamanho dentro do limite da API. Os limites moram em
 * `claude-api-image-limits.json`, lido também pelo renderer.
 */

const CLAUDE_API_IMAGE_LIMITS = require('./claude-api-image-limits.json')

const LABELS = {
  'image/png': 'PNG',
  'image/jpeg': 'JPEG',
  'image/gif': 'GIF',
  'image/webp': 'WebP',
}

/** Primeiros bytes de cada formato. */
function matchesSignature(mediaType, head) {
  switch (mediaType) {
    case 'image/png':
      return head.length >= 4 && head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47
    case 'image/jpeg':
      return head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff
    case 'image/gif':
      return head.length >= 4 && head.toString('latin1', 0, 4) === 'GIF8'
    case 'image/webp':
      return head.length >= 12 && head.toString('latin1', 0, 4) === 'RIFF' && head.toString('latin1', 8, 12) === 'WEBP'
    default:
      return false
  }
}

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/

/**
 * @param {unknown} raw - `images` do pedido do renderer.
 * @returns {{ ok: true, images: { mediaType: string, data: string }[] } | { ok: false, message: string }}
 */
function normalizeClaudeApiImages(raw) {
  if (raw === undefined || raw === null) return { ok: true, images: [] }
  if (!Array.isArray(raw)) return { ok: false, message: 'Imagens em formato inválido.' }
  if (raw.length > CLAUDE_API_IMAGE_LIMITS.maxImagesPerMessage) {
    return { ok: false, message: `Mande no máximo ${CLAUDE_API_IMAGE_LIMITS.maxImagesPerMessage} imagens por mensagem.` }
  }
  const images = []
  for (const [index, item] of raw.entries()) {
    const position = raw.length > 1 ? ` (imagem ${index + 1})` : ''
    const mediaType = item && typeof item === 'object' ? item.mediaType : undefined
    const data = item && typeof item === 'object' ? item.data : undefined
    if (typeof mediaType !== 'string' || !CLAUDE_API_IMAGE_LIMITS.types.includes(mediaType)) {
      return { ok: false, message: `Formato de imagem não aceito${position}. Use PNG, JPEG, GIF ou WebP.` }
    }
    if (typeof data !== 'string' || !data) {
      return { ok: false, message: `Imagem vazia${position}.` }
    }
    if (data.length > CLAUDE_API_IMAGE_LIMITS.maxBase64Chars) {
      return { ok: false, message: `Imagem grande demais${position}: a API aceita até 5 MB por imagem.` }
    }
    if (data.length % 4 !== 0 || !BASE64.test(data)) {
      return { ok: false, message: `Imagem corrompida${position}.` }
    }
    const head = Buffer.from(data.slice(0, 24), 'base64')
    if (!matchesSignature(mediaType, head)) {
      return { ok: false, message: `O arquivo${position} não é uma imagem ${LABELS[mediaType]}.` }
    }
    images.push({ mediaType, data })
  }
  return { ok: true, images }
}

/**
 * Conteúdo da mensagem do usuário. Sem imagem continua sendo só o texto (como
 * sempre foi); com imagem vira a lista de blocos da API, imagens antes do
 * texto, como a Anthropic recomenda.
 */
function buildClaudeApiUserContent(text, images) {
  if (!images || images.length === 0) return text
  const blocks = images.map((image) => ({
    type: 'image',
    source: { type: 'base64', media_type: image.mediaType, data: image.data },
  }))
  if (typeof text === 'string' && text.trim()) blocks.push({ type: 'text', text })
  return blocks
}

module.exports = {
  CLAUDE_API_IMAGE_LIMITS,
  normalizeClaudeApiImages,
  buildClaudeApiUserContent,
}

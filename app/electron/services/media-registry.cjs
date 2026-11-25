'use strict'

const { randomUUID } = require('node:crypto')
const { mediaMimeTypeFromFileName } = require('./media-mime-types.cjs')

/** Ids vivos ao mesmo tempo; o mais antigo sai primeiro. */
const MAX_MEDIA_IDS = 256

/**
 * Identificadores opacos para a rota `app://felixo/__midia/<id>`: o renderer
 * nunca vê o caminho do arquivo na URL, e um id que ele inventa não resolve.
 * A autorização (`authorize`, a mesma do bloco de arquivo) roda na emissão e de
 * novo a cada pedido, então uma concessão revogada para de servir na hora.
 *
 * @param {object} options
 * @param {(filePath: unknown) => string} options.authorize - caminho real autorizado, ou lança
 */
function createMediaRegistry({ authorize, max = MAX_MEDIA_IDS }) {
  /** id -> caminho real */
  const byId = new Map()
  /** caminho real -> id: abrir o mesmo arquivo de novo não cria outro id. */
  const byPath = new Map()

  function issue(filePath) {
    const resolved = authorize(filePath)
    const mimeType = mediaMimeTypeFromFileName(resolved)
    if (!mimeType) throw new Error('O arquivo não é um áudio ou vídeo reconhecido.')
    let id = byPath.get(resolved)
    if (!id) {
      id = randomUUID()
      byId.set(id, resolved)
      byPath.set(resolved, id)
      if (byId.size > max) {
        const [oldestId, oldestPath] = byId.entries().next().value
        byId.delete(oldestId)
        byPath.delete(oldestPath)
      }
    }
    return { id, mimeType }
  }

  /** `{ filePath, mimeType }` do id, ou `null` (desconhecido, revogado ou fora das pastas autorizadas). */
  function resolve(id) {
    const stored = typeof id === 'string' ? byId.get(id) : undefined
    if (!stored) return null
    try {
      const filePath = authorize(stored)
      const mimeType = mediaMimeTypeFromFileName(filePath)
      return mimeType ? { filePath, mimeType } : null
    } catch {
      return null
    }
  }

  function clear() {
    byId.clear()
    byPath.clear()
  }

  return { issue, resolve, clear }
}

module.exports = { MAX_MEDIA_IDS, createMediaRegistry }

'use strict'

const fs = require('node:fs')
const { Readable } = require('node:stream')

/**
 * `Range` de um só intervalo (`bytes=a-b`, `bytes=a-`, `bytes=-n`).
 * `null` = sem Range útil (serve o arquivo inteiro); `'invalid'` = 416.
 */
function parseRange(header, size) {
  if (typeof header !== 'string') return null
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!match) return null // outra unidade ou vários intervalos: o servidor pode ignorar
  const [, rawStart, rawEnd] = match
  if (rawStart === '' && rawEnd === '') return 'invalid'
  let start
  let end
  if (rawStart === '') {
    const suffix = Number(rawEnd)
    if (suffix === 0) return 'invalid'
    start = Math.max(size - suffix, 0)
    end = size - 1
  } else {
    start = Number(rawStart)
    end = rawEnd === '' ? size - 1 : Math.min(Number(rawEnd), size - 1)
  }
  if (!Number.isSafeInteger(start) || start >= size || end < start) return 'invalid'
  return { start, end }
}

/**
 * Resposta de um arquivo em partes, sem carregá-lo na memória: `206` com
 * `Content-Range` quando há Range. O arquivo é lido por stream.
 */
async function createMediaResponse({ filePath, mimeType, rangeHeader, method = 'GET' }) {
  const stats = await fs.promises.stat(filePath)
  if (!stats.isFile()) return new Response('não encontrado', { status: 404 })
  const size = stats.size
  const headers = {
    'content-type': mimeType,
    'accept-ranges': 'bytes',
    'x-content-type-options': 'nosniff',
    'cache-control': 'no-store',
  }
  const range = size === 0 ? null : parseRange(rangeHeader, size)
  if (range === 'invalid') {
    return new Response(null, { status: 416, headers: { ...headers, 'content-range': `bytes */${size}` } })
  }
  const { start, end } = range ?? { start: 0, end: size - 1 }
  headers['content-length'] = String(size === 0 ? 0 : end - start + 1)
  if (range) headers['content-range'] = `bytes ${start}-${end}/${size}`
  const status = range ? 206 : 200
  if (method === 'HEAD' || size === 0) return new Response(null, { status, headers })
  const body = Readable.toWeb(fs.createReadStream(filePath, { start, end }))
  return new Response(body, { status, headers })
}

module.exports = { createMediaResponse, parseRange }

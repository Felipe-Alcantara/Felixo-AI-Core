'use strict'

/**
 * Áudio e vídeo que o bloco de arquivo tenta tocar. O que o Chromium do
 * Electron não decodifica (MOV com codec da Apple, por exemplo) falha no
 * `onError` do reprodutor e cai em "abrir no sistema".
 */
const MEDIA_MIME_BY_EXTENSION = Object.freeze({
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.flac': 'audio/flac',
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.webm': 'video/webm',
  '.ogv': 'video/ogg',
  '.mov': 'video/quicktime',
})

/** MIME do arquivo de mídia pelo nome, ou `null` quando não é áudio/vídeo conhecido. */
function mediaMimeTypeFromFileName(fileName) {
  const dot = typeof fileName === 'string' ? fileName.lastIndexOf('.') : -1
  if (dot < 0) return null
  return MEDIA_MIME_BY_EXTENSION[fileName.slice(dot).toLowerCase()] ?? null
}

module.exports = { MEDIA_MIME_BY_EXTENSION, mediaMimeTypeFromFileName }

/**
 * @module image-mime-types
 * The image formats the app accepts, and how to name one from a file.
 *
 * Lives apart from any single feature because two independent paths need the
 * same answer: attachments arriving from the renderer (which carry a declared
 * MIME type) and images arriving from the OS clipboard (which often carry only
 * a file name). Keeping the list in one place is what stops the two from
 * drifting into accepting different formats.
 */

const path = require('node:path')

/** Accepted image MIME types, mapped to the extension we save them with. */
const IMAGE_MIME_EXTENSIONS = new Map([
  ['image/avif', 'avif'],
  ['image/bmp', 'bmp'],
  ['image/gif', 'gif'],
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/svg+xml', 'svg'],
  ['image/webp', 'webp'],
])

/** Reverse lookup, plus the spellings that map onto an accepted type. */
const EXTENSION_MIME_TYPES = new Map(
  Array.from(IMAGE_MIME_EXTENSIONS, ([mimeType, extension]) => [
    extension,
    mimeType,
  ]),
).set('jpeg', 'image/jpeg')

/**
 * @param {unknown} value
 * @returns {string} Lowercased MIME type, with `image/jpg` folded into the
 *   registered `image/jpeg`. Empty string when there is nothing usable.
 */
function normalizeImageMimeType(value) {
  const mimeType = typeof value === 'string' ? value.trim().toLowerCase() : ''

  return mimeType === 'image/jpg' ? 'image/jpeg' : mimeType
}

/**
 * @param {unknown} value - File name or path.
 * @returns {string} Accepted MIME type for the extension, or empty string.
 */
function imageMimeTypeFromFileName(value) {
  const name = typeof value === 'string' ? value : ''
  const extension = path.extname(name).toLowerCase().replace(/^\./, '')

  return EXTENSION_MIME_TYPES.get(extension) || ''
}

/**
 * @param {unknown} value
 * @returns {boolean} Whether the app can store an image of this type.
 */
function isSupportedImageMimeType(value) {
  return IMAGE_MIME_EXTENSIONS.has(normalizeImageMimeType(value))
}

module.exports = {
  IMAGE_MIME_EXTENSIONS,
  imageMimeTypeFromFileName,
  isSupportedImageMimeType,
  normalizeImageMimeType,
}

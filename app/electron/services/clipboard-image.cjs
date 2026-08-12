/**
 * @module clipboard-image
 * Reads an image out of the OS clipboard, whatever shape it arrives in.
 *
 * A terminal is a text pipe and cannot carry image bytes. The agent CLIs work
 * around that by reading the clipboard themselves, which on Linux means
 * shelling out to `xclip` or `wl-paste` — tools that are usually not installed,
 * so pasting a screenshot silently does nothing. Electron's clipboard is native
 * on every platform and depends on no such binary, so reading here (and handing
 * the terminal a file path) is what makes one paste behave the same on Windows,
 * macOS, X11 and Wayland, and across every agent.
 *
 * Two shapes show up in practice:
 * - a raw bitmap — "copy image" in a browser, and most screenshot tools;
 * - a reference to a file on disk — "copy" in a file manager, which arrives as
 *   a `file://` URI list and never as a bitmap.
 * `readImage()` only covers the first, so the second is resolved explicitly.
 */

const fsPromises = require('fs/promises')
const path = require('node:path')
const { fileURLToPath } = require('node:url')
const { imageMimeTypeFromFileName } = require('./image-mime-types.cjs')

/**
 * Clipboard formats that carry file references. `text/uri-list` is the
 * cross-platform spelling; the GNOME one is what Nemo/Nautilus (Linux Mint)
 * publish, and it prefixes the list with the operation (`copy` / `cut`).
 */
const FILE_URI_CLIPBOARD_FORMATS = ['text/uri-list', 'x-special/gnome-copied-files']

/** Prefixes GNOME puts on its file list, which are not paths. */
const FILE_LIST_OPERATIONS = new Set(['copy', 'cut'])

/**
 * @typedef {object} ClipboardImage
 * @property {boolean} ok
 * @property {string} [name] - Suggested file name.
 * @property {string} [type] - Accepted image MIME type.
 * @property {Buffer} [data]
 * @property {string} [message] - Why nothing was found.
 */

/**
 * @param {object} [options]
 * @param {import('electron').Clipboard} [options.clipboard] - Injectable for tests.
 * @param {(filePath: string) => Promise<Buffer>} [options.readFile] - Injectable for tests.
 * @returns {Promise<ClipboardImage>}
 */
async function readClipboardImage(options = {}) {
  const { clipboard = require('electron').clipboard, readFile = fsPromises.readFile } =
    options

  const bitmap = readClipboardBitmap(clipboard)

  if (bitmap) {
    return bitmap
  }

  return readClipboardImageFile(clipboard, readFile)
}

/**
 * @param {import('electron').Clipboard} clipboard
 * @returns {ClipboardImage | null}
 */
function readClipboardBitmap(clipboard) {
  if (typeof clipboard?.readImage !== 'function') {
    return null
  }

  const image = clipboard.readImage()

  if (!image || image.isEmpty()) {
    return null
  }

  // PNG regardless of what was copied: it is lossless, universally accepted by
  // the agent CLIs, and the only encoding `NativeImage` guarantees.
  const data = image.toPNG()

  return data && data.length > 0
    ? { ok: true, name: 'clipboard-image.png', type: 'image/png', data }
    : null
}

/**
 * @param {import('electron').Clipboard} clipboard
 * @param {(filePath: string) => Promise<Buffer>} readFile
 * @returns {Promise<ClipboardImage>}
 */
async function readClipboardImageFile(clipboard, readFile) {
  for (const filePath of readClipboardFilePaths(clipboard)) {
    const type = imageMimeTypeFromFileName(filePath)

    if (!type) {
      continue
    }

    try {
      const data = await readFile(filePath)

      if (data && data.length > 0) {
        return { ok: true, name: path.basename(filePath), type, data }
      }
    } catch {
      // Dangling reference (file moved or deleted since it was copied). The
      // clipboard can hold several entries, so keep looking.
    }
  }

  return { ok: false, message: 'Nenhuma imagem na area de transferencia.' }
}

/**
 * @param {import('electron').Clipboard} clipboard
 * @returns {string[]} Absolute paths referenced by the clipboard, in order and
 *   without repeats.
 */
function readClipboardFilePaths(clipboard) {
  const sources = FILE_URI_CLIPBOARD_FORMATS.map((format) =>
    readClipboardFormatAsText(clipboard, format),
  )

  // Last resort: some tools copy a bare path as plain text.
  sources.push(typeof clipboard?.readText === 'function' ? clipboard.readText() : '')

  const filePaths = []

  for (const source of sources) {
    for (const line of String(source || '').split(/\r?\n/)) {
      const filePath = parseClipboardFilePath(line)

      if (filePath && !filePaths.includes(filePath)) {
        filePaths.push(filePath)
      }
    }
  }

  return filePaths
}

/**
 * @param {import('electron').Clipboard} clipboard
 * @param {string} format
 * @returns {string}
 */
function readClipboardFormatAsText(clipboard, format) {
  try {
    if (typeof clipboard?.read === 'function') {
      const value = clipboard.read(format)

      if (value) {
        return value
      }
    }

    // GNOME publishes its list as raw bytes, which `read` returns empty for.
    if (typeof clipboard?.readBuffer === 'function') {
      return clipboard.readBuffer(format).toString('utf8')
    }
  } catch {
    // Format absent on this platform; the other sources still apply.
  }

  return ''
}

/**
 * @param {unknown} line - One entry of a clipboard file list.
 * @returns {string} Absolute path, or empty string when the line is not one.
 */
function parseClipboardFilePath(line) {
  const value = String(line || '').trim()

  if (!value || FILE_LIST_OPERATIONS.has(value) || value.startsWith('#')) {
    return ''
  }

  if (value.startsWith('file://')) {
    try {
      return fileURLToPath(value)
    } catch {
      return ''
    }
  }

  // A relative path has no meaning here: the clipboard carries no working
  // directory, so resolving it would guess at a file the person never copied.
  return path.isAbsolute(value) ? value : ''
}

module.exports = {
  parseClipboardFilePath,
  readClipboardFilePaths,
  readClipboardImage,
}

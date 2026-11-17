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
 * The first is read as an image item and the second is resolved explicitly.
 *
 * Electron 44 made the clipboard asynchronous and W3C-shaped (`read()` returns
 * `ClipboardItem`s; `readImage`/`readBuffer` are gone), so everything here is
 * async and goes through one `clipboard.read()`.
 */

const fsPromises = require('fs/promises')
const path = require('node:path')
const { fileURLToPath } = require('node:url')
const { IMAGE_MIME_EXTENSIONS, imageMimeTypeFromFileName } = require('./image-mime-types.cjs')

/**
 * Clipboard formats that carry file references. `text/uri-list` is the
 * cross-platform spelling; the GNOME one is what Nemo/Nautilus (Linux Mint)
 * publish, and it prefixes the list with the operation (`copy` / `cut`). The
 * last entry is Electron's wrapper for a raw platform format Chromium does not
 * map, which is how the GNOME one may surface.
 */
const FILE_URI_CLIPBOARD_FORMATS = [
  'text/uri-list',
  'x-special/gnome-copied-files',
  'electron application/osclipboard;format="x-special/gnome-copied-files"',
]

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

  const items = await readClipboardItems(clipboard)
  const bitmap = await readClipboardBitmap(items)

  if (bitmap) {
    return bitmap
  }

  return readClipboardImageFile(clipboard, readFile, items)
}

/**
 * @param {import('electron').Clipboard} clipboard
 * @returns {Promise<import('electron').ClipboardItem[]>} Empty when the
 *   clipboard cannot be read (or holds nothing).
 */
async function readClipboardItems(clipboard) {
  if (typeof clipboard?.read !== 'function') {
    return []
  }

  try {
    return (await clipboard.read()) ?? []
  } catch {
    return []
  }
}

/**
 * Bytes of one clipboard format, or null when absent or unreadable.
 * @param {import('electron').ClipboardItem[]} items
 * @param {string} format
 * @returns {Promise<Buffer | null>}
 */
async function readClipboardFormat(items, format) {
  for (const item of items) {
    if (!item?.types?.includes(format)) {
      continue
    }

    try {
      const value = await item.getType(format)
      const bytes = Buffer.from(await value.arrayBuffer())

      if (bytes.length > 0) {
        return bytes
      }
    } catch {
      // Format absent on this platform; the other sources still apply.
    }
  }

  return null
}

/**
 * @param {import('electron').ClipboardItem[]} items
 * @returns {Promise<ClipboardImage | null>}
 */
async function readClipboardBitmap(items) {
  const imageTypes = new Set()

  for (const item of items) {
    for (const type of item?.types ?? []) {
      if (IMAGE_MIME_EXTENSIONS.has(type)) {
        imageTypes.add(type)
      }
    }
  }

  // PNG first: lossless and accepted by every agent CLI. Any other accepted
  // image type is handed over as it came.
  const ordered = imageTypes.has('image/png') ? ['image/png', ...imageTypes] : [...imageTypes]

  for (const type of new Set(ordered)) {
    const data = await readClipboardFormat(items, type)

    if (data) {
      return {
        ok: true,
        name: `clipboard-image.${IMAGE_MIME_EXTENSIONS.get(type)}`,
        type,
        data,
      }
    }
  }

  return null
}

/**
 * @param {import('electron').Clipboard} clipboard
 * @param {(filePath: string) => Promise<Buffer>} readFile
 * @param {import('electron').ClipboardItem[]} items
 * @returns {Promise<ClipboardImage>}
 */
async function readClipboardImageFile(clipboard, readFile, items) {
  for (const filePath of await readClipboardFilePaths(clipboard, items)) {
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
 * @param {import('electron').ClipboardItem[]} [items] - Already-read items; read
 *   again when omitted.
 * @returns {Promise<string[]>} Absolute paths referenced by the clipboard, in
 *   order and without repeats.
 */
async function readClipboardFilePaths(clipboard, items) {
  const clipboardItems = items ?? (await readClipboardItems(clipboard))
  const sources = []

  for (const format of FILE_URI_CLIPBOARD_FORMATS) {
    const bytes = await readClipboardFormat(clipboardItems, format)
    sources.push(bytes ? bytes.toString('utf8') : '')
  }

  // Last resort: some tools copy a bare path as plain text.
  try {
    sources.push(typeof clipboard?.readText === 'function' ? await clipboard.readText() : '')
  } catch {
    sources.push('')
  }

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

const fs = require('fs/promises')
const path = require('node:path')
const { randomUUID } = require('node:crypto')
const { readClipboardImage } = require('./clipboard-image.cjs')
const {
  IMAGE_MIME_EXTENSIONS,
  imageMimeTypeFromFileName,
  normalizeImageMimeType,
} = require('./image-mime-types.cjs')

const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024

function registerFileAttachmentIpcHandlers(appPaths, options = {}) {
  const { ipcMain = require('electron').ipcMain } = options
  const attachmentDir =
    options.attachmentDir ||
    path.join(appPaths.userData, 'clipboard-attachments')

  ipcMain.handle('files:save-attachment', async (_event, params) =>
    saveAttachment(params, attachmentDir),
  )
  ipcMain.handle('files:read-image-attachment', async (_event, params) =>
    readImageAttachment(params),
  )
  ipcMain.handle('files:save-clipboard-image', async () =>
    saveClipboardImage(attachmentDir, options),
  )
}

/**
 * Turns "there is an image in the clipboard" into "there is a file on disk" —
 * the only form a terminal can carry. Used when the renderer's paste event
 * came through without the bitmap, which is routine on Linux: several
 * screenshot tools publish a clipboard format Chromium never surfaces to the
 * page, while the native clipboard read still finds it.
 *
 * @param {string} attachmentDir
 * @param {object} [options] - Forwarded to {@link readClipboardImage} for tests.
 * @returns {Promise<object>} Same shape as `files:save-attachment`.
 */
async function saveClipboardImage(attachmentDir, options = {}) {
  const image = await readClipboardImage(options)

  return image.ok ? saveAttachment(image, attachmentDir) : image
}

async function saveAttachment(params, attachmentDir) {
  const mimeType = normalizeImageMimeType(params?.type)
  const buffer = toBuffer(params?.data)

  if (!mimeType || !mimeType.startsWith('image/')) {
    return { ok: false, message: 'Tipo de anexo invalido.' }
  }

  if (!IMAGE_MIME_EXTENSIONS.has(mimeType)) {
    return { ok: false, message: 'Formato de imagem nao suportado.' }
  }

  if (!buffer || buffer.length === 0) {
    return { ok: false, message: 'Imagem vazia ou invalida.' }
  }

  if (buffer.length > MAX_ATTACHMENT_BYTES) {
    return {
      ok: false,
      message: 'Imagem maior que o limite de 25 MB.',
    }
  }

  try {
    await fs.mkdir(attachmentDir, { recursive: true })

    const fileName = createAttachmentFileName(params?.name, mimeType)
    const filePath = path.join(attachmentDir, fileName)

    await fs.writeFile(filePath, buffer, { flag: 'wx' })

    return {
      ok: true,
      filePath,
      fileName,
      type: mimeType,
      size: buffer.length,
    }
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : 'Falha ao salvar imagem anexada.',
    }
  }
}

async function readImageAttachment(params) {
  const filePath = typeof params?.path === 'string' ? params.path : ''
  const mimeType = resolveAttachmentMimeType(params)

  if (!filePath) {
    return { ok: false, message: 'Caminho da imagem invalido.' }
  }

  if (!mimeType || !mimeType.startsWith('image/')) {
    return { ok: false, message: 'Tipo de anexo invalido.' }
  }

  if (!IMAGE_MIME_EXTENSIONS.has(mimeType)) {
    return { ok: false, message: 'Formato de imagem nao suportado.' }
  }

  try {
    const stats = await fs.stat(filePath)

    if (!stats.isFile()) {
      return { ok: false, message: 'Anexo nao e um arquivo.' }
    }

    if (stats.size > MAX_ATTACHMENT_BYTES) {
      return {
        ok: false,
        message: 'Imagem maior que o limite de 25 MB.',
      }
    }

    const buffer = await fs.readFile(filePath)

    return {
      ok: true,
      dataUrl: `data:${mimeType};base64,${buffer.toString('base64')}`,
      type: mimeType,
      size: buffer.length,
    }
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : 'Falha ao abrir imagem anexada.',
    }
  }
}

function resolveAttachmentMimeType(params) {
  const mimeType = normalizeImageMimeType(params?.type)

  if (IMAGE_MIME_EXTENSIONS.has(mimeType)) {
    return mimeType
  }

  // Fall back to the extension: a path picked from disk often carries no
  // declared type at all.
  const name = typeof params?.name === 'string' ? params.name : params?.path

  return imageMimeTypeFromFileName(name) || mimeType
}

function toBuffer(value) {
  if (value instanceof ArrayBuffer) {
    return Buffer.from(value)
  }

  if (ArrayBuffer.isView(value)) {
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength)
  }

  return null
}

function createAttachmentFileName(originalName, mimeType) {
  const extension = IMAGE_MIME_EXTENSIONS.get(mimeType) || 'bin'
  const baseName = sanitizeBaseName(
    typeof originalName === 'string' ? path.parse(originalName).name : '',
  )
  const timestamp = new Date()
    .toISOString()
    .replace(/\.\d{3}Z$/, 'Z')
    .replace(/[-:]/g, '')
  const suffix = randomUUID().slice(0, 8)

  return `${baseName || 'clipboard-image'}-${timestamp}-${suffix}.${extension}`
}

function sanitizeBaseName(value) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

module.exports = {
  createAttachmentFileName,
  readImageAttachment,
  registerFileAttachmentIpcHandlers,
  saveAttachment,
  saveClipboardImage,
}

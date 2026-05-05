const fs = require('fs/promises')
const path = require('node:path')
const { randomUUID } = require('node:crypto')

const IMAGE_MIME_EXTENSIONS = new Map([
  ['image/avif', 'avif'],
  ['image/bmp', 'bmp'],
  ['image/gif', 'gif'],
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/svg+xml', 'svg'],
  ['image/webp', 'webp'],
])

const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024

function registerFileAttachmentIpcHandlers(appPaths, options = {}) {
  const { ipcMain = require('electron').ipcMain } = options
  const attachmentDir =
    options.attachmentDir ||
    path.join(appPaths.userData, 'clipboard-attachments')

  ipcMain.handle('files:save-attachment', async (_event, params) =>
    saveAttachment(params, attachmentDir),
  )
}

async function saveAttachment(params, attachmentDir) {
  const mimeType = normalizeMimeType(params?.type)
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

function normalizeMimeType(value) {
  const mimeType = typeof value === 'string' ? value.trim().toLowerCase() : ''

  return mimeType === 'image/jpg' ? 'image/jpeg' : mimeType
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
  registerFileAttachmentIpcHandlers,
  saveAttachment,
}

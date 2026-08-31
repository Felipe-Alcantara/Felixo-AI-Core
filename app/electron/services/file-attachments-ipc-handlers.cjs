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
const CONTEXT_PICK_MODES = new Set(['files', 'directory'])

function registerFileAttachmentIpcHandlers(appPaths, options = {}) {
  const { ipcMain = require('electron').ipcMain } = options
  const attachmentDir =
    options.attachmentDir ||
    path.join(appPaths.userData, 'clipboard-attachments')
  const authorizedImagePaths = options.authorizedImagePaths || new Set()

  ipcMain.handle('files:pick-context', async (_event, params) =>
    pickContextAttachments(params, {
      authorizedImagePaths,
      getMainWindow: options.getMainWindow,
      showOpenDialog: options.showOpenDialog,
    }),
  )

  ipcMain.handle('files:save-attachment', async (_event, params) =>
    saveAttachment(params, attachmentDir),
  )
  ipcMain.handle('files:read-image-attachment', async (_event, params) =>
    readImageAttachment(params, { attachmentDir, authorizedImagePaths }),
  )
  ipcMain.handle('files:save-clipboard-image', async () =>
    saveClipboardImage(attachmentDir, options),
  )
}

/**
 * Opens the native picker for arbitrary files or one complete directory.
 * The renderer receives metadata and an absolute path, never file contents.
 * Image paths selected here are recorded in the main process before being
 * returned, which makes the later preview read an explicit user grant.
 *
 * @param {object} params
 * @param {'files'|'directory'} params.mode
 * @param {object} options
 * @param {Set<string>} options.authorizedImagePaths
 * @param {Function} [options.getMainWindow]
 * @param {Function} [options.showOpenDialog] - Injectable for tests.
 */
async function pickContextAttachments(params, options = {}) {
  const mode = params?.mode

  if (!CONTEXT_PICK_MODES.has(mode)) {
    return { ok: false, message: 'Modo de selecao de contexto invalido.' }
  }

  const dialogOptions = {
    title:
      mode === 'directory'
        ? 'Adicionar pasta ao contexto'
        : 'Adicionar arquivos ao contexto',
    properties:
      mode === 'directory'
        ? ['openDirectory']
        : ['openFile', 'multiSelections'],
  }

  try {
    const result = await showContextOpenDialog(dialogOptions, options)

    if (result?.canceled || !Array.isArray(result?.filePaths)) {
      return { ok: true, canceled: true, attachments: [] }
    }

    const attachments = []

    for (const filePath of [...new Set(result.filePaths)]) {
      const attachment = await describePickedContextPath(
        filePath,
        options.authorizedImagePaths,
      )

      if (attachment) {
        attachments.push(attachment)
      }
    }

    if (result.filePaths.length > 0 && attachments.length === 0) {
      return {
        ok: false,
        message: 'Nao foi possivel acessar os caminhos selecionados.',
      }
    }

    return { ok: true, canceled: false, attachments }
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : 'Falha ao abrir o seletor de contexto.',
    }
  }
}

async function showContextOpenDialog(dialogOptions, options = {}) {
  if (typeof options.showOpenDialog === 'function') {
    return options.showOpenDialog(dialogOptions)
  }

  const { BrowserWindow, dialog } = require('electron')
  const focusedWindow = BrowserWindow.getFocusedWindow()
  const configuredWindow =
    typeof options.getMainWindow === 'function'
      ? options.getMainWindow()
      : undefined
  const window = focusedWindow || configuredWindow

  if (window && !window.isDestroyed()) {
    return dialog.showOpenDialog(window, dialogOptions)
  }

  return dialog.showOpenDialog(dialogOptions)
}

async function describePickedContextPath(filePath, authorizedImagePaths) {
  if (typeof filePath !== 'string' || !filePath.trim()) {
    return null
  }

  try {
    const resolvedPath = await fs.realpath(filePath)
    const stats = await fs.stat(resolvedPath)
    const isDirectory = stats.isDirectory()

    if (!isDirectory && !stats.isFile()) {
      return null
    }

    const type = isDirectory
      ? 'inode/directory'
      : imageMimeTypeFromFileName(resolvedPath) || 'application/octet-stream'

    if (!isDirectory && IMAGE_MIME_EXTENSIONS.has(type)) {
      authorizedImagePaths?.add(resolvedPath)
    }

    return {
      id: randomUUID(),
      name: path.basename(resolvedPath) || resolvedPath,
      path: resolvedPath,
      type,
      size: isDirectory ? 0 : stats.size,
      isDirectory,
    }
  } catch {
    return null
  }
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

async function readImageAttachment(params, options = {}) {
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
    const authorizedPath = await resolveAuthorizedImagePath(filePath, options)
    const stats = await fs.stat(authorizedPath)

    if (!stats.isFile()) {
      return { ok: false, message: 'Anexo nao e um arquivo.' }
    }

    if (stats.size > MAX_ATTACHMENT_BYTES) {
      return {
        ok: false,
        message: 'Imagem maior que o limite de 25 MB.',
      }
    }

    const buffer = await fs.readFile(authorizedPath)

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

async function resolveAuthorizedImagePath(filePath, options = {}) {
  const resolvedPath = await fs.realpath(filePath)
  const authorizedImagePaths = options.authorizedImagePaths

  if (authorizedImagePaths?.has(resolvedPath)) {
    return resolvedPath
  }

  const attachmentDir =
    typeof options.attachmentDir === 'string' ? options.attachmentDir : ''

  if (attachmentDir) {
    const resolvedAttachmentDir = await fs.realpath(attachmentDir).catch(() => null)

    if (resolvedAttachmentDir && isPathInside(resolvedAttachmentDir, resolvedPath)) {
      return resolvedPath
    }
  }

  throw new Error('Caminho da imagem nao autorizado.')
}

function isPathInside(rootPath, targetPath) {
  const relativePath = path.relative(rootPath, targetPath)

  return (
    relativePath === '' ||
    (!relativePath.startsWith(`..${path.sep}`) &&
      relativePath !== '..' &&
      !path.isAbsolute(relativePath))
  )
}

function resolveAttachmentMimeType(params) {
  // The path is the source of truth. Neither the renderer-controlled MIME
  // type nor the renderer-controlled display name can turn a .txt (or an
  // extensionless path) into an image read.
  return imageMimeTypeFromFileName(params?.path)
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
  describePickedContextPath,
  isPathInside,
  pickContextAttachments,
  readImageAttachment,
  registerFileAttachmentIpcHandlers,
  resolveAuthorizedImagePath,
  saveAttachment,
  saveClipboardImage,
}

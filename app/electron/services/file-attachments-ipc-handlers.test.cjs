const assert = require('node:assert/strict')
const fs = require('fs/promises')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const {
  criarCaminhoDeArquivoQueEscapa,
} = require('../__fixtures__/link-fixtures.cjs')
const {
  createAttachmentFileName,
  duplicateImage,
  openImageArtifact,
  pickImageArtifact,
  registerFileAttachmentIpcHandlers,
  readImageAttachment,
  removeGeneratedImage,
  saveAttachment,
  saveGeneratedImage,
  saveImageCopy,
} = require('./file-attachments-ipc-handlers.cjs')

test('saveAttachment persists image data in attachment directory', async (t) => {
  const attachmentDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'felixo-attachment-'),
  )
  t.after(() => fs.rm(attachmentDir, { recursive: true, force: true }))

  const result = await saveAttachment(
    {
      name: 'cafe screenshot.png',
      type: 'image/png',
      data: new Uint8Array([1, 2, 3]).buffer,
    },
    attachmentDir,
  )

  assert.equal(result.ok, true)
  assert.match(
    result.fileName,
    /^cafe-screenshot-\d{8}T\d{6}Z-[a-f0-9]{8}\.png$/,
  )
  assert.equal(result.type, 'image/png')
  assert.equal(result.size, 3)
  assert.equal(path.dirname(result.filePath), attachmentDir)
  assert.deepEqual(Array.from(await fs.readFile(result.filePath)), [1, 2, 3])
})

test('saveAttachment rejects unsupported attachment types', async () => {
  const result = await saveAttachment(
    {
      name: 'notes.txt',
      type: 'text/plain',
      data: new Uint8Array([1]).buffer,
    },
    os.tmpdir(),
  )

  assert.equal(result.ok, false)
  assert.equal(result.message, 'Tipo de anexo invalido.')
})

test('readImageAttachment returns an image data url', async (t) => {
  const attachmentDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'felixo-attachment-read-'),
  )
  t.after(() => fs.rm(attachmentDir, { recursive: true, force: true }))

  const filePath = path.join(attachmentDir, 'screenshot.png')
  await fs.writeFile(filePath, Buffer.from([1, 2, 3]))

  const result = await readImageAttachment({
    path: filePath,
    name: 'screenshot.png',
    type: 'image/jpeg',
  }, { attachmentDir })

  assert.equal(result.ok, true)
  assert.equal(result.type, 'image/png')
  assert.equal(result.size, 3)
  assert.equal(result.dataUrl, 'data:image/png;base64,AQID')
})

test('readImageAttachment rejects non-image attachments', async () => {
  const result = await readImageAttachment({
    path: path.join(os.tmpdir(), 'notes.txt'),
    name: 'notes.txt',
    type: 'image/png',
  })

  assert.equal(result.ok, false)
  assert.equal(result.message, 'Tipo de anexo invalido.')
})

test('readImageAttachment rejects an image outside the app attachment directory', async (t) => {
  const attachmentDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'felixo-attachment-authorized-'),
  )
  const outsideDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'felixo-attachment-outside-'),
  )
  t.after(() => Promise.all([
    fs.rm(attachmentDir, { recursive: true, force: true }),
    fs.rm(outsideDir, { recursive: true, force: true }),
  ]))

  const outsidePath = path.join(outsideDir, 'private.png')
  await fs.writeFile(outsidePath, Buffer.from([1, 2, 3]))

  const result = await readImageAttachment(
    {
      path: outsidePath,
      name: 'private.png',
      type: 'image/png',
    },
    { attachmentDir },
  )

  assert.equal(result.ok, false)
  assert.equal(result.message, 'Caminho da imagem nao autorizado.')
})

test('readImageAttachment rejects a symlink from the attachment directory to outside', async (t) => {
  // Sem skip por plataforma: ver electron/__fixtures__/link-fixtures.cjs.
  const attachmentDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'felixo-attachment-symlink-'),
  )
  const outsideDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'felixo-attachment-symlink-outside-'),
  )
  t.after(() => Promise.all([
    fs.rm(attachmentDir, { recursive: true, force: true }),
    fs.rm(outsideDir, { recursive: true, force: true }),
  ]))

  const outsidePath = path.join(outsideDir, 'private.png')
  await fs.writeFile(outsidePath, Buffer.from([1, 2, 3]))
  // resolveAuthorizedImagePath autoriza por realpath + containment, entao o
  // caminho so precisa resolver para fora do diretorio de anexos. Onde nao
  // ha symlink de arquivo, o helper chega la atravessando um diretorio
  // ligado, que produz o mesmo escape sem exigir privilegio.
  const { caminho: symlinkPath } = criarCaminhoDeArquivoQueEscapa({
    dentro: attachmentDir,
    arquivoExterno: outsidePath,
    nome: 'allowed-name.png',
  })

  const result = await readImageAttachment(
    {
      path: symlinkPath,
      name: 'allowed-name.png',
      type: 'image/png',
    },
    { attachmentDir },
  )

  assert.equal(result.ok, false)
  assert.equal(result.message, 'Caminho da imagem nao autorizado.')
})

test('readImageAttachment enforces the size limit after authorization', async (t) => {
  const attachmentDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'felixo-attachment-size-'),
  )
  t.after(() => fs.rm(attachmentDir, { recursive: true, force: true }))

  const filePath = path.join(attachmentDir, 'large.png')
  await fs.writeFile(filePath, Buffer.from([1]))
  await fs.truncate(filePath, 25 * 1024 * 1024 + 1)

  const result = await readImageAttachment(
    { path: filePath, name: 'large.png', type: 'image/png' },
    { attachmentDir },
  )

  assert.equal(result.ok, false)
  assert.equal(result.message, 'Imagem maior que o limite de 25 MB.')
})

test('native context selection returns absolute paths and grants selected images', async (t) => {
  const rootDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'felixo-context-picker-'),
  )
  const attachmentDir = path.join(rootDir, 'owned-attachments')
  const selectedDir = path.join(rootDir, 'selected-folder')
  t.after(() => fs.rm(rootDir, { recursive: true, force: true }))

  const imagePath = path.join(rootDir, 'reference.png')
  const arbitraryPath = path.join(rootDir, 'payload.bin')
  await fs.writeFile(imagePath, Buffer.from([1, 2, 3]))
  await fs.writeFile(arbitraryPath, Buffer.from([4, 5, 6]))
  await fs.mkdir(selectedDir)
  const resolvedImagePath = await fs.realpath(imagePath)
  const resolvedArbitraryPath = await fs.realpath(arbitraryPath)
  const resolvedSelectedDir = await fs.realpath(selectedDir)

  const handlers = new Map()
  const ipcMain = {
    handle(channel, handler) {
      handlers.set(channel, handler)
    },
  }
  let dialogOptions
  let nextSelection = [imagePath, arbitraryPath]

  registerFileAttachmentIpcHandlers(
    { userData: rootDir },
    {
      ipcMain,
      attachmentDir,
      showOpenDialog: async (options) => {
        dialogOptions = options
        return { canceled: false, filePaths: nextSelection }
      },
    },
  )

  const pickContext = handlers.get('files:pick-context')
  const readImage = handlers.get('files:read-image-attachment')
  assert.equal(typeof pickContext, 'function')
  assert.equal(typeof readImage, 'function')

  const filesResult = await pickContext(null, { mode: 'files' })

  assert.equal(filesResult.ok, true)
  assert.equal(filesResult.attachments.length, 2)
  assert.deepEqual(dialogOptions.properties, ['openFile', 'multiSelections'])
  assert.equal(filesResult.attachments[0].path, resolvedImagePath)
  assert.equal(filesResult.attachments[0].type, 'image/png')
  assert.equal(filesResult.attachments[1].type, 'application/octet-stream')
  assert.equal(filesResult.attachments[1].path, resolvedArbitraryPath)

  const grantedReadResult = await readImage(null, {
    path: imagePath,
    name: 'spoofed.txt',
    type: 'text/plain',
  })
  assert.equal(grantedReadResult.ok, true)
  assert.equal(grantedReadResult.type, 'image/png')

  nextSelection = [selectedDir]
  const directoryResult = await pickContext(null, { mode: 'directory' })

  assert.equal(directoryResult.ok, true)
  assert.deepEqual(dialogOptions.properties, ['openDirectory'])
  assert.equal(directoryResult.attachments[0].path, resolvedSelectedDir)
  assert.equal(directoryResult.attachments[0].isDirectory, true)
  assert.equal(directoryResult.attachments[0].type, 'inode/directory')
})

test('saveGeneratedImage persists a sanitized artifact that survives the preview boundary', async (t) => {
  const rootDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'felixo-generated-image-'),
  )
  const generatedImageDir = path.join(rootDir, 'generated-images')
  t.after(() => fs.rm(rootDir, { recursive: true, force: true }))

  const result = await saveGeneratedImage(
    {
      name: 'resultado da imagem.png',
      type: 'image/png',
      data: new Uint8Array([1, 2, 3]).buffer,
      prompt: '  um gato no espaço  ',
      model: 'image-model',
      requestId: 'request-123',
      createdAt: '2026-09-21T12:00:00.000Z',
      cost: 0.04,
      temporary: true,
      key: 'nao-deve-vazar',
      url: 'https://private.example/image',
    },
    generatedImageDir,
  )

  assert.equal(result.ok, true)
  assert.equal(result.artifact.kind, 'generated-image')
  assert.equal(result.artifact.mimeType, 'image/png')
  assert.equal(result.artifact.prompt, 'um gato no espaço')
  assert.equal(result.artifact.cost, 0.04)
  assert.equal(result.artifact.key, undefined)
  assert.equal(result.artifact.url, undefined)
  assert.equal(path.dirname(result.artifact.path), await fs.realpath(generatedImageDir))
  assert.deepEqual(Array.from(await fs.readFile(result.artifact.path)), [1, 2, 3])

  const preview = await readImageAttachment(
    { path: result.artifact.path, type: 'image/jpeg' },
    { authorizedImageDirs: [generatedImageDir] },
  )
  assert.equal(preview.ok, true)
  assert.equal(preview.type, 'image/png')
})

test('generated image actions enforce ownership and keep copies inside generated storage', async (t) => {
  const rootDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'felixo-generated-actions-'),
  )
  const generatedImageDir = path.join(rootDir, 'generated-images')
  const outsideDir = path.join(rootDir, 'outside')
  await fs.mkdir(outsideDir)
  t.after(() => fs.rm(rootDir, { recursive: true, force: true }))

  const saved = await saveGeneratedImage(
    {
      name: 'original.png',
      type: 'image/png',
      data: new Uint8Array([4, 5, 6]).buffer,
      prompt: 'prompt',
      model: 'model',
    },
    generatedImageDir,
  )
  assert.equal(saved.ok, true)

  let openedPath = ''
  const opened = await openImageArtifact(
    { path: saved.artifact.path },
    {
      authorizedImageDirs: [generatedImageDir],
      openPath: async (filePath) => {
        openedPath = filePath
        return ''
      },
    },
  )
  assert.deepEqual(opened, { ok: true })
  assert.equal(openedPath, saved.artifact.path)

  const copyPath = path.join(outsideDir, 'copy.png')
  const copied = await saveImageCopy(
    { path: saved.artifact.path },
    {
      authorizedImageDirs: [generatedImageDir],
      showSaveDialog: async () => ({ canceled: false, filePath: copyPath }),
    },
  )
  assert.deepEqual(copied, { ok: true, filePath: copyPath })
  assert.deepEqual(Array.from(await fs.readFile(copyPath)), [4, 5, 6])

  const duplicated = await duplicateImage(
    {
      path: saved.artifact.path,
      name: 'duplicated.png',
      prompt: 'copied prompt',
      model: 'copied model',
    },
    {
      generatedImageDir,
      authorizedImageDirs: [generatedImageDir],
    },
  )
  assert.equal(duplicated.ok, true)
  assert.equal(path.dirname(duplicated.artifact.path), await fs.realpath(generatedImageDir))
  assert.equal(duplicated.artifact.prompt, 'copied prompt')
  assert.deepEqual(Array.from(await fs.readFile(duplicated.artifact.path)), [4, 5, 6])

  const outsideResult = await openImageArtifact(
    { path: copyPath },
    { authorizedImageDirs: [generatedImageDir] },
  )
  assert.equal(outsideResult.ok, false)

  const removed = await removeGeneratedImage(
    { path: duplicated.artifact.path },
    generatedImageDir,
  )
  assert.deepEqual(removed, { ok: true, deleted: true })
  await assert.rejects(fs.access(duplicated.artifact.path))
})

test('native image picker grants a supported image and returns canonical MIME metadata', async (t) => {
  const rootDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'felixo-image-picker-'),
  )
  const imagePath = path.join(rootDir, 'reference.jpeg')
  await fs.writeFile(imagePath, Buffer.from([1, 2]))
  t.after(() => fs.rm(rootDir, { recursive: true, force: true }))

  let dialogOptions
  const authorizedImagePaths = new Set()
  const result = await pickImageArtifact({
    authorizedImagePaths,
    showOpenDialog: async (options) => {
      dialogOptions = options
      return { canceled: false, filePaths: [imagePath] }
    },
  })

  assert.equal(result.ok, true)
  assert.equal(result.type, 'image/jpeg')
  assert.equal(result.mimeType, 'image/jpeg')
  assert.equal(result.path, await fs.realpath(imagePath))
  assert.equal(authorizedImagePaths.has(result.path), true)
  assert.deepEqual(dialogOptions.filters, [
    {
      name: 'Imagens',
      extensions: ['avif', 'bmp', 'gif', 'jpg', 'png', 'svg', 'webp', 'jpeg'],
    },
  ])
})

// Imagens geradas só nascem no main (serviço de imagem → saveGeneratedImage),
// que avisa o canvas sozinho. Um canal de escrita aberto ao renderer, sem
// nenhum chamador, só alargava a superfície da ponte de IPC.
test('registered image IPC keeps generated-image writes out of the renderer', () => {
  const handlers = new Map()
  const ipcMain = {
    handle(channel, handler) {
      handlers.set(channel, handler)
    },
  }

  registerFileAttachmentIpcHandlers({ userData: os.tmpdir() }, { ipcMain })

  assert.equal(handlers.has('files:save-generated-image'), false)
  assert.equal(typeof handlers.get('files:pick-image'), 'function')
  assert.equal(typeof handlers.get('files:open-image'), 'function')
  assert.equal(typeof handlers.get('files:save-image-copy'), 'function')
  assert.equal(typeof handlers.get('files:duplicate-image'), 'function')
  assert.equal(typeof handlers.get('files:remove-generated-image'), 'function')
})

test('createAttachmentFileName sanitizes untrusted names', () => {
  const fileName = createAttachmentFileName('../../minha imagem.png', 'image/png')

  assert.match(fileName, /^minha-imagem-\d{8}T\d{6}Z-[a-f0-9]{8}\.png$/)
  assert.equal(fileName.includes('/'), false)
  assert.equal(fileName.includes('\\'), false)
})

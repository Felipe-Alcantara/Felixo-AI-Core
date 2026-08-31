const assert = require('node:assert/strict')
const fs = require('fs/promises')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const {
  createAttachmentFileName,
  registerFileAttachmentIpcHandlers,
  readImageAttachment,
  saveAttachment,
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
  if (process.platform === 'win32') {
    t.skip('Criacao de symlink pode exigir privilegio adicional no Windows.')
    return
  }

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
  const symlinkPath = path.join(attachmentDir, 'allowed-name.png')
  await fs.writeFile(outsidePath, Buffer.from([1, 2, 3]))
  await fs.symlink(outsidePath, symlinkPath)

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
  assert.equal(filesResult.attachments[0].path, imagePath)
  assert.equal(filesResult.attachments[0].type, 'image/png')
  assert.equal(filesResult.attachments[1].type, 'application/octet-stream')
  assert.equal(filesResult.attachments[1].path, arbitraryPath)

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
  assert.equal(directoryResult.attachments[0].path, selectedDir)
  assert.equal(directoryResult.attachments[0].isDirectory, true)
  assert.equal(directoryResult.attachments[0].type, 'inode/directory')
})

test('createAttachmentFileName sanitizes untrusted names', () => {
  const fileName = createAttachmentFileName('../../minha imagem.png', 'image/png')

  assert.match(fileName, /^minha-imagem-\d{8}T\d{6}Z-[a-f0-9]{8}\.png$/)
  assert.equal(fileName.includes('/'), false)
  assert.equal(fileName.includes('\\'), false)
})

const assert = require('node:assert/strict')
const fs = require('fs/promises')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const {
  createAttachmentFileName,
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

test('createAttachmentFileName sanitizes untrusted names', () => {
  const fileName = createAttachmentFileName('../../minha imagem.png', 'image/png')

  assert.match(fileName, /^minha-imagem-\d{8}T\d{6}Z-[a-f0-9]{8}\.png$/)
  assert.equal(fileName.includes('/'), false)
  assert.equal(fileName.includes('\\'), false)
})

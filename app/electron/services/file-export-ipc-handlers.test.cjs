const assert = require('node:assert/strict')
const fs = require('fs/promises')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const { writeTextFilesToFolder } = require('./file-export-ipc-handlers.cjs')

test('writeTextFilesToFolder grava um arquivo por item e nunca sobrescreve', async (t) => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'felixo-export-'))
  t.after(() => fs.rm(folder, { recursive: true, force: true }))
  await fs.writeFile(path.join(folder, 'a.md'), 'ja existia', 'utf8')

  const result = await writeTextFilesToFolder(folder, [
    { name: 'a.md', content: 'novo a' },
    { name: 'b.md', content: 'ação 🚀' },
  ])

  assert.equal(result.ok, true)
  assert.deepEqual(result.fileNames, ['a-2.md', 'b.md'])
  assert.equal(await fs.readFile(path.join(folder, 'a.md'), 'utf8'), 'ja existia')
  assert.equal(await fs.readFile(path.join(folder, 'a-2.md'), 'utf8'), 'novo a')
  assert.equal(await fs.readFile(path.join(folder, 'b.md'), 'utf8'), 'ação 🚀')
})

test('writeTextFilesToFolder ignora separador de caminho e ponto inicial no nome', async (t) => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'felixo-export-'))
  t.after(() => fs.rm(folder, { recursive: true, force: true }))

  const result = await writeTextFilesToFolder(folder, [
    { name: '../../fora.md', content: 'x' },
    { name: ['..', '..', 'fora2.md'].join(String.fromCharCode(92)), content: 'x' },
    { name: '.oculto.md', content: 'x' },
  ])

  assert.deepEqual(result.fileNames, ['fora.md', 'fora2.md', 'oculto.md'])
  assert.deepEqual((await fs.readdir(folder)).sort(), ['fora.md', 'fora2.md', 'oculto.md'])
})

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { isPathInside, resolvePathInside } = require('./projects-ipc-handlers.cjs')
const { criarLinkDeDiretorio } = require('../__fixtures__/link-fixtures.cjs')

test('project path containment does not confuse a sibling prefix with a child', () => {
  assert.equal(isPathInside('/work/project', '/work/project/file.md'), true)
  assert.equal(isPathInside('/work/project', '/work/project-archive/file.md'), false)
})

test('project path containment rejects a symlink that leaves the selected project', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-project-path-'))
  const projectRoot = path.join(tempRoot, 'project')
  const outsideRoot = path.join(tempRoot, 'outside')
  fs.mkdirSync(projectRoot)
  fs.mkdirSync(outsideRoot)
  fs.mkdirSync(path.join(outsideRoot, 'secret'))

  // Antes isto era um try/catch que, no Windows, engolia o EPERM e dava
  // return: o teste reportava PASS sem verificar nada, justamente numa
  // regra de seguranca. O helper cria o link com o recurso disponivel na
  // plataforma e garante que ele realmente escapa da raiz, entao a
  // assercao abaixo passa a rodar em todo sistema suportado.
  criarLinkDeDiretorio(path.join(outsideRoot, 'secret'), path.join(projectRoot, 'linked'))

  assert.throws(
    () => resolvePathInside(projectRoot, 'linked'),
    /Diretorio fora do projeto/,
  )
  fs.rmSync(tempRoot, { recursive: true, force: true })
})

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { isPathInside, resolvePathInside } = require('./projects-ipc-handlers.cjs')

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

  try {
    fs.symlinkSync(path.join(outsideRoot, 'secret'), path.join(projectRoot, 'linked'))
  } catch (error) {
    fs.rmSync(tempRoot, { recursive: true, force: true })
    if (process.platform === 'win32') {
      return
    }
    throw error
  }

  assert.throws(
    () => resolvePathInside(projectRoot, 'linked'),
    /Diretorio fora do projeto/,
  )
  fs.rmSync(tempRoot, { recursive: true, force: true })
})

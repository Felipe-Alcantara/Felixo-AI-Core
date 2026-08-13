const { describe, it } = require('node:test')
const assert = require('node:assert/strict')

const { ensureManagedCliRuntime } = require('./managed-cli-runtime.cjs')

function createFakeFileSystem() {
  const files = new Map()
  const modes = new Map()

  return {
    files,
    modes,
    mkdirSync: () => {},
    writeFileSync: (filePath, content) => files.set(filePath, content),
    chmodSync: (filePath, mode) => modes.set(filePath, mode),
  }
}

describe('managed-cli-runtime', () => {
  const layout = {
    root: '/data/clis',
    packagesBin: '/data/clis/bin',
    runtimeBin: '/data/clis/runtime-bin',
  }

  it('creates an executable node shim pointing at the embedded runtime', () => {
    const fileSystem = createFakeFileSystem()

    const shims = ensureManagedCliRuntime({
      layout,
      nodeExecutable: '/opt/app/felixo',
      npmCliPath: '/opt/app/resources/npm/bin/npm-cli.js',
      platformName: 'linux',
      fileSystem,
    })

    assert.equal(shims.node, '/data/clis/runtime-bin/node')

    const script = fileSystem.files.get(shims.node)
    assert.match(script, /^#!\/bin\/sh/)
    assert.match(script, /ELECTRON_RUN_AS_NODE=1/)
    // `exec` importa: sem ele o shell do atalho fica vivo entre o app e a
    // CLI, e o sinal de encerramento para nele em vez de chegar na CLI.
    assert.match(script, /exec "\/opt\/app\/felixo" "\$@"/)
    assert.equal(fileSystem.modes.get(shims.node), 0o755)
  })

  it('creates an npm shim that runs the bundled npm', () => {
    const fileSystem = createFakeFileSystem()

    const shims = ensureManagedCliRuntime({
      layout,
      nodeExecutable: '/opt/app/felixo',
      npmCliPath: '/opt/app/resources/npm/bin/npm-cli.js',
      platformName: 'linux',
      fileSystem,
    })

    assert.match(
      fileSystem.files.get(shims.npm),
      /exec "\/opt\/app\/felixo" "\/opt\/app\/resources\/npm\/bin\/npm-cli\.js" "\$@"/,
    )
  })

  it('writes .cmd shims on Windows, where chmod does not apply', () => {
    const fileSystem = createFakeFileSystem()

    const shims = ensureManagedCliRuntime({
      layout,
      nodeExecutable: 'C:\\Program Files\\Felixo\\felixo.exe',
      npmCliPath: 'C:\\Program Files\\Felixo\\resources\\npm\\bin\\npm-cli.js',
      platformName: 'win32',
      fileSystem,
    })

    assert.ok(shims.node.endsWith('node.cmd'))
    // As aspas sao o que faz o atalho sobreviver a "C:\Program Files".
    assert.match(fileSystem.files.get(shims.node), /"C:\\Program Files\\Felixo\\felixo\.exe" %\*/)
    assert.equal(fileSystem.modes.size, 0)
  })

  // Sem npm empacotado ainda vale criar o `node`: as CLIs ja instaladas
  // dependem dele para rodar, mesmo que nao seja possivel instalar novas.
  it('still creates the node shim when there is no bundled npm', () => {
    const fileSystem = createFakeFileSystem()

    const shims = ensureManagedCliRuntime({
      layout,
      nodeExecutable: '/opt/app/felixo',
      npmCliPath: null,
      platformName: 'linux',
      fileSystem,
    })

    assert.equal(shims.npm, null)
    assert.ok(fileSystem.files.has(shims.node))
  })
})

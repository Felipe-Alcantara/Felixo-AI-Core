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

  // O `.cmd` é lido na página OEM: sem o `chcp 65001` antes da linha do comando,
  // um acento no caminho do executável quebra o atalho (node.cmd e npm.cmd).
  it('puts chcp 65001 before the command line, restores the code page and keeps the exit code', () => {
    const fileSystem = createFakeFileSystem()

    const shims = ensureManagedCliRuntime({
      layout,
      nodeExecutable: 'C:\\Users\\João\\Felixo\\felixo.exe',
      npmCliPath: 'C:\\Users\\João\\Felixo\\resources\\npm\\bin\\npm-cli.js',
      platformName: 'win32',
      fileSystem,
    })

    for (const shim of [shims.node, shims.npm]) {
      const lines = fileSystem.files.get(shim).split('\r\n')
      const chcp = lines.indexOf('chcp 65001 >nul')
      const command = lines.findIndex((line) => line.includes('João') && line.endsWith(' %*'))

      assert.ok(chcp > 0 && chcp < command, 'chcp 65001 precisa vir antes do caminho acentuado')
      assert.ok(lines.includes('set "FELIXO_RC=%errorlevel%"'))
      assert.ok(lines.indexOf('if defined FELIXO_CP chcp %FELIXO_CP% >nul') > command)
      assert.equal(lines[lines.indexOf('exit /b %FELIXO_RC%') - 1].startsWith('if defined'), true)
    }
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

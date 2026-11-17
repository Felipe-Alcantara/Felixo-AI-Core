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
    assert.match(fileSystem.files.get(shims.node), /set "FELIXO_EXE0=C:\\Program Files\\Felixo\\felixo\.exe"/)
    assert.match(fileSystem.files.get(shims.node), /"%FELIXO_EXE0%" %\*/)
    assert.equal(fileSystem.modes.size, 0)
  })

  // O `.cmd` é lido na página OEM: o caminho acentuado é decodificado sob
  // `chcp 65001` e guardado em variável; a página volta ANTES de a CLI rodar.
  it('decodes the path under chcp 65001, restores the code page before running and keeps the exit code', () => {
    const fileSystem = createFakeFileSystem()

    const shims = ensureManagedCliRuntime({
      layout,
      nodeExecutable: 'C:\\Users\\João\\Felixo\\felixo.exe',
      npmCliPath: 'C:\\Users\\João\\Felixo\\resources\\npm\\bin\\npm-cli.js',
      platformName: 'win32',
      fileSystem,
    })

    for (const [shim, partes] of [[shims.node, 1], [shims.npm, 2]]) {
      const lines = fileSystem.files.get(shim).split('\r\n')
      const chcp = lines.indexOf('chcp 65001 >nul')
      const atribuicoes = lines.map((line, index) => (line.startsWith('set "FELIXO_EXE') && line.includes('João') ? index : -1)).filter((index) => index >= 0)
      const volta = lines.indexOf('if defined FELIXO_CP chcp %FELIXO_CP% >nul')
      const command = lines.findIndex((line) => line.endsWith(' %*'))

      assert.equal(atribuicoes.length, partes)
      assert.ok(chcp > 0 && atribuicoes.every((index) => index > chcp && index < volta), 'o caminho é lido sob chcp 65001')
      assert.ok(volta < command, 'a página volta antes de a CLI rodar')
      assert.equal(lines[command].includes('João'), false, 'a linha que executa não carrega o caminho literal')
      assert.equal(lines[command], Array.from({ length: partes }, (_, i) => `"%FELIXO_EXE${i}%"`).join(' ') + ' %*')
      assert.equal(lines[command + 1], 'exit /b %errorlevel%')
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

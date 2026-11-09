const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')

const { getManagedCliLayout } = require('../core/managed-cli-paths.cjs')
const {
  createCodexNativeShim,
  ensureManagedCodexNativeShim,
  findManagedCodexNativeBinary,
  isNodeProvidedByApp,
} = require('./managed-codex-native-shim.cjs')

const win = path.win32
const USER_DATA = 'C:\\Users\\Pessoa\\AppData\\Roaming\\Felixo AI Core'
const TRIPLE_X64 = 'x86_64-pc-windows-msvc'

function createLayout(userData = USER_DATA) {
  return getManagedCliLayout({ userData, platformName: 'win32', env: {} })
}

/** Caminho do `codex.exe` no layout que o npm deixa no Windows (pacote da plataforma aninhado). */
function nestedExecutable(layout, { platformPackage = 'codex-win32-x64', triple = TRIPLE_X64 } = {}) {
  return win.join(
    layout.root,
    'node_modules',
    '@openai',
    'codex',
    'node_modules',
    '@openai',
    platformPackage,
    'vendor',
    triple,
    'bin',
    'codex.exe',
  )
}

function createFakeFileSystem(existing = []) {
  const files = new Map(existing.map((filePath) => [filePath, '']))
  const log = { writes: [], removed: [], rmdirs: [] }

  return {
    files,
    log,
    existsSync: (filePath) => files.has(filePath),
    readFileSync: (filePath) => {
      if (!files.has(filePath)) {
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
      }
      return files.get(filePath)
    },
    mkdirSync: () => {},
    writeFileSync: (filePath, content) => {
      files.set(filePath, content)
      log.writes.push(filePath)
    },
    rmSync: (filePath) => {
      files.delete(filePath)
      log.removed.push(filePath)
    },
    rmdirSync: (dirPath) => {
      log.rmdirs.push(dirPath)
    },
  }
}

/** PATH das CLIs de uma máquina sem Node: só o `node.cmd` do app, por último. */
function pathWithoutRealNode(layout) {
  return ['C:\\Windows\\System32', layout.packagesBin, layout.runtimeBin].join(';')
}

describe('managed-codex-native-shim', () => {
  describe('quando grava o atalho', () => {
    it('grava native-bin\\codex.cmd quando o node do PATH é só o do app', () => {
      const layout = createLayout()
      const executable = nestedExecutable(layout)
      const fileSystem = createFakeFileSystem([executable, win.join(layout.runtimeBin, 'node.cmd')])

      const result = ensureManagedCodexNativeShim({
        layout,
        effectivePath: pathWithoutRealNode(layout),
        platformName: 'win32',
        arch: 'x64',
        fileSystem,
      })

      const shimPath = win.join(layout.nativeBin, 'codex.cmd')
      assert.equal(result.action, 'created')
      assert.equal(result.shimPath, shimPath)
      assert.deepEqual(fileSystem.log.writes, [shimPath])
      assert.match(fileSystem.files.get(shimPath), /codex-win32-x64\\vendor\\x86_64-pc-windows-msvc\\bin\\codex\.exe"/)
    })

    it('grava também quando não há node nenhum no PATH', () => {
      const layout = createLayout()
      const fileSystem = createFakeFileSystem([nestedExecutable(layout)])

      const result = ensureManagedCodexNativeShim({
        layout,
        effectivePath: 'C:\\Windows\\System32',
        platformName: 'win32',
        arch: 'x64',
        fileSystem,
      })

      assert.equal(result.action, 'created')
    })

    it('não regrava um atalho que já está certo (o cmd.exe lê o .cmd aos poucos enquanto roda)', () => {
      const layout = createLayout()
      const fileSystem = createFakeFileSystem([nestedExecutable(layout)])
      const options = {
        layout,
        effectivePath: pathWithoutRealNode(layout),
        platformName: 'win32',
        arch: 'x64',
        fileSystem,
      }

      assert.equal(ensureManagedCodexNativeShim(options).action, 'created')
      fileSystem.log.writes.length = 0

      assert.equal(ensureManagedCodexNativeShim(options).action, 'unchanged')
      assert.deepEqual(fileSystem.log.writes, [])
    })

    it('atualiza o atalho quando o conteúdo mudou (ex.: o npm passou a içar o pacote da plataforma)', () => {
      const layout = createLayout()
      const shimPath = win.join(layout.nativeBin, 'codex.cmd')
      const fileSystem = createFakeFileSystem([nestedExecutable(layout), shimPath])
      fileSystem.files.set(shimPath, '@echo off\r\nrem de uma versao antiga\r\n')

      const result = ensureManagedCodexNativeShim({
        layout,
        effectivePath: pathWithoutRealNode(layout),
        platformName: 'win32',
        arch: 'x64',
        fileSystem,
      })

      assert.equal(result.action, 'updated')
      assert.notEqual(fileSystem.files.get(shimPath), '@echo off\r\nrem de uma versao antiga\r\n')
    })

    it('não faz nada fora do Windows', () => {
      const layout = createLayout()
      const fileSystem = createFakeFileSystem([nestedExecutable(layout)])

      for (const platformName of ['linux', 'darwin']) {
        const result = ensureManagedCodexNativeShim({
          layout,
          effectivePath: '',
          platformName,
          arch: 'x64',
          fileSystem,
        })
        assert.equal(result.action, 'none')
      }
      assert.deepEqual(fileSystem.log.writes, [])
    })
  })

  describe('quando NÃO grava (e remove o que sobrou)', () => {
    it('com um node.exe de verdade antes do runtime-bin, deixa o codex.cmd do npm valer', () => {
      const layout = createLayout()
      const shimPath = win.join(layout.nativeBin, 'codex.cmd')
      const realNode = 'C:\\Program Files\\nodejs\\node.exe'
      const fileSystem = createFakeFileSystem([
        nestedExecutable(layout),
        realNode,
        win.join(layout.runtimeBin, 'node.cmd'),
        shimPath,
      ])

      const result = ensureManagedCodexNativeShim({
        layout,
        effectivePath: ['C:\\Program Files\\nodejs', layout.packagesBin, layout.runtimeBin].join(';'),
        platformName: 'win32',
        arch: 'x64',
        fileSystem,
      })

      assert.equal(result.action, 'removed')
      assert.equal(result.reason, 'node-real-no-path')
      assert.deepEqual(fileSystem.log.removed, [shimPath])
      assert.deepEqual(fileSystem.log.rmdirs, [layout.nativeBin])
    })

    it('sem node de verdade mas sem codex.exe no disco, não grava e remove o atalho velho', () => {
      const layout = createLayout()
      const shimPath = win.join(layout.nativeBin, 'codex.cmd')
      const fileSystem = createFakeFileSystem([shimPath])

      const result = ensureManagedCodexNativeShim({
        layout,
        effectivePath: pathWithoutRealNode(layout),
        platformName: 'win32',
        arch: 'x64',
        fileSystem,
      })

      assert.equal(result.action, 'removed')
      assert.equal(result.reason, 'sem-codex-nativo')
      assert.deepEqual(fileSystem.log.writes, [])
    })

    it('não escreve nada quando não há o que gravar nem o que remover', () => {
      const layout = createLayout()
      const fileSystem = createFakeFileSystem()

      const result = ensureManagedCodexNativeShim({
        layout,
        effectivePath: pathWithoutRealNode(layout),
        platformName: 'win32',
        arch: 'x64',
        fileSystem,
      })

      assert.equal(result.action, 'none')
      assert.deepEqual(fileSystem.log, { writes: [], removed: [], rmdirs: [] })
    })

    it('se o Windows não deixar apagar o atalho (Codex aberto), segue sem lançar erro', () => {
      const layout = createLayout()
      const shimPath = win.join(layout.nativeBin, 'codex.cmd')
      const fileSystem = createFakeFileSystem([shimPath])
      fileSystem.rmSync = () => {
        throw Object.assign(new Error('EBUSY'), { code: 'EBUSY' })
      }

      const result = ensureManagedCodexNativeShim({
        layout,
        effectivePath: pathWithoutRealNode(layout),
        platformName: 'win32',
        arch: 'x64',
        fileSystem,
      })

      assert.equal(result.action, 'none')
    })
  })

  describe('findManagedCodexNativeBinary', () => {
    it('acha o pacote da plataforma aninhado no pacote principal', () => {
      const layout = createLayout()
      const executable = nestedExecutable(layout)

      const found = findManagedCodexNativeBinary({
        layout,
        arch: 'x64',
        fileSystem: createFakeFileSystem([executable]),
      })

      assert.equal(found.executable, executable)
      assert.equal(found.packageRoot, win.join(layout.root, 'node_modules', '@openai', 'codex'))
    })

    it('acha o pacote da plataforma içado para o nível de cima', () => {
      const layout = createLayout()
      const executable = win.join(
        layout.root,
        'node_modules',
        '@openai',
        'codex-win32-x64',
        'vendor',
        TRIPLE_X64,
        'bin',
        'codex.exe',
      )

      const found = findManagedCodexNativeBinary({
        layout,
        arch: 'x64',
        fileSystem: createFakeFileSystem([executable]),
      })

      assert.equal(found.executable, executable)
    })

    it('acha o vendor/ dentro do pacote principal (layout antigo do codex.js)', () => {
      const layout = createLayout()
      const executable = win.join(
        layout.root,
        'node_modules',
        '@openai',
        'codex',
        'vendor',
        TRIPLE_X64,
        'bin',
        'codex.exe',
      )

      const found = findManagedCodexNativeBinary({
        layout,
        arch: 'x64',
        fileSystem: createFakeFileSystem([executable]),
      })

      assert.equal(found.executable, executable)
    })

    it('usa o triplo e o pacote do ARM64 no Windows ARM', () => {
      const layout = createLayout()
      const executable = nestedExecutable(layout, {
        platformPackage: 'codex-win32-arm64',
        triple: 'aarch64-pc-windows-msvc',
      })

      const found = findManagedCodexNativeBinary({
        layout,
        arch: 'arm64',
        fileSystem: createFakeFileSystem([executable]),
      })

      assert.equal(found.executable, executable)
    })

    it('devolve null para uma arquitetura sem pacote do Codex', () => {
      const layout = createLayout()

      assert.equal(
        findManagedCodexNativeBinary({
          layout,
          arch: 'ia32',
          fileSystem: createFakeFileSystem([nestedExecutable(layout)]),
        }),
        null,
      )
    })
  })

  describe('isNodeProvidedByApp', () => {
    const layout = createLayout()

    it('é verdade quando o primeiro node do PATH é o node.cmd do runtime-bin', () => {
      const exists = (candidate) => candidate === win.join(layout.runtimeBin, 'node.cmd')

      assert.equal(isNodeProvidedByApp({ effectivePath: pathWithoutRealNode(layout), layout, exists }), true)
    })

    it('é falso quando um node.exe de gerenciador de versão vem antes do runtime-bin', () => {
      const nvmNode = 'C:\\Users\\Pessoa\\AppData\\Local\\nvm\\v22.1.0\\node.exe'
      const exists = (candidate) => candidate === nvmNode || candidate === win.join(layout.runtimeBin, 'node.cmd')
      const effectivePath = ['C:\\Users\\Pessoa\\AppData\\Local\\nvm\\v22.1.0', layout.runtimeBin].join(';')

      assert.equal(isNodeProvidedByApp({ effectivePath, layout, exists }), false)
    })

    it('é falso para um node.cmd que não é o do app (shim de gerenciador de versão)', () => {
      const fnmShim = 'C:\\Users\\Pessoa\\AppData\\Local\\fnm_multishells\\123\\node.cmd'
      const exists = (candidate) => candidate === fnmShim
      const effectivePath = ['C:\\Users\\Pessoa\\AppData\\Local\\fnm_multishells\\123', layout.runtimeBin].join(';')

      assert.equal(isNodeProvidedByApp({ effectivePath, layout, exists }), false)
    })

    it('compara a pasta do runtime-bin sem diferenciar maiúsculas nem barra final', () => {
      const shimmedPath = `${layout.runtimeBin.toUpperCase()}\\`
      const exists = (candidate) => candidate.toLowerCase() === win.join(layout.runtimeBin, 'node.cmd').toLowerCase()

      assert.equal(isNodeProvidedByApp({ effectivePath: shimmedPath, layout, exists }), true)
    })

    it('é verdade quando não há node em lugar nenhum', () => {
      assert.equal(isNodeProvidedByApp({ effectivePath: 'C:\\Windows', layout, exists: () => false }), true)
    })
  })

  describe('createCodexNativeShim', () => {
    const shim = createCodexNativeShim({
      executableRelative: '..\\node_modules\\@openai\\codex\\node_modules\\@openai\\codex-win32-x64\\vendor\\x86_64-pc-windows-msvc\\bin\\codex.exe',
      packageRootRelative: '..\\node_modules\\@openai\\codex',
    })

    it('abre o codex.exe a partir da pasta do próprio atalho e repassa os argumentos', () => {
      assert.match(shim, /^"%~dp0\.\.\\node_modules\\@openai\\codex\\node_modules\\.*\\codex\.exe" %\*$/m)
    })

    it('define as variáveis que o codex.js do npm define, sem vazar para o cmd.exe interativo', () => {
      assert.match(shim, /^setlocal$/m)
      assert.match(shim, /set "CODEX_MANAGED_BY_NPM=1"/)
      assert.match(shim, /set "CODEX_MANAGED_PACKAGE_ROOT=%%~fI"/)
    })

    it('devolve o código de saída do Codex', () => {
      assert.match(shim, /^exit \/b %errorlevel%$/m)
    })

    it('usa só ASCII e fim de linha CRLF (o cmd.exe lê o .cmd na página de código OEM)', () => {
      assert.match(shim, /^[\x00-\x7f]*$/)
      assert.ok(!/(?<!\r)\n/.test(shim), 'toda quebra de linha precisa ser CRLF')
    })

    it('não tem caractere de redirecionamento nem pipe nos comentários (o cmd.exe os interpretaria)', () => {
      const comments = shim.split('\r\n').filter((line) => line.startsWith('rem '))

      assert.ok(comments.length > 0)
      for (const line of comments) {
        assert.doesNotMatch(line, /[<>|&%]/, line)
      }
    })

    it('com perfil acentuado no Windows, o atalho continua só em ASCII (caminho relativo, não literal)', () => {
      const layout = createLayout('C:\\Users\\João Antônio\\AppData\\Roaming\\Felixo AI Core')
      const fileSystem = createFakeFileSystem([nestedExecutable(layout)])

      ensureManagedCodexNativeShim({
        layout,
        effectivePath: pathWithoutRealNode(layout),
        platformName: 'win32',
        arch: 'x64',
        fileSystem,
      })

      assert.match(fileSystem.files.get(win.join(layout.nativeBin, 'codex.cmd')), /^[\x00-\x7f]*$/)
    })
  })
})

'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const {
  createPtyWorkingDirectory,
  runContextCatalogSmoke,
  normalizePtyTextOutput,
} = require('./release-smoke.cjs')

function pastaTemporaria() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-release-smoke-test-'))
}

test('createPtyWorkingDirectory devolve um cwd curto por padrão', () => {
  const cwd = createPtyWorkingDirectory()
  try {
    assert.ok(fs.existsSync(cwd))
    assert.ok(cwd.length < 200)
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true })
  }
})

test('createPtyWorkingDirectory estoura o MAX_PATH clássico com FELIXO_RELEASE_SMOKE_LONG_PATH=1', () => {
  process.env.FELIXO_RELEASE_SMOKE_LONG_PATH = '1'
  let cwd
  try {
    cwd = createPtyWorkingDirectory()
    assert.ok(fs.existsSync(cwd))
    assert.ok(cwd.length > 260, `esperava mais de 260 caracteres, teve ${cwd.length}`)
  } finally {
    delete process.env.FELIXO_RELEASE_SMOKE_LONG_PATH
    if (cwd) fs.rmSync(cwd, { recursive: true, force: true })
  }
})

/**
 * O `.cmd` do Windows só roda de verdade passado pelo `cmd.exe` (`cmd /c`),
 * que é como `child_process` resolve um `.cmd` sem `shell: true` — mesmo
 * comportamento provado em `agent-command-install.test.cjs`.
 */
function executarComando(caminho, args) {
  if (process.platform === 'win32') {
    return execFileSync('cmd.exe', ['/d', '/s', '/c', caminho, ...args], {
      encoding: 'utf8',
      windowsVerbatimArguments: true,
    })
  }
  return execFileSync(caminho, args, { encoding: 'utf8' })
}

test('prova a entrega de catálogo de ponta a ponta: escreve, instala o shim e lê byte a byte pelo comando real', async () => {
  const root = pastaTemporaria()
  const userData = path.join(root, 'profile')
  const contextFiles = path.join(userData, 'context-deliveries')
  const bin = path.join(userData, 'bin')
  fs.mkdirSync(contextFiles, { recursive: true })

  const fakeApp = {
    getPath: (name) => (name === 'userData' ? userData : root),
    isPackaged: true,
  }

  const manager = {
    spawnOptions: null,
    spawn(_sessionId, options) {
      this.spawnOptions = options
    },
    write(_sessionId, script) {
      const linhas = script.split(/\r?\n/).filter(Boolean)
      let saida = ''
      for (const linha of linhas) {
        const leitura = linha.match(/^felixo context read "(.+)"$/)
        if (leitura) {
          const shimPath = path.join(bin, process.platform === 'win32' ? 'felixo.cmd' : 'felixo')
          try {
            saida += executarComando(shimPath, ['context', 'read', leitura[1]])
          } catch (error) {
            // O shim sai com código != 0 quando o artefato não existe; a
            // mensagem real (stdout+stderr) é o que o teste precisa inspecionar.
            saida += `${error.stdout || ''}${error.stderr || ''}`
          }
          continue
        }
        const eco = linha.match(/^echo (\S+)$/)
        if (eco) saida += `${eco[1]}\n`
      }
      queueMicrotask(() => {
        this.spawnOptions.onData(saida)
        this.spawnOptions.onExit({ exitCode: 0 })
      })
      return true
    },
    aguardarEscritas() {
      return Promise.resolve()
    },
  }

  const resultado = await runContextCatalogSmoke({ app: fakeApp, manager, cwd: root })

  assert.equal(resultado.ok, true)
  assert.equal(resultado.files.length, 2)
  assert.ok(resultado.files.every((file) => file.readExactly === true))
  assert.equal(resultado.missingArtifactReported, true)
  assert.ok(fs.existsSync(resultado.shimInstalled))
})

test('reporta ok:false com preview cru quando o artefato ausente não é reportado pelo shim', async () => {
  const root = pastaTemporaria()
  const userData = path.join(root, 'profile')
  fs.mkdirSync(path.join(userData, 'context-deliveries'), { recursive: true })

  const fakeApp = {
    getPath: (name) => (name === 'userData' ? userData : root),
    isPackaged: true,
  }

  // Um manager cujo `write` nunca roda o shim de verdade — simula um regressão
  // em que o PTY não devolve nada — deve fazer o smoke falhar, não passar em
  // silêncio.
  const managerMudo = {
    spawn(_sessionId, options) {
      this.onExit = options.onExit
      this.onData = options.onData
    },
    write() {
      queueMicrotask(() => {
        this.onData(`ignorado\nFELIXO_RELEASE_CONTEXT_DONE\n`)
        this.onExit({ exitCode: 0 })
      })
      return true
    },
    aguardarEscritas() {
      return Promise.resolve()
    },
  }

  const resultado = await runContextCatalogSmoke({ app: fakeApp, manager: managerMudo, cwd: root })

  assert.equal(resultado.ok, false)
  assert.equal(resultado.missingArtifactReported, false)
  assert.ok(typeof resultado.rawOutputPreview === 'string' && resultado.rawOutputPreview.length > 0)
})

test('runPackagedReleaseSmoke lança quando a entrega de contexto reporta ok:false', async () => {
  const root = pastaTemporaria()
  const statusFile = path.join(root, 'status.json')
  const userData = path.join(root, 'profile')

  class FakePtyManager {
    spawn(sessionId, options) {
      const marker = sessionId.startsWith('release-smoke-context-')
        ? 'FELIXO_RELEASE_CONTEXT_DONE'
        : 'FELIXO_RELEASE_PTY_OK'
      queueMicrotask(() => {
        options.onData(`${marker}\r\n`)
        options.onExit({ exitCode: 0 })
      })
    }

    write() {
      return true
    }

    aguardarEscritas() {
      return Promise.resolve()
    }

    killAll() {}
  }

  await assert.rejects(
    () => require('./release-smoke.cjs').runPackagedReleaseSmoke({
      app: { isPackaged: true, getVersion: () => '0.1.999', getPath: () => userData },
      statusFile,
      PtyManager: FakePtyManager,
    }),
    /entrega de catálogo empacotada falhou/,
  )

  const status = JSON.parse(fs.readFileSync(statusFile, 'utf8'))
  assert.equal(status.contextDelivery.ok, false)
  assert.ok(typeof status.contextDelivery.rawOutputPreview === 'string')
})

test('sobrevive à tradução \\n → \\r\\n de um PTY real, sem reprovar um corpo intacto', async () => {
  // Bug medido ao vivo na matriz de Release: um PTY POSIX (termios `onlcr`) e
  // o ConPTY do Windows convertem cada `\n` que o processo filho escreve para
  // `\r\n` na leitura. `writeContextFile` grava com `\n` puro; sem normalizar
  // a saída do PTY antes de comparar, os três SOs reprovavam uma entrega cujo
  // corpo estava, na verdade, intacto. Este fake reproduz exatamente essa
  // tradução — algo que o teste com `execFileSync` (acima) não reproduz,
  // porque um processo comum não passa pela disciplina de linha de um PTY.
  const root = pastaTemporaria()
  const userData = path.join(root, 'profile')
  const contextFiles = path.join(userData, 'context-deliveries')
  fs.mkdirSync(contextFiles, { recursive: true })

  const fakeApp = {
    getPath: (name) => (name === 'userData' ? userData : root),
    isPackaged: true,
  }

  const managerComOnlcr = {
    spawn(_sessionId, options) {
      this.onExit = options.onExit
      this.onData = options.onData
    },
    write(_sessionId, script) {
      const nomes = [...script.matchAll(/felixo context read "(.+)"/g)].map((m) => m[1])
      let saida = ''
      for (const nome of nomes) {
        const caminho = path.join(contextFiles, nome)
        const corpo = fs.existsSync(caminho)
          ? fs.readFileSync(caminho, 'utf8')
          : `Artefato de contexto não encontrado: ${nome}. Não substitua por outro artefato; informe este nome e o erro exato.`
        // A "tradução onlcr": todo \n vira \r\n, como um PTY de verdade entrega.
        saida += corpo.replace(/\n/g, '\r\n')
      }
      queueMicrotask(() => {
        this.onData(`${saida}\r\nFELIXO_RELEASE_CONTEXT_DONE\r\n`)
        this.onExit({ exitCode: 0 })
      })
      return true
    },
    aguardarEscritas() {
      return Promise.resolve()
    },
  }

  const resultado = await runContextCatalogSmoke({ app: fakeApp, manager: managerComOnlcr, cwd: root })

  assert.equal(resultado.ok, true)
  assert.ok(resultado.files.every((file) => file.readExactly === true))
  assert.equal(resultado.missingArtifactReported, true)
})

test('reconstitui o texto de verdade a partir de uma captura real do runner Windows (PowerShell + ConPTY)', () => {
  // Fixture não inventada: é o `rawOutputPreview` de verdade que a matriz de
  // Release publicou no run 34436218790, antes desta normalização existir —
  // ver electron/__fixtures__/release-smoke-windows-conpty-sample.txt. Prova
  // que a correção resolve o caso real, não uma reprodução aproximada dele.
  const capturaReal = fs.readFileSync(
    path.join(__dirname, '__fixtures__', 'release-smoke-windows-conpty-sample.txt'),
    'utf8',
  )

  const normalizado = normalizePtyTextOutput(capturaReal)

  assert.ok(
    normalizado.includes('Acentuação: ação, avaliação, coração, é, ê, ã, ç.\nEmoji: 🚀 ✅ 🧪'),
    'o primeiro corpo deveria reaparecer contíguo, sem sequência ANSI no meio',
  )
  assert.ok(
    normalizado.includes(
      'Esta é a SEGUNDA parte; a ordem de leitura importa para a "combinação ordenada".',
    ),
    'o segundo corpo deveria reaparecer contíguo, sem sequência ANSI no meio',
  )
  assert.ok(
    normalizado.includes('Artefato de contexto não encontrado: felixo-context-0-'),
    'o erro de artefato ausente deveria sobreviver à normalização',
  )
  assert.ok(!normalizado.includes('\x1b'), 'nenhuma sequência de escape deveria sobrar')
})

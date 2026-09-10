'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const { runContextCatalogSmoke } = require('./release-smoke.cjs')

function pastaTemporaria() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-release-smoke-test-'))
}

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

test('falha alto e claro quando o artefato ausente não é reportado pelo shim', async () => {
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

  await assert.rejects(
    () => runContextCatalogSmoke({ app: fakeApp, manager: managerMudo, cwd: root }),
    /não devolveu algum artefato byte a byte|não reportou o artefato ausente/,
  )
})

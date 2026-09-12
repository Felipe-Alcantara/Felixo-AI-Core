'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { EventEmitter } = require('node:events')

const {
  DEFAULT_CACHE_BUDGET_BYTES,
  measureDirectorySize,
  pruneNpmCacheIfOverBudget,
} = require('./managed-cli-cache-maintenance.cjs')

/**
 * Sistema de arquivos falso: um mapa caminho → { isFile, size } | { isDir, children }.
 * As chaves são montadas com `path.join`, não concatenação de string com
 * `/` — a função real usa `path.join`, que no Windows produz `\`. Um teste
 * com chave hardcoded em `/` nunca bateria com o caminho real ali.
 */
function createFakeFs(tree) {
  return {
    readdirSync(dir, { withFileTypes }) {
      const node = tree[dir]
      if (!node || node.isFile) throw new Error(`ENOENT: ${dir}`)
      if (!withFileTypes) throw new Error('teste espera withFileTypes')
      return node.children.map((name) => ({
        name,
        isDirectory: () => Boolean(tree[path.join(dir, name)]?.isDir),
        isFile: () => Boolean(tree[path.join(dir, name)]?.isFile),
      }))
    },
    statSync(filePath) {
      const node = tree[filePath]
      if (!node) throw new Error(`ENOENT: ${filePath}`)
      return { size: node.size ?? 0 }
    },
  }
}

const CACHE_DIR = path.join('cache-root', 'cache')

describe('measureDirectorySize', () => {
  it('soma o tamanho de todos os arquivos recursivamente', () => {
    const fileSystem = createFakeFs({
      [CACHE_DIR]: { isDir: true, children: ['a.txt', 'sub'] },
      [path.join(CACHE_DIR, 'a.txt')]: { isFile: true, size: 100 },
      [path.join(CACHE_DIR, 'sub')]: { isDir: true, children: ['b.txt'] },
      [path.join(CACHE_DIR, 'sub', 'b.txt')]: { isFile: true, size: 250 },
    })

    assert.equal(measureDirectorySize(CACHE_DIR, fileSystem), 350)
  })

  it('devolve 0 quando a pasta nunca foi criada (cache nunca usado)', () => {
    const fileSystem = createFakeFs({})

    assert.equal(measureDirectorySize(path.join('cache-root', 'nao-existe'), fileSystem), 0)
  })
})

describe('pruneNpmCacheIfOverBudget', () => {
  const baseFs = createFakeFs({
    [CACHE_DIR]: { isDir: true, children: ['big.bin'] },
    [path.join(CACHE_DIR, 'big.bin')]: { isFile: true, size: 300 },
  })

  it('não mexe no cache quando está dentro do orçamento', async () => {
    let spawnCalled = false
    const result = await pruneNpmCacheIfOverBudget({
      cacheDir: CACHE_DIR,
      npmCliPath: '/npm-cli.js',
      nodeExecutable: '/node',
      env: {},
      maxBytes: 1000,
      fileSystem: baseFs,
      spawn: () => {
        spawnCalled = true
      },
    })

    assert.equal(result.pruned, false)
    assert.equal(result.sizeBytes, 300)
    assert.equal(spawnCalled, false)
  })

  it('limpa o cache com "npm cache clean --force" quando passa do orçamento', async () => {
    const calls = []
    const result = await pruneNpmCacheIfOverBudget({
      cacheDir: CACHE_DIR,
      npmCliPath: '/npm-cli.js',
      nodeExecutable: '/node',
      env: { PATH: '/usr/bin' },
      maxBytes: 100,
      fileSystem: baseFs,
      spawn: (command, args, options) => {
        calls.push({ command, args, options })
        const child = new EventEmitter()
        child.stderr = new EventEmitter()
        process.nextTick(() => child.emit('close', 0))
        return child
      },
    })

    assert.equal(result.pruned, true)
    assert.equal(result.sizeBytes, 300)
    assert.equal(calls.length, 1)
    assert.equal(calls[0].command, '/node')
    assert.deepEqual(calls[0].args, [
      '/npm-cli.js',
      'cache',
      'clean',
      '--force',
      '--cache',
      CACHE_DIR,
      '--loglevel=error',
    ])
  })

  it('reporta a falha sem lançar quando a limpeza do npm falha', async () => {
    const result = await pruneNpmCacheIfOverBudget({
      cacheDir: CACHE_DIR,
      npmCliPath: '/npm-cli.js',
      nodeExecutable: '/node',
      env: {},
      maxBytes: 100,
      fileSystem: baseFs,
      spawn: () => {
        const child = new EventEmitter()
        child.stderr = new EventEmitter()
        process.nextTick(() => {
          child.stderr.emit('data', 'disco cheio')
          child.emit('close', 1)
        })
        return child
      },
    })

    assert.equal(result.pruned, false)
    assert.match(result.message, /falhou/)
  })

  it('usa o orçamento padrão quando maxBytes não é passado', () => {
    assert.equal(typeof DEFAULT_CACHE_BUDGET_BYTES, 'number')
    assert.ok(DEFAULT_CACHE_BUDGET_BYTES > 0)
  })
})

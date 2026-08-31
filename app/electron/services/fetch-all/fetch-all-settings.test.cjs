const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { DEFAULT_EXCLUDE_DIRS } = require('./repo-scanner.cjs')
const {
  createFetchAllSettingsStore,
  normalizeSettings,
} = require('./fetch-all-settings.cjs')
const {
  cacheMatchesRoots,
  cachedReposStillOnDisk,
  createScanCache,
  createScanCacheKey,
  parseCache,
} = require('./scan-cache.cjs')

function tempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix))
}

test('normalizeSettings aplica os padrões diante de lixo', () => {
  const settings = normalizeSettings({ scanRoots: [1, '  ', null], analyzeWorkers: 999 })

  assert.deepEqual(settings.scanRoots, [])
  assert.deepEqual(settings.excludeDirs, DEFAULT_EXCLUDE_DIRS)
  assert.deepEqual(settings.ignoredPaths, [])
  assert.equal(settings.analyzeWorkers, 8)
  assert.deepEqual(normalizeSettings(null).excludeDirs, DEFAULT_EXCLUDE_DIRS)
})

test('normalizeSettings mescla de volta as exclusões padrão perdidas', () => {
  const settings = normalizeSettings({ excludeDirs: ['minha-pasta'] })

  assert.equal(settings.excludeDirs[0], 'minha-pasta')
  for (const name of DEFAULT_EXCLUDE_DIRS) {
    assert.ok(settings.excludeDirs.includes(name), `faltou ${name}`)
  }
})

test('normalizeSettings resolve e deduplica os caminhos ignorados', () => {
  // path.resolve() segue o SO real (em Windows, '/a/b' vira 'D:\a\b' e não
  // '/a/b'), então o esperado tem que passar pelo mesmo resolve, não vir
  // como literal POSIX cravado no teste.
  const resolved = path.resolve('/a/b')

  const settings = normalizeSettings({
    ignoredPaths: ['/a/b', '/a/b/', '/a/b/../b', 'relativo'],
  })

  assert.ok(settings.ignoredPaths.includes(resolved))
  assert.equal(settings.ignoredPaths.filter((item) => item === resolved).length, 1)
  assert.ok(settings.ignoredPaths.every((item) => path.isAbsolute(item)))
})

test('o store persiste e relê a configuração já normalizada', async () => {
  const store = createFetchAllSettingsStore({ configDir: tempDir('felixo-config-') })

  assert.deepEqual((await store.load()).ignoredPaths, [])

  const saved = await store.save({ ignoredPaths: ['/dados/arquivo-morto'], analyzeWorkers: 4 })

  assert.deepEqual(saved.ignoredPaths, [path.resolve('/dados/arquivo-morto')])
  assert.deepEqual(await store.load(), saved)
})

test('createFetchAllSettingsStore exige um diretório de configuração', () => {
  assert.throws(() => createFetchAllSettingsStore({ configDir: '  ' }), /inválido/)
})

test('parseCache trata conteúdo corrompido como cache ausente', () => {
  assert.equal(parseCache(null), null)
  assert.equal(parseCache({ roots: ['/a'] }), null)
  assert.equal(parseCache({ scannedAt: '2026-07-05', roots: ['/a'], repos: [1] }), null)
  assert.deepEqual(parseCache({ scannedAt: '2026-07-05', roots: [], repos: [] }), {
    scannedAt: '2026-07-05',
    roots: [],
    repos: [],
  })
})

test('o cache só vale para as mesmas raízes e descarta repositório apagado', async () => {
  const cacheDir = tempDir('felixo-cache-')
  const repoDir = tempDir('felixo-repo-')
  const apagado = path.join(repoDir, 'sumiu')

  fs.mkdirSync(path.join(repoDir, '.git'))

  const cache = createScanCache({ cacheDir })
  await cache.save(['/'], [repoDir, apagado])

  const loaded = await cache.load()

  assert.deepEqual(loaded.roots, ['/'])
  assert.equal(cacheMatchesRoots(loaded, ['/']), true)
  assert.equal(cacheMatchesRoots(loaded, ['/', '/mnt/dados']), false)
  assert.deepEqual(cachedReposStillOnDisk(loaded), [repoDir])
})

test('o cache invalida exclusões, ignorados, montagens e discos disponíveis diferentes', async () => {
  const cache = createScanCache({ cacheDir: tempDir('felixo-cache-contexto-') })
  const context = {
    excludeDirs: ['node_modules', '.cache'],
    ignoredPaths: ['/dados/antigos'],
    skipPaths: ['/proc', '/run'],
    availableRoots: ['/', '/mnt/dados'],
  }

  await cache.save(['/projetos'], ['/projetos/app'], context)
  const loaded = await cache.load()

  assert.equal(cacheMatchesRoots(loaded, ['/projetos'], context), true)
  assert.equal(
    cacheMatchesRoots(loaded, ['/projetos'], {
      ...context,
      excludeDirs: [...context.excludeDirs, 'tmp'],
    }),
    false,
  )
  assert.equal(
    cacheMatchesRoots(loaded, ['/projetos'], {
      ...context,
      ignoredPaths: [],
    }),
    false,
  )
  assert.equal(
    cacheMatchesRoots(loaded, ['/projetos'], {
      ...context,
      skipPaths: ['/proc', '/sys'],
    }),
    false,
  )
  assert.equal(
    cacheMatchesRoots(loaded, ['/projetos'], {
      ...context,
      availableRoots: ['/', '/mnt/novo-disco'],
    }),
    false,
  )
  assert.notEqual(
    loaded.cacheKey,
    createScanCacheKey({ roots: ['/projetos'], ...context, availableRoots: [] }),
  )
})

test('cache ausente ou ilegível devolve null em vez de quebrar a varredura', async () => {
  const cache = createScanCache({ cacheDir: tempDir('felixo-cache-vazio-') })

  assert.equal(await cache.load(), null)

  fs.writeFileSync(cache.filePath, 'isto não é json')

  assert.equal(await cache.load(), null)
})

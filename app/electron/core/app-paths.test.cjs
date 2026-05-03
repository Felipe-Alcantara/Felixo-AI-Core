const { describe, it, after } = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const os = require('node:os')
const fs = require('node:fs')

const { getAppPaths, ensureDir, initAppPaths, getCacheBase, APP_NAME } = require('./app-paths.cjs')

const mockUserData = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-paths-'))

function createMockApp(overrides = {}) {
  return {
    isPackaged: overrides.isPackaged ?? false,
    getPath(name) {
      const paths = {
        userData: mockUserData,
        logs: path.join(mockUserData, 'logs'),
        sessionData: path.join(mockUserData, 'sessionData'),
      }
      if (paths[name]) return paths[name]
      throw new Error(`Unknown path: ${name}`)
    },
  }
}

describe('app-paths', () => {
  after(() => {
    fs.rmSync(mockUserData, { recursive: true, force: true })
  })

  describe('getAppPaths()', () => {
    it('returns all expected path keys', () => {
      const paths = getAppPaths({ electronApp: createMockApp() })
      const expectedKeys = [
        'userData', 'config', 'logs', 'cache', 'temp',
        'database', 'exports', 'notes', 'reports',
        'assets', 'appRoot', 'isPackaged', 'platform',
      ]
      for (const key of expectedKeys) {
        assert.ok(key in paths, `Missing key: ${key}`)
      }
    })

    it('returns absolute paths', () => {
      const paths = getAppPaths({ electronApp: createMockApp() })
      const pathKeys = ['userData', 'config', 'logs', 'cache', 'temp', 'database', 'exports', 'notes', 'reports', 'assets', 'appRoot']
      for (const key of pathKeys) {
        assert.ok(path.isAbsolute(paths[key]), `${key} is not absolute: ${paths[key]}`)
      }
    })

    it('reports correct isPackaged value', () => {
      const paths = getAppPaths({ electronApp: createMockApp({ isPackaged: false }) })
      assert.strictEqual(paths.isPackaged, false)

      const pathsProd = getAppPaths({ electronApp: createMockApp({ isPackaged: true }) })
      assert.strictEqual(pathsProd.isPackaged, true)
    })

    it('reports correct platform', () => {
      const paths = getAppPaths({ electronApp: createMockApp() })
      assert.strictEqual(paths.platform, process.platform)
    })

    it('config is inside userData', () => {
      const paths = getAppPaths({ electronApp: createMockApp() })
      assert.ok(paths.config.startsWith(paths.userData))
    })

    it('database is inside userData', () => {
      const paths = getAppPaths({ electronApp: createMockApp() })
      assert.ok(paths.database.startsWith(paths.userData))
    })

    it('works without electronApp (fallback mode)', () => {
      const paths = getAppPaths()
      assert.ok(path.isAbsolute(paths.userData))
      assert.strictEqual(paths.isPackaged, false)
    })
  })

  describe('ensureDir()', () => {
    it('creates directory if it does not exist', () => {
      const testDir = path.join(mockUserData, 'ensure-test', 'nested')
      ensureDir(testDir)
      assert.ok(fs.existsSync(testDir))
      fs.rmSync(path.join(mockUserData, 'ensure-test'), { recursive: true, force: true })
    })

    it('does not throw if directory already exists', () => {
      const testDir = path.join(mockUserData, 'ensure-existing')
      fs.mkdirSync(testDir, { recursive: true })
      assert.doesNotThrow(() => ensureDir(testDir))
      fs.rmSync(testDir, { recursive: true, force: true })
    })

    it('throws for empty string', () => {
      assert.throws(() => ensureDir(''), /non-empty string/)
    })

    it('returns the same path', () => {
      const testDir = path.join(mockUserData, 'ensure-return')
      const result = ensureDir(testDir)
      assert.strictEqual(result, testDir)
      fs.rmSync(testDir, { recursive: true, force: true })
    })
  })

  describe('initAppPaths()', () => {
    it('creates all user-data directories', () => {
      const paths = initAppPaths({ electronApp: createMockApp() })
      assert.ok(fs.existsSync(paths.config))
      assert.ok(fs.existsSync(paths.logs))
      assert.ok(fs.existsSync(paths.database))
      assert.ok(fs.existsSync(paths.exports))
      assert.ok(fs.existsSync(paths.notes))
      assert.ok(fs.existsSync(paths.reports))
    })
  })

  describe('getCacheBase()', () => {
    it('returns a non-empty string', () => {
      const cacheBase = getCacheBase()
      assert.ok(typeof cacheBase === 'string')
      assert.ok(cacheBase.length > 0)
    })

    it('returns an absolute path', () => {
      const cacheBase = getCacheBase()
      assert.ok(path.isAbsolute(cacheBase))
    })
  })

  describe('APP_NAME', () => {
    it('is felixo-ai-core', () => {
      assert.strictEqual(APP_NAME, 'felixo-ai-core')
    })
  })
})

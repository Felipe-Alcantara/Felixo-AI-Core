const test = require('node:test')
const assert = require('node:assert/strict')
const {
  defaultConfig,
  normalizeConfig,
  SYSTEM_DESIGN_CONFIG_KEY,
} = require('./system-design-ipc-handlers.cjs')

test('SYSTEM_DESIGN_CONFIG_KEY is the expected settings key', () => {
  assert.equal(SYSTEM_DESIGN_CONFIG_KEY, 'system-design.config')
})

test('defaultConfig enables Felixo-System-Design by default and points to upstream repo', () => {
  const config = defaultConfig()
  assert.equal(config.enabled, true)
  assert.match(config.repoUrl, /Felixo-System-Design/)
  assert.equal(config.branch, 'main')
  assert.equal(config.lastSha, null)
  assert.equal(config.lastSyncedAt, null)
  assert.equal(config.lastError, null)
})

test('normalizeConfig coerces invalid input into defaults', () => {
  assert.deepEqual(normalizeConfig(null), defaultConfig())
  assert.deepEqual(normalizeConfig('texto'), defaultConfig())
  assert.deepEqual(normalizeConfig({}), defaultConfig())
})

test('normalizeConfig preserves valid fields and accepts custom repoUrl/branch', () => {
  const result = normalizeConfig({
    enabled: true,
    repoUrl: 'https://github.com/user/repo.git',
    branch: 'develop',
    lastSha: 'abc1234',
    lastSyncedAt: '2026-05-08T00:00:00Z',
    lastError: 'erro de teste',
  })
  assert.equal(result.enabled, true)
  assert.equal(result.repoUrl, 'https://github.com/user/repo.git')
  assert.equal(result.branch, 'develop')
  assert.equal(result.lastSha, 'abc1234')
  assert.equal(result.lastSyncedAt, '2026-05-08T00:00:00Z')
  assert.equal(result.lastError, 'erro de teste')
})

test('normalizeConfig falls back to default enabled for invalid enabled values', () => {
  assert.equal(normalizeConfig({ enabled: 'sim' }).enabled, true)
  assert.equal(normalizeConfig({ enabled: 1 }).enabled, true)
  assert.equal(normalizeConfig({ enabled: false }).enabled, false)
  assert.equal(normalizeConfig({ enabled: true }).enabled, true)
})

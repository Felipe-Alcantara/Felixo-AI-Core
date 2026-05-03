const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')

const {
  createOrchestratorSettingsStore,
  normalizeSettingsPayload,
} = require('./orchestrator-settings-store.cjs')

test('orchestrator settings store returns null when file is missing', async () => {
  const configDir = createTempDir()
  const store = createOrchestratorSettingsStore({ configDir })

  try {
    assert.equal(await store.load(), null)
  } finally {
    removeTempDir(configDir)
  }
})

test('orchestrator settings store saves and loads settings', async () => {
  const configDir = createTempDir()
  const store = createOrchestratorSettingsStore({ configDir })
  const settings = {
    mode: 'semi_auto',
    customContext: 'Priorizar modelos baratos.',
    enabledSkills: ['planejamento', 'revisao'],
    maxAgentsPerTurn: 2,
  }

  try {
    await store.save(settings)

    assert.deepEqual(await store.load(), settings)
    assert.ok(fs.existsSync(store.filePath))
  } finally {
    removeTempDir(configDir)
  }
})

test('orchestrator settings store rejects non-object payloads', () => {
  assert.throws(() => normalizeSettingsPayload(null), /devem ser um objeto/)
  assert.throws(() => normalizeSettingsPayload([]), /devem ser um objeto/)
})

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-orchestrator-settings-'))
}

function removeTempDir(dirPath) {
  fs.rmSync(dirPath, { recursive: true, force: true })
}

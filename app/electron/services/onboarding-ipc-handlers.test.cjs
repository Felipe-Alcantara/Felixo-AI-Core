'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { createStorageDatabase } = require('./storage/sqlite-database.cjs')
const { ONBOARDING_STATE_KEY } = require('./storage/onboarding-state-repository.cjs')
const { MAX_ONBOARDING_VALUE_BYTES, registerOnboardingIpcHandlers } = require('./onboarding-ipc-handlers.cjs')

const NOW = Date.parse('2026-09-26T12:00:00.000Z')
const STATE = Object.freeze({ schemaVersion: 1, tours: {} })
const AUTOMATION = Object.freeze({ autoOpen: false, reason: 'devtools' })

function setup(overrides = {}) {
  const databaseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-onboarding-ipc-'))
  const database = createStorageDatabase({ databaseDir })
  const handlers = new Map()
  const ipcMain = { handle: (channel, handler) => handlers.set(channel, handler) }
  registerOnboardingIpcHandlers({
    ipcMain,
    database,
    getAppVersion: () => '0.1.423-2-gabc1234-dev',
    automation: AUTOMATION,
    now: () => NOW,
    ...overrides,
  })
  return {
    database,
    handlers,
    read: () => handlers.get('onboarding:read')(),
    write: (request) => handlers.get('onboarding:write')(null, request),
    cleanup: () => {
      database.close()
      fs.rmSync(databaseDir, { recursive: true, force: true })
    },
  }
}

test('registra só os canais onboarding:read e onboarding:write', () => {
  const context = setup()
  try {
    assert.deepEqual([...context.handlers.keys()].sort(), ['onboarding:read', 'onboarding:write'])
  } finally {
    context.cleanup()
  }
})

test('read devolve revisão, valor, corrupted, versão do app e a política de automação', async () => {
  const context = setup()
  try {
    assert.deepEqual(await context.read(), {
      ok: true,
      revision: 0,
      value: null,
      corrupted: false,
      appVersion: '0.1.423-2-gabc1234-dev',
      automation: { autoOpen: false, reason: 'devtools' },
    })
  } finally {
    context.cleanup()
  }
})

test('write aplica com a revisão certa, conflita com a velha e grava a hora do relógio injetado', async () => {
  const context = setup()
  try {
    assert.deepEqual(await context.write({ expectedRevision: 0, value: STATE }), { ok: true, applied: true, revision: 1 })
    const next = { ...STATE, knownFeatures: ['feature.ajuda'] }
    assert.deepEqual(await context.write({ expectedRevision: 0, value: next }), {
      ok: true,
      applied: false,
      revision: 1,
      value: STATE,
      corrupted: false,
    })
    const row = context.database.connection
      .prepare('SELECT updated_at FROM settings WHERE key = ?')
      .get(ONBOARDING_STATE_KEY)
    assert.equal(row.updated_at, '2026-09-26T12:00:00.000Z')
    assert.equal((await context.read()).revision, 1)
  } finally {
    context.cleanup()
  }
})

test('payload inválido é recusado com ok:false e nada é gravado', async () => {
  const context = setup()
  try {
    const big = { schemaVersion: 1, extra: 'x'.repeat(MAX_ONBOARDING_VALUE_BYTES) }
    const invalid = [
      null,
      [],
      'texto',
      { expectedRevision: 0 },
      { expectedRevision: 0, value: [] },
      { expectedRevision: 0, value: { tours: {} } },
      { expectedRevision: 0, value: { schemaVersion: 0 } },
      { expectedRevision: 0, value: { schemaVersion: '1' } },
      { expectedRevision: 0, value: big },
      { expectedRevision: 1.5, value: STATE },
      { expectedRevision: -1, value: STATE },
      { expectedRevision: '0', value: STATE },
    ]
    for (const request of invalid) {
      const result = await context.write(request)
      assert.equal(result.ok, false, JSON.stringify(request)?.slice(0, 80))
      assert.equal(typeof result.message, 'string')
    }
    assert.deepEqual((await context.read()).revision, 0)
  } finally {
    context.cleanup()
  }
})

test('o limite de 64 KiB conta bytes UTF-8, não caracteres', async () => {
  const context = setup()
  try {
    // 22 000 "á" = 44 000 bytes (cabe); 33 000 = 66 000 bytes (não cabe).
    const fits = await context.write({ expectedRevision: 0, value: { schemaVersion: 1, texto: 'á'.repeat(22_000) } })
    assert.equal(fits.ok, true)
    const tooBig = await context.write({ expectedRevision: 1, value: { schemaVersion: 1, texto: 'á'.repeat(33_000) } })
    assert.equal(tooBig.ok, false)
    assert.match(tooBig.message, /64 KiB/)
  } finally {
    context.cleanup()
  }
})

test('erro do SQLite vira ok:false, sem lançar para o renderer', async () => {
  const context = setup()
  try {
    context.database.close()
    assert.equal((await context.read()).ok, false)
    assert.equal((await context.write({ expectedRevision: 0, value: STATE })).ok, false)
  } finally {
    fs.rmSync(path.dirname(context.database.path), { recursive: true, force: true })
  }
})

test('versão do app ausente, inválida ou que lança vira null; a política é copiada, não compartilhada', async () => {
  for (const getAppVersion of [undefined, () => '', () => 42, () => 'v'.repeat(200), () => { throw new Error('x') }]) {
    const context = setup({ getAppVersion })
    try {
      const result = await context.read()
      assert.equal(result.appVersion, null)
      result.automation.autoOpen = true
      assert.equal((await context.read()).automation.autoOpen, false)
    } finally {
      context.cleanup()
    }
  }
})

test('contrato: o preload expõe os dois canais e o vite-env.d.ts declara a ponte', () => {
  const preload = fs.readFileSync(path.join(__dirname, '../preload.cjs'), 'utf8')
  assert.match(preload, /ipcRenderer\.invoke\('onboarding:read'\)/)
  assert.match(preload, /ipcRenderer\.invoke\('onboarding:write', request\)/)
  const types = fs.readFileSync(path.join(__dirname, '../../src/vite-env.d.ts'), 'utf8')
  assert.match(types, /onboarding\?:/)
})

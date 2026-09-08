'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const {
  LOW_END_MEMORY_BYTES,
  persistGraphicsMode,
  readPersistedGraphicsMode,
  resolveGraphicsProfile,
} = require('./graphics-mode.cjs')

function createProfile(overrides = {}) {
  return resolveGraphicsProfile({
    argv: [],
    environment: {},
    userDataPath: '',
    platformName: 'win32',
    totalMemoryBytes: 8 * 1024 * 1024 * 1024,
    cpuCount: 8,
    ...overrides,
  })
}

test('mantém GPU no modo automático fora do perfil de baixo recurso', () => {
  const profile = createProfile()

  assert.equal(profile.mode, 'auto')
  assert.equal(profile.useSoftwareRendering, false)
  assert.equal(profile.automaticLowEnd, false)
  assert.equal(profile.reason, 'hardware-default')
})

test('ativa rasterização por software automaticamente em Windows com pouca memória', () => {
  const profile = createProfile({ totalMemoryBytes: LOW_END_MEMORY_BYTES })

  assert.equal(profile.useSoftwareRendering, true)
  assert.equal(profile.automaticLowEnd, true)
  assert.equal(profile.reason, 'windows-low-memory')
})

test('não aplica o heurístico de Windows em outros sistemas', () => {
  const profile = createProfile({
    platformName: 'linux',
    totalMemoryBytes: LOW_END_MEMORY_BYTES,
  })

  assert.equal(profile.useSoftwareRendering, false)
  assert.equal(profile.automaticLowEnd, false)
})

test('modo manual de software e hardware vence o modo automático', () => {
  assert.equal(
    createProfile({ environment: { FELIXO_GRAPHICS_MODE: 'software' } }).useSoftwareRendering,
    true,
  )
  assert.equal(
    createProfile({
      environment: { FELIXO_GRAPHICS_MODE: 'hardware' },
      totalMemoryBytes: LOW_END_MEMORY_BYTES,
    }).useSoftwareRendering,
    false,
  )
})

test('lê e grava o modo persistente sem aceitar JSON inválido', () => {
  const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-graphics-'))

  try {
    assert.equal(readPersistedGraphicsMode(userDataPath), null)
    assert.equal(persistGraphicsMode({ userDataPath, mode: 'software' }), 'software')
    assert.equal(readPersistedGraphicsMode(userDataPath), 'software')

    fs.writeFileSync(path.join(userDataPath, 'graphics-mode.json'), '{malformed', 'utf8')
    assert.equal(readPersistedGraphicsMode(userDataPath), null)
    assert.throws(
      () => persistGraphicsMode({ userDataPath, mode: 'invalid' }),
      /Modo gráfico inválido/,
    )
  } finally {
    fs.rmSync(userDataPath, { recursive: true, force: true })
  }
})

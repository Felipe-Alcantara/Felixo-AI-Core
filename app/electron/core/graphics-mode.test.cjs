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
  shouldUseSoftwareRendering,
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

test('automação do DevTools rasteriza por software por padrão', () => {
  const graphicsProfile = resolveGraphicsProfile({ argv: [], environment: {}, platformName: 'linux', fileSystem: { readFileSync: () => { throw new Error('ENOENT') } } })
  assert.equal(shouldUseSoftwareRendering({ devtoolsActive: true, graphicsProfile }), true)
  assert.equal(shouldUseSoftwareRendering({ devtoolsActive: false, graphicsProfile }), false)
})

test('automação do DevTools usa a GPU quando o lançamento pede hardware explicitamente', () => {
  // Sem isto nenhuma bancada media a GPU: a porta CDP forçava disable-gpu sempre.
  const semPerfil = { readFileSync: () => { throw new Error('ENOENT') } }
  const porAmbiente = resolveGraphicsProfile({ argv: [], environment: { FELIXO_GRAPHICS_MODE: 'hardware' }, platformName: 'linux', fileSystem: semPerfil })
  const porArgumento = resolveGraphicsProfile({ argv: ['--felixo-graphics-mode=hardware'], environment: {}, platformName: 'linux', fileSystem: semPerfil })
  assert.equal(shouldUseSoftwareRendering({ devtoolsActive: true, graphicsProfile: porAmbiente }), false)
  assert.equal(shouldUseSoftwareRendering({ devtoolsActive: true, graphicsProfile: porArgumento }), false)
})

test('modo hardware salvo no perfil não liga a GPU numa sessão de automação', () => {
  // `felixo devtools launch --real-profile` precisa continuar no padrão seguro.
  const perfilComHardware = { readFileSync: () => JSON.stringify({ mode: 'hardware' }) }
  const graphicsProfile = resolveGraphicsProfile({ argv: [], environment: {}, platformName: 'linux', userDataPath: '/perfil', fileSystem: perfilComHardware })
  assert.equal(graphicsProfile.source, 'profile')
  assert.equal(shouldUseSoftwareRendering({ devtoolsActive: true, graphicsProfile }), true)
})

test('modo compatível continua em software com ou sem automação', () => {
  const semPerfil = { readFileSync: () => { throw new Error('ENOENT') } }
  const graphicsProfile = resolveGraphicsProfile({ argv: [], environment: { FELIXO_GRAPHICS_MODE: 'software' }, platformName: 'linux', fileSystem: semPerfil })
  assert.equal(shouldUseSoftwareRendering({ devtoolsActive: false, graphicsProfile }), true)
  assert.equal(shouldUseSoftwareRendering({ devtoolsActive: true, graphicsProfile }), true)
})

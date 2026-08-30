'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const {
  buildProfileEnv,
  getMirrorEntries,
  getProfileDir,
  supportsProfiles,
} = require('./cli-account-profiles.cjs')

const USER_DATA = '/home/pessoa/.config/felixo-ai-core'
const PERFIL = 'a1b2c3d4-1111-2222-3333-444455556666'

test('cada CLI isola o login pela variável que ela realmente aceita', () => {
  const dir = getProfileDir(USER_DATA, 'codex', PERFIL)

  assert.deepEqual(buildProfileEnv({ providerId: 'codex', profileDir: dir }), {
    CODEX_HOME: dir,
  })
  assert.deepEqual(buildProfileEnv({ providerId: 'claude', profileDir: dir }), {
    CLAUDE_CONFIG_DIR: dir,
  })
})

test('o Gemini troca HOME e leva o XDG junto', () => {
  // Ele resolve a pasta por os.homedir(); deixar o XDG apontando para a home
  // real deixaria o isolamento pela metade.
  const dir = getProfileDir(USER_DATA, 'gemini', PERFIL)
  const env = buildProfileEnv({
    providerId: 'gemini',
    profileDir: dir,
    homeDir: '/home/pessoa',
  })

  assert.equal(env.HOME, dir)
  assert.equal(env.XDG_CONFIG_HOME, path.join(dir, '.config'))
  assert.equal(env.XDG_CACHE_HOME, path.join(dir, '.cache'))
  // A home real fica registrada para a interface poder avisar.
  assert.equal(env.FELIXO_REAL_HOME, '/home/pessoa')
})

test('trocar HOME exige espelhar o que o trabalho no repositório precisa', () => {
  assert.deepEqual(getMirrorEntries('gemini'), ['.gitconfig', '.ssh', '.npmrc'])
  // Quem isola por variável dedicada não mexe na home, então não espelha nada.
  assert.deepEqual(getMirrorEntries('codex'), [])
})

test('o Openia entra pela chave, e sem chave não força nada', () => {
  assert.deepEqual(
    buildProfileEnv({ providerId: 'openia', secret: 'chave-de-teste' }),
    { OPENROUTER_API_KEY: 'chave-de-teste' },
  )
  assert.deepEqual(buildProfileEnv({ providerId: 'openia' }), {})
})

test('sem perfil escolhido o terminal nasce com o login do sistema', () => {
  // É o comportamento de antes desta feature, e continua sendo o padrão.
  assert.deepEqual(buildProfileEnv({ providerId: 'codex' }), {})
  assert.deepEqual(buildProfileEnv({ providerId: 'desconhecido', profileDir: '/x' }), {})
})

test('o caminho do perfil recusa identificador que escape da pasta', () => {
  for (const ruim of ['../fuga', 'a/b', '..', '', 'perfil com espaço', '.oculto']) {
    assert.throws(
      () => getProfileDir(USER_DATA, 'codex', ruim),
      /inválido/,
      `deveria recusar: ${JSON.stringify(ruim)}`,
    )
  }

  assert.throws(() => getProfileDir(USER_DATA, '../etc', PERFIL), /inválido/)
})

test('o caminho fica dentro do perfil do app, separado por CLI', () => {
  const dir = getProfileDir(USER_DATA, 'claude', PERFIL)

  assert.equal(dir, path.join(USER_DATA, 'cli-profiles', 'claude', PERFIL))
  // Contenção, e não prefixo de string: no Windows o separador é outro, e
  // comparar texto reprovava um caminho correto.
  const relativo = path.relative(USER_DATA, dir)
  assert.ok(relativo && !relativo.startsWith('..') && !path.isAbsolute(relativo))
})

test('só as CLIs medidas aceitam conta por terminal', () => {
  assert.equal(supportsProfiles('codex'), true)
  assert.equal(supportsProfiles('claude'), true)
  assert.equal(supportsProfiles('gemini'), true)
  assert.equal(supportsProfiles('openia'), true)
  assert.equal(supportsProfiles('inexistente'), false)
})

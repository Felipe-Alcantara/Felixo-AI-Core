'use strict'

const test = require('node:test')
const { describe, it } = test
const assert = require('node:assert/strict')
const path = require('node:path')
const {
  CREDENCIAIS_HERDADAS,
  applyProfileEnv,
  buildProfileEnv,
  getInheritedCredentialNames,
  getMirrorEntries,
  getProfileDir,
  supportsProfiles,
} = require('./cli-account-profiles.cjs')
const { getManagedCliLayout, getOfflineCacheLayout } = require('../core/managed-cli-paths.cjs')

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

// Task "Release — Provar isolamento de binário/cache entre perfis": decisão
// de 12/09/2026 foi cache/binário COMPARTILHADO entre perfis (só
// login/credencial isolado) — o que resta a provar é que dois perfis
// simultâneos nunca leem/escrevem o diretório de credencial um do outro, e
// que o compartilhamento de binário/cache é deliberado, não um vazamento.
describe('isolamento entre dois perfis simultâneos da mesma CLI', () => {
  const PERFIL_A = 'a1b2c3d4-1111-2222-3333-444455556666'
  const PERFIL_B = 'b2c3d4e5-2222-3333-4444-555566667777'

  it('cada perfil tem sua própria pasta de credencial, sem sobreposição', () => {
    const dirA = getProfileDir(USER_DATA, 'codex', PERFIL_A)
    const dirB = getProfileDir(USER_DATA, 'codex', PERFIL_B)

    assert.notEqual(dirA, dirB)
    assert.ok(!dirA.startsWith(dirB) && !dirB.startsWith(dirA))
  })

  it('o env de um perfil nunca referencia o diretório do outro', () => {
    const dirA = getProfileDir(USER_DATA, 'gemini', PERFIL_A)
    const dirB = getProfileDir(USER_DATA, 'gemini', PERFIL_B)

    const envA = buildProfileEnv({ providerId: 'gemini', profileDir: dirA, homeDir: '/home/pessoa' })
    const envB = buildProfileEnv({ providerId: 'gemini', profileDir: dirB, homeDir: '/home/pessoa' })

    for (const value of Object.values(envA)) {
      assert.ok(!String(value).includes(dirB), `env do perfil A não deveria conter o caminho de B: ${value}`)
    }
    for (const value of Object.values(envB)) {
      assert.ok(!String(value).includes(dirA), `env do perfil B não deveria conter o caminho de A: ${value}`)
    }
  })

  it('o binário/cache instalado é o MESMO caminho pros dois perfis — compartilhado por decisão, não por vazamento', () => {
    const layout = getManagedCliLayout({ userData: USER_DATA, platformName: 'linux', env: {} })
    const cache = getOfflineCacheLayout({
      userData: USER_DATA,
      providerId: 'codex',
      version: '0.154.0',
      platformName: 'linux',
      arch: 'x64',
    })

    // getManagedCliLayout/getOfflineCacheLayout não recebem profileId — o
    // mesmo layout serve qualquer perfil, de propósito. O teste documenta a
    // decisão em código executável, não confiando na assinatura da função
    // continuar sem profileId por acidente: confere que o caminho resultante
    // não contém o diretório de nenhum dos dois perfis.
    const dirPerfilA = getProfileDir(USER_DATA, 'codex', PERFIL_A)
    const dirPerfilB = getProfileDir(USER_DATA, 'codex', PERFIL_B)

    assert.ok(!layout.root.includes(dirPerfilA) && !layout.root.includes(dirPerfilB))
    assert.ok(!cache.root.includes(dirPerfilA) && !cache.root.includes(dirPerfilB))
  })
})

test('só as CLIs medidas aceitam conta por terminal', () => {
  assert.equal(supportsProfiles('codex'), true)
  assert.equal(supportsProfiles('claude'), true)
  assert.equal(supportsProfiles('gemini'), true)
  assert.equal(supportsProfiles('openia'), true)
  assert.equal(supportsProfiles('inexistente'), false)
})

test('perfil com conta própria sai sem as credenciais herdadas do provedor; o resto do ambiente fica', () => {
  const base = Object.freeze({
    PATH: '/usr/bin',
    OPENAI_API_KEY: 'sk-sentinela-openai',
    CODEX_API_KEY: 'sk-sentinela-codex',
    CODEX_ACCESS_TOKEN: 'eyJ.sentinela',
    ANTHROPIC_API_KEY: 'sk-ant-sentinela',
  })

  const codex = applyProfileEnv(base, { providerId: 'codex', profileEnv: { CODEX_HOME: '/perfis/trabalho' } }, 'linux')
  assert.deepEqual(codex, {
    PATH: '/usr/bin',
    ANTHROPIC_API_KEY: 'sk-ant-sentinela',
    CODEX_HOME: '/perfis/trabalho',
  })
  assert.equal(base.OPENAI_API_KEY, 'sk-sentinela-openai', 'o ambiente base não pode ser alterado')

  const claude = applyProfileEnv(
    { ...base, ANTHROPIC_AUTH_TOKEN: 't', CLAUDE_CODE_OAUTH_TOKEN: 'o', CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR: '3' },
    { providerId: 'claude', profileEnv: { CLAUDE_CONFIG_DIR: '/perfis/claude' } },
    'linux',
  )
  assert.equal(claude.CLAUDE_CONFIG_DIR, '/perfis/claude')
  for (const nome of CREDENCIAIS_HERDADAS.claude) assert.equal(Object.hasOwn(claude, nome), false, nome)
  assert.equal(claude.OPENAI_API_KEY, 'sk-sentinela-openai')
})

test('Gemini tira as chaves do Google; Openia não tira nada e a chave do perfil vence', () => {
  const gemini = applyProfileEnv(
    { GEMINI_API_KEY: 'g', GOOGLE_API_KEY: 'k', GOOGLE_APPLICATION_CREDENTIALS: '/c.json', GOOGLE_GENAI_USE_VERTEXAI: 'true', HOME: '/home/pessoa' },
    { providerId: 'gemini', profileEnv: { HOME: '/perfis/gemini' } },
    'linux',
  )
  assert.deepEqual(gemini, { HOME: '/perfis/gemini' })

  assert.deepEqual(getInheritedCredentialNames('openia'), [])
  const openia = applyProfileEnv(
    { OPENROUTER_API_KEY: 'sk-or-da-pessoa', OPENAI_API_KEY: 'sk-x' },
    { providerId: 'openia', profileEnv: { OPENROUTER_API_KEY: 'sk-or-da-conta' } },
    'linux',
  )
  assert.deepEqual(openia, { OPENROUTER_API_KEY: 'sk-or-da-conta', OPENAI_API_KEY: 'sk-x' })
})

test('no Windows o nome não diferencia maiúscula; fora dele, só o nome exato sai', () => {
  const base = { openai_api_key: 'sk-minusculo', Codex_Api_Key: 'sk-misto', Path: 'C:\\Windows' }

  assert.deepEqual(applyProfileEnv(base, { providerId: 'codex', profileEnv: {} }, 'win32'), { Path: 'C:\\Windows' })
  assert.deepEqual(applyProfileEnv(base, { providerId: 'codex', profileEnv: {} }, 'linux'), base)
})

test('provedor desconhecido não tira nada', () => {
  assert.deepEqual(getInheritedCredentialNames('outro'), [])
  assert.deepEqual(applyProfileEnv({ OPENAI_API_KEY: 'x' }, { providerId: 'outro' }, 'linux'), { OPENAI_API_KEY: 'x' })
})

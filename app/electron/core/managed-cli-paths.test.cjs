const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')

const {
  getManagedCliLayout,
  getManagedCliPathCandidates,
  getNpmRegistryCacheDir,
  getOfflineCacheLayout,
} = require('./managed-cli-paths.cjs')
const { getProfileDir, PROFILES_DIRNAME } = require('../services/cli-account-profiles.cjs')

describe('managed-cli-paths', () => {
  it('keeps the CLIs the app installs inside the user data folder', () => {
    const layout = getManagedCliLayout({
      userData: '/home/pessoa/.config/felixo-ai-core',
      platformName: 'linux',
      env: {},
    })

    assert.equal(layout.root, '/home/pessoa/.config/felixo-ai-core/clis')
    assert.equal(layout.packagesBin, '/home/pessoa/.config/felixo-ai-core/clis/bin')
    assert.equal(
      layout.runtimeBin,
      '/home/pessoa/.config/felixo-ai-core/clis/runtime-bin',
    )
  })

  // O npm nao usa `bin/` no Windows: os executaveis vao direto para o prefixo.
  // Errar isso deixaria o PATH apontando para uma pasta que nunca existe, e a
  // CLI instalada com sucesso continuaria "nao encontrada".
  it('resolves the npm bin folder the way npm does on Windows', () => {
    const layout = getManagedCliLayout({
      userData: path.join('C:', 'Users', 'pessoa', 'AppData', 'Roaming', 'app'),
      platformName: 'win32',
      env: {},
    })

    assert.equal(layout.packagesBin, layout.root)
  })

  it('lets an environment variable relocate the managed folder', () => {
    const layout = getManagedCliLayout({
      userData: '/home/pessoa/.config/felixo-ai-core',
      platformName: 'linux',
      env: { FELIXO_MANAGED_CLI_ROOT: '/opt/felixo-clis' },
    })

    assert.equal(layout.root, '/opt/felixo-clis')
  })

  it('exposes both the packages and the runtime folders to the PATH', () => {
    const layout = getManagedCliLayout({
      userData: '/home/pessoa/.config/felixo-ai-core',
      platformName: 'linux',
      env: {},
    })

    assert.deepEqual(getManagedCliPathCandidates(layout), [
      layout.packagesBin,
      layout.runtimeBin,
    ])
  })
})

describe('getOfflineCacheLayout', () => {
  it('separa o cache por provider, plataforma, arquitetura e versão — nunca por perfil', () => {
    const layout = getOfflineCacheLayout({
      userData: '/home/pessoa/.config/felixo-ai-core',
      providerId: 'codex',
      version: '0.154.0',
      platformName: 'linux',
      arch: 'x64',
    })

    assert.equal(
      layout.root,
      '/home/pessoa/.config/felixo-ai-core/cli-cache/codex/linux-x64/0.154.0',
    )
  })

  it('duas versões da mesma CLI nunca compartilham pasta de cache', () => {
    const base = { userData: '/home/p/.config/felixo-ai-core', providerId: 'claude', platformName: 'linux', arch: 'x64' }
    const v1 = getOfflineCacheLayout({ ...base, version: '2.1.262' })
    const v2 = getOfflineCacheLayout({ ...base, version: '2.1.263' })

    assert.notEqual(v1.root, v2.root)
  })

  it('a mesma CLI em plataformas diferentes nunca compartilha pasta de cache', () => {
    const base = { userData: '/home/p/.config/felixo-ai-core', providerId: 'gemini', version: '0.58.0' }
    const linux = getOfflineCacheLayout({ ...base, platformName: 'linux', arch: 'x64' })
    const win = getOfflineCacheLayout({ ...base, platformName: 'win32', arch: 'x64' })

    assert.notEqual(linux.root, win.root)
  })

  it('recusa providerId ou version que poderiam escapar da pasta de cache', () => {
    const base = { userData: '/home/p/.config/felixo-ai-core', providerId: 'codex', version: '1.0.0' }

    assert.throws(() => getOfflineCacheLayout({ ...base, providerId: '../../etc' }))
    assert.throws(() => getOfflineCacheLayout({ ...base, version: '../../../etc/passwd' }))
    assert.throws(() => getOfflineCacheLayout({ ...base, userData: undefined }))
  })

  // Fatia "garantir que o cache offline nunca guarda segredo/credencial":
  // login/credencial vive em cli-profiles (cli-account-profiles.cjs),
  // completamente fora da árvore do cache offline — não é um caminho que a
  // escrita do cache algum dia alcance por acidente. O cache nunca lê nem
  // escreve nesse diretório, então nenhum segredo pode vazar pra lá por
  // engano de path.
  it('a pasta do cache offline nunca cruza com a pasta de credencial/login do perfil', () => {
    const userData = '/home/pessoa/.config/felixo-ai-core'
    const cache = getOfflineCacheLayout({
      userData,
      providerId: 'codex',
      version: '0.154.0',
      platformName: 'linux',
      arch: 'x64',
    })
    const credenciais = getProfileDir(userData, 'codex', 'algum-perfil-uuid')

    assert.ok(!cache.root.startsWith(path.join(userData, PROFILES_DIRNAME)))
    assert.ok(!credenciais.startsWith(path.join(userData, 'cli-cache')))
  })
})

describe('getNpmRegistryCacheDir', () => {
  it('fica dentro da mesma árvore cli-cache, mas fora de qualquer pasta de versão', () => {
    const userData = '/home/pessoa/.config/felixo-ai-core'
    const dir = getNpmRegistryCacheDir(userData, 'linux')

    assert.equal(dir, '/home/pessoa/.config/felixo-ai-core/cli-cache/npm-registry-cache')
  })

  it('é a mesma pasta pra toda CLI e versão — compartilhado de propósito', () => {
    const userData = '/home/pessoa/.config/felixo-ai-core'

    assert.equal(
      getNpmRegistryCacheDir(userData, 'linux'),
      getNpmRegistryCacheDir(userData, 'linux'),
    )
  })

  it('recusa sem userData', () => {
    assert.throws(() => getNpmRegistryCacheDir(undefined, 'linux'))
  })
})

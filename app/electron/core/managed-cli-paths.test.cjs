const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')

const {
  getManagedCliLayout,
  getManagedCliPathCandidates,
} = require('./managed-cli-paths.cjs')

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

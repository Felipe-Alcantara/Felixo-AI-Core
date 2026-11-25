'use strict'
require('../../scripts/test-support/pasta-do-teste.cjs') // isola o temporário deste arquivo (ver pasta-do-teste.cjs)

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')

const {
  MANAGED_CLI_MANIFEST,
  getManagedCliManifestEntry,
  getManagedCliPlatformPackage,
  getPinnedInstallTarget,
} = require('./managed-cli-manifest.cjs')

const SHA512_INTEGRITY = /^sha512-[A-Za-z0-9+/]{86}==$/

describe('managed-cli-manifest', () => {
  it('pina codex, claude e gemini com versão exata e hash sha512', () => {
    for (const id of ['codex', 'claude', 'gemini']) {
      const entry = getManagedCliManifestEntry(id)

      assert.ok(entry, `manifesto sem entrada para ${id}`)
      assert.match(entry.version, /^\d+\.\d+\.\d+/)
      assert.match(entry.integrity, SHA512_INTEGRITY)
    }
  })

  it('não tem entrada para provedor fora do manifesto', () => {
    assert.equal(getManagedCliManifestEntry('openia'), null)
    assert.equal(getPinnedInstallTarget('openia'), null)
  })

  it('monta o alvo pacote@versão-exata para instalar', () => {
    const entry = MANAGED_CLI_MANIFEST.gemini

    assert.equal(getPinnedInstallTarget('gemini'), `${entry.npmPackage}@${entry.version}`)
  })

  it('declara o pacote nativo do Codex por plataforma e arquitetura', () => {
    assert.equal(
      getManagedCliPlatformPackage('codex', {
        platformName: 'win32',
        arch: 'x64',
      }),
      '@openai/codex-win32-x64',
    )
    assert.equal(
      getManagedCliPlatformPackage('codex', {
        platformName: 'win32',
        arch: 'arm64',
      }),
      '@openai/codex-win32-arm64',
    )
    // Linux e macOS também abrem o Codex por um pacote nativo opcional; antes só o
    // Windows era conferido, e um pacote faltando lá passava como instalado.
    assert.equal(
      getManagedCliPlatformPackage('codex', {
        platformName: 'linux',
        arch: 'x64',
      }),
      '@openai/codex-linux-x64',
    )
    assert.equal(
      getManagedCliPlatformPackage('codex', {
        platformName: 'darwin',
        arch: 'arm64',
      }),
      '@openai/codex-darwin-arm64',
    )
    assert.equal(getManagedCliPlatformPackage('codex', { platformName: 'freebsd', arch: 'x64' }), null)
  })

  it('nunca aponta para uma versão solta ("latest" implícito)', () => {
    for (const id of Object.keys(MANAGED_CLI_MANIFEST)) {
      assert.ok(!getPinnedInstallTarget(id).endsWith('latest'))
    }
  })
})

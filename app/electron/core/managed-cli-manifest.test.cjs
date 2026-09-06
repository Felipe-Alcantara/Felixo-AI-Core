'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')

const {
  MANAGED_CLI_MANIFEST,
  getManagedCliManifestEntry,
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

  it('nunca aponta para uma versão solta ("latest" implícito)', () => {
    for (const id of Object.keys(MANAGED_CLI_MANIFEST)) {
      assert.ok(!getPinnedInstallTarget(id).endsWith('latest'))
    }
  })
})

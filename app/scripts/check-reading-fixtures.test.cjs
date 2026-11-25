'use strict'
require('./test-support/pasta-do-teste.cjs') // isola o temporário deste arquivo (ver pasta-do-teste.cjs)

const test = require('node:test')
const assert = require('node:assert/strict')
const { PROVIDERS, driftedFixtures, fixtureVersions, parseVersion } = require('./check-reading-fixtures.cjs')

test('lê a versão do que as CLIs imprimem em --version', () => {
  assert.equal(parseVersion('2.1.327 (Claude Code)'), '2.1.327')
  assert.equal(parseVersion('codex-cli 0.171.0-alpha.12\n'), '0.171.0-alpha.12')
  assert.equal(parseVersion('sem versão'), null)
})

test('aponta só as gravações de outra versão; sem CLI instalada, nada', () => {
  const fixtures = [
    { name: 'a', version: '1.0.0' },
    { name: 'b', version: '1.1.0' },
  ]
  assert.deepEqual(driftedFixtures('1.1.0', fixtures), [{ name: 'a', version: '1.0.0' }])
  assert.deepEqual(driftedFixtures(null, fixtures), [])
})

test('as gravações do repositório de cada provedor têm versão', () => {
  for (const { provider, ignore } of PROVIDERS) {
    const fixtures = fixtureVersions(provider, undefined, ignore)
    assert.ok(fixtures.length > 0, provider)
    for (const fixture of fixtures) assert.match(fixture.version, /^\d+\.\d+/, fixture.name)
  }
})

test('o Gemini confere as gravações sintéticas e deixa de fora a recusa real da 0.62.0', () => {
  assert.ok(PROVIDERS.some((item) => item.provider === 'gemini'))
  const names = fixtureVersions('gemini', undefined, ['gemini-erro']).map((fixture) => fixture.name)
  assert.ok(!names.includes('gemini-erro'))
  assert.ok(names.includes('gemini-resposta'))
})

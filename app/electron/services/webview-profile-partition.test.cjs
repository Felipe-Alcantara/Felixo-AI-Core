const test = require('node:test')
const assert = require('node:assert/strict')
const {
  DEFAULT_PARTITION,
  isValidProfileId,
  partitionForProfile,
} = require('./webview-profile-partition.cjs')

test('o perfil Padrão mantém a partição que já existia (ninguém é deslogado)', () => {
  assert.equal(partitionForProfile('default'), 'persist:felixo-webview')
  assert.equal(DEFAULT_PARTITION, 'persist:felixo-webview')
})

test('perfil da pessoa ganha partição própria, persistente e distinta do Padrão', () => {
  assert.equal(partitionForProfile('trabalho-ab12'), 'persist:felixo-webview-trabalho-ab12')
  assert.notEqual(partitionForProfile('trabalho-ab12'), partitionForProfile('pessoal-cd34'))
})

test('id inválido nunca vira nome de partição (nem escapa do prefixo)', () => {
  for (const ruim of ['', 'a', 'Maiuscula', '../x', 'a b c', 'x'.repeat(41), '-abc', null, 3, 'persist:outra']) {
    assert.equal(isValidProfileId(ruim), false, String(ruim))
    assert.throws(() => partitionForProfile(ruim), /invalido/)
  }
})

test("'default' não é um id de perfil da pessoa (não dá para gravar/excluir o Padrão)", () => {
  assert.equal(isValidProfileId('default'), false)
})

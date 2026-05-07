const test = require('node:test')
const assert = require('node:assert/strict')
const { requiresDelegation } = require('./delegation-policy.cjs')

test('greetings and trivial acks do not require delegation', () => {
  assert.equal(requiresDelegation('oi'), false)
  assert.equal(requiresDelegation('ok'), false)
  assert.equal(requiresDelegation('valeu'), false)
  assert.equal(requiresDelegation('Bom dia'), false)
  assert.equal(requiresDelegation(''), false)
  assert.equal(requiresDelegation(undefined), false)
})

test('imperative action verbs trigger delegation regardless of length', () => {
  assert.equal(requiresDelegation('crie um arquivo .gitignore'), true)
  assert.equal(requiresDelegation('analise o auth.py'), true)
  assert.equal(requiresDelegation('refatore X'), true)
  assert.equal(requiresDelegation('escreva um README'), true)
})

test('long prompts always require delegation', () => {
  const long = 'a'.repeat(150)
  assert.equal(requiresDelegation(long), true)
})

test('greeting + action verb still triggers delegation (intuition trap)', () => {
  assert.equal(
    requiresDelegation('oi, cria um arquivo de exemplo pra mim'),
    true,
  )
})

test('short ambiguous question without action verb is treated as trivial', () => {
  assert.equal(requiresDelegation('o que e isso?'), false)
  assert.equal(requiresDelegation('por que?'), false)
})

test('medium-length question without action verb requires delegation (safe default)', () => {
  assert.equal(
    requiresDelegation('como funciona o sistema de cache do projeto inteiro hoje?'),
    true,
  )
})

test('case and accents do not affect classification', () => {
  assert.equal(requiresDelegation('ANÁLISE rápida'), true)
  assert.equal(requiresDelegation('refátoré isso'), true)
})

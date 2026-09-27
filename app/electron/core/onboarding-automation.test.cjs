'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')

const { resolveOnboardingAutomation } = require('./onboarding-automation.cjs')

test('app normal (sem porta de depuração): o tutorial abre e grava sozinho', () => {
  assert.deepEqual(resolveOnboardingAutomation({ env: {}, devtoolsPort: Number.NaN }), {
    autoOpen: true,
    reason: 'produto',
  })
  assert.deepEqual(resolveOnboardingAutomation(), { autoOpen: true, reason: 'produto' })
})

test('porta inválida conta como app normal, igual ao main (que só liga o CDP com porta válida)', () => {
  for (const devtoolsPort of [0, -1, 70000, 1.5, '', 'abc', undefined, null]) {
    assert.deepEqual(
      resolveOnboardingAutomation({ env: {}, devtoolsPort }),
      { autoOpen: true, reason: 'produto' },
      String(devtoolsPort),
    )
  }
})

test('instância de automação (com porta): nada abre nem grava sozinho', () => {
  assert.deepEqual(resolveOnboardingAutomation({ env: {}, devtoolsPort: 9333 }), {
    autoOpen: false,
    reason: 'devtools',
  })
  assert.deepEqual(resolveOnboardingAutomation({ env: {}, devtoolsPort: '9333' }), {
    autoOpen: false,
    reason: 'devtools',
  })
  assert.deepEqual(
    resolveOnboardingAutomation({ env: { FELIXO_DEVTOOLS_ONBOARDING: 'true' }, devtoolsPort: 9333 }),
    { autoOpen: false, reason: 'devtools' },
  )
})

test('porta + FELIXO_DEVTOOLS_ONBOARDING=1: comportamento de produto para o smoke', () => {
  assert.deepEqual(
    resolveOnboardingAutomation({ env: { FELIXO_DEVTOOLS_ONBOARDING: '1' }, devtoolsPort: 9333 }),
    { autoOpen: true, reason: 'devtools-opt-in' },
  )
})

test('o opt-in sem porta é ignorado (app normal continua produto)', () => {
  assert.deepEqual(
    resolveOnboardingAutomation({ env: { FELIXO_DEVTOOLS_ONBOARDING: '1' }, devtoolsPort: Number.NaN }),
    { autoOpen: true, reason: 'produto' },
  )
})

'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')
const { isReleaseSmokeProcess } = require('./release-smoke-mode.cjs')

test('recognizes the legacy release-smoke argument', () => {
  assert.equal(isReleaseSmokeProcess({ argv: ['electron', '--release-smoke'], env: {} }), true)
})

test('recognizes the environment marker when Electron consumes the switch', () => {
  assert.equal(isReleaseSmokeProcess({ argv: ['Felixo AI Core.exe'], env: { FELIXO_RELEASE_SMOKE: '1' } }), true)
})

test('does not enter release-smoke mode for other environment values', () => {
  assert.equal(isReleaseSmokeProcess({ argv: ['Felixo AI Core.exe'], env: { FELIXO_RELEASE_SMOKE: 'true' } }), false)
})

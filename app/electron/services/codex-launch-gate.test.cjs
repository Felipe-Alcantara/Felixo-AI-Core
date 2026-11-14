'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { CODEX_LAUNCH_SPACING_MS, codexProfileKey, createCodexLaunchGate } = require('./codex-launch-gate.cjs')

test('o primeiro processo do perfil abre na hora; os seguintes esperam a vez, um depois do outro', () => {
  let clock = 1_000
  const gate = createCodexLaunchGate({ now: () => clock })
  assert.equal(gate.reserve('perfil-a'), 0)
  assert.equal(gate.reserve('perfil-a'), CODEX_LAUNCH_SPACING_MS)
  assert.equal(gate.reserve('perfil-a'), 2 * CODEX_LAUNCH_SPACING_MS)
  // Outro perfil não espera: o auth.json é outro.
  assert.equal(gate.reserve('perfil-b'), 0)
  // Passado o espaço, abre na hora de novo.
  clock += 3 * CODEX_LAUNCH_SPACING_MS
  assert.equal(gate.reserve('perfil-a'), 0)
})

test('o perfil é o CODEX_HOME da conta, ou o padrão do login do sistema', () => {
  assert.equal(codexProfileKey({}), 'padrao')
  assert.equal(codexProfileKey({ CODEX_HOME: '  ' }), 'padrao')
  assert.equal(codexProfileKey({ CODEX_HOME: 'C:\\Perfis\\Conta-A' }, 'win32'), codexProfileKey({ CODEX_HOME: 'c:\\perfis\\conta-a' }, 'win32'))
  assert.notEqual(codexProfileKey({ CODEX_HOME: '/perfis/a' }, 'linux'), codexProfileKey({ CODEX_HOME: '/perfis/b' }, 'linux'))
})

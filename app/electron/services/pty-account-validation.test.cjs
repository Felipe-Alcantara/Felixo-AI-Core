'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const {
  resolveProviderIdForCommand,
  validatePtyAccountSelection,
} = require('./pty-account-validation.cjs')

test('resolve o provedor de comandos conhecidos, inclusive caminhos Windows', () => {
  assert.equal(resolveProviderIdForCommand('claude'), 'claude')
  assert.equal(
    resolveProviderIdForCommand('C:\\Users\\Felipe Martins\\AppData\\Roaming\\npm\\codex.cmd'),
    'codex',
  )
  assert.equal(resolveProviderIdForCommand('python3'), null)
})

test('infere o provedor para validar nodes antigos sem providerId', () => {
  const chamadas = []

  const result = validatePtyAccountSelection({
    accountId: 'conta-codex',
    command: 'codex',
    validateAccount: (accountId, providerId) => {
      chamadas.push({ accountId, providerId })
      return { ok: true }
    },
  })

  assert.deepEqual(result, { ok: true, providerId: 'codex' })
  assert.deepEqual(chamadas, [{ accountId: 'conta-codex', providerId: 'codex' }])
})

test('recusa conta quando o providerId e o comando são incompatíveis', () => {
  let validou = false
  const result = validatePtyAccountSelection({
    accountId: 'conta-codex',
    providerId: 'codex',
    command: 'claude',
    validateAccount: () => {
      validou = true
      return { ok: true }
    },
  })

  assert.equal(result.ok, false)
  assert.match(result.message, /provedor incompatível/)
  assert.equal(validou, false)
})

test('não monta ambiente de conta para comando que não é uma CLI conhecida', () => {
  const result = validatePtyAccountSelection({
    accountId: 'conta-qualquer',
    command: 'python3',
  })

  assert.deepEqual(result, {
    ok: false,
    message: 'Não foi possível validar a conta porque o provedor do comando não foi reconhecido.',
  })
})

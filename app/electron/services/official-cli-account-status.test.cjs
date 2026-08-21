const { describe, it } = require('node:test')
const assert = require('node:assert/strict')

const {
  describeAccountStatusForLog,
  parseCodexAccountStatus,
  parseCodexLoginStatus,
  redactSecrets,
} = require('./official-cli-account-status.cjs')

describe('redactSecrets', () => {
  it('preserva o rótulo e mascara o resto da linha', () => {
    // O resto da linha inteiro vai junto: um valor pode conter espaço
    // (`Bearer <token>`), e parar na primeira palavra deixaria o segredo à
    // mostra. Perder o texto após o valor é o preço aceito por isso.
    assert.equal(
      redactSecrets('erro: access_token=abc123def456 expirado\nlinha seguinte'),
      'erro: access_token=[oculto]\nlinha seguinte',
    )
  })

  it('mascara cabeçalho Authorization e chave no formato sk-', () => {
    assert.equal(
      redactSecrets('Authorization: Bearer sk-abcdefghijklmnop'),
      'Authorization: [oculto]',
    )
    assert.equal(
      redactSecrets('usando sk-abcdefghijklmnop agora'),
      'usando [oculto] agora',
    )
  })

  it('mascara JWT solto, sem rótulo que o identifique', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcDEF123'

    assert.equal(redactSecrets(`token do usuário ${jwt}`), 'token do usuário [oculto]')
  })

  it('não altera texto sem segredo', () => {
    assert.equal(redactSecrets('Logged in using ChatGPT'), 'Logged in using ChatGPT')
  })
})

describe('parseCodexLoginStatus', () => {
  it('reconhece a sessão ativa', () => {
    assert.equal(parseCodexLoginStatus('Logged in using ChatGPT'), 'logged_in')
  })

  it('classifica "Not logged in" como desconectado, e não como conectado', () => {
    assert.equal(parseCodexLoginStatus('Not logged in'), 'logged_out')
  })

  it('devolve unknown para saída vazia ou inesperada', () => {
    assert.equal(parseCodexLoginStatus(''), 'unknown')
    assert.equal(parseCodexLoginStatus('Something else'), 'unknown')
  })
})

describe('parseCodexAccountStatus', () => {
  it('não inventa identidade quando a CLI só informa o método', () => {
    const status = parseCodexAccountStatus('Logged in using ChatGPT')

    assert.deepEqual(status, { authStatus: 'logged_in', method: 'ChatGPT' })
  })

  it('lê conta e plano quando a CLI os imprime', () => {
    const status = parseCodexAccountStatus(
      'Logged in using ChatGPT\n  Account: pessoa@example.com\n  Plan: Pro',
    )

    assert.equal(status.authStatus, 'logged_in')
    assert.equal(status.account, 'pessoa@example.com')
    assert.equal(status.plan, 'Pro')
  })

  it('não expõe segredo mesmo quando ele aparece numa linha rotulada', () => {
    const status = parseCodexAccountStatus(
      'Logged in using an API key\n  Account: pessoa@example.com\n  token: sk-abcdefghijklmnop',
    )

    assert.equal(status.account, 'pessoa@example.com')
    assert.equal(JSON.stringify(status).includes('sk-'), false)
  })

  it('não reporta método quando a sessão está desconectada', () => {
    assert.deepEqual(parseCodexAccountStatus('Not logged in'), {
      authStatus: 'logged_out',
    })
  })
})

describe('describeAccountStatusForLog', () => {
  it('resume sem levar identidade para o log', () => {
    const resumo = describeAccountStatusForLog({
      authStatus: 'logged_in',
      account: 'pessoa@example.com',
      plan: 'Pro',
    })

    assert.deepEqual(resumo, { authStatus: 'logged_in', hasIdentity: true })
  })

  it('sobrevive a um status ausente', () => {
    assert.deepEqual(describeAccountStatusForLog(undefined), {
      authStatus: 'unknown',
      hasIdentity: false,
    })
  })
})

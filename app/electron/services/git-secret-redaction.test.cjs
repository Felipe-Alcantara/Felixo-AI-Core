'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')
const {
  formatGitError,
  redactSensitiveText,
  sanitizeGitErrorText,
  sanitizeGitRemoteUrl,
} = require('./git-secret-redaction.cjs')

const GITHUB_TOKEN = `ghp_${'a'.repeat(30)}`

test('redactSensitiveText mascara URL, parâmetros, cabeçalhos e tokens', () => {
  const text = [
    `remote: https://deploy:${GITHUB_TOKEN}@github.com/acme/private.git?access_token=${GITHUB_TOKEN}`,
    `remote alternativo: git+https://deploy:${GITHUB_TOKEN}@github.com/acme/private.git`,
    `Authorization: Bearer ${GITHUB_TOKEN}`,
    `--password ${GITHUB_TOKEN}`,
  ].join('\n')

  const redacted = redactSensitiveText(text)

  assert.doesNotMatch(redacted, new RegExp(GITHUB_TOKEN))
  assert.match(redacted, /https:\/\/\*\*\*@github\.com\/acme\/private\.git/)
  assert.match(redacted, /git\+https:\/\/\*\*\*@github\.com\/acme\/private\.git/)
  assert.match(redacted, /access_token=\*\*\*/)
  assert.match(redacted, /Authorization: \*\*\*/)
  assert.match(redacted, /--password \*\*\*/)
})

test('sanitizeGitRemoteUrl remove credenciais e parâmetros sensíveis', () => {
  const safe = sanitizeGitRemoteUrl(
    `https://deploy:${GITHUB_TOKEN}@github.com/acme/private.git?access_token=${GITHUB_TOKEN}&scope=repo#${GITHUB_TOKEN}`,
  )

  assert.equal(safe, 'https://github.com/acme/private.git?scope=repo')
  assert.doesNotMatch(safe, new RegExp(GITHUB_TOKEN))
})

test('sanitizeGitErrorText remove a linha de comando e compacta o stderr', () => {
  assert.equal(
    sanitizeGitErrorText(
      `Command failed: git clone https://deploy:${GITHUB_TOKEN}@github.com/acme/private.git repo\n\nfatal: token=${GITHUB_TOKEN}`,
    ),
    'fatal: token=***',
  )
})

test('formatGitError preserva etapa, código e destino sem linha de comando', () => {
  const error = new Error(
    `Command failed: git clone https://deploy:${GITHUB_TOKEN}@github.com/acme/private.git repo\nfatal: Authentication failed for 'https://deploy:${GITHUB_TOKEN}@github.com/acme/private.git'`,
  )
  error.code = 128
  error.stderr = `fatal: Authentication failed for 'https://deploy:${GITHUB_TOKEN}@github.com/acme/private.git'`

  const message = formatGitError(error, {
    stage: 'clone',
    repoUrl: `https://deploy:${GITHUB_TOKEN}@github.com/acme/private.git`,
    branch: 'main',
  })

  assert.match(message, /Falha no Git durante clone/)
  assert.match(message, /Código: 128/)
  assert.match(message, /Repositório: https:\/\/github\.com\/acme\/private\.git/)
  assert.doesNotMatch(message, new RegExp(GITHUB_TOKEN))
  assert.doesNotMatch(message, /Command failed: git clone/)
})

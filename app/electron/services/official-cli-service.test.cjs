const { describe, it } = require('node:test')
const assert = require('node:assert/strict')

const {
  parseCodexLoginStatus,
} = require('./official-cli-service.cjs')

describe('official-cli-service', () => {
  it('parses Codex ChatGPT login status', () => {
    assert.equal(
      parseCodexLoginStatus('Logged in using ChatGPT'),
      'logged_in',
    )
  })

  it('parses Codex logged out status before logged in substrings', () => {
    assert.equal(parseCodexLoginStatus('Not logged in'), 'logged_out')
  })

  it('returns unknown for empty or unexpected status output', () => {
    assert.equal(parseCodexLoginStatus(''), 'unknown')
    assert.equal(parseCodexLoginStatus('Something else'), 'unknown')
  })
})

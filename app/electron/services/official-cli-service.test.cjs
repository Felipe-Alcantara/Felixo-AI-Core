const { describe, it } = require('node:test')
const assert = require('node:assert/strict')

const {
  openOfficialCliLogin,
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

  it('uses the Windows cmd shim when opening the Codex login terminal', () => {
    let launched

    const result = openOfficialCliLogin('codex', {
      platformName: 'win32',
      launchTerminal: (options) => {
        launched = options
        return { ok: true, command: 'cmd.exe', args: ['/c', 'codex.cmd', 'login'] }
      },
    })

    assert.equal(result.ok, true)
    assert.equal(launched.command, 'codex.cmd')
    assert.deepEqual(launched.args, ['login'])
  })
})

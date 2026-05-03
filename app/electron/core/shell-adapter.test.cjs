const { describe, it } = require('node:test')
const assert = require('node:assert/strict')

const {
  detectDefaultShell,
  escapeShellArg,
  getTerminationStrategy,
  buildSpawnOptions,
  getPlatformInfo,
} = require('./shell-adapter.cjs')

describe('shell-adapter', () => {
  describe('detectDefaultShell()', () => {
    it('returns bash for linux', () => {
      const result = detectDefaultShell({ platform: 'linux', env: {} })
      assert.strictEqual(result.shell, '/bin/bash')
      assert.deepStrictEqual(result.shellArgs, ['-c'])
      assert.strictEqual(result.platform, 'linux')
    })

    it('returns zsh for darwin', () => {
      const result = detectDefaultShell({ platform: 'darwin', env: {} })
      assert.strictEqual(result.shell, '/bin/zsh')
      assert.deepStrictEqual(result.shellArgs, ['-c'])
    })

    it('returns cmd.exe for win32 when no powershell found', () => {
      const result = detectDefaultShell({ platform: 'win32', env: {} })
      assert.ok(result.shell.includes('cmd') || result.shell.includes('powershell') || result.shell.includes('pwsh'))
    })

    it('uses FELIXO_SHELL env override', () => {
      const result = detectDefaultShell({
        platform: 'linux',
        env: { FELIXO_SHELL: '/usr/bin/fish' },
      })
      assert.strictEqual(result.shell, '/usr/bin/fish')
    })

    it('uses SHELL env on linux', () => {
      const result = detectDefaultShell({
        platform: 'linux',
        env: { SHELL: '/bin/zsh' },
      })
      assert.strictEqual(result.shell, '/bin/zsh')
    })
  })

  describe('escapeShellArg()', () => {
    it('returns empty quotes for empty string', () => {
      assert.strictEqual(escapeShellArg('', 'linux'), '""')
    })

    it('returns arg unchanged if no special chars (unix)', () => {
      assert.strictEqual(escapeShellArg('hello', 'linux'), 'hello')
    })

    it('wraps in single quotes for spaces (unix)', () => {
      const result = escapeShellArg('hello world', 'linux')
      assert.ok(result.startsWith("'"))
      assert.ok(result.endsWith("'"))
    })

    it('wraps in double quotes for spaces (win32)', () => {
      const result = escapeShellArg('hello world', 'win32')
      assert.ok(result.startsWith('"'))
      assert.ok(result.endsWith('"'))
    })

    it('escapes internal single quotes (unix)', () => {
      const result = escapeShellArg("it's", 'linux')
      assert.ok(result.includes("\\'"))
    })

    it('handles paths with accents', () => {
      const result = escapeShellArg('/home/usuário/código', 'linux')
      assert.ok(result.length > 0)
    })
  })

  describe('getTerminationStrategy()', () => {
    it('allows process group kill on linux', () => {
      const strategy = getTerminationStrategy('linux')
      assert.strictEqual(strategy.canKillGroup, true)
      assert.strictEqual(strategy.signal, 'SIGTERM')
    })

    it('disallows process group kill on win32', () => {
      const strategy = getTerminationStrategy('win32')
      assert.strictEqual(strategy.canKillGroup, false)
    })
  })

  describe('buildSpawnOptions()', () => {
    it('returns expected keys', () => {
      const options = buildSpawnOptions({ cwd: '/tmp' })
      assert.ok('cwd' in options)
      assert.ok('detached' in options)
      assert.ok('windowsHide' in options)
      assert.ok('stdio' in options)
    })

    it('sets cwd correctly', () => {
      const options = buildSpawnOptions({ cwd: '/home/user/project' })
      assert.strictEqual(options.cwd, '/home/user/project')
    })
  })

  describe('getPlatformInfo()', () => {
    it('returns info for linux', () => {
      const info = getPlatformInfo('linux')
      assert.strictEqual(info.defaultShell, '/bin/bash')
      assert.strictEqual(info.pathSeparator, ':')
      assert.strictEqual(info.supportsProcessGroups, true)
      assert.ok(Array.isArray(info.notes))
    })

    it('returns info for darwin', () => {
      const info = getPlatformInfo('darwin')
      assert.strictEqual(info.defaultShell, '/bin/zsh')
    })

    it('returns info for win32', () => {
      const info = getPlatformInfo('win32')
      assert.strictEqual(info.defaultShell, 'cmd.exe')
      assert.strictEqual(info.pathSeparator, ';')
      assert.strictEqual(info.supportsProcessGroups, false)
    })
  })
})

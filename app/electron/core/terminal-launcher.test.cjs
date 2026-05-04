const { describe, it } = require('node:test')
const assert = require('node:assert/strict')

const {
  createTerminalLaunchPlan,
} = require('./terminal-launcher.cjs')

describe('terminal-launcher', () => {
  it('creates a konsole plan on Linux when konsole is available', () => {
    const plan = createTerminalLaunchPlan({
      command: 'codex',
      args: [],
      cwd: '/home/felipe',
      env: { PATH: '/usr/bin' },
      platform: 'linux',
      exists: (candidate) => candidate === '/usr/bin/konsole',
    })

    assert.equal(plan.ok, true)
    assert.equal(plan.command, 'konsole')
    assert.deepEqual(plan.args, [
      '--hold',
      '--workdir',
      '/home/felipe',
      '-e',
      'codex',
    ])
  })

  it('returns a manual fallback when no Linux terminal is found', () => {
    const plan = createTerminalLaunchPlan({
      command: 'gemini',
      cwd: '/home/felipe',
      env: { PATH: '/usr/bin' },
      platform: 'linux',
      exists: () => false,
    })

    assert.equal(plan.ok, false)
    assert.match(plan.message, /terminal grafico/)
  })

  it('creates a macOS Terminal plan with a shell command line', () => {
    const plan = createTerminalLaunchPlan({
      command: 'claude',
      cwd: '/Users/felipe/My Project',
      platform: 'darwin',
    })

    assert.equal(plan.ok, true)
    assert.equal(plan.command, 'osascript')
    assert.match(plan.args.join(' '), /Terminal/)
    assert.match(plan.args.join(' '), /claude/)
  })

  it('creates a Windows cmd plan that keeps the login terminal open', () => {
    const plan = createTerminalLaunchPlan({
      command: 'codex.cmd',
      args: ['login', 'status'],
      cwd: 'C:\\Users\\felipe',
      platform: 'win32',
    })

    assert.equal(plan.ok, true)
    assert.equal(plan.command, 'cmd.exe')
    assert.deepEqual(plan.args, [
      '/d',
      '/s',
      '/c',
      'start',
      '',
      'cmd.exe',
      '/k',
      'codex.cmd login status',
    ])
  })
})

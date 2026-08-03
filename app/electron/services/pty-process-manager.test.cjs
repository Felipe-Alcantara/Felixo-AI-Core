const test = require('node:test')
const assert = require('node:assert/strict')
const win32Platform = require('../core/platform/win32.cjs')
const {
  PtyProcessManager,
  DEFAULT_COLS,
  DEFAULT_ROWS,
  createPtyLaunchSpec,
  resolveWorkingDirectory,
  resolveWindowsCodexPath,
} = require('./pty-process-manager.cjs')

/**
 * Build a fake PTY plus a factory that records how it was spawned. The fake
 * mirrors the slice of the `node-pty` surface the manager depends on, so tests
 * never load the native binding.
 */
function createFakePty() {
  const calls = []
  const fakePty = {
    pid: 4242,
    written: [],
    resizes: [],
    kills: [],
    dataListeners: [],
    exitListeners: [],
    write(data) {
      this.written.push(data)
    },
    resize(cols, rows) {
      this.resizes.push({ cols, rows })
    },
    kill(signal) {
      this.kills.push(signal)
    },
    onData(listener) {
      this.dataListeners.push(listener)
    },
    onExit(listener) {
      this.exitListeners.push(listener)
    },
    emitData(data) {
      this.dataListeners.forEach((listener) => listener(data))
    },
    emitExit(event) {
      this.exitListeners.forEach((listener) => listener(event))
    },
  }

  const spawnPty = (file, args, options) => {
    calls.push({ file, args, options })
    return fakePty
  }

  return { fakePty, spawnPty, calls }
}

test('spawn launches the shell by default and streams raw output', () => {
  const { fakePty, spawnPty, calls } = createFakePty()
  const manager = new PtyProcessManager({ spawnPty })
  const received = []

  manager.spawn('term-1', { onData: (data) => received.push(data) })

  assert.equal(calls.length, 1)
  assert.equal(typeof calls[0].file, 'string')
  assert.ok(calls[0].file.length > 0)
  assert.equal(calls[0].options.cols, DEFAULT_COLS)
  assert.equal(calls[0].options.rows, DEFAULT_ROWS)
  assert.equal(manager.has('term-1'), true)
  assert.equal(manager.get('term-1'), fakePty)

  fakePty.emitData('hello\r\n')
  assert.deepEqual(received, ['hello\r\n'])
})

test('Windows falls back to cmd.exe when PowerShell is not present', () => {
  assert.equal(win32Platform.getDefaultShell({}), 'cmd.exe')
})

test('default shell resolution uses the environment passed to the PTY', () => {
  const { calls, spawnPty } = createFakePty()
  let shellEnvironment
  const adapter = {
    name: 'win32',
    getDefaultShell: (env) => {
      shellEnvironment = env
      return 'cmd.exe'
    },
  }
  const manager = new PtyProcessManager({ spawnPty, platform: adapter })

  manager.spawn('term-shell-env', {})

  assert.equal(shellEnvironment, calls[0].options.env)
})

test('spawn honors an explicit command, args and dimensions', () => {
  const { calls, spawnPty } = createFakePty()
  const manager = new PtyProcessManager({ spawnPty })

  manager.spawn('term-2', {
    command: 'claude',
    args: ['--print'],
    cols: 120,
    rows: 40,
  })

  // The explicit command is launched through the current platform's spec
  // (direct on Linux, via the shell on macOS/Windows so the CLI resolves).
  const expected = createPtyLaunchSpec('claude', ['--print'], process.env)
  assert.equal(calls[0].file, expected.command)
  assert.deepEqual(calls[0].args, expected.args)
  assert.equal(calls[0].options.cols, 120)
  assert.equal(calls[0].options.rows, 40)
})

test('macOS launches explicit CLIs through the interactive login shell', () => {
  const adapter = {
    name: 'darwin',
    getDefaultShell: () => '/bin/zsh',
    escapeArg: (value) => `'${value.replaceAll("'", "'\\''")}'`,
  }

  const launch = createPtyLaunchSpec(
    'codex',
    ['--model', 'gpt-5.5'],
    { SHELL: '/bin/zsh' },
    adapter,
  )

  assert.deepEqual(launch, {
    command: '/bin/zsh',
    args: ['-l', '-i', '-c', "exec 'codex' '--model' 'gpt-5.5'"],
  })
})

test('Windows launches explicit CLIs through cmd.exe so PATHEXT resolves .cmd shims', () => {
  const adapter = {
    name: 'win32',
    getDefaultShell: () => 'powershell.exe',
    escapeArg: (value) => (/[" &|<>^%]/.test(value) ? `"${value}"` : value),
  }

  const launch = createPtyLaunchSpec(
    'claude',
    ['--model', 'opus'],
    {},
    adapter,
  )

  // Bare `claude` (installed as claude.cmd) must go through the shell, not be
  // handed straight to CreateProcess — otherwise: "Cannot create process".
  // Args stay as separate argv entries (not pre-joined into one string) so
  // node-pty's own Windows command-line builder quotes each one correctly.
  assert.deepEqual(launch, {
    command: 'cmd.exe',
    args: ['/d', '/s', '/c', 'claude', '--model', 'opus'],
  })
})

test('Linux runs explicit CLIs directly (already on PATH)', () => {
  const adapter = { name: 'linux', getDefaultShell: () => '/bin/bash' }

  const launch = createPtyLaunchSpec('gemini', ['--yolo'], {}, adapter)

  assert.deepEqual(launch, { command: 'gemini', args: ['--yolo'] })
})

test('write forwards input to the active session only', () => {
  const { fakePty, spawnPty } = createFakePty()
  const manager = new PtyProcessManager({ spawnPty })

  manager.spawn('term-3', {})

  assert.equal(manager.write('term-3', 'ls\n'), true)
  assert.deepEqual(fakePty.written, ['ls\n'])
  assert.equal(manager.write('missing', 'noop'), false)
})

test('resize updates dimensions and skips redundant resizes', () => {
  const { fakePty, spawnPty } = createFakePty()
  const manager = new PtyProcessManager({ spawnPty })

  manager.spawn('term-4', { cols: 80, rows: 24 })

  assert.equal(manager.resize('term-4', 100, 30), true)
  assert.deepEqual(fakePty.resizes, [{ cols: 100, rows: 30 }])

  // Same dimensions: no extra resize call reaches the PTY.
  assert.equal(manager.resize('term-4', 100, 30), true)
  assert.equal(fakePty.resizes.length, 1)

  assert.equal(manager.resize('missing', 100, 30), false)
})

test('invalid dimensions fall back to safe defaults', () => {
  const { calls, spawnPty } = createFakePty()
  const manager = new PtyProcessManager({ spawnPty })

  manager.spawn('term-5', { cols: 0, rows: -10 })

  assert.equal(calls[0].options.cols, DEFAULT_COLS)
  assert.equal(calls[0].options.rows, DEFAULT_ROWS)
})

test('missing working directory falls back to the user home', () => {
  const { calls, spawnPty } = createFakePty()
  const warnings = []
  const received = []
  const manager = new PtyProcessManager({
    spawnPty,
    logger: { warn: (...args) => warnings.push(args) },
  })
  const home = require('node:os').homedir()

  manager.spawn('term-invalid-cwd', {
    cwd: require('node:path').join(home, 'felixo-path-that-does-not-exist'),
    onData: (data) => received.push(data),
  })

  assert.equal(calls[0].options.cwd, home)
  assert.equal(resolveWorkingDirectory(home), home)
  assert.equal(
    warnings[0][0],
    'PTY: O caminho salvo não está disponível; usando a pasta do usuário.',
  )
  assert.deepEqual(warnings[0][1], { reason: 'invalid-cwd', platform: process.platform })
  assert.deepEqual(received, [
    '\r\n[Felixo] Camada: diretório de trabalho. O caminho salvo não está disponível; usando a pasta do usuário.\r\n',
  ])
})

test('Windows retries once when ConPTY reports a path error after startup', () => {
  const first = createFakePty()
  const second = createFakePty()
  const spawnCalls = []
  const received = []
  const spawnPty = (file, args, options) => {
    spawnCalls.push({ file, args, options })
    return (spawnCalls.length === 1 ? first : second).spawnPty(file, args, options)
  }
  const manager = new PtyProcessManager({
    spawnPty,
    platform: fakeWin32Platform,
  })

  manager.spawn('term-cwd-error', {
    cwd: 'C:\\Users\\missing-project',
    onData: (data) => received.push(data),
  })

  first.fakePty.emitData('O sistema não pode encontrar o caminho especificado.\r\n')
  second.fakePty.emitData('C:\\Users\\felipe>')

  assert.equal(spawnCalls.length, 2)
  assert.equal(spawnCalls[1].options.cwd, require('node:os').homedir())
  assert.deepEqual(received, [
    '\r\n[Felixo] Camada: diretório de trabalho. O caminho salvo não está disponível; usando a pasta do usuário.\r\n',
    '\r\n[Felixo] Camada: shell do Windows. O shell reportou um erro de caminho; tentando a pasta do usuário.\r\n',
    'C:\\Users\\felipe>',
  ])
})

test('finds the Codex Windows shim in the npm user directory', () => {
  const env = {
    Path: 'C:\\Windows\\System32',
    APPDATA: 'C:\\Users\\felipe\\AppData\\Roaming',
  }
  const expected = 'C:\\Users\\felipe\\AppData\\Roaming\\npm\\codex.cmd'

  assert.equal(
    resolveWindowsCodexPath('codex', env, (candidate) => candidate === expected),
    expected,
  )
  assert.equal(resolveWindowsCodexPath('claude', env, () => true), null)
})

test('Windows retries an early Codex failure with the located executable and original args', () => {
  const first = createFakePty()
  const second = createFakePty()
  const spawnCalls = []
  const resolvedPath = 'C:\\Users\\felipe\\AppData\\Roaming\\npm\\codex.cmd'
  const spawnPty = (file, args, options) => {
    spawnCalls.push({ file, args, options })
    return (spawnCalls.length === 1 ? first : second).spawnPty(file, args, options)
  }
  const manager = new PtyProcessManager({
    spawnPty,
    platform: fakeWin32Platform,
    logger: { warn() {} },
    resolveCodexPath: () => resolvedPath,
  })

  manager.spawn('term-codex-path', {
    command: 'codex',
    args: ['--model', 'gpt-5.6-luna'],
  })
  first.fakePty.emitExit({ exitCode: 1 })

  assert.equal(spawnCalls.length, 2)
  assert.deepEqual(spawnCalls[1].args, [
    '/d',
    '/s',
    '/c',
    resolvedPath,
    '--model',
    'gpt-5.6-luna',
  ])
})

test('Windows keeps the terminal usable with a clean shell after every Codex fallback fails', () => {
  const first = createFakePty()
  const second = createFakePty()
  const third = createFakePty()
  const spawnCalls = []
  const spawnPty = (file, args, options) => {
    spawnCalls.push({ file, args, options })
    return [first, second, third][spawnCalls.length - 1].spawnPty(file, args, options)
  }
  const manager = new PtyProcessManager({
    spawnPty,
    platform: fakeWin32Platform,
    logger: { warn() {} },
    resolveCodexPath: () => 'C:\\Users\\felipe\\AppData\\Roaming\\npm\\codex.cmd',
  })

  manager.spawn('term-codex-emergency-shell', {
    command: 'codex',
    args: ['--model', 'gpt-5.6-luna'],
  })
  first.fakePty.emitExit({ exitCode: 1 })
  second.fakePty.emitExit({ exitCode: 1 })

  assert.equal(spawnCalls.length, 3)
  assert.equal(spawnCalls[2].file, 'cmd.exe')
  assert.deepEqual(spawnCalls[2].args, [])
  assert.equal(spawnCalls[2].options.cwd, require('node:os').homedir())
})

test('force kill terminates immediately and drops the session', () => {
  const { fakePty, spawnPty } = createFakePty()
  const manager = new PtyProcessManager({ spawnPty })

  manager.spawn('term-6', {})
  assert.equal(manager.kill('term-6', { force: true }), true)

  assert.deepEqual(fakePty.kills, ['SIGKILL'])
  assert.equal(manager.has('term-6'), false)
  assert.equal(manager.kill('missing'), false)
})

test('graceful kill sends SIGTERM but keeps the session until exit', () => {
  const { fakePty, spawnPty } = createFakePty()
  const manager = new PtyProcessManager({ spawnPty })

  manager.spawn('term-7', {})
  assert.equal(manager.kill('term-7'), true)

  assert.deepEqual(fakePty.kills, ['SIGTERM'])
  // Session is dropped only once the PTY actually exits.
  assert.equal(manager.has('term-7'), true)

  fakePty.emitExit({ exitCode: 0 })
  assert.equal(manager.has('term-7'), false)
})

test('exit cleans up the session and notifies the caller', () => {
  const { fakePty, spawnPty } = createFakePty()
  const manager = new PtyProcessManager({ spawnPty })
  const exits = []

  manager.spawn('term-8', { onExit: (event) => exits.push(event) })
  fakePty.emitExit({ exitCode: 137, signal: 9 })

  assert.deepEqual(exits, [{ exitCode: 137, signal: 9 }])
  assert.equal(manager.has('term-8'), false)
})

test('re-spawning the same id replaces the previous session', () => {
  const first = createFakePty()
  const second = createFakePty()
  let spawnCount = 0
  const spawnPty = (...callArgs) => {
    spawnCount += 1
    return (spawnCount === 1 ? first : second).spawnPty(...callArgs)
  }
  const manager = new PtyProcessManager({ spawnPty })

  manager.spawn('term-9', {})
  manager.spawn('term-9', {})

  assert.deepEqual(first.fakePty.kills, ['SIGKILL'])
  assert.equal(manager.get('term-9'), second.fakePty)
})

const fakeWin32Platform = {
  name: 'win32',
  getDefaultShell: () => 'cmd.exe',
  escapeArg: (value) => (/[" &|<>^%]/.test(value) ? `"${value}"` : value),
}

test('Windows: command with args that exits almost immediately retries with the bare command', () => {
  const first = createFakePty()
  const second = createFakePty()
  const spawnCalls = []
  const spawnPty = (file, args, options) => {
    spawnCalls.push({ file, args, options })
    return (spawnCalls.length === 1 ? first : second).spawnPty(file, args, options)
  }
  const manager = new PtyProcessManager({ spawnPty, platform: fakeWin32Platform })
  const exits = []

  manager.spawn('term-10', {
    command: 'codex',
    args: ['--model', 'gpt-5.6-sol'],
    onExit: (event) => exits.push(event),
  })

  // Exits right away — the launch never really started.
  first.fakePty.emitExit({ exitCode: 1 })

  assert.equal(spawnCalls.length, 2)
  assert.deepEqual(spawnCalls[1].args, ['/d', '/s', '/c', 'codex'])
  assert.equal(manager.get('term-10'), second.fakePty)
  // The failed first attempt's exit is swallowed — the caller only hears
  // about the outcome of the retry, not the throwaway failed attempt.
  assert.deepEqual(exits, [])

  second.fakePty.emitExit({ exitCode: 0 })
  assert.deepEqual(exits, [{ exitCode: 0 }])
})

test('Windows: command with args that runs for a while does not trigger a fallback retry', () => {
  const { fakePty, spawnPty } = createFakePty()
  let now = 0
  const manager = new PtyProcessManager({
    spawnPty,
    now: () => now,
    platform: fakeWin32Platform,
  })
  const exits = []

  manager.spawn('term-11', {
    command: 'codex',
    args: ['--model', 'gpt-5.6-sol'],
    onExit: (event) => exits.push(event),
  })

  // Session stayed up well past the early-exit threshold before exiting.
  now += 5000
  fakePty.emitExit({ exitCode: 0 })

  assert.deepEqual(exits, [{ exitCode: 0 }])
})

test('non-Windows: a fast exit with args is reported as-is, no fallback retry', () => {
  const { fakePty, spawnPty } = createFakePty()
  const linuxPlatform = { name: 'linux', getDefaultShell: () => '/bin/bash' }
  const manager = new PtyProcessManager({ spawnPty, platform: linuxPlatform })
  const exits = []

  manager.spawn('term-12', {
    command: 'codex',
    args: ['--version'],
    onExit: (event) => exits.push(event),
  })

  // A legitimately fast-exiting command (e.g. --version) must reach the
  // caller as-is on platforms with no argv-quoting fallback to guard against.
  fakePty.emitExit({ exitCode: 0 })

  assert.deepEqual(exits, [{ exitCode: 0 }])
})

test('killAll terminates every tracked session', () => {
  const { spawnPty } = createFakePty()
  const manager = new PtyProcessManager({ spawnPty })

  manager.spawn('a', {})
  manager.spawn('b', {})
  manager.killAll({ force: true })

  assert.equal(manager.has('a'), false)
  assert.equal(manager.has('b'), false)
})

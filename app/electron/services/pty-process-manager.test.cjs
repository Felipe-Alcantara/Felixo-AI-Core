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

test('preserva a causa original quando a fábrica nativa da PTY falha', () => {
  const nativeError = new Error('node-pty: dlopen failed for arm64')
  const manager = new PtyProcessManager({
    spawnPty: () => {
      throw nativeError
    },
  })

  assert.throws(
    () => manager.spawn('term-spawn-error', {}),
    (error) => {
      assert.match(error.message, /não foi possível criar a sessão/)
      assert.match(error.message, /dlopen failed for arm64/)
      assert.equal(error.cause, nativeError)
      return true
    },
  )
})

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
  // `() => false` descreve a máquina sem PowerShell: sem isso o teste
  // consultava o disco real e passava só onde ele não estivesse instalado —
  // no Linux por acidente, e no Windows nunca.
  assert.equal(win32Platform.getDefaultShell({}, () => false), 'cmd.exe')
})

test('Windows prefers PowerShell 7 when it is installed', () => {
  const pwsh = 'C:\\Program Files\\PowerShell\\7\\pwsh.exe'

  assert.equal(
    win32Platform.getDefaultShell({}, (candidate) => candidate === pwsh),
    pwsh,
  )
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

test('Windows starts the default PowerShell without the user profile', () => {
  const { calls, spawnPty } = createFakePty()
  const adapter = {
    name: 'win32',
    getDefaultShell: () => 'powershell.exe',
    getShellArgs: () => ['-NoLogo', '-NoProfile'],
  }
  const manager = new PtyProcessManager({ spawnPty, platform: adapter })

  manager.spawn('term-clean-powershell', {})

  assert.deepEqual(calls[0].args, ['-NoLogo', '-NoProfile'])
})

test('Windows starts the default CMD with AutoRun disabled', () => {
  const { calls, spawnPty } = createFakePty()
  const adapter = {
    name: 'win32',
    getDefaultShell: () => 'cmd.exe',
    getShellArgs: () => ['/d'],
  }
  const manager = new PtyProcessManager({ spawnPty, platform: adapter })

  manager.spawn('term-clean-cmd', {})

  assert.deepEqual(calls[0].args, ['/d'])
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
  // Bare commands stay separate so node-pty can construct its normal Windows
  // command line and CMD can resolve the `.cmd` shim through PATHEXT.
  assert.deepEqual(launch, {
    command: 'cmd.exe',
    args: ['/d', '/s', '/c', 'claude', '--model', 'opus'],
  })
})

test('Windows dispatches an absolute CLI path with spaces through cmd.exe call', () => {
  const adapter = {
    name: 'win32',
    getDefaultShell: () => 'powershell.exe',
    escapeArg: (value) => (/[^A-Za-z0-9_./:-]/.test(value) ? `"${value}"` : value),
  }

  const launch = createPtyLaunchSpec(
    'C:\\Users\\Felipe Martins\\AppData\\Roaming\\npm\\claude.cmd',
    ['--print'],
    {},
    adapter,
  )

  assert.deepEqual(launch, {
    command: 'cmd.exe',
    args: [
      '/d',
      '/s',
      '/c',
      'call',
      'C:\\Users\\Felipe Martins\\AppData\\Roaming\\npm\\claude.cmd',
      '--print',
    ],
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

test('Windows retries a startup path error with the WinPTY backend before changing shell', () => {
  const first = createFakePty()
  const second = createFakePty()
  const spawnCalls = []
  const received = []
  const warnings = []
  const spawnPty = (file, args, options) => {
    spawnCalls.push({ file, args, options })
    return (spawnCalls.length === 1 ? first : second).spawnPty(file, args, options)
  }
  const manager = new PtyProcessManager({
    spawnPty,
    logger: { warn: (...args) => warnings.push(args) },
    isDebugSession: () => true,
    platform: {
      ...fakeWin32Platform,
      getDefaultShell: () => 'powershell.exe',
      getShellArgs: (shell) =>
        shell === 'cmd.exe' ? ['/d'] : ['-NoLogo', '-NoProfile'],
    },
  })

  manager.spawn('term-cwd-error', {
    cwd: 'C:\\Users\\missing-project',
    onData: (data) => received.push(data),
  })

  first.fakePty.emitData('O sistema não pode encontrar o caminho especificado.\r\n')
  second.fakePty.emitData('C:\\Users\\felipe>')

  assert.equal(spawnCalls.length, 2)
  assert.equal(spawnCalls[0].file, 'powershell.exe')
  assert.equal(spawnCalls[1].file, 'powershell.exe')
  assert.deepEqual(spawnCalls[1].args, ['-NoLogo', '-NoProfile'])
  assert.equal(spawnCalls[1].options.useConpty, false)
  assert.equal(spawnCalls[1].options.cwd, require('node:os').homedir())
  assert.deepEqual(warnings[1], [
    'PTY: Diagnóstico bruto do shell Windows.',
    {
      reason: 'shell-path-error',
      platform: 'win32',
      backend: 'conpty/auto',
      shell: 'powershell.exe',
      args: ['-NoLogo', '-NoProfile'],
      cwd: require('node:os').homedir(),
      output: 'O sistema não pode encontrar o caminho especificado.\r\n',
    },
  ])
  assert.deepEqual(received, [
    '\r\n[Felixo] Camada: diretório de trabalho. O caminho salvo não está disponível; usando a pasta do usuário.\r\n',
    '\r\n[Felixo] Camada: backend PTY do Windows. A camada de terminal reportou um erro de caminho; tentando o backend alternativo.\r\n',
    'C:\\Users\\felipe>',
  ])
})

test('Windows retries an explicit Codex launch with WinPTY after an early path error', () => {
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
    logger: { warn() {} },
    resolveCodexPath: () => null,
  })

  manager.spawn('term-codex-conpty-error', {
    command: 'codex',
    args: ['--model', 'gpt-5.6-luna'],
    cwd: require('node:os').homedir(),
    onData: (data) => received.push(data),
  })
  first.fakePty.emitData('O sistema não pode encontrar o caminho especificado.\r\n')

  assert.equal(spawnCalls.length, 2)
  assert.equal(spawnCalls[1].options.useConpty, false)
  assert.deepEqual(spawnCalls[1].args, [
    '/d',
    '/s',
    '/c',
    'codex',
    '--model',
    'gpt-5.6-luna',
  ])
  assert.deepEqual(received, [
    '\r\n[Felixo] Camada: backend PTY do Windows. A camada de terminal reportou um erro de caminho; tentando o backend alternativo.\r\n',
  ])
})

test('Windows does not restart an explicit CLI when it prints a file-not-found message', () => {
  const { fakePty, spawnPty } = createFakePty()
  const received = []
  const manager = new PtyProcessManager({ spawnPty, platform: fakeWin32Platform })

  manager.spawn('term-cli-file-error', {
    command: 'codex',
    cwd: require('node:os').homedir(),
    onData: (data) => received.push(data),
  })
  fakePty.emitData('File not found: README.md\r\n')

  assert.deepEqual(received, ['File not found: README.md\r\n'])
  assert.equal(fakePty.kills.length, 0)
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

test('Windows resolves the Codex shim before the first PTY attempt', () => {
  const first = createFakePty()
  const spawnCalls = []
  const resolvedPath = 'C:\\Users\\felipe\\AppData\\Roaming\\npm\\codex.cmd'
  const spawnPty = (file, args, options) => {
    spawnCalls.push({ file, args, options })
    return first.spawnPty(file, args, options)
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

  assert.equal(spawnCalls.length, 1)
  assert.deepEqual(spawnCalls[0].args, [
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
  assert.deepEqual(spawnCalls[2].args, ['/d'])
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

test('Windows force kill omits the unsupported signal and drops the session', () => {
  const { fakePty, spawnPty } = createFakePty()
  const manager = new PtyProcessManager({
    spawnPty,
    platform: fakeWin32Platform,
  })

  manager.spawn('term-win-kill', {})
  assert.equal(manager.kill('term-win-kill', { force: true }), true)

  assert.deepEqual(fakePty.kills, [undefined])
  assert.equal(manager.has('term-win-kill'), false)
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
  assert.equal(manager.has('term-7'), true)
  manager.kill('term-7', { force: true })
  assert.equal(manager.has('term-7'), false)
})

test('exit retains the replayable session and notifies the caller', () => {
  const { fakePty, spawnPty } = createFakePty()
  // Plataforma fixa em posix: no Windows uma saída imediata com código != 0
  // aciona o retry de fallback da CLI, que reinicia a sessão em vez de
  // reportar a saída — o comportamento certo lá, mas não o que este teste
  // descreve. Sem fixar, o resultado dependia de onde a suíte roda.
  const manager = new PtyProcessManager({
    spawnPty,
    platform: { name: 'linux', getDefaultShell: () => '/bin/bash' },
  })
  const exits = []

  manager.spawn('term-8', { onExit: (event) => exits.push(event) })
  fakePty.emitExit({ exitCode: 137, signal: 9 })

  assert.deepEqual(exits, [{ exitCode: 137, signal: 9 }])
  assert.equal(manager.has('term-8'), true)
  assert.equal(manager.kill('term-8', { force: true }), true)
  assert.equal(manager.has('term-8'), false)
})

test('reuseExisting reattaches without spawning or replaying the initial process', () => {
  const { fakePty, spawnPty, calls } = createFakePty()
  const manager = new PtyProcessManager({ spawnPty })
  const firstOutput = []
  const secondOutput = []

  manager.spawn('canvas:term-reload', {
    command: 'claude',
    onData: (data) => firstOutput.push(data),
  })
  fakePty.emitData('history before HMR\r\n')

  manager.spawn('canvas:term-reload', {
    command: 'claude',
    reuseExisting: true,
    onData: (data) => secondOutput.push(data),
  })

  assert.equal(calls.length, 1)
  assert.deepEqual(firstOutput, ['history before HMR\r\n'])
  assert.deepEqual(secondOutput, ['history before HMR\r\n'])
  assert.deepEqual(fakePty.kills, [])
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
  const manager = new PtyProcessManager({
    spawnPty,
    platform: fakeWin32Platform,
    resolveCodexPath: () => null,
  })
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

test('Windows: a run-a-file session keeps the shell open with /k instead of /c', () => {
  const launch = createPtyLaunchSpec('py', ['script.py'], {}, fakeWin32Platform, true)

  // /c would close the pane the moment the script ends, leaving the user with
  // nothing to read and nothing to type into.
  assert.deepEqual(launch, {
    command: 'cmd.exe',
    args: ['/d', '/s', '/k', 'py', 'script.py'],
  })
})

test('Windows: a normal CLI launch still uses /c', () => {
  const launch = createPtyLaunchSpec('claude', ['--print'], {}, fakeWin32Platform)

  assert.deepEqual(launch, {
    command: 'cmd.exe',
    args: ['/d', '/s', '/c', 'claude', '--print'],
  })
})

test('POSIX: a run-a-file session hands control back to an interactive shell', () => {
  const linuxPlatform = require('../core/platform/linux.cjs')
  const launch = createPtyLaunchSpec(
    'env',
    ['python3', 'script.py'],
    { SHELL: '/bin/bash' },
    linuxPlatform,
    true,
  )

  assert.equal(launch.command, '/bin/bash')
  // No `exec` on the command itself: the shell must outlive it.
  assert.ok(!launch.args[2].startsWith('exec env'))
  assert.match(launch.args[2], /^env python3 script\.py; exec \/bin\/bash -i$/)
})

test('Windows: a run-a-file session never retries by dropping the file argument', () => {
  const first = createFakePty()
  const second = createFakePty()
  const spawnCalls = []
  const spawnPty = (file, args, options) => {
    spawnCalls.push({ file, args, options })
    return (spawnCalls.length === 1 ? first : second).spawnPty(file, args, options)
  }
  const manager = new PtyProcessManager({ spawnPty, platform: fakeWin32Platform })

  manager.spawn('term-run-1', {
    command: 'py',
    args: ['script.py'],
    keepShellOpen: true,
    onExit: () => {},
  })

  first.fakePty.emitExit({ exitCode: 1 })

  // Dropping the args here would launch a bare `py` REPL — running something
  // the user never asked for. The emergency shell is the only allowed step.
  const retried = spawnCalls[1]
  assert.ok(!retried.args.includes('py') || !retried.args.includes('script.py'))
  assert.ok(!(retried.args.includes('py') && retried.args.length === 4))
})

test('Windows: the failed process output is replayed before the emergency shell', () => {
  const first = createFakePty()
  const second = createFakePty()
  const spawnCalls = []
  const spawnPty = (file, args, options) => {
    spawnCalls.push({ file, args, options })
    return (spawnCalls.length === 1 ? first : second).spawnPty(file, args, options)
  }
  const manager = new PtyProcessManager({ spawnPty, platform: fakeWin32Platform })
  const output = []

  manager.spawn('term-run-2', {
    command: 'py',
    args: ['script.py'],
    keepShellOpen: true,
    onData: (data) => output.push(data),
    onExit: () => {},
  })

  first.fakePty.emitData("ModuleNotFoundError: No module named 'requests'")
  first.fakePty.emitExit({ exitCode: 1 })

  // The traceback is the whole diagnosis; without it the user only sees a
  // clean shell in their home folder and reports "the file doesn't open".
  const replayed = output.join('')
  assert.match(replayed, /ModuleNotFoundError: No module named 'requests'/)
  assert.match(replayed, /encerrou com código 1/)
})

test('Windows: a silent failure says the command produced no output', () => {
  const first = createFakePty()
  const second = createFakePty()
  const spawnCalls = []
  const spawnPty = (file, args, options) => {
    spawnCalls.push({ file, args, options })
    return (spawnCalls.length === 1 ? first : second).spawnPty(file, args, options)
  }
  const manager = new PtyProcessManager({ spawnPty, platform: fakeWin32Platform })
  const output = []

  manager.spawn('term-run-3', {
    command: 'py',
    args: ['script.py'],
    keepShellOpen: true,
    onData: (data) => output.push(data),
    onExit: () => {},
  })

  first.fakePty.emitExit({ exitCode: 9009 })

  assert.match(output.join(''), /sem produzir saída/)
})

test('Windows: `py` failing instantly retries the file with `python`', () => {
  const first = createFakePty()
  const second = createFakePty()
  const spawnCalls = []
  const spawnPty = (file, args, options) => {
    spawnCalls.push({ file, args, options })
    return (spawnCalls.length === 1 ? first : second).spawnPty(file, args, options)
  }
  const manager = new PtyProcessManager({ spawnPty, platform: fakeWin32Platform })

  manager.spawn('term-run-4', {
    command: 'py',
    args: ['script.py'],
    fallbackCommand: 'python',
    keepShellOpen: true,
    onExit: () => {},
  })

  // `py` is absent on Microsoft Store / conda installs: cmd exits 9009.
  first.fakePty.emitExit({ exitCode: 9009 })

  assert.equal(spawnCalls.length, 2)
  // Still the user's file, still keeping the shell open — only the
  // interpreter changed.
  assert.deepEqual(spawnCalls[1].args, ['/d', '/s', '/k', 'python', 'script.py'])
})

test('Windows: the interpreter fallback is tried only once', () => {
  const ptys = [createFakePty(), createFakePty(), createFakePty()]
  const spawnCalls = []
  const spawnPty = (file, args, options) => {
    spawnCalls.push({ file, args, options })
    return ptys[Math.min(spawnCalls.length - 1, ptys.length - 1)].spawnPty(file, args, options)
  }
  const manager = new PtyProcessManager({ spawnPty, platform: fakeWin32Platform })

  manager.spawn('term-run-5', {
    command: 'py',
    args: ['script.py'],
    fallbackCommand: 'python',
    keepShellOpen: true,
    onExit: () => {},
  })

  ptys[0].fakePty.emitExit({ exitCode: 9009 })
  ptys[1].fakePty.emitExit({ exitCode: 9009 })

  // Neither interpreter exists: the third attempt must be the emergency
  // shell, not an infinite py/python ping-pong.
  assert.equal(spawnCalls.length, 3)
  assert.ok(!spawnCalls[2].args.includes('script.py'))
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

test('lista as sessões vivas com o comando que cada uma pediu', () => {
  const { fakePty, spawnPty } = createFakePty()
  const manager = new PtyProcessManager({ spawnPty })

  manager.spawn('canvas:no-codex', { command: 'codex', cwd: process.cwd() })
  manager.spawn('canvas:no-shell', {})

  const sessoes = manager.listarSessoesVivas()
  const porId = new Map(sessoes.map((sessao) => [sessao.sessionId, sessao]))

  assert.equal(sessoes.length, 2)
  assert.equal(porId.get('canvas:no-codex').command, 'codex')
  // Sessão sem comando explícito é um shell: não pertence a nenhuma CLI, e
  // reportar o shell padrão aqui faria a troca de conta acusar terminal alheio.
  assert.equal(porId.get('canvas:no-shell').command, null)

  fakePty.emitExit({ exitCode: 0 })

  assert.deepEqual(manager.listarSessoesVivas(), [])
})

test('o terminal nasce na conta escolhida, e sem conta segue o login do sistema', () => {
  const { spawnPty, calls } = createFakePty()
  const environmentCalls = []
  const manager = new PtyProcessManager({
    spawnPty,
    buildAccountEnv: (accountId, providerId) => {
      environmentCalls.push({ accountId, providerId })
      return accountId === 'conta-trabalho' ? { CODEX_HOME: '/perfis/trabalho' } : {}
    },
  })

  try {
    manager.spawn('sessao-a', { command: 'codex', accountId: 'conta-trabalho' })
    manager.spawn('sessao-b', { command: 'codex' })

    assert.equal(calls[0].options.env.CODEX_HOME, '/perfis/trabalho')
    assert.equal(calls[1].options.env.CODEX_HOME, undefined)
    // O PATH montado pelo app continua valendo nos dois casos.
    assert.ok(calls[0].options.env.PATH && calls[1].options.env.PATH)
    assert.deepEqual(environmentCalls, [
      { accountId: 'conta-trabalho', providerId: 'codex' },
      { accountId: undefined, providerId: 'codex' },
    ])
  } finally {
    manager.killAll({ force: true })
  }
})

test('o PTY recusa conta incompatível antes de compor o ambiente', () => {
  const { spawnPty, calls } = createFakePty()
  let ambienteMontado = false
  const manager = new PtyProcessManager({
    spawnPty,
    validateAccount: () => ({
      ok: false,
      message: 'A conta selecionada pertence a outro provedor.',
    }),
    buildAccountEnv: () => {
      ambienteMontado = true
      return { CODEX_HOME: '/perfis/nao-deveria-usar' }
    },
  })

  assert.throws(
    () => manager.spawn('sessao-invalida', { command: 'claude', accountId: 'conta-codex' }),
    /outro provedor/,
  )
  assert.equal(ambienteMontado, false)
  assert.equal(calls.length, 0)
})

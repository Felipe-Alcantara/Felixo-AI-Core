const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const win32Platform = require('../core/platform/win32.cjs')
const {
  PtyProcessManager,
  MAX_REPLAY_BUFFER_CHARS,
  PTY_SESSION_ACCOUNT_MISMATCH,
  isClaudeCommandName,
  DEFAULT_COLS,
  DEFAULT_ROWS,
  WIN32_MAX_PATH,
  createPtyLaunchSpec,
  isWindowsLongPathFailure,
  resolveWorkingDirectory,
  resolveWindowsCodexPath,
} = require('./pty-process-manager.cjs')
const { createCliAccountStore } = require('./cli-account-store.cjs')
const { createAccountOutputWatcher } = require('./accounts/account-output-watcher.cjs')
const { OUTPUT_WATCHER_DEBOUNCE_MS } = require('./accounts/account-chain-constants.cjs')

/**
 * Cria um diretório real acima do MAX_PATH clássico. No Windows,
 * `mkdirSync` sem o prefixo de path estendido `\\?\` falha já na criação
 * (medido ao vivo em release-smoke.cjs) — mesma técnica usada lá.
 */
function criarPastaComPathLongo() {
  const segmento = 'pasta-bem-comprida-para-estourar-o-max-path-classico-do-windows'
  let alvo = os.tmpdir()
  while (alvo.length < WIN32_MAX_PATH + 20) {
    alvo = path.join(alvo, segmento)
  }
  const mkdirAlvo = process.platform === 'win32' ? `\\\\?\\${alvo}` : alvo
  fs.mkdirSync(mkdirAlvo, { recursive: true })
  return alvo
}

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

const fakePosixPlatform = {
  name: 'linux',
  getDefaultShell: () => '/bin/bash',
}

test('isWindowsLongPathFailure só reconhece o erro real de path longo no Windows', () => {
  const erro267 = new Error('Cannot create process, error code: 267')
  const cwdLongo = 'C'.repeat(300)
  const cwdCurto = 'C:\\projeto'

  assert.equal(isWindowsLongPathFailure(erro267, cwdLongo, 'win32'), true)
  // Fora do Windows, mesmo erro/cwd não deve disparar — a mensagem é
  // específica do WindowsPtyAgent.
  assert.equal(isWindowsLongPathFailure(erro267, cwdLongo, 'linux'), false)
  // cwd dentro do limite não deve disparar mesmo com a mensagem batendo —
  // evita falso positivo por coincidência de texto.
  assert.equal(isWindowsLongPathFailure(erro267, cwdCurto, 'win32'), false)
  // Outra falha qualquer, mesmo com cwd longo, não deve virar um aviso
  // enganoso de "path longo".
  assert.equal(
    isWindowsLongPathFailure(new Error('node-pty: dlopen failed'), cwdLongo, 'win32'),
    false,
  )
})

test('spawn avisa especificamente sobre path longo quando o node-pty recusa com o erro 267 no Windows', () => {
  const cwdLongo = criarPastaComPathLongo()
  try {
    const manager = new PtyProcessManager({
      platform: win32Platform,
      spawnPty: () => {
        throw new Error('Cannot create process, error code: 267')
      },
    })
    const avisos = []

    assert.throws(
      () =>
        manager.spawn('term-long-path', {
          cwd: cwdLongo,
          onData: (data) => avisos.push(data),
        }),
      (error) => {
        assert.match(error.message, /excede o limite de caminho do Windows/)
        return true
      },
    )

    assert.ok(
      avisos.some((aviso) => aviso.includes('caminho longo demais')),
      'esperava um aviso explicando o path longo, não um "não foi possível criar a sessão" genérico',
    )
  } finally {
    fs.rmSync(process.platform === 'win32' ? `\\\\?\\${cwdLongo}` : cwdLongo, {
      recursive: true,
      force: true,
    })
  }
})

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
  const manager = new PtyProcessManager({ spawnPty, platform: fakePosixPlatform })

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
  const manager = new PtyProcessManager({ spawnPty, platform: fakePosixPlatform })

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

test('a sessão guarda conta, provedor e modo, e a lista de sessões vivas os expõe', () => {
  const { fakePty, spawnPty } = createFakePty()
  const manager = new PtyProcessManager({ spawnPty, platform: fakePosixPlatform })

  try {
    manager.spawn('canvas:cadeia', { command: 'codex', accountId: ' conta-trabalho ', providerId: 'codex', accountMode: 'chain' })
    manager.spawn('canvas:fixa', { command: 'claude', accountId: 'conta-max' })
    manager.spawn('canvas:sistema', { command: 'codex', accountMode: 'chain' })
    manager.spawn('canvas:modo-estranho', { command: 'codex', accountId: 'conta-x', accountMode: 'automatica' })
    manager.spawn('canvas:shell', {})

    const porId = new Map(manager.listarSessoesVivas().map((sessao) => [sessao.sessionId, sessao]))
    const conta = (id) => {
      const { accountId, providerId, accountMode } = porId.get(id)
      return { accountId, providerId, accountMode }
    }
    assert.deepEqual(conta('canvas:cadeia'), { accountId: 'conta-trabalho', providerId: 'codex', accountMode: 'chain' })
    // Bloco antigo, sem o campo novo: nasce fixo na conta escolhida.
    assert.deepEqual(conta('canvas:fixa'), { accountId: 'conta-max', providerId: 'claude', accountMode: 'pinned' })
    // Login do sistema não é membro da cadeia, mesmo que peçam.
    assert.deepEqual(conta('canvas:sistema'), { accountId: null, providerId: 'codex', accountMode: 'pinned' })
    assert.equal(conta('canvas:modo-estranho').accountMode, 'pinned')
    assert.deepEqual(conta('canvas:shell'), { accountId: null, providerId: null, accountMode: 'pinned' })
    // Nada de caminho de perfil nem ambiente na lista.
    assert.doesNotMatch(JSON.stringify([...porId.values()]), /CODEX_HOME|cli-profiles|env/)

    fakePty.emitExit({ exitCode: 0 })
  } finally {
    manager.killAll({ force: true })
  }
})

test('reanexar a sessão viva em outra conta é recusado; na mesma conta reanexa', () => {
  const { fakePty, spawnPty, calls } = createFakePty()
  const manager = new PtyProcessManager({ spawnPty })
  const originalOutput = []
  const reattachedOutput = []

  try {
    manager.spawn('canvas:bloco', {
      command: 'codex',
      accountId: 'conta-pessoal',
      onData: (data) => originalOutput.push(data),
    })
    fakePty.emitData('trabalho na conta pessoal\r\n')

    for (const outraConta of ['conta-trabalho', undefined, '']) {
      assert.throws(
        () =>
          manager.spawn('canvas:bloco', {
            command: 'codex',
            accountId: outraConta,
            reuseExisting: true,
            onData: (data) => reattachedOutput.push(data),
          }),
        (error) => {
          assert.equal(error.code, PTY_SESSION_ACCOUNT_MISMATCH)
          assert.match(error.message, /outra conta/)
          return true
        },
      )
    }

    // Nada nasceu, nada morreu, e o renderer antigo continua recebendo a saída.
    assert.equal(calls.length, 1)
    assert.deepEqual(fakePty.kills, [])
    assert.deepEqual(reattachedOutput, [])
    fakePty.emitData('ainda na conta pessoal\r\n')
    assert.deepEqual(originalOutput, ['trabalho na conta pessoal\r\n', 'ainda na conta pessoal\r\n'])

    manager.spawn('canvas:bloco', {
      command: 'codex',
      accountId: 'conta-pessoal',
      reuseExisting: true,
      onData: (data) => reattachedOutput.push(data),
    })
    assert.equal(calls.length, 1)
    assert.equal(reattachedOutput.length, 1, 'a mesma conta reanexa com o replay')
  } finally {
    manager.killAll({ force: true })
  }
})

test('a descoberta de conversa recebe as pastas do perfil da conta e a referência leva a conta', async () => {
  const { spawnPty } = createFakePty()
  const pedidos = []
  const manager = new PtyProcessManager({
    spawnPty,
    platform: fakePosixPlatform,
    buildAccountEnv: (accountId) => (accountId === 'conta-trabalho' ? { CODEX_HOME: '/perfis/codex/trabalho' } : {}),
    discoverAgentSession: (request) => {
      pedidos.push(request)
      return { version: 1, provider: 'codex', sessionId: `sessao-${pedidos.length}-abcdef`, cwd: request.cwd, capturedAt: 1 }
    },
  })
  const referencias = new Map()
  const recebida = (id) =>
    new Promise((resolve) => {
      referencias.set(id, resolve)
    })
  const daConta = recebida('conta')
  const doSistema = recebida('sistema')

  try {
    manager.spawn('canvas:conta', {
      command: 'codex',
      cwd: process.cwd(),
      accountId: 'conta-trabalho',
      onSession: (reference) => referencias.get('conta')(reference),
    })
    manager.spawn('canvas:sistema', {
      command: 'codex',
      cwd: process.cwd(),
      onSession: (reference) => referencias.get('sistema')(reference),
    })

    const [referenciaConta, referenciaSistema] = await Promise.all([daConta, doSistema])
    const pedidoConta = pedidos.find((pedido) => pedido.env?.CODEX_HOME === '/perfis/codex/trabalho')
    assert.ok(pedidoConta, `a descoberta não recebeu a pasta do perfil: ${JSON.stringify(pedidos.map((p) => p.env))}`)
    assert.equal(Object.hasOwn(pedidoConta.env, 'PATH'), false, 'só as pastas de histórico vão para a descoberta')
    assert.equal(referenciaConta.accountId, 'conta-trabalho')
    assert.equal(Object.hasOwn(referenciaSistema, 'accountId'), false, 'login do sistema não tem conta')
    assert.deepEqual(manager.listarSessoesVivas().length, 2)
  } finally {
    manager.killAll({ force: true })
  }
})

test('sessão do login do sistema também não reanexa numa conta própria', () => {
  const { spawnPty, calls } = createFakePty()
  const manager = new PtyProcessManager({ spawnPty })

  try {
    manager.spawn('canvas:sistema', { command: 'claude' })
    assert.throws(
      () => manager.spawn('canvas:sistema', { command: 'claude', accountId: 'conta-max', reuseExisting: true }),
      { code: PTY_SESSION_ACCOUNT_MISMATCH },
    )
    manager.spawn('canvas:sistema', { command: 'claude', reuseExisting: true })
    assert.equal(calls.length, 1)
  } finally {
    manager.killAll({ force: true })
  }
})

test('reattach depois de mais saída que o limite reenvia exatamente a cauda, na ordem', () => {
  const { fakePty, spawnPty } = createFakePty()
  const manager = new PtyProcessManager({ spawnPty })
  const emitted = []
  const replayed = []

  manager.spawn('canvas:term-long', { command: 'claude', onData: () => {} })
  // Mais que o limite, em pedaços pequenos como os de uma CLI animando spinner,
  // com um pedaço grande no meio e caracteres fora do BMP (pares UTF-16).
  for (let index = 0; index < 3_000; index += 1) {
    const chunk = index === 1_500
      ? `bloco-grande-${'z'.repeat(MAX_REPLAY_BUFFER_CHARS / 2)}\r\n`
      : `linha ${String(index).padStart(5, '0')} ⠋ 😀 ${'x'.repeat(50)}\r\n`
    emitted.push(chunk)
    fakePty.emitData(chunk)
  }

  manager.spawn('canvas:term-long', {
    command: 'claude',
    reuseExisting: true,
    onData: (data) => replayed.push(data),
  })

  const expected = emitted.join('').slice(-MAX_REPLAY_BUFFER_CHARS)
  assert.equal(replayed.length, 1)
  assert.equal(replayed[0].length, MAX_REPLAY_BUFFER_CHARS)
  assert.equal(replayed[0], expected)
})

test('o limite do replay no processo principal é o mesmo que o renderer anuncia', () => {
  // O aviso de histórico do terminal cita TERMINAL_REPLAY_BUFFER_CHARS; se os
  // dois números divergirem, o aviso promete um replay que o main não guarda.
  const scrollbackSource = fs.readFileSync(
    path.join(__dirname, '..', '..', 'src', 'features', 'canvas', 'terminal', 'terminal-scrollback.ts'),
    'utf8',
  )
  const match = /TERMINAL_REPLAY_BUFFER_CHARS\s*=\s*([\d_]+)/.exec(scrollbackSource)
  assert.ok(match, 'TERMINAL_REPLAY_BUFFER_CHARS não encontrado em terminal-scrollback.ts')
  assert.equal(Number(match[1].replaceAll('_', '')), MAX_REPLAY_BUFFER_CHARS)
})

test('re-spawning the same id replaces the previous session', () => {
  const first = createFakePty()
  const second = createFakePty()
  let spawnCount = 0
  const spawnPty = (...callArgs) => {
    spawnCount += 1
    return (spawnCount === 1 ? first : second).spawnPty(...callArgs)
  }
  const manager = new PtyProcessManager({ spawnPty, platform: fakePosixPlatform })

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

test('terminal com conta própria não herda chave de API do ambiente do app; o login do sistema fica igual', () => {
  // Com a chave no ambiente, o Codex de uma conta ChatGPT cobraria pela chave
  // (e o Claude Max, por uso): a conta escolhida deixaria de ser quem paga.
  const sentinelas = {
    OPENAI_API_KEY: 'sk-sentinela-openai',
    CODEX_API_KEY: 'sk-sentinela-codex',
    CODEX_ACCESS_TOKEN: 'eyJsentinela.codex',
    ANTHROPIC_API_KEY: 'sk-ant-sentinela',
    CLAUDE_CODE_OAUTH_TOKEN: 'sentinela-oauth',
  }
  const anteriores = Object.fromEntries(Object.keys(sentinelas).map((nome) => [nome, process.env[nome]]))
  Object.assign(process.env, sentinelas)
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-pty-credenciais-'))

  try {
    // A loja real de contas, montada como no processo principal.
    const store = createCliAccountStore({ userData: path.join(raiz, 'userData'), homeDir: path.join(raiz, 'home') })
    const codex = store.create({ providerId: 'codex', label: 'trabalho' })
    const claude = store.create({ providerId: 'claude', label: 'max' })
    const { spawnPty, calls } = createFakePty()
    const manager = new PtyProcessManager({
      spawnPty,
      platform: fakePosixPlatform,
      validateAccount: (accountId, providerId) => store.validateAccount(accountId, providerId),
      buildAccountEnv: (accountId, providerId) => store.buildEnv(accountId, providerId),
    })

    try {
      manager.spawn('com-conta-codex', { command: 'codex', accountId: codex.id })
      manager.spawn('com-conta-claude', { command: 'claude', accountId: claude.id })
      manager.spawn('login-do-sistema', { command: 'codex' })

      const [envCodex, envClaude, envSistema] = calls.map((call) => call.options.env)
      assert.match(envCodex.CODEX_HOME, new RegExp(codex.id))
      for (const nome of ['OPENAI_API_KEY', 'CODEX_API_KEY', 'CODEX_ACCESS_TOKEN']) {
        assert.equal(Object.hasOwn(envCodex, nome), false, `${nome} vazou para o terminal da conta Codex`)
      }
      assert.match(envClaude.CLAUDE_CONFIG_DIR, new RegExp(claude.id))
      for (const nome of ['ANTHROPIC_API_KEY', 'CLAUDE_CODE_OAUTH_TOKEN']) {
        assert.equal(Object.hasOwn(envClaude, nome), false, `${nome} vazou para o terminal da conta Claude`)
      }
      // Nenhum valor virou o texto "undefined" (o node-pty serializa assim).
      assert.ok(!Object.values(envCodex).includes(undefined) && !Object.values(envClaude).includes(undefined))

      for (const [nome, valor] of Object.entries(sentinelas)) {
        assert.equal(envSistema[nome], valor, `o login do sistema perdeu ${nome}`)
      }
      assert.ok(envCodex.PATH && envSistema.PATH)
    } finally {
      manager.killAll({ force: true })
    }
  } finally {
    for (const [nome, valor] of Object.entries(anteriores)) {
      if (valor === undefined) delete process.env[nome]
      else process.env[nome] = valor
    }
    fs.rmSync(raiz, { recursive: true, force: true })
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

test('classicScreen: só o Claude Code recebe CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN, e só quando pedido', () => {
  const envDe = (command, classicScreen) => {
    const { calls, spawnPty } = createFakePty()
    new PtyProcessManager({ spawnPty, platform: fakePosixPlatform }).spawn('t', { command, classicScreen })
    return calls[0].options.env
  }
  assert.equal(envDe('claude', true).CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN, '1')
  assert.equal(envDe('claude', false).CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN, undefined)
  assert.equal(envDe('claude', 'true').CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN, undefined)
  assert.equal(envDe('codex', true).CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN, undefined)
  assert.equal(envDe(undefined, true).CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN, undefined)
})

test('isClaudeCommandName reconhece só o executável do Claude Code', () => {
  for (const c of ['claude', 'claude.exe', 'C:\\a\\claude.cmd', '/usr/bin/claude']) assert.equal(isClaudeCommandName(c), true, c)
  for (const c of ['codex', 'bash', 'claude-helper', 'myclaude', '', undefined, 3]) assert.equal(isClaudeCommandName(c), false, String(c))
})

/**
 * Manager com a vigia real de falha por conta, relógio fixo e agendador
 * manual: os testes disparam os timers quando querem.
 */
function criarManagerComVigia(extra = {}) {
  const { fakePty, spawnPty, calls } = createFakePty()
  const timers = []
  const detections = []
  const created = []
  const manager = new PtyProcessManager({
    spawnPty,
    platform: fakePosixPlatform,
    discoverAgentSession: () => null,
    now: () => 5_000,
    createOutputWatcher: (options) => {
      created.push(options.providerId)
      return createAccountOutputWatcher({
        ...options,
        now: () => 5_000 + OUTPUT_WATCHER_DEBOUNCE_MS,
        setTimer: (callback) => {
          const timer = { callback, active: true }
          timers.push(timer)
          return timer
        },
        clearTimer: (timer) => {
          timer.active = false
        },
      })
    },
    onOutputFailure: (detection) => detections.push(detection),
    ...extra,
  })
  const fireTimers = () => {
    for (const timer of timers.filter((item) => item.active)) {
      timer.active = false
      timer.callback()
    }
  }
  return { manager, fakePty, calls, timers, detections, created, fireTimers }
}

const LIMITE_CODEX = '■ You’ve hit your usage limit. Upgrade to Plus to continue using Codex, or try again at 8:04 PM.\r\n'

test('vigia: a detecção sai com a sessão, a conta, o provedor e o modo do bloco', () => {
  const { manager, fakePty, detections, fireTimers } = criarManagerComVigia()
  try {
    manager.spawn('canvas:cadeia', { command: 'codex', accountId: 'conta-a', providerId: 'codex', accountMode: 'chain' })
    fakePty.emitData('trabalhando...\r\n')
    fakePty.emitData(LIMITE_CODEX)
    fireTimers()

    assert.equal(detections.length, 1)
    const [detection] = detections
    assert.equal(detection.kind, 'failure')
    assert.equal(detection.sessionId, 'canvas:cadeia')
    assert.equal(detection.accountId, 'conta-a')
    assert.equal(detection.providerId, 'codex')
    assert.equal(detection.accountMode, 'chain')
    assert.equal(detection.lineageId, null)
    assert.equal(detection.failure.failureClass, 'limit')
    assert.equal(detection.failure.scope, 'account')
    // O horário do último pedaço fica na entrada para a cadeia saber se a
    // origem ainda está produzindo saída.
    assert.equal(manager.sessions.get('canvas:cadeia').lastOutputAt, 5_000)
  } finally {
    manager.killAll({ force: true })
  }
})

test('vigia: o login do sistema também é vigiado (só aviso); shell, Openia e manager sem consumidor não têm vigia', () => {
  const { manager, fakePty, detections, created, fireTimers } = criarManagerComVigia()
  try {
    manager.spawn('canvas:sistema', { command: 'codex' })
    manager.spawn('canvas:shell', {})
    manager.spawn('canvas:openia', { command: 'openia' })
    fakePty.emitData(LIMITE_CODEX)
    fireTimers()

    // O PTY falso é o mesmo para as três sessões; só a do Codex tem vigia.
    assert.deepEqual(created, ['codex', 'openia'])
    assert.equal(detections.length, 1)
    assert.equal(detections[0].sessionId, 'canvas:sistema')
    assert.equal(detections[0].accountId, null)
    assert.equal(detections[0].accountMode, 'pinned')
  } finally {
    manager.killAll({ force: true })
  }

  let criadas = 0
  const semConsumidor = new PtyProcessManager({
    spawnPty: createFakePty().spawnPty,
    platform: fakePosixPlatform,
    discoverAgentSession: () => null,
    createOutputWatcher: () => {
      criadas += 1
      return null
    },
  })
  semConsumidor.spawn('canvas:x', { command: 'codex' })
  semConsumidor.killAll({ force: true })
  assert.equal(criadas, 0)
})

test('vigia: os bytes entregues ao renderer são idênticos com e sem vigia, na mesma ordem', () => {
  const pedacos = [
    '\x1b[2K\r⠋ Thinking… ',
    'ç😀\r\n',
    LIMITE_CODEX,
    '\x1b[?1049h\x1b[H\x1b[2J',
    'Not logged in\r\n',
    '',
    'fim',
  ]
  const entregar = (manager, fakePty) => {
    const recebidos = []
    manager.spawn('canvas:bytes', { command: 'codex', onData: (data) => recebidos.push(data) })
    for (const pedaco of pedacos) fakePty.emitData(pedaco)
    manager.killAll({ force: true })
    return recebidos
  }

  const semVigia = createFakePty()
  const comVigia = criarManagerComVigia()
  const esperado = entregar(
    new PtyProcessManager({ spawnPty: semVigia.spawnPty, platform: fakePosixPlatform, discoverAgentSession: () => null }),
    semVigia.fakePty,
  )
  const obtido = entregar(comVigia.manager, comVigia.fakePty)

  assert.deepEqual(obtido, pedacos)
  assert.deepEqual(obtido, esperado)
})

test('vigia: o replay do attach não realimenta a vigia', () => {
  const { manager, fakePty, detections, timers, fireTimers } = criarManagerComVigia()
  try {
    manager.spawn('canvas:replay', { command: 'codex' })
    fakePty.emitData(LIMITE_CODEX)
    fireTimers()
    assert.equal(detections.length, 1)
    const armados = timers.length

    let replay = ''
    manager.spawn('canvas:replay', { command: 'codex', reuseExisting: true, onData: (data) => { replay += data } })
    assert.equal(replay, LIMITE_CODEX)
    assert.equal(timers.length, armados, 'o replay armou a vigia')
    fireTimers()
    assert.equal(detections.length, 1)
  } finally {
    manager.killAll({ force: true })
  }
})

test('vigia: a saída do processo varre na hora a última mensagem e desliga a vigia; o kill forçado só desliga', () => {
  const { manager, fakePty, detections, timers } = criarManagerComVigia()
  manager.spawn('canvas:sai', { command: 'codex' })
  fakePty.emitData('Not logged in\r\n')
  assert.equal(timers.filter((timer) => timer.active).length, 1)

  fakePty.emitExit({ exitCode: 1 })

  assert.equal(detections.length, 1, 'a última mensagem se perdeu na saída')
  assert.equal(detections[0].failure.failureClass, 'auth')
  assert.equal(timers.filter((timer) => timer.active).length, 0, 'timer ficou armado depois da saída')
  manager.killAll({ force: true })

  const outro = criarManagerComVigia()
  outro.manager.spawn('canvas:morto', { command: 'codex' })
  outro.fakePty.emitData(LIMITE_CODEX)
  outro.manager.kill('canvas:morto', { force: true })
  assert.equal(outro.timers.filter((timer) => timer.active).length, 0)
  assert.deepEqual(outro.detections, [])
})

test('vigia: falha dentro da vigia ou do consumidor não derruba o terminal nem a entrega', () => {
  const { spawnPty, fakePty } = createFakePty()
  const recebidos = []
  const manager = new PtyProcessManager({
    spawnPty,
    platform: fakePosixPlatform,
    discoverAgentSession: () => null,
    createOutputWatcher: () => ({
      push() {
        throw new Error('vigia quebrada')
      },
      flush() {
        throw new Error('vigia quebrada')
      },
      dispose() {
        throw new Error('vigia quebrada')
      },
    }),
    onOutputFailure: () => {},
  })
  manager.spawn('canvas:robusto', { command: 'claude', onData: (data) => recebidos.push(data) })

  assert.doesNotThrow(() => fakePty.emitData('a'))
  assert.doesNotThrow(() => fakePty.emitData('b'))
  assert.doesNotThrow(() => fakePty.emitExit({ exitCode: 0 }))
  assert.deepEqual(recebidos, ['a', 'b'])
  manager.killAll({ force: true })
})

test('a lista de sessões vivas expõe a última saída e a linhagem; o modo muda só em sessão viva com conta', () => {
  const { fakePty, spawnPty } = createFakePty()
  let clock = 1_000
  const manager = new PtyProcessManager({ spawnPty, platform: fakePosixPlatform, now: () => clock })

  try {
    manager.spawn('canvas:conta', { command: 'codex', accountId: 'conta-a', providerId: 'codex' })
    manager.spawn('canvas:sistema', { command: 'codex' })
    const antes = new Map(manager.listarSessoesVivas().map((sessao) => [sessao.sessionId, sessao]))
    // Sem saída ainda: a cadeia nunca bloqueia por uma origem que não imprimiu nada.
    assert.equal(antes.get('canvas:conta').lastOutputAt, null)
    assert.equal(antes.get('canvas:conta').lineageId, null)

    clock = 5_000
    fakePty.emitData('trabalhando\r\n')
    const depois = new Map(manager.listarSessoesVivas().map((sessao) => [sessao.sessionId, sessao]))
    assert.equal(depois.get('canvas:conta').lastOutputAt, 5_000)

    assert.equal(manager.setAccountMode('canvas:conta', 'chain'), true)
    assert.equal(manager.listarSessoesVivas().find((s) => s.sessionId === 'canvas:conta').accountMode, 'chain')
    assert.equal(manager.setAccountMode('canvas:conta', 'pinned'), true)
    // Login do sistema não entra na cadeia; modo fora do contrato e sessão inexistente são recusados.
    assert.equal(manager.setAccountMode('canvas:sistema', 'chain'), false)
    assert.equal(manager.setAccountMode('canvas:conta', 'automatica'), false)
    assert.equal(manager.setAccountMode('canvas:nenhuma', 'pinned'), false)
  } finally {
    manager.killAll({ force: true })
  }
})

test('a linhagem da cadeia fica na sessão só com conta própria e sai na lista de sessões vivas', () => {
  const { spawnPty } = createFakePty()
  const manager = new PtyProcessManager({ spawnPty, platform: fakePosixPlatform })

  try {
    manager.spawn('canvas:continuacao', { command: 'codex', accountId: 'conta-b', providerId: 'codex', accountMode: 'chain', lineageId: 'linhagem-1' })
    manager.spawn('canvas:sistema', { command: 'codex', lineageId: 'linhagem-2' })
    const porId = new Map(manager.listarSessoesVivas().map((sessao) => [sessao.sessionId, sessao]))
    assert.equal(porId.get('canvas:continuacao').lineageId, 'linhagem-1')
    assert.equal(porId.get('canvas:sistema').lineageId, null)
  } finally {
    manager.killAll({ force: true })
  }
})

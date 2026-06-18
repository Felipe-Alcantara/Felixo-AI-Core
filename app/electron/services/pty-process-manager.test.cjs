const test = require('node:test')
const assert = require('node:assert/strict')
const {
  PtyProcessManager,
  DEFAULT_COLS,
  DEFAULT_ROWS,
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

test('spawn honors an explicit command, args and dimensions', () => {
  const { calls, spawnPty } = createFakePty()
  const manager = new PtyProcessManager({ spawnPty })

  manager.spawn('term-2', {
    command: 'claude',
    args: ['--print'],
    cols: 120,
    rows: 40,
  })

  assert.equal(calls[0].file, 'claude')
  assert.deepEqual(calls[0].args, ['--print'])
  assert.equal(calls[0].options.cols, 120)
  assert.equal(calls[0].options.rows, 40)
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

test('killAll terminates every tracked session', () => {
  const { spawnPty } = createFakePty()
  const manager = new PtyProcessManager({ spawnPty })

  manager.spawn('a', {})
  manager.spawn('b', {})
  manager.killAll({ force: true })

  assert.equal(manager.has('a'), false)
  assert.equal(manager.has('b'), false)
})

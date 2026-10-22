const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const { answerConsoleListLocally, createNodePtySpawn } = require('./node-pty-windows-kill.cjs')

/** A session shaped like node-pty's `WindowsTerminal`, with a recording helper. */
function createFakeSession({ innerPid = 4321, pid = innerPid } = {}) {
  const exitListeners = []
  const originalHelper = () => Promise.reject(new Error('the forking helper must not run'))
  const session = {
    pid,
    _agent: { innerPid, _getConsoleProcessList: originalHelper },
    onExit(listener) {
      exitListeners.push(listener)
    },
    emitExit() {
      exitListeners.forEach((listener) => listener({ exitCode: 0 }))
    },
  }
  return { session, originalHelper }
}

test('answers the console list with the shell pid while the session is alive', async () => {
  const { session } = createFakeSession({ innerPid: 4321 })

  assert.equal(answerConsoleListLocally(session, { platformName: 'win32' }), true)
  assert.deepEqual(await session._agent._getConsoleProcessList(), [4321])
})

test('answers nothing once the session has exited, so a reused pid is never killed', async () => {
  const { session } = createFakeSession({ innerPid: 4321 })
  answerConsoleListLocally(session, { platformName: 'win32' })

  session.emitExit()

  assert.deepEqual(await session._agent._getConsoleProcessList(), [])
})

test('reads the pid when the helper runs, not when it is installed', async () => {
  const { session } = createFakeSession({ innerPid: 0 })
  answerConsoleListLocally(session, { platformName: 'win32' })
  assert.deepEqual(await session._agent._getConsoleProcessList(), [])

  session._agent.innerPid = 777
  assert.deepEqual(await session._agent._getConsoleProcessList(), [777])
})

test('falls back to the session pid when the agent has no innerPid', async () => {
  const { session } = createFakeSession({ pid: 555 })
  delete session._agent.innerPid
  answerConsoleListLocally(session, { platformName: 'win32' })

  assert.deepEqual(await session._agent._getConsoleProcessList(), [555])
})

test('never answers with an invalid pid', async () => {
  for (const invalid of [undefined, null, 0, -1, 1.5, 'abc']) {
    const { session } = createFakeSession()
    session._agent.innerPid = invalid
    session.pid = invalid
    answerConsoleListLocally(session, { platformName: 'win32' })

    assert.deepEqual(await session._agent._getConsoleProcessList(), [], String(invalid))
  }
})

test('leaves POSIX sessions untouched', () => {
  for (const platformName of ['linux', 'darwin']) {
    const { session, originalHelper } = createFakeSession()

    assert.equal(answerConsoleListLocally(session, { platformName }), false)
    assert.equal(session._agent._getConsoleProcessList, originalHelper)
  }
})

test('reports a node-pty without the helper instead of throwing', () => {
  assert.equal(answerConsoleListLocally(undefined, { platformName: 'win32' }), false)
  assert.equal(answerConsoleListLocally({}, { platformName: 'win32' }), false)
  assert.equal(answerConsoleListLocally({ _agent: {} }, { platformName: 'win32' }), false)
  assert.equal(
    answerConsoleListLocally({ _agent: { _getConsoleProcessList: 'not a function' } }, { platformName: 'win32' }),
    false,
  )
})

test('still replaces the helper when the session has no exit event', async () => {
  const { session } = createFakeSession({ innerPid: 4321 })
  delete session.onExit

  assert.equal(answerConsoleListLocally(session, { platformName: 'win32' }), true)
  assert.deepEqual(await session._agent._getConsoleProcessList(), [4321])
})

test('createNodePtySpawn forwards the arguments and returns the very same session', () => {
  const { session } = createFakeSession()
  const calls = []
  const nodePty = {
    spawn(...args) {
      calls.push(args)
      return session
    },
  }

  const spawn = createNodePtySpawn(nodePty, { platformName: 'win32' })
  const result = spawn('cmd.exe', ['/d'], { cols: 80 })

  assert.equal(result, session)
  assert.deepEqual(calls, [['cmd.exe', ['/d'], { cols: 80 }]])
})

test('createNodePtySpawn fixes the session on Windows only', () => {
  const windows = createFakeSession()
  const posix = createFakeSession()

  createNodePtySpawn({ spawn: () => windows.session }, { platformName: 'win32' })('a', [], {})
  createNodePtySpawn({ spawn: () => posix.session }, { platformName: 'linux' })('a', [], {})

  assert.notEqual(windows.session._agent._getConsoleProcessList, windows.originalHelper)
  assert.equal(posix.session._agent._getConsoleProcessList, posix.originalHelper)
})

test('createNodePtySpawn reads nodePty.spawn on every call, so a swapped spawn is honoured', () => {
  const first = createFakeSession()
  const second = createFakeSession()
  const nodePty = { spawn: () => first.session }
  const spawn = createNodePtySpawn(nodePty, { platformName: 'win32' })

  nodePty.spawn = () => second.session

  assert.equal(spawn('a', [], {}), second.session)
})

test('every production module that loads node-pty spawns through createNodePtySpawn', () => {
  // A new call site that takes `require('node-pty').spawn` raw would bring the
  // failing helper, the stderr noise and the 5 s timer back on Windows.
  const electronRoot = path.join(__dirname, '..')
  const offenders = []

  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        if (entry.name !== '__fixtures__' && entry.name !== 'node_modules') visit(entryPath)
      } else if (entry.name.endsWith('.cjs') && !entry.name.includes('.test.')) {
        const source = fs.readFileSync(entryPath, 'utf8')
        if (/require\((['"])node-pty\1\)/.test(source) && !source.includes('createNodePtySpawn(')) {
          offenders.push(path.relative(electronRoot, entryPath))
        }
      }
    }
  }
  visit(electronRoot)

  assert.deepEqual(offenders, [])
})

test('the installed node-pty still has the helper this module replaces', () => {
  // If node-pty reshapes these internals, the replacement silently stops
  // applying and the 5 s timer plus "AttachConsole failed" come back.
  const agentSource = fs.readFileSync(require.resolve('node-pty/lib/windowsPtyAgent.js'), 'utf8')

  assert.match(agentSource, /WindowsPtyAgent\.prototype\._getConsoleProcessList = function/)
  assert.match(agentSource, /this\._getConsoleProcessList\(\)\.then\(/)
  assert.match(agentSource, /get: function \(\) \{ return this\._innerPid; \}/)

  const terminalSource = fs.readFileSync(require.resolve('node-pty/lib/windowsTerminal.js'), 'utf8')
  assert.match(terminalSource, /_this\._agent = new windowsPtyAgent_1\.WindowsPtyAgent\(/)
})

const test = require('node:test')
const assert = require('node:assert/strict')
const { CliProcessManager } = require('./cli-process-manager.cjs')

test('cli process manager keeps stdin closed by default', async () => {
  const manager = new CliProcessManager()
  const childProcess = manager.spawn('default-stdin', process.execPath, [
    '-e',
    'setTimeout(() => process.exit(0), 10)',
  ])

  assert.equal(childProcess.stdin, null)

  await onceClose(childProcess)
})

test('cli process manager opens stdin when requested', async () => {
  const manager = new CliProcessManager()
  const childProcess = manager.spawn(
    'open-stdin',
    process.execPath,
    ['-e', 'process.stdin.resume(); process.stdin.on("end", () => process.exit(0))'],
    process.cwd(),
    { openStdin: true },
  )

  assert.notEqual(childProcess.stdin, null)
  assert.equal(manager.write('open-stdin', 'hello\n'), true)
  childProcess.stdin.end()

  await onceClose(childProcess)
})

function onceClose(childProcess) {
  return new Promise((resolve, reject) => {
    childProcess.once('error', reject)
    childProcess.once('close', (code) => {
      if (code === 0) {
        resolve()
        return
      }

      reject(new Error(`Process closed with code ${code}`))
    })
  })
}

'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { startPerformanceRecovery } = require('./performance-recovery.cjs')

function profile(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-recovery-'))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  return directory
}

test('primeira abertura e encerramento normal não ativam recuperação', (t) => {
  const userData = profile(t)
  const first = startPerformanceRecovery({ userData, pid: 101, isAlive: () => false })
  assert.equal(first.needsRecovery(), false)
  first.close()
  const next = startPerformanceRecovery({ userData, pid: 102, isAlive: () => false })
  assert.equal(next.needsRecovery(), false)
  next.close()
})

test('interrupção ativa recuperação e confirmação permite encerramento limpo', (t) => {
  const userData = profile(t)
  startPerformanceRecovery({ userData, pid: 101, isAlive: () => false })
  const next = startPerformanceRecovery({ userData, pid: 102, isAlive: () => false })
  assert.equal(next.needsRecovery(), true)
  next.acknowledge()
  assert.equal(next.needsRecovery(), false)
  next.close()
  const after = startPerformanceRecovery({ userData, pid: 103, isAlive: () => false })
  assert.equal(after.needsRecovery(), false)
  after.close()
})

test('falha do renderer e recuperação não confirmada sobrevivem ao encerramento', (t) => {
  const userData = profile(t)
  const first = startPerformanceRecovery({ userData, pid: 101, isAlive: () => false })
  first.rendererCrashed()
  first.close()
  const next = startPerformanceRecovery({ userData, pid: 102, isAlive: () => false })
  assert.equal(next.needsRecovery(), true)
  next.close()
  const after = startPerformanceRecovery({ userData, pid: 103, isAlive: () => false })
  assert.equal(after.needsRecovery(), true)
  after.acknowledge()
  after.close()
})

test('outra instância viva não é confundida com uma interrupção', (t) => {
  const userData = profile(t)
  const first = startPerformanceRecovery({ userData, pid: 101, isAlive: () => true })
  const second = startPerformanceRecovery({ userData, pid: 102, isAlive: (pid) => pid === 101 })
  assert.equal(second.needsRecovery(), false)
  second.close()
  first.close()
})

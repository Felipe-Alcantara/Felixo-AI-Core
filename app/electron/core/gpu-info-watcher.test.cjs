'use strict'

const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const test = require('node:test')

const { createGpuInfoWatcher } = require('./gpu-info-watcher.cjs')

test('espera o gpu-info-update e resolve todos os que aguardam', async () => {
  const app = new EventEmitter()
  const watcher = createGpuInfoWatcher(app)
  assert.equal(watcher.isReady(), false)

  const first = watcher.wait(1_000)
  const second = watcher.wait(1_000)
  app.emit('gpu-info-update')

  assert.deepEqual(await Promise.all([first, second]), [true, true])
  assert.equal(watcher.isReady(), true)
  // Depois do primeiro evento, quem chega já sai pronto.
  assert.equal(await watcher.wait(1), true)
})

test('sem o evento dentro do prazo, devolve false', async () => {
  const watcher = createGpuInfoWatcher(new EventEmitter())
  assert.equal(await watcher.wait(10), false)
  assert.equal(watcher.isReady(), false)
})

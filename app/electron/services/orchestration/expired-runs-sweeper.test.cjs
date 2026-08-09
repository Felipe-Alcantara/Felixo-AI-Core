const test = require('node:test')
const assert = require('node:assert/strict')
const { startExpiredRunsSweeper } = require('./expired-runs-sweeper.cjs')

/** Timer falso, para não depender de tempo real no teste. */
function createFakeTimers() {
  let nextId = 1
  const active = new Map()

  return {
    active,
    setInterval(fn, ms) {
      const id = nextId++
      active.set(id, { fn, ms })
      // Espelha o objeto Timeout do Node, que expõe unref().
      return { id, unref: () => {}, __fake: true }
    },
    clearInterval(handle) {
      active.delete(handle?.id)
    },
    tick() {
      for (const { fn } of [...active.values()]) fn()
    },
  }
}

test('varre os runs expirados periodicamente', () => {
  const timers = createFakeTimers()
  let varreduras = 0

  startExpiredRunsSweeper({
    failExpiredRuns: () => {
      varreduras += 1
    },
    setInterval: timers.setInterval,
    clearInterval: timers.clearInterval,
  })

  assert.equal(varreduras, 0, 'não deve varrer antes do primeiro intervalo')
  timers.tick()
  timers.tick()
  assert.equal(varreduras, 2)
})

test('não impede o processo de encerrar (unref)', () => {
  // Sem unref(), um intervalo vivo segura o event loop e o app não fecha.
  let unrefChamado = false
  startExpiredRunsSweeper({
    failExpiredRuns: () => {},
    setInterval: () => ({ unref: () => { unrefChamado = true } }),
    clearInterval: () => {},
  })

  assert.equal(unrefChamado, true)
})

test('stop() cancela a varredura', () => {
  const timers = createFakeTimers()
  let varreduras = 0

  const stop = startExpiredRunsSweeper({
    failExpiredRuns: () => {
      varreduras += 1
    },
    setInterval: timers.setInterval,
    clearInterval: timers.clearInterval,
  })

  timers.tick()
  stop()
  timers.tick()

  assert.equal(varreduras, 1, 'nada deve rodar depois do stop')
  assert.equal(timers.active.size, 0, 'o intervalo deveria ter sido limpo')
})

test('stop() é idempotente', () => {
  const timers = createFakeTimers()
  const stop = startExpiredRunsSweeper({
    failExpiredRuns: () => {},
    setInterval: timers.setInterval,
    clearInterval: timers.clearInterval,
  })

  stop()
  assert.doesNotThrow(() => stop())
})

test('um erro numa varredura não derruba a próxima', () => {
  // A varredura roda solta num timer: se uma exceção escapasse, viraria um
  // unhandled error no processo principal e as varreduras seguintes ainda
  // precisam acontecer.
  const timers = createFakeTimers()
  const erros = []
  let varreduras = 0

  startExpiredRunsSweeper({
    failExpiredRuns: () => {
      varreduras += 1
      if (varreduras === 1) throw new Error('falha na primeira varredura')
    },
    onError: (error) => erros.push(error.message),
    setInterval: timers.setInterval,
    clearInterval: timers.clearInterval,
  })

  assert.doesNotThrow(() => timers.tick())
  timers.tick()

  assert.equal(varreduras, 2)
  assert.deepEqual(erros, ['falha na primeira varredura'])
})

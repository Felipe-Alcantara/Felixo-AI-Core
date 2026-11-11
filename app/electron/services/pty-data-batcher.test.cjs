'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { createPtyDataBatcher } = require('./pty-data-batcher.cjs')

/** Relógio e timers manuais: o teste decide quando o tempo passa. */
function createClock() {
  let current = 0
  const timers = []
  return {
    now: () => current,
    setTimer: (fn, ms) => {
      const timer = { at: current + ms, fn, cancelled: false }
      timers.push(timer)
      return timer
    },
    clearTimer: (timer) => {
      timer.cancelled = true
    },
    advance(ms) {
      current += ms
      for (;;) {
        const due = timers
          .filter((timer) => !timer.cancelled && timer.at <= current)
          .sort((a, b) => a.at - b.at)[0]
        if (!due) break
        due.cancelled = true
        due.fn()
      }
    },
  }
}

function setup(options = {}) {
  const clock = createClock()
  const messages = []
  const batcher = createPtyDataBatcher({
    send: (batch) => messages.push(batch),
    now: clock.now,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    ...options,
  })
  return { clock, messages, batcher }
}

/** PRNG com semente (mulberry32): a sequência aleatória se repete igual em toda rodada. */
function seeded(seed) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

test('os pedaços da janela saem numa mensagem só, com cada sessão concatenada na ordem', () => {
  const { clock, messages, batcher } = setup()
  batcher.push('a', 'a1')
  batcher.push('b', 'b1')
  batcher.push('a', 'a2')
  assert.equal(messages.length, 0)

  clock.advance(8)
  assert.deepEqual(messages, [[{ sessionId: 'a', data: 'a1a2' }, { sessionId: 'b', data: 'b1' }]])
})

test('a sessão que passa do teto sai na hora, sem esperar a janela', () => {
  const { messages, batcher } = setup({ maxChars: 5 })
  batcher.push('a', 'abc')
  batcher.push('a', 'def')
  assert.deepEqual(messages, [[{ sessionId: 'a', data: 'abcdef' }]])
})

test('depois de uma entrada, o eco sai na hora e o que esperava sai antes dele', () => {
  const { clock, messages, batcher } = setup()
  batcher.push('a', 'antes|')
  batcher.noteInput('a')
  assert.deepEqual(messages, [[{ sessionId: 'a', data: 'antes|' }]])

  batcher.push('a', 'eco')
  assert.deepEqual(messages.at(-1), [{ sessionId: 'a', data: 'eco' }])

  // Passada a janela do eco, a sessão volta a agrupar.
  clock.advance(101)
  batcher.push('a', 'depois')
  assert.equal(messages.length, 2)
  clock.advance(8)
  assert.deepEqual(messages.at(-1), [{ sessionId: 'a', data: 'depois' }])
})

test('flush manda só a sessão pedida; discard joga fora sem mandar', () => {
  const { clock, messages, batcher } = setup()
  batcher.push('a', 'a1')
  batcher.push('b', 'b1')
  batcher.flush('a')
  assert.deepEqual(messages, [[{ sessionId: 'a', data: 'a1' }]])

  batcher.discard('b')
  clock.advance(50)
  assert.equal(messages.length, 1, 'o pendente descartado não sai depois')
})

test('20 terminais a 100 pedaços/s viram ~125 mensagens por segundo em vez de 2.000', () => {
  const { clock, messages, batcher } = setup()
  let chunks = 0
  for (let ms = 0; ms < 1000; ms += 10) {
    for (let session = 0; session < 20; session += 1) {
      batcher.push(`s${session}`, `pedaço ${ms}\r\n`)
      chunks += 1
    }
    clock.advance(10)
  }
  clock.advance(10)
  assert.equal(chunks, 2000)
  assert.ok(messages.length <= 130, `mensagens demais: ${messages.length}`)
  assert.equal(messages.flat().length, 2000, 'a cada 10 ms, cada sessão chega numa entrada do lote')
})

test('propriedade: nada se perde nem se reordena, e o fim de cada sessão vem depois do último dado dela', () => {
  for (let seed = 1; seed <= 200; seed += 1) {
    const random = seeded(seed)
    const { clock, messages, batcher } = setup({ maxChars: 1 + Math.floor(random() * 64) })
    const sessions = ['a', 'b', 'c', 'd']
    const pushed = Object.fromEntries(sessions.map((id) => [id, '']))
    // O "handler" de exit: grava o pendente e só então avisa o fim.
    const exitAfter = Object.fromEntries(sessions.map((id) => [id, null]))
    const exits = []
    const exit = (id) => {
      batcher.flush(id)
      exitAfter[id] = messages.length
      exits.push(id)
    }

    let counter = 0
    for (let step = 0; step < 300; step += 1) {
      const id = sessions[Math.floor(random() * sessions.length)]
      const roll = random()
      if (exitAfter[id] !== null) continue
      if (roll < 0.6) {
        const chunk = `${id}${counter++};`
        pushed[id] += chunk
        batcher.push(id, chunk)
      } else if (roll < 0.7) {
        batcher.noteInput(id)
      } else if (roll < 0.95) {
        clock.advance(Math.floor(random() * 20))
      } else {
        exit(id)
      }
    }
    for (const id of sessions) if (exitAfter[id] === null) exit(id)
    clock.advance(1000)

    for (const id of sessions) {
      const received = messages
        .flat()
        .filter((item) => item.sessionId === id)
        .map((item) => item.data)
        .join('')
      assert.equal(received, pushed[id], `semente ${seed}, sessão ${id}: saída perdida ou fora de ordem`)
      const afterExit = messages.slice(exitAfter[id]).flat().filter((item) => item.sessionId === id)
      assert.deepEqual(afterExit, [], `semente ${seed}, sessão ${id}: dado depois do fim`)
    }
    for (const batch of messages) {
      const ids = batch.map((item) => item.sessionId)
      assert.equal(new Set(ids).size, ids.length, `semente ${seed}: sessão repetida no mesmo lote`)
    }
    assert.equal(exits.length, sessions.length)
  }
})

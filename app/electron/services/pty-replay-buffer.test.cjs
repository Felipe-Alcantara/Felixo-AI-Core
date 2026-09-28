'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { performance } = require('node:perf_hooks')
const { createReplayBuffer } = require('./pty-replay-buffer.cjs')

/** O comportamento anterior do pty-process-manager, usado como oráculo. */
function oraculo(chunks, limit) {
  let buffer = ''
  for (const chunk of chunks) {
    buffer = `${buffer}${String(chunk)}`.slice(-limit)
  }
  return buffer
}

/** Gerador determinístico para os casos aleatórios serem reproduzíveis. */
function criarAleatorio(seed) {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 2 ** 32
  }
}

const ALFABETO = ['a', 'Z', '\r\n', '\x1b[2K', '⠋', 'ç', '😀', '\x1b[?1049h', ' ', '\n']

function pedacoAleatorio(random, maxLength) {
  const length = Math.floor(random() * maxLength)
  let text = ''
  for (let index = 0; index < length; index += 1) {
    text += ALFABETO[Math.floor(random() * ALFABETO.length)]
  }
  return text
}

test('guarda exatamente a mesma cauda que o concat+slice antigo, em sequências aleatórias', () => {
  for (let seed = 1; seed <= 200; seed += 1) {
    const random = criarAleatorio(seed)
    const limit = 1 + Math.floor(random() * 300)
    const chunks = Array.from({ length: Math.floor(random() * 120) }, () =>
      pedacoAleatorio(random, Math.floor(random() * 3) === 0 ? limit * 2 : 40),
    )
    const buffer = createReplayBuffer(limit)
    chunks.forEach((chunk, index) => {
      buffer.append(chunk)
      // Ler no meio do fluxo (compacta a lista) não pode mudar o resultado final.
      if (index % 17 === 0) buffer.toString()
    })

    assert.equal(buffer.toString(), oraculo(chunks, limit), `seed ${seed}, limite ${limit}`)
  }
})

test('um pedaço maior que o limite sozinho vira só a cauda dele', () => {
  const buffer = createReplayBuffer(10)
  buffer.append('0123456789ABCDEFGHIJ')

  assert.equal(buffer.toString(), 'ABCDEFGHIJ')
  assert.equal(buffer.length, 10)
})

test('vazio, nulo e limite zero não guardam nada nem lançam', () => {
  const buffer = createReplayBuffer(5)
  buffer.append('')
  buffer.append(null)
  buffer.append(undefined)
  assert.equal(buffer.toString(), '')
  assert.equal(buffer.length, 0)

  const semLimite = createReplayBuffer(0)
  semLimite.append('qualquer coisa')
  assert.equal(semLimite.toString(), '')
})

test('ler duas vezes sem saída nova devolve o mesmo texto', () => {
  const buffer = createReplayBuffer(8)
  buffer.append('abc')
  buffer.append('defgh')
  buffer.append('ij')

  const first = buffer.toString()
  assert.equal(first, 'cdefghij')
  assert.equal(buffer.toString(), first)
  assert.equal(buffer.length, 8)
})

test('com o buffer cheio, cada pedaço custa uma inserção, não uma cópia da cauda inteira', () => {
  // A versão antiga levava de 90 a 190 µs por pedaço nesta situação (200.000
  // caracteres retidos) — 20.000 pedaços passavam de 1,8 s. O teto abaixo deixa
  // folga de centenas de vezes para a versão nova e continua reprovando a antiga
  // mesmo numa máquina de CI rápida.
  const limit = 200_000
  const buffer = createReplayBuffer(limit)
  buffer.append('y'.repeat(limit))
  const chunk = '\x1b[2K\r⠋ Thinking… (12s · esc to interrupt) '.padEnd(100, 'x')

  const startedAt = performance.now()
  for (let index = 0; index < 20_000; index += 1) {
    buffer.append(chunk)
  }
  const elapsedMs = performance.now() - startedAt

  assert.ok(elapsedMs < 400, `20.000 pedaços levaram ${elapsedMs.toFixed(1)} ms`)
  assert.equal(buffer.toString().length, limit)
  assert.ok(buffer.toString().endsWith(chunk))
})

test('tail(n) devolve o mesmo que toString().slice(-n), em fluxos aleatórios', () => {
  for (let seed = 1; seed <= 200; seed += 1) {
    const random = criarAleatorio(seed * 7919)
    const limit = 1 + Math.floor(random() * 300)
    const chunks = Array.from({ length: Math.floor(random() * 120) }, () =>
      pedacoAleatorio(random, Math.floor(random() * 3) === 0 ? limit * 2 : 40),
    )
    const buffer = createReplayBuffer(limit)
    const esperado = oraculo(chunks, limit)
    chunks.forEach((chunk) => buffer.append(chunk))

    for (const count of [1, 5, Math.floor(limit / 2), limit - 1, limit, limit + 50, esperado.length]) {
      const n = Math.max(0, count)
      assert.equal(buffer.tail(n), n === 0 ? '' : esperado.slice(-n), `seed ${seed}, limite ${limit}, n ${n}`)
    }
  }
})

test('tail não compacta nem muda o estado: length e o próximo toString() ficam iguais', () => {
  for (let seed = 1; seed <= 200; seed += 1) {
    const random = criarAleatorio(seed * 104729)
    const limit = 1 + Math.floor(random() * 300)
    const chunks = Array.from({ length: Math.floor(random() * 120) }, () => pedacoAleatorio(random, 60))
    // Dois buffers com a mesma entrada; só um deles é lido pela cauda, no
    // meio do fluxo e no fim. Qualquer efeito colateral apareceria na
    // comparação com o gêmeo que nunca foi lido.
    const lido = createReplayBuffer(limit)
    const gemeo = createReplayBuffer(limit)
    chunks.forEach((chunk, index) => {
      lido.append(chunk)
      gemeo.append(chunk)
      if (index % 5 === 0) {
        const antes = lido.length
        lido.tail(1 + Math.floor(random() * limit))
        assert.equal(lido.length, antes, `seed ${seed}: tail mudou o length`)
      }
    })

    lido.tail(limit)
    assert.equal(lido.length, gemeo.length, `seed ${seed}`)
    assert.equal(lido.toString(), gemeo.toString(), `seed ${seed}`)
    assert.equal(lido.toString(), oraculo(chunks, limit), `seed ${seed}`)
  }
})

test('tail com zero, negativo, inválido ou maior que o limite não lança', () => {
  const buffer = createReplayBuffer(6)
  assert.equal(buffer.tail(3), '')
  buffer.append('abc')
  buffer.append('defgh')

  assert.equal(buffer.tail(0), '')
  assert.equal(buffer.tail(-4), '')
  assert.equal(buffer.tail(Number.NaN), '')
  assert.equal(buffer.tail(undefined), '')
  assert.equal(buffer.tail(2.9), 'gh')
  assert.equal(buffer.tail(1_000), 'cdefgh')
  assert.equal(buffer.tail(Number.POSITIVE_INFINITY), 'cdefgh')
})

test('ler a cauda curta com o buffer cheio só junta os pedaços do fim', () => {
  // Cauda de 4 KiB sobre 200.000 caracteres retidos em pedaços de 100: juntar
  // tudo (o toString) custaria a cópia inteira a cada varredura da vigia.
  const limit = 200_000
  const buffer = createReplayBuffer(limit)
  const chunk = '\x1b[2K\r⠋ Thinking… (12s · esc to interrupt) '.padEnd(100, 'x')
  for (let index = 0; index < limit / 100 + 10; index += 1) buffer.append(chunk)

  const startedAt = performance.now()
  let last = ''
  for (let index = 0; index < 5_000; index += 1) last = buffer.tail(4096)
  const elapsedMs = performance.now() - startedAt

  assert.equal(last, buffer.toString().slice(-4096))
  assert.ok(elapsedMs < 1_000, `5.000 leituras de 4 KiB levaram ${elapsedMs.toFixed(1)} ms`)
})

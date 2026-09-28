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

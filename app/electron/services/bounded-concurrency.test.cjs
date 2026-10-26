'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { mapWithConcurrency } = require('./bounded-concurrency.cjs')

const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

test('nunca passa do limite e devolve os resultados na ordem dos itens', async () => {
  let emAndamento = 0
  let pico = 0
  const itens = Array.from({ length: 30 }, (_, i) => i)

  const resultado = await mapWithConcurrency(itens, 4, async (item) => {
    emAndamento += 1
    pico = Math.max(pico, emAndamento)
    // Os itens pares demoram mais: a ordem de término difere da ordem de entrada.
    await esperar(item % 2 === 0 ? 8 : 1)
    emAndamento -= 1
    return item * 10
  })

  assert.equal(pico, 4)
  assert.deepEqual(resultado, itens.map((item) => item * 10))
})

test('limite maior que a lista e lista vazia não travam nem criam vias a mais', async () => {
  assert.deepEqual(await mapWithConcurrency([], 4, async () => 1), [])

  let pico = 0
  let emAndamento = 0
  const resultado = await mapWithConcurrency(['a', 'b'], 10, async (item) => {
    emAndamento += 1
    pico = Math.max(pico, emAndamento)
    await esperar(2)
    emAndamento -= 1
    return item
  })
  assert.deepEqual(resultado, ['a', 'b'])
  assert.equal(pico, 2)
})

test('uma rejeição interrompe a fila: nenhum item novo começa depois dela', async () => {
  const iniciados = []

  await assert.rejects(
    mapWithConcurrency([1, 2, 3, 4, 5, 6, 7, 8], 2, async (item) => {
      iniciados.push(item)
      await esperar(2)
      if (item === 2) throw new Error('falhou o 2')
      return item
    }),
    /falhou o 2/,
  )

  await esperar(30)
  // Duas vias: 1 e 2 começam juntos; o 3 entra quando o 1 termina, antes de o 2
  // falhar. Depois da falha ninguém mais começa.
  assert.ok(iniciados.length <= 4, `começaram ${iniciados.length} itens: ${iniciados}`)
  assert.ok(!iniciados.includes(8))
})

test('limite inválido é recusado em vez de rodar sem teto', async () => {
  for (const limite of [0, -1, 1.5, Number.NaN, '4', undefined, Infinity]) {
    await assert.rejects(mapWithConcurrency([1], limite, async () => 1), TypeError)
  }
})

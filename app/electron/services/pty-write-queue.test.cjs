'use strict'

const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  LIMITE_DE_ESCRITA_DIRETA,
  criarFilaDeEscrita,
  dividirEmBlocos,
  precisaFatiar,
} = require('./pty-write-queue.cjs')

/** Fila com espera instantânea: o teste não deve pagar a pausa real. */
function criarFila(extra = {}) {
  const escritas = []
  const fila = criarFilaDeEscrita({
    escrever: (dados) => escritas.push(dados),
    esperar: () => Promise.resolve(),
    ...extra,
  })
  return { fila, escritas }
}

const grande = (tamanho) => 'a'.repeat(tamanho)

// ------------------------------------------------------------ fatiamento

test('texto pequeno vira um bloco só', () => {
  assert.deepEqual(dividirEmBlocos('oi', 512), ['oi'])
})

test('texto vazio não gera bloco', () => {
  assert.deepEqual(dividirEmBlocos('', 512), [])
})

test('divide em blocos do tamanho pedido', () => {
  assert.deepEqual(dividirEmBlocos('abcdefg', 3), ['abc', 'def', 'g'])
})

test('NAO parte par surrogate ao meio', () => {
  // Cortar um emoji pela metade produz dois caracteres inválidos — e o prompt
  // inicial do canvas tem emoji e acento.
  const texto = '👍👍👍'

  const blocos = dividirEmBlocos(texto, 1)

  assert.deepEqual(blocos, ['👍', '👍', '👍'])
  assert.equal(blocos.join(''), texto)
})

test('acento e emoji sobrevivem ao ida e volta', () => {
  const texto = 'Padrão de qualidade — não quebre 🔥 nada'

  assert.equal(dividirEmBlocos(texto, 4).join(''), texto)
})

test('tamanho inválido cai no padrão em vez de travar', () => {
  assert.deepEqual(dividirEmBlocos('abc', 0), ['abc'])
  assert.deepEqual(dividirEmBlocos('abc', Number.NaN), ['abc'])
})

test('só fatia acima do limite', () => {
  assert.equal(precisaFatiar('a'), false)
  assert.equal(precisaFatiar(grande(LIMITE_DE_ESCRITA_DIRETA)), false)
  assert.equal(precisaFatiar(grande(LIMITE_DE_ESCRITA_DIRETA + 1)), true)
})

// ------------------------------------------------------------------ fila

test('tecla solta vai direto, sem fila e sem atraso', () => {
  const { fila, escritas } = criarFila()

  assert.equal(fila.enfileirar('x'), true)

  assert.deepEqual(escritas, ['x'])
  assert.equal(fila.pendentes, 0)
})

test('carga grande sai fatiada e completa', async () => {
  const { fila, escritas } = criarFila({ tamanhoDoBloco: 100 })
  const texto = grande(1024 + 250)

  fila.enfileirar(texto)
  await new Promise((resolve) => setImmediate(resolve))

  assert.ok(escritas.length > 1, 'deveria ter fatiado')
  assert.equal(escritas.join(''), texto, 'nenhum pedaço pode se perder')
})

test('ORDEM preservada: o Enter não ultrapassa o texto que ainda sai', async () => {
  // O prompt inicial é escrito e logo depois o Enter. Um Enter que passasse na
  // frente submeteria o prompt pela metade — falha pior que não entregar.
  const { fila, escritas } = criarFila({ tamanhoDoBloco: 10 })

  fila.enfileirar(grande(1500))
  fila.enfileirar('\r')
  await new Promise((resolve) => setImmediate(resolve))

  assert.equal(escritas.at(-1), '\r')
  assert.equal(escritas.join(''), `${grande(1500)}\r`)
})

test('tecla digitada durante uma carga grande respeita a fila', async () => {
  const { fila, escritas } = criarFila({ tamanhoDoBloco: 10 })

  fila.enfileirar(grande(1500))
  fila.enfileirar('x')
  await new Promise((resolve) => setImmediate(resolve))

  assert.equal(escritas.at(-1), 'x')
})

test('sessão encerrada no meio interrompe a entrega', async () => {
  let viva = true
  const escritas = []
  const fila = criarFilaDeEscrita({
    escrever: (dados) => {
      escritas.push(dados)
      viva = false // morre logo no primeiro bloco
    },
    ativa: () => viva,
    esperar: () => Promise.resolve(),
    tamanhoDoBloco: 10,
  })

  fila.enfileirar(grande(1500))
  await new Promise((resolve) => setImmediate(resolve))

  assert.equal(escritas.length, 1)
  assert.equal(fila.pendentes, 0)
})

test('descartar limpa o que ainda não saiu', async () => {
  const { fila } = criarFila({ tamanhoDoBloco: 10 })

  fila.enfileirar(grande(5000))
  fila.descartar()
  await new Promise((resolve) => setImmediate(resolve))

  assert.equal(fila.pendentes, 0)
  assert.equal(fila.enfileirar('x'), false, 'fila descartada não aceita mais')
})

test('carga vazia é recusada em vez de virar escrita inútil', () => {
  const { fila, escritas } = criarFila()

  assert.equal(fila.enfileirar(''), false)
  assert.equal(fila.enfileirar(null), false)
  assert.deepEqual(escritas, [])
})

test('duas cargas grandes seguidas saem inteiras e na ordem', async () => {
  const { fila, escritas } = criarFila({ tamanhoDoBloco: 64 })
  const primeira = 'A'.repeat(2000)
  const segunda = 'B'.repeat(2000)

  fila.enfileirar(primeira)
  fila.enfileirar(segunda)
  await new Promise((resolve) => setImmediate(resolve))

  assert.equal(escritas.join(''), primeira + segunda)
})

test('prompt inicial realista chega inteiro', async () => {
  // O caso do bug: prompt de contexto com acento, emoji e milhares de chars.
  const { fila, escritas } = criarFila()
  const prompt = `Antes de qualquer tarefa: siga o PADRÃO DE QUALIDADE 🔥\n${'contexto '.repeat(1200)}`

  fila.enfileirar(prompt)
  await new Promise((resolve) => setImmediate(resolve))

  assert.equal(escritas.join(''), prompt)
  assert.ok(escritas.length > 10, 'texto desse tamanho tem que sair fatiado')
})

test('aguardar resolve so depois que tudo saiu', async () => {
  const { fila, escritas } = criarFila({ tamanhoDoBloco: 10 })
  const texto = grande(2000)

  fila.enfileirar(texto)
  await fila.aguardar()

  assert.equal(escritas.join(''), texto, 'aguardar retornou antes do fim')
  assert.equal(fila.pendentes, 0)
})

test('aguardar com a fila parada resolve na hora', async () => {
  const { fila } = criarFila()

  await fila.aguardar()

  assert.equal(fila.pendentes, 0)
})

test('descartar libera quem estava aguardando, em vez de pendurar', async () => {
  // Sessão morta com alguém esperando o dreno travaria o await para sempre.
  const { fila } = criarFila({ tamanhoDoBloco: 10 })
  fila.enfileirar(grande(5000))

  const espera = fila.aguardar()
  fila.descartar()

  await espera
  assert.equal(fila.pendentes, 0)
})

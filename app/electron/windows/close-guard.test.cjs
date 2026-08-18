'use strict'

/**
 * A guarda tem duas maneiras de falhar, e as duas são ruins de jeitos opostos:
 *
 * - perguntar quando não há nada rodando → a pessoa aprende a clicar no
 *   automático, e a pergunta perde o valor justamente quando importa;
 * - deixar passar quando há agente rodando → o trabalho some sem aviso, que é
 *   exatamente o incidente que originou tudo isto.
 *
 * Uma janela falsa basta: o que precisa ser verificável é a DECISÃO, e ela foi
 * separada do Electron de propósito.
 */

const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  INDICE_CANCELAR,
  INDICE_FECHAR,
  decidirFechamento,
  montarPergunta,
  registrarGuardaDeFechamento,
} = require('./close-guard.cjs')

/** Janela falsa que registra listeners e sabe disparar o evento `close`. */
function criarJanelaFalsa() {
  const listeners = new Map()

  return {
    fechamentos: 0,
    on(evento, fn) {
      listeners.set(evento, [...(listeners.get(evento) ?? []), fn])
    },
    removeListener(evento, fn) {
      listeners.set(evento, (listeners.get(evento) ?? []).filter((f) => f !== fn))
    },
    close() {
      this.fechamentos += 1
      return this.disparar()
    },
    /** Simula o evento `close` do Electron e devolve se foi impedido. */
    disparar() {
      let impedido = false
      const evento = { preventDefault: () => { impedido = true } }

      for (const fn of listeners.get('close') ?? []) {
        fn(evento)
      }

      return impedido
    },
  }
}

test('sem sessão viva, fecha direto', () => {
  assert.equal(decidirFechamento({ sessoesVivas: 0 }), 'fechar')
})

test('com sessão viva, pergunta', () => {
  assert.equal(decidirFechamento({ sessoesVivas: 1 }), 'perguntar')
  assert.equal(decidirFechamento({ sessoesVivas: 7 }), 'perguntar')
})

test('já confirmado fecha mesmo com sessão viva', () => {
  // Sem isto a guarda perguntaria de novo sobre a resposta recém-dada.
  assert.equal(decidirFechamento({ sessoesVivas: 3, jaConfirmado: true }), 'fechar')
})

test('a pergunta diz QUANTOS terminais morrem', () => {
  assert.match(montarPergunta(1).mensagem, /1 terminal ativo/)
  assert.match(montarPergunta(4).mensagem, /4 terminais ativos/)
  assert.equal(montarPergunta(2).botoes.length, 2)
})

test('janela sem terminal fecha sem diálogo nenhum', () => {
  const janela = criarJanelaFalsa()
  let perguntou = false

  registrarGuardaDeFechamento(janela, {
    contarSessoesVivas: () => 0,
    perguntar: async () => { perguntou = true; return INDICE_FECHAR },
  })

  assert.equal(janela.disparar(), false, 'o fechamento foi impedido sem motivo')
  assert.equal(perguntou, false)
})

test('com terminal vivo, o fechamento é impedido e a pergunta aparece', async () => {
  const janela = criarJanelaFalsa()
  const perguntas = []

  registrarGuardaDeFechamento(janela, {
    contarSessoesVivas: () => 2,
    perguntar: async (pergunta) => { perguntas.push(pergunta); return INDICE_CANCELAR },
  })

  assert.equal(janela.disparar(), true, 'o fechamento deveria ter sido impedido')
  await new Promise((resolve) => setImmediate(resolve))

  assert.equal(perguntas.length, 1)
  assert.match(perguntas[0].mensagem, /2 terminais ativos/)
  assert.equal(janela.fechamentos, 0, 'cancelar não pode fechar')
})

test('confirmar fecha, e a segunda passagem não pergunta de novo', async () => {
  const janela = criarJanelaFalsa()
  let vezes = 0

  registrarGuardaDeFechamento(janela, {
    contarSessoesVivas: () => 1,
    perguntar: async () => { vezes += 1; return INDICE_FECHAR },
  })

  janela.disparar()
  await new Promise((resolve) => setImmediate(resolve))

  assert.equal(janela.fechamentos, 1)
  assert.equal(vezes, 1, 'perguntou mais de uma vez para o mesmo fechamento')
})

test('fechar repetido enquanto o diálogo está aberto não empilha diálogos', async () => {
  const janela = criarJanelaFalsa()
  let vezes = 0
  let liberar

  registrarGuardaDeFechamento(janela, {
    contarSessoesVivas: () => 1,
    perguntar: () => {
      vezes += 1
      return new Promise((resolve) => { liberar = resolve })
    },
  })

  janela.disparar()
  janela.disparar()
  janela.disparar()

  assert.equal(vezes, 1)

  liberar(INDICE_CANCELAR)
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(janela.fechamentos, 0)
})

test('diálogo que falha NÃO fecha a janela', async () => {
  // Perder trabalho por causa de um erro de interface seria o pior desfecho.
  const janela = criarJanelaFalsa()

  registrarGuardaDeFechamento(janela, {
    contarSessoesVivas: () => 1,
    perguntar: async () => { throw new Error('diálogo indisponível') },
  })

  assert.equal(janela.disparar(), true)
  await new Promise((resolve) => setImmediate(resolve))

  assert.equal(janela.fechamentos, 0)
})

test('contador ausente é tratado como zero, não como erro', () => {
  const janela = criarJanelaFalsa()

  registrarGuardaDeFechamento(janela, {
    contarSessoesVivas: undefined,
    perguntar: async () => INDICE_FECHAR,
  })

  assert.equal(janela.disparar(), false)
})

test('desregistrar devolve a janela ao comportamento original', () => {
  const janela = criarJanelaFalsa()

  const desligar = registrarGuardaDeFechamento(janela, {
    contarSessoesVivas: () => 5,
    perguntar: async () => INDICE_CANCELAR,
  })

  assert.equal(janela.disparar(), true)
  desligar()
  assert.equal(janela.disparar(), false)
})

'use strict'

/**
 * Cauda da saída de um PTY que o processo principal guarda para reenviar
 * quando o renderer se reconecta (`attach` depois de reload/HMR) ou quando o
 * shell de emergência precisa mostrar por que a CLI morreu.
 *
 * O contrato é exatamente o de antes — os últimos `maxChars` caracteres do que
 * o processo emitiu —, só que sem recopiar a cauda inteira a cada pedaço.
 * A versão anterior fazia `${buffer}${pedaço}`.slice(-maxChars) em todo
 * `onData`: com o buffer cheio, cada pedaço de ~100 caracteres (um quadro de
 * spinner) obrigava o V8 a achatar uma string de 200.000 caracteres, cerca de
 * 90 a 190 µs por pedaço, por sessão, no mesmo processo que encaminha as
 * teclas para o PTY. Aqui cada pedaço custa uma inserção numa lista; a junção
 * só acontece quando alguém lê.
 */
function createReplayBuffer(maxChars) {
  const limit = Math.max(0, Math.floor(Number(maxChars) || 0))
  /** Pedaços em ordem de chegada; o primeiro pode sobrar além do limite. */
  let chunks = []
  let total = 0

  function append(text) {
    const value = String(text ?? '')
    if (!value || limit === 0) {
      return
    }

    chunks.push(value)
    total += value.length

    // Descarta pedaços inteiros do começo enquanto o que resta sem ele ainda
    // cobre o limite. O excedente dentro do primeiro pedaço fica até a leitura,
    // que corta no caractere exato — mesmo resultado do slice antigo.
    while (chunks.length > 1 && total - chunks[0].length >= limit) {
      total -= chunks[0].length
      chunks.shift()
    }
  }

  function toString() {
    if (chunks.length === 0) {
      return ''
    }

    const joined = chunks.length === 1 ? chunks[0] : chunks.join('')
    const tail = joined.length > limit ? joined.slice(-limit) : joined
    // Compacta: a próxima leitura sem saída nova não junta de novo, e o
    // próximo append continua barato (a lista volta a ter um pedaço só).
    chunks = [tail]
    total = tail.length
    return tail
  }

  /**
   * Os últimos `count` caracteres, sem compactar nem mudar o estado: é o que
   * `toString().slice(-count)` devolveria, lendo só os pedaços do fim.
   *
   * Quem lê a cauda com frequência (a vigia de falha por conta varre 4 KiB a
   * cada poucas centenas de ms) não pode pagar a junção dos 200.000
   * caracteres a cada leitura, nem trocar a lista de pedaços por baixo do
   * `append` do `onData`.
   *
   * @param {number} count
   * @returns {string}
   */
  function tail(count) {
    const wanted = Math.min(Math.max(0, Math.floor(Number(count) || 0)), limit, total)
    if (wanted === 0) {
      return ''
    }

    let start = chunks.length - 1
    let size = chunks[start].length
    while (size < wanted && start > 0) {
      start -= 1
      size += chunks[start].length
    }

    const joined = start === chunks.length - 1 ? chunks[start] : chunks.slice(start).join('')
    return joined.length > wanted ? joined.slice(-wanted) : joined
  }

  return {
    append,
    toString,
    tail,
    /** Tamanho que `toString()` devolveria agora, sem juntar os pedaços. */
    get length() {
      return Math.min(total, limit)
    },
  }
}

module.exports = {
  createReplayBuffer,
}

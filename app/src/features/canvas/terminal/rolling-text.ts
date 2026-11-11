/**
 * Os últimos `limit` caracteres de um fluxo de texto, sem recopiar a janela a
 * cada pedaço.
 *
 * As varreduras de tela de aceite faziam `(janela + pedaço).slice(-12000)` em
 * todo pedaço de saída: com a janela cheia, cada quadro de spinner obrigava a
 * achatar 12.000 caracteres. Aqui cada pedaço é só uma inserção numa lista
 * (mesma técnica de `electron/services/pty-replay-buffer.cjs`); a junção só
 * acontece quando alguém lê.
 */
export type RollingText = {
  append: (text: string) => void
  /** Exatamente o que `(antes + pedaço).slice(-limit)` daria. */
  toString: () => string
  clear: () => void
  /** Quantos caracteres a janela segura agora (no máximo `limit` + o último pedaço). */
  readonly heldChars: number
}

export function createRollingText(limit: number): RollingText {
  let chunks: string[] = []
  let total = 0

  return {
    append(text) {
      if (!text || limit <= 0) return
      chunks.push(text)
      total += text.length
      // Tira do começo só pedaços inteiros que já sobram além do limite; o
      // primeiro que restar pode passar dele, e o `toString` corta o excesso.
      let drop = 0
      while (drop < chunks.length - 1 && total - chunks[drop].length >= limit) {
        total -= chunks[drop].length
        drop += 1
      }
      if (drop > 0) chunks = chunks.slice(drop)
    },
    toString() {
      if (chunks.length === 0) return ''
      const joined = chunks.length === 1 ? chunks[0] : chunks.join('')
      const value = joined.length > limit ? joined.slice(-limit) : joined
      // Guarda a leitura JÁ CORTADA: guardar a junção inteira fazia o primeiro
      // pedaço crescer sem teto quando se lê a cada pedaço (o laço do `append`
      // só tira pedaços inteiros), e cada leitura copiava tudo de novo.
      chunks = [value]
      total = value.length
      return value
    },
    clear() {
      chunks = []
      total = 0
    },
    get heldChars() {
      return total
    },
  }
}

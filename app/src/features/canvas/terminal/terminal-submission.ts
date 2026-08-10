/**
 * Detecção de "o texto foi escrito mas não foi enviado".
 *
 * O prompt inicial (`/resume`, padrão de qualidade) é entregue em duas
 * escritas: o texto e, depois de um intervalo, o Enter. A separação existe
 * porque CLIs de tela cheia tratam um CR colado junto com o texto como quebra
 * de linha, e não como submissão.
 *
 * O intervalo fixo é um palpite: sob carga (várias CLIs subindo ao reiniciar o
 * app, máquina ocupada), o TUI ainda está redesenhando quando o Enter chega e a
 * tecla se perde — o texto fica escrito na linha de entrada, esperando. Este
 * módulo permite confirmar pelo conteúdo da tela, em vez de confiar no relógio.
 */

/**
 * Linhas de entrada de CLIs de agente: `>` (Claude), `›` (Codex) e o par
 * `$`/`#` de shells. O texto digitado aparece logo depois do marcador.
 *
 * O prefixo opcional cobre as bordas da caixa que CLIs de tela cheia desenham
 * em volta da entrada (`│ > /resume`) — sem ele, o formato do Claude Code, que
 * é justamente onde a falha foi relatada, não seria reconhecido.
 */
const PROMPT_LINE = /^[\s│┃|]*(?:[>›❯$#])\s*(.*)$/

/**
 * Normaliza para comparação: o TUI pode quebrar a linha, inserir espaços de
 * preenchimento ou um cursor de bloco no fim do texto.
 */
function normalize(text: string): string {
  return text.replace(/\s+/g, ' ').replace(/[█▏▎▍▌▋▊▉|]+$/, '').trim()
}

/**
 * Espaçamento que separa o texto digitado de uma dica do próprio TUI ("enter
 * to send", contador de caracteres): o preenchimento até a borda da caixa é
 * largo. O limiar fica acima do que uma linha reflowada produz entre palavras,
 * para não recortar a instrução do usuário no meio.
 */
const HINT_PADDING = /\s{5,}/

/**
 * Verdadeiro quando `text` ainda aparece na linha de entrada do viewport, ou
 * seja: foi digitado, mas o Enter não foi aceito.
 *
 * Depois de uma submissão bem-sucedida a CLI limpa a linha de entrada (o texto
 * pode reaparecer acima, como parte do histórico da conversa) — por isso apenas
 * a linha de prompt é inspecionada, nunca o restante da tela.
 */
export function isSubmissionPending(viewport: string, text: string): boolean {
  const expected = normalize(text)
  if (!expected) {
    return false
  }

  return viewport.split('\n').some((line) => {
    const match = PROMPT_LINE.exec(line)
    if (!match) {
      return false
    }
    // Descarta a dica que o TUI desenha ao fim da linha antes de comparar; o
    // que sobra é o que a pessoa (ou nós) digitou.
    const typed = normalize(match[1].split(HINT_PADDING)[0])

    // Igualdade, não `startsWith`: se a linha contém MAIS do que enviamos, o
    // usuário está digitando em cima dela. Reenviar Enter ali submeteria uma
    // frase inacabada que ele nunca confirmou — e um agente pode agir sobre
    // ela de forma irreversível. Na dúvida, não envia nada.
    return typed !== '' && typed === expected
  })
}

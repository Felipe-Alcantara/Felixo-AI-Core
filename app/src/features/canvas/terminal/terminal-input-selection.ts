/**
 * Selecionar, com Ctrl+A, o que a pessoa escreveu na linha de entrada.
 *
 * Num terminal não existe "selecionar tudo": `Ctrl+A` é o caractere `0x01`, que
 * em readline (e nas CLIs de agente) significa *ir para o começo da linha*. O
 * que existe é a seleção **do xterm** — a mesma que se faz com o mouse e que o
 * Ctrl+C já sabe copiar. É ela que este módulo mira: destacar o texto digitado,
 * para que ele possa ser copiado ou apagado de uma vez.
 *
 * A decisão mora aqui, longe do DOM e do PTY, para poder ser testada direto —
 * mesmo molde de `terminal-copy-shortcut.ts` e `terminal-image-paste.ts`.
 */

/**
 * Os marcadores que separam o prompt do que foi digitado.
 *
 * `❯` e `>` são a entrada do Claude Code, `›` a do Codex, `$` e `#` a de um
 * shell. Reconhecer o marcador é o que permite selecionar **só o que a pessoa
 * escreveu**, em vez de arrastar o prompt junto.
 */
const PROMPT_MARKERS = ['❯', '›', '>', '$', '#']

/** Onde começa e quanto mede o texto digitado, em colunas da linha. */
export type TypedInputRange = {
  start: number
  length: number
}

/** A entrada localizada em uma sequência curta de linhas do buffer. */
export type MultiLineTypedInputRange = {
  startLine: number
  startColumn: number
  text: string
}

/**
 * O trecho digitado na linha onde o cursor está.
 *
 * O fim é o próprio cursor — é onde a digitação parou, e não depende de
 * adivinhar onde o TUI encerra a caixa de entrada. O começo é o último marcador
 * de prompt antes dele, mais os espaços que o seguem.
 *
 * `null` quando não há marcador na linha ou quando nada foi escrito depois
 * dele: aí não há o que selecionar, e quem chama deixa o `0x01` seguir para o
 * PTY — o "ir para o começo da linha" continua valendo onde não atrapalha.
 */
export function findTypedInputRange(line: string, cursorX: number): TypedInputRange | null {
  // `line` é a linha **lógica** — as visuais já concatenadas por quem leu o
  // buffer —, e `cursorX` o deslocamento do cursor dentro dela.
  const antesDoCursor = line.slice(0, Math.max(0, cursorX))

  // O **primeiro** marcador da linha, não o último: `#`, `$` e `>` aparecem
  // dentro do que se digita, e mirar o último fazia o Claude selecionar só o
  // fim da entrada — com `❯ [Pasted text #1 +6 lines]`, o `#` do texto virava o
  // prompt e a seleção saía como `1 +6 lines]`. O prompt vem antes de tudo.
  const marcador = PROMPT_MARKERS.reduce((menor, simbolo) => {
    const indice = antesDoCursor.indexOf(simbolo)

    return indice === -1 ? menor : Math.min(menor, indice)
  }, Number.POSITIVE_INFINITY)
  if (!Number.isFinite(marcador)) {
    return null
  }

  // Qualquer espaço em branco, não só o `0x20`: as CLIs de tela cheia separam o
  // marcador do texto com espaço não separável, e comparar com `' '` deixava
  // esse espaço dentro da seleção.
  let start = marcador + 1
  while (start < antesDoCursor.length && /\s/.test(antesDoCursor[start])) {
    start += 1
  }

  const length = antesDoCursor.length - start

  return length > 0 ? { start, length } : null
}

/**
 * Encontra uma entrada que o composer desenhou em várias linhas lógicas.
 *
 * O xterm marca apenas quebras automáticas com `isWrapped`; Shift+Enter cria
 * linhas independentes e deixa o cursor numa delas, sem o marcador de prompt.
 * Por isso procuramos o marcador nas poucas linhas anteriores e retornamos o
 * texto limpo que deve ir para a área de transferência.
 */
export function findMultiLineTypedInputRange(
  lines: string[],
  cursorLine: number,
  cursorX: number,
): MultiLineTypedInputRange | null {
  // O prompt vem antes das continuações. Procurar de cima para baixo preserva
  // um `>` ou `$` que a pessoa escreveu nas linhas seguintes.
  for (let lineIndex = 0; lineIndex <= cursorLine; lineIndex += 1) {
    if (!looksLikePromptLine(lines[lineIndex])) {
      continue
    }

    const lineEnd = lineIndex === cursorLine ? cursorX : lines[lineIndex].length
    const range = findTypedInputRange(lines[lineIndex], lineEnd)
    if (!range) {
      continue
    }

    const hasFrame = /^[\s│┃|]*[│┃|]/.test(lines[lineIndex])
    const text = lines
      .slice(lineIndex, cursorLine + 1)
      .map((line, index) => {
        const end = lineIndex + index === cursorLine ? cursorX : line.length
        const start = index === 0 ? range.start : continuationStart(line, range.start, hasFrame)
        return trimComposerLine(line.slice(start, end), hasFrame)
      })
      .join('\n')

    return { startLine: lineIndex, startColumn: range.start, text }
  }

  return null
}

function looksLikePromptLine(line: string): boolean {
  // Claude e Codex põem o marcador no começo da área de edição, às vezes depois
  // da borda da caixa. Shells deixam `$` ou `#` antes de um espaço.
  return /^[\s│┃|]*[❯›>](?:\s|$)/.test(line) || /[$#]\s/.test(line)
}

function continuationStart(line: string, promptStart: number, hasFrame: boolean): number {
  if (hasFrame) {
    return promptStart
  }

  // TUI sem moldura normalmente mantém o recuo do prompt. Se não o fizer,
  // começar em zero evita comer o primeiro caractere da continuação.
  const indentation = line.match(/^\s*/)?.[0].length ?? 0
  return Math.min(promptStart, indentation)
}

function trimComposerLine(line: string, hasFrame: boolean): string {
  const withoutPadding = line.replace(/\s+$/, '')
  return hasFrame ? withoutPadding.replace(/\s*[│┃|]\s*$/, '') : withoutPadding
}

/** Uma coordenada do buffer do xterm: linha absoluta e coluna. */
export type BufferPosition = {
  row: number
  col: number
}

/**
 * Converte um deslocamento dentro da linha lógica em coordenada do buffer.
 *
 * Existe porque a linha que a pessoa digita e a linha que o terminal desenha não
 * são a mesma coisa: passando da largura da janela, uma entrada vira duas ou
 * três linhas visuais (`isWrapped`), e o cursor cai numa linha que **não tem
 * prompt nenhum**. Foi o que aconteceu na primeira verificação no app — texto
 * curto selecionava, texto longo não. Quem seleciona precisa raciocinar sobre a
 * linha lógica e traduzir para o buffer só no fim.
 */
export function positionFromOffset(startRow: number, offset: number, cols: number): BufferPosition {
  return {
    row: startRow + Math.floor(offset / cols),
    col: offset % cols,
  }
}

/** Ctrl+A (Cmd+A no macOS), a tecla que seleciona o que foi escrito. */
export function isSelectInputShortcut(event: KeyboardEvent): boolean {
  if (event.type !== 'keydown' || event.shiftKey || event.altKey) {
    return false
  }

  // No macOS o atalho é Cmd+A; em Windows e Linux, Ctrl+A — a mesma distinção
  // que a colagem e a cópia já fazem.
  const usaCommand = event.metaKey && !event.ctrlKey
  const usaControl = event.ctrlKey && !event.metaKey

  return (usaCommand || usaControl) && event.key.toLowerCase() === 'a'
}

/**
 * Backspace ou Delete: com a seleção da entrada ativa, apagam a linha inteira.
 *
 * É o que dá utilidade à seleção. Numa caixa de texto, selecionar tudo e apertar
 * Backspace esvazia o campo; aqui a mesma sequência precisa terminar do mesmo
 * jeito, senão o Ctrl+A destaca um texto que ninguém consegue apagar de uma vez.
 */
export function isDeleteSelectionKey(event: KeyboardEvent): boolean {
  return (
    event.type === 'keydown' &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey &&
    (event.key === 'Backspace' || event.key === 'Delete')
  )
}

/**
 * Monta o que apaga a linha de entrada de qualquer CLI: `Ctrl+U` (do cursor
 * para trás) repetido uma vez por linha **visual** que a seleção cobre,
 * seguido de `Ctrl+K` (do cursor para a frente, na linha em que ele parou).
 *
 * São teclas que o readline e as CLIs de agente já entendem — mais confiável do
 * que contar caracteres e mandar Backspace na conta certa, que erra assim que o
 * texto tem acento, emoji ou uma quebra de linha no meio.
 *
 * Um só `Ctrl+U` mata apenas até o começo da linha visual **corrente**, não da
 * entrada inteira: numa entrada de uma linha os dois coincidem, mas a partir da
 * segunda linha a seleção do Ctrl+A cobre mais do que aquele único Ctrl+U
 * apaga, sobrando as linhas de cima. Repeti-lo por linha some com cada uma
 * delas antes do Ctrl+K final limpar o que resta na linha onde o cursor parou.
 *
 * `visualLineCount` vem de quantas linhas do buffer do xterm a seleção ocupou
 * (não da contagem de `\n` no texto lógico) — são as mesmas linhas que o
 * composer da CLI desenhou, e é nelas que o Ctrl+U age.
 *
 * Sem `\r` junto: limpar não é enviar. Um `\r` aqui mandaria para o agente o
 * prompt pela metade que a pessoa estava justamente descartando.
 */
export function buildClearInputSequence(visualLineCount: number): string {
  const ctrlU = '\x15'.repeat(Math.max(1, visualLineCount))
  return `${ctrlU}\x0b`
}

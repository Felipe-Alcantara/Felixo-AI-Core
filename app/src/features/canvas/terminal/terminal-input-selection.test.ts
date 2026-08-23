import { describe, expect, it } from 'vitest'
import {
  CLEAR_INPUT_SEQUENCE,
  findTypedInputRange,
  isDeleteSelectionKey,
  isSelectInputShortcut,
  positionFromOffset,
} from './terminal-input-selection'

function keyEvent(init: Partial<KeyboardEvent> & { key: string }) {
  return { type: 'keydown', shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, ...init } as KeyboardEvent
}

describe('findTypedInputRange', () => {
  it('encontra o texto digitado na entrada do Claude', () => {
    const linha = '│ ❯ escrever um teste'
    expect(findTypedInputRange(linha, linha.length)).toEqual({ start: 4, length: 17 })
  })

  it('encontra o texto digitado na entrada do Codex', () => {
    const linha = '› resumir os commits'
    expect(findTypedInputRange(linha, linha.length)).toEqual({ start: 2, length: 18 })
  })

  it('encontra o texto digitado num shell', () => {
    const linha = 'felipe@maquina:~$ npm run build'
    expect(findTypedInputRange(linha, linha.length)).toEqual({ start: 18, length: 13 })
  })

  it('para no cursor, não no fim da linha', () => {
    const linha = '❯ texto até aqui e o resto é da caixa do TUI'
    expect(findTypedInputRange(linha, 16)).toEqual({ start: 2, length: 14 })
  })

  it('devolve null com a entrada vazia, para o Ctrl+A seguir ao PTY', () => {
    expect(findTypedInputRange('❯ ', 2)).toBeNull()
    expect(findTypedInputRange('felipe@maquina:~$ ', 18)).toBeNull()
  })

  it('devolve null quando a linha não tem marcador de prompt', () => {
    expect(findTypedInputRange('saída solta de um comando', 25)).toBeNull()
  })

  it('usa o primeiro marcador, para o texto digitado não roubar o lugar do prompt', () => {
    // Um `>` de redirecionamento no meio do comando não é o prompt.
    const linha = '❯ git log > /tmp/saida'
    expect(findTypedInputRange(linha, linha.length)).toEqual({ start: 2, length: 20 })
  })

  it('pula o espaço não separável que as CLIs desenham depois do marcador', () => {
    // Regressão medida no app: a seleção vinha com um espaço na frente.
    const linha = '❯\u00a0[Pasted text #1 +6 lines]'
    expect(findTypedInputRange(linha, linha.length)).toEqual({ start: 2, length: 25 })
  })

  it('não confunde o # de um texto colado com o prompt do Claude', () => {
    // Regressão medida no app: a seleção saía como "1 +6 lines]".
    const linha = '❯ [Pasted text #1 +6 lines]'
    expect(findTypedInputRange(linha, linha.length)).toEqual({ start: 2, length: 25 })
  })

  it('não confunde uma variável de ambiente com o prompt do shell', () => {
    const linha = 'felipe@maquina:~$ echo $HOME'
    expect(findTypedInputRange(linha, linha.length)).toEqual({ start: 18, length: 10 })
  })
})

describe('isSelectInputShortcut', () => {
  it('reconhece Ctrl+A', () => {
    expect(isSelectInputShortcut(keyEvent({ key: 'a', ctrlKey: true }))).toBe(true)
  })

  it('reconhece Cmd+A no macOS', () => {
    expect(isSelectInputShortcut(keyEvent({ key: 'a', metaKey: true }))).toBe(true)
  })

  it('ignora Ctrl+Shift+A e Ctrl+Alt+A', () => {
    expect(isSelectInputShortcut(keyEvent({ key: 'A', ctrlKey: true, shiftKey: true }))).toBe(false)
    expect(isSelectInputShortcut(keyEvent({ key: 'a', ctrlKey: true, altKey: true }))).toBe(false)
  })

  it('ignora a tecla sem modificador e o keyup', () => {
    expect(isSelectInputShortcut(keyEvent({ key: 'a' }))).toBe(false)
    expect(isSelectInputShortcut(keyEvent({ key: 'a', ctrlKey: true, type: 'keyup' }))).toBe(false)
  })
})

describe('isDeleteSelectionKey', () => {
  it('reconhece Backspace e Delete', () => {
    expect(isDeleteSelectionKey(keyEvent({ key: 'Backspace' }))).toBe(true)
    expect(isDeleteSelectionKey(keyEvent({ key: 'Delete' }))).toBe(true)
  })

  it('ignora Backspace com modificador, que já tem significado próprio', () => {
    expect(isDeleteSelectionKey(keyEvent({ key: 'Backspace', ctrlKey: true }))).toBe(false)
  })

  it('ignora outras teclas', () => {
    expect(isDeleteSelectionKey(keyEvent({ key: 'a' }))).toBe(false)
  })
})

describe('CLEAR_INPUT_SEQUENCE', () => {
  it('é Ctrl+U seguido de Ctrl+K, e não carrega um Enter junto', () => {
    expect(CLEAR_INPUT_SEQUENCE).toBe('\x15\x0b')
    expect(CLEAR_INPUT_SEQUENCE).not.toContain('\r')
  })
})

describe('positionFromOffset', () => {
  it('devolve a própria linha quando o texto cabe nela', () => {
    expect(positionFromOffset(10, 18, 80)).toEqual({ row: 10, col: 18 })
  })

  it('desce de linha quando a entrada passou da largura da janela', () => {
    // 80 colunas: o caractere 95 está na segunda linha visual, coluna 15.
    expect(positionFromOffset(10, 95, 80)).toEqual({ row: 11, col: 15 })
  })

  it('acerta a virada exata da coluna', () => {
    expect(positionFromOffset(4, 80, 80)).toEqual({ row: 5, col: 0 })
  })
})

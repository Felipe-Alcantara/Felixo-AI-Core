import { describe, expect, it } from 'vitest'
import { Terminal } from '@xterm/xterm'
import { isAlternateScreen, readBuffer, readShellHistory } from './terminal-buffer-reader'

/**
 * xterm de verdade (o mesmo pacote do app, sem DOM): é o que mostra o que o
 * Claude Code deixa no buffer. Os leitores com buffer de mentira
 * (`terminal-buffer-reader.test.ts`) não provam o comportamento da tela alternativa.
 */
const ENTRAR_NA_TELA_ALTERNATIVA = '\x1b[?1049h'
const SAIR_DA_TELA_ALTERNATIVA = '\x1b[?1049l'

function escrever(terminal: Terminal, dados: string): Promise<void> {
  return new Promise((resolve) => terminal.write(dados, resolve))
}

function novoTerminal(rows = 5) {
  return new Terminal({ cols: 40, rows, scrollback: 1000, allowProposedApi: true })
}

describe('terminal real na tela alternativa (Claude Code)', () => {
  it('o buffer ativo só tem a tela: a conversa que rolou nunca chega ao terminal', async () => {
    const terminal = novoTerminal(5)
    await escrever(terminal, '$ claude\r\n')
    await escrever(terminal, ENTRAR_NA_TELA_ALTERNATIVA)
    // O Claude redesenha a tela inteira a cada resposta: 30 respostas, 5 linhas visíveis.
    for (let resposta = 1; resposta <= 30; resposta += 1) {
      await escrever(terminal, `\x1b[H\x1b[2Jresposta ${resposta}\r\nlinha B\r\nlinha C`)
    }

    expect(isAlternateScreen(terminal)).toBe(true)
    const texto = readBuffer(terminal)
    expect(texto).toContain('resposta 30')
    expect(texto).not.toContain('resposta 1\n')
    expect(texto).not.toContain('resposta 29')
    // 5 linhas de tela, nenhuma de histórico.
    expect(terminal.buffer.active.length).toBe(5)
  })

  it('o buffer normal não resolve: só guarda o que veio antes de o app subir', async () => {
    const terminal = novoTerminal(5)
    await escrever(terminal, '$ cd projeto\r\n$ claude\r\n')
    await escrever(terminal, ENTRAR_NA_TELA_ALTERNATIVA)
    await escrever(terminal, '\x1b[H\x1b[2Jconversa de agora')

    const antesDoApp = readShellHistory(terminal)
    expect(antesDoApp).toContain('$ claude')
    expect(antesDoApp).not.toContain('conversa de agora')
  })

  it('fora da tela alternativa o histórico rolado entra no buffer e screenOnly não se aplica', async () => {
    const terminal = novoTerminal(3)
    for (let linha = 1; linha <= 20; linha += 1) {
      await escrever(terminal, `saida ${linha}\r\n`)
    }

    expect(isAlternateScreen(terminal)).toBe(false)
    const texto = readBuffer(terminal)
    expect(texto).toContain('saida 1\n')
    expect(texto).toContain('saida 20')
  })

  it('ao sair do app, o terminal volta ao buffer normal', async () => {
    const terminal = novoTerminal(5)
    await escrever(terminal, 'antes\r\n')
    await escrever(terminal, ENTRAR_NA_TELA_ALTERNATIVA)
    expect(isAlternateScreen(terminal)).toBe(true)
    await escrever(terminal, SAIR_DA_TELA_ALTERNATIVA)

    expect(isAlternateScreen(terminal)).toBe(false)
    expect(readBuffer(terminal)).toContain('antes')
  })
})

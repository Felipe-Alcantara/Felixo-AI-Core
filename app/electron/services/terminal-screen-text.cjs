'use strict'

const { Terminal } = require('@xterm/headless')

const SCROLLBACK_LINHAS = 5_000

/**
 * Transforma a saída crua de um PTY (com ANSI, cursor, tela alternativa) no
 * texto que a pessoa vê no bloco, com o mesmo motor do terminal do app.
 * Leitura sob demanda: o terminal virtual nasce, renderiza e morre aqui.
 *
 * @param {string} saida
 * @param {{ cols?: number, rows?: number }} [tamanho] tamanho real do PTY, para os redesenhos de cursor caírem onde caíram
 * @returns {Promise<string>}
 */
async function renderizarTextoDaTela(saida, { cols = 120, rows = 30 } = {}) {
  if (!saida) return ''
  const terminal = new Terminal({ cols, rows, scrollback: SCROLLBACK_LINHAS, allowProposedApi: true })
  try {
    await new Promise((resolve) => terminal.write(saida, resolve))
    const buffer = terminal.buffer.active
    const linhas = []
    for (let i = 0; i < buffer.length; i += 1) {
      linhas.push(buffer.getLine(i)?.translateToString(true) ?? '')
    }
    return linhas.join('\n').replace(/\s+$/, '')
  } finally {
    terminal.dispose()
  }
}

module.exports = { renderizarTextoDaTela }

'use strict'

/**
 * Descreve ONDE dois textos divergem, com os caracteres de controle escapados.
 * O `assert.equal` do Node trunca textos grandes ("... 43826 more characters"),
 * o que escondeu o que o ConPTY colocou no meio de um payload de 44 mil caracteres
 * (CI de 20/09: recebido com 9 caracteres a mais que o esperado). Com isto a
 * próxima falha mostra os bytes exatos em vez de exigir outra investigação.
 */
function describeDivergence(expected, actual, context = 40) {
  const a = String(expected)
  const b = String(actual)
  if (a === b) return 'textos iguais'

  const limit = Math.min(a.length, b.length)
  let index = 0
  while (index < limit && a[index] === b[index]) index += 1

  const window = (text) => JSON.stringify(text.slice(Math.max(0, index - context), index + context))
  return [
    `primeira divergência no índice ${index}`,
    `(esperado ${a.length} caracteres, recebido ${b.length}, diferença ${b.length - a.length})`,
    `esperado: ${window(a)}`,
    `recebido: ${window(b)}`,
  ].join(' ')
}

module.exports = { describeDivergence }

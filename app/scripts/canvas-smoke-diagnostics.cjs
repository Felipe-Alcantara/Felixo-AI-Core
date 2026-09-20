/**
 * Classifica por que o canvas não ficou pronto a tempo: "app lento" (a árvore do
 * canvas existe e segue em 'Carregando canvas…') é diferente de "app quebrado"
 * (a árvore nem montou). Puro sobre o que a página informou, para ter teste.
 */
function diagnosticarMontagem({ rootPresent, hydrated, status }, timeoutMs) {
  if (!rootPresent) {
    return `[canvas-smoke] APP NÃO MONTOU: o canvas não apareceu em ${timeoutMs} ms (sem [data-felixo-canvas-ready]); parece quebra, não lentidão.`
  }
  return `[canvas-smoke] APP LENTO: o canvas montou mas não terminou de carregar em ${timeoutMs} ms (hydrated=${hydrated}; barra de status: "${status}"); parece runner lento, confira o log antes de chamar de bug.`
}

module.exports = { diagnosticarMontagem }

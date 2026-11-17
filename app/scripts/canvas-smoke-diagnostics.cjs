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

/**
 * Uma linha com o que separa "o shell não montou" de "o shell montou e o chunk da
 * CanvasView não chegou" (investigação do 'APP NÃO MONTOU' do CI, nov/2026).
 * `recursos` vem de performance.getEntriesByType('resource') filtrado por CanvasView.
 */
function descreverEstadoDoShell({ appReady, shell, loadingText, readyState, recursos = [], erros = [] } = {}) {
  const chunk = recursos.length === 0
    ? 'requisição da CanvasView: NÃO saiu'
    : `requisição da CanvasView: ${recursos.map((r) => `${r.status || '?'} ${r.duration} ms${r.responseEnd > 0 ? '' : ' (sem fim)'}`).join('; ')}`
  const err = erros.length === 0 ? 'sem erro de console/pageerror' : `erros: ${erros.slice(0, 5).join(' | ')}`
  return `[canvas-smoke] estado: felixoAppReady=${appReady ?? 'ausente'}; shell=${shell ? 'montado' : 'ausente'}; readyState=${readyState}; espera="${loadingText ?? ''}"; ${chunk}; ${err}`
}

/** Linha final da espera estendida: separa "lento, resolve" de "travou". */
function descreverDesfecho(aparecidoEmMs, extraMs, totalMs) {
  if (extraMs <= 0) return '[canvas-smoke] espera estendida desligada (FELIXO_SMOKE_POS_MONTAGEM_MS=0)'
  return aparecidoEmMs === null
    ? `[canvas-smoke] a CanvasView NÃO apareceu em ${totalMs} ms no total: travou, não é lentidão`
    : `[canvas-smoke] a CanvasView apareceu ${aparecidoEmMs} ms depois do teto (${totalMs - extraMs + aparecidoEmMs} ms no total): era lentidão`
}

module.exports = { diagnosticarMontagem, descreverEstadoDoShell, descreverDesfecho }

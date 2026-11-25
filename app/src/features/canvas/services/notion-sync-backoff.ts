/** Intervalo padrão do auto-sync quando não há falhas consecutivas. */
export const AUTO_SYNC_BASE_INTERVAL_MS = 60_000
/** Teto do backoff — nunca espera mais que isto entre tentativas. */
export const AUTO_SYNC_MAX_INTERVAL_MS = 15 * 60_000

/**
 * Backoff exponencial simples (com teto) pro auto-sync em segundo plano:
 * cada falha consecutiva dobra o intervalo até o teto, evitando bater na
 * rede no mesmo ritmo enquanto ela está indisponível. Reseta pra 0 no
 * primeiro sucesso (chamado com `consecutiveFailures = 0`).
 */
export function nextAutoSyncDelayMs(consecutiveFailures: number): number {
  if (!Number.isFinite(consecutiveFailures) || consecutiveFailures <= 0) {
    return AUTO_SYNC_BASE_INTERVAL_MS
  }
  const delay = AUTO_SYNC_BASE_INTERVAL_MS * 2 ** consecutiveFailures
  return Math.min(delay, AUTO_SYNC_MAX_INTERVAL_MS)
}

/** Intervalo da recarga automática da database de detalhes do Painel (muda pouco). */
export const DETAILS_SYNC_BASE_INTERVAL_MS = 10 * 60_000

/** Mesmo backoff do auto-sync das tarefas, partindo de um intervalo base maior e com o mesmo teto. */
export function nextDetailsSyncDelayMs(consecutiveFailures: number): number {
  if (!Number.isFinite(consecutiveFailures) || consecutiveFailures <= 0) return DETAILS_SYNC_BASE_INTERVAL_MS
  return Math.min(DETAILS_SYNC_BASE_INTERVAL_MS * 2 ** consecutiveFailures, AUTO_SYNC_MAX_INTERVAL_MS)
}

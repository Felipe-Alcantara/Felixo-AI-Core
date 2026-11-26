import { describe, expect, it } from 'vitest'
import {
  AUTO_SYNC_BASE_INTERVAL_MS,
  AUTO_SYNC_MAX_INTERVAL_MS,
  DETAILS_SYNC_BASE_INTERVAL_MS,
  nextAutoSyncDelayMs,
  nextDetailsSyncDelayMs,
  shouldDeferBoardAutoSync,
  TABLE_LOAD_ROW_LIMIT,
} from './notion-sync-backoff'

describe('nextAutoSyncDelayMs', () => {
  it('sem falhas (0 ou negativo), usa o intervalo base', () => {
    expect(nextAutoSyncDelayMs(0)).toBe(AUTO_SYNC_BASE_INTERVAL_MS)
    expect(nextAutoSyncDelayMs(-1)).toBe(AUTO_SYNC_BASE_INTERVAL_MS)
  })

  it('dobra a cada falha consecutiva', () => {
    expect(nextAutoSyncDelayMs(1)).toBe(AUTO_SYNC_BASE_INTERVAL_MS * 2)
    expect(nextAutoSyncDelayMs(2)).toBe(AUTO_SYNC_BASE_INTERVAL_MS * 4)
    expect(nextAutoSyncDelayMs(3)).toBe(AUTO_SYNC_BASE_INTERVAL_MS * 8)
  })

  it('nunca passa do teto, mesmo com muitas falhas seguidas', () => {
    expect(nextAutoSyncDelayMs(10)).toBe(AUTO_SYNC_MAX_INTERVAL_MS)
    expect(nextAutoSyncDelayMs(100)).toBe(AUTO_SYNC_MAX_INTERVAL_MS)
  })

  it('entradas não numéricas caem no intervalo base, em vez de NaN', () => {
    expect(nextAutoSyncDelayMs(Number.NaN)).toBe(AUTO_SYNC_BASE_INTERVAL_MS)
  })
})

describe('nextDetailsSyncDelayMs', () => {
  it('parte de 10 min, dobra por falha e respeita o mesmo teto', () => {
    expect(nextDetailsSyncDelayMs(0)).toBe(DETAILS_SYNC_BASE_INTERVAL_MS)
    expect(nextDetailsSyncDelayMs(Number.NaN)).toBe(DETAILS_SYNC_BASE_INTERVAL_MS)
    expect(nextDetailsSyncDelayMs(1)).toBe(AUTO_SYNC_MAX_INTERVAL_MS)
    expect(nextDetailsSyncDelayMs(50)).toBe(AUTO_SYNC_MAX_INTERVAL_MS)
  })
})

describe('shouldDeferBoardAutoSync', () => {
  const grande = { isBoard: true, loading: false, rows: TABLE_LOAD_ROW_LIMIT + 1, sinceLastLoadMs: 60_000 }

  it('no Painel de uma database grande, só recarrega depois de 10 min', () => {
    expect(shouldDeferBoardAutoSync(grande)).toBe(true)
    expect(shouldDeferBoardAutoSync({ ...grande, sinceLastLoadMs: DETAILS_SYNC_BASE_INTERVAL_MS })).toBe(false)
  })

  it('nunca enfileira outra carga do Painel enquanto uma está em andamento', () => {
    expect(shouldDeferBoardAutoSync({ ...grande, rows: 0, loading: true })).toBe(true)
  })

  it('database pequena e tabela seguem no intervalo normal', () => {
    expect(shouldDeferBoardAutoSync({ ...grande, rows: TABLE_LOAD_ROW_LIMIT })).toBe(false)
    expect(shouldDeferBoardAutoSync({ ...grande, isBoard: false, loading: true })).toBe(false)
  })
})

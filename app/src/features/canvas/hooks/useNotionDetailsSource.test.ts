// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useNotionDetailsSource } from './useNotionDetailsSource'
import { AUTO_SYNC_MAX_INTERVAL_MS, DETAILS_SYNC_BASE_INTERVAL_MS } from '../services/notion-sync-backoff'

const target = { dataSourceId: 'ds', databaseId: null }

function criarApi(listTasks: ReturnType<typeof vi.fn>) {
  return {
    getCachedTasks: vi.fn().mockResolvedValue({ ok: true, hasCache: false }),
    listTasks,
  } as never
}

async function avancar(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

describe('useNotionDetailsSource: recarga automática', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('recarrega a cada 10 min com o Painel aberto e para quando ele fecha', async () => {
    const listTasks = vi.fn().mockResolvedValue({ ok: true, tasks: [], schema: {} })
    const api = criarApi(listTasks)
    const { rerender } = renderHook((p: { enabled: boolean }) =>
      useNotionDetailsSource({ api, connectionId: 'c', target, enabled: p.enabled, refreshKey: 0 }), { initialProps: { enabled: true } })
    await avancar(1)
    expect(listTasks).toHaveBeenCalledTimes(1)
    await avancar(DETAILS_SYNC_BASE_INTERVAL_MS - 1000)
    expect(listTasks).toHaveBeenCalledTimes(1)
    await avancar(1000)
    await avancar(1)
    expect(listTasks).toHaveBeenCalledTimes(2)
    rerender({ enabled: false })
    await avancar(DETAILS_SYNC_BASE_INTERVAL_MS * 3)
    expect(listTasks).toHaveBeenCalledTimes(2)
  })

  it('depois de uma falha espera mais (backoff)', async () => {
    const listTasks = vi.fn().mockResolvedValue({ ok: false, message: 'rede' })
    const api = criarApi(listTasks)
    renderHook(() => useNotionDetailsSource({ api, connectionId: 'c', target, enabled: true, refreshKey: 0 }))
    await avancar(1)
    expect(listTasks).toHaveBeenCalledTimes(1)
    await avancar(DETAILS_SYNC_BASE_INTERVAL_MS)
    expect(listTasks).toHaveBeenCalledTimes(1)
    await avancar(AUTO_SYNC_MAX_INTERVAL_MS - DETAILS_SYNC_BASE_INTERVAL_MS)
    await avancar(1)
    expect(listTasks).toHaveBeenCalledTimes(2)
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GpuPreferenceStatus } from './gpu-preference'
import {
  acknowledgeGpuFallback,
  getGpuStatusSnapshot,
  refreshGpuStatus,
  resetGpuStatusStoreForTests,
  saveGpuPreference,
  subscribeGpuStatus,
} from './gpu-status-store'

const STATUS: GpuPreferenceStatus = {
  preference: 'dedicada',
  applied: 'dedicada',
  notApplied: null,
  sessionOutcome: 'healthy',
  supported: true,
  unsupportedReason: null,
  fallback: null,
  devices: [
    { vendorId: 0x10de, deviceId: 0x134f },
    { vendorId: 0x8086, deviceId: 0x1916 },
  ],
  multipleGpus: true,
}

function stubBridge(overrides: Record<string, unknown> = {}) {
  let changeListener: ((gpu: GpuPreferenceStatus) => void) | null = null
  const bridge = {
    getConfig: vi.fn(async () => ({ ok: true, config: { gpu: STATUS } })),
    setGpuPreference: vi.fn(async (preference: string) => ({ ok: true, preference, message: 'salvo' })),
    acknowledgeGpuFallback: vi.fn(async () => ({ ok: true })),
    onGpuPreferenceChange: vi.fn((callback: (gpu: GpuPreferenceStatus) => void) => {
      changeListener = callback
      return () => {
        changeListener = null
      }
    }),
    ...overrides,
  }
  vi.stubGlobal('window', { felixo: { graphics: bridge } })
  return { bridge, emitChange: (gpu: GpuPreferenceStatus) => changeListener?.(gpu), hasListener: () => changeListener !== null }
}

afterEach(() => {
  resetGpuStatusStoreForTests()
  vi.unstubAllGlobals()
})

describe('estado da placa de vídeo no renderer', () => {
  it('lê a configuração ao ganhar o primeiro assinante e solta a ponte ao perder o último', async () => {
    const { bridge, hasListener } = stubBridge()
    const listener = vi.fn()
    const unsubscribe = subscribeGpuStatus(listener)
    await refreshGpuStatus()

    expect(bridge.getConfig).toHaveBeenCalled()
    expect(getGpuStatusSnapshot()).toEqual(STATUS)
    expect(listener).toHaveBeenCalled()
    expect(hasListener()).toBe(true)

    unsubscribe()
    expect(hasListener()).toBe(false)
  })

  it('a volta automática avisada pelo processo principal chega a quem assina', () => {
    const { emitChange } = stubBridge()
    const listener = vi.fn()
    subscribeGpuStatus(listener)
    const reverted: GpuPreferenceStatus = {
      ...STATUS,
      preference: 'auto',
      sessionOutcome: 'reverted',
      fallback: { from: 'dedicada', reason: 'gpu-disabled', at: null, detail: null },
    }
    emitChange(reverted)
    expect(getGpuStatusSnapshot()).toEqual(reverted)
    expect(listener).toHaveBeenCalled()
  })

  it('reconhecer o aviso tira o aviso de todas as telas, mesmo se a IPC falhar', async () => {
    const { bridge, emitChange } = stubBridge({ acknowledgeGpuFallback: vi.fn(async () => Promise.reject(new Error('ipc'))) })
    subscribeGpuStatus(() => {})
    emitChange({ ...STATUS, fallback: { from: 'dedicada', reason: 'gpu-disabled', at: null, detail: null } })

    await expect(acknowledgeGpuFallback()).rejects.toThrow('ipc')
    expect(bridge.acknowledgeGpuFallback).toHaveBeenCalled()
    expect(getGpuStatusSnapshot()?.fallback).toBeNull()
  })

  it('salvar chama a IPC e relê o estado; sem Electron explica o motivo', async () => {
    const { bridge } = stubBridge()
    expect(await saveGpuPreference('integrada')).toEqual({ ok: true, message: 'salvo' })
    expect(bridge.setGpuPreference).toHaveBeenCalledWith('integrada')
    expect(bridge.getConfig).toHaveBeenCalled()

    vi.stubGlobal('window', {})
    expect(await saveGpuPreference('integrada')).toEqual({
      ok: false,
      message: 'Esta opção só está disponível no app Electron.',
    })
  })
})

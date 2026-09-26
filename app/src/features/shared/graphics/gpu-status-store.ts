import { useSyncExternalStore } from 'react'
import type { GpuPreference, GpuPreferenceStatus } from './gpu-preference'

/**
 * Fonte única, no renderer, do estado da placa de vídeo: as Configurações e o
 * aviso de volta automática leem daqui. Assim, quem reconhece o aviso num
 * lugar o tira do outro, e a volta automática que o processo principal avisa
 * no meio da sessão chega às duas telas de uma vez.
 */

type Listener = () => void

let snapshot: GpuPreferenceStatus | null = null
let pending: Promise<void> | null = null
let stopBridge: (() => void) | null = null
const listeners = new Set<Listener>()

function publish(next: GpuPreferenceStatus | null) {
  snapshot = next
  for (const listener of listeners) listener()
}

function graphicsBridge() {
  return typeof window === 'undefined' ? undefined : window.felixo?.graphics
}

export function refreshGpuStatus(): Promise<void> {
  const bridge = graphicsBridge()
  if (!bridge) return Promise.resolve()
  pending ??= bridge
    .getConfig()
    .then((result) => {
      if (result.ok && result.config?.gpu) publish(result.config.gpu)
    })
    .catch(() => {
      // Sem a leitura, a opção simplesmente não aparece; nada a avisar.
    })
    .finally(() => {
      pending = null
    })
  return pending
}

export function subscribeGpuStatus(listener: Listener): () => void {
  listeners.add(listener)
  if (listeners.size === 1) {
    stopBridge = graphicsBridge()?.onGpuPreferenceChange?.((gpu) => publish(gpu)) ?? null
    void refreshGpuStatus()
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      stopBridge?.()
      stopBridge = null
    }
  }
}

export function getGpuStatusSnapshot(): GpuPreferenceStatus | null {
  return snapshot
}

export async function saveGpuPreference(
  preference: GpuPreference,
): Promise<{ ok: boolean; message: string }> {
  const save = graphicsBridge()?.setGpuPreference
  if (!save) return { ok: false, message: 'Esta opção só está disponível no app Electron.' }
  try {
    const result = await save(preference)
    if (result.ok) await refreshGpuStatus()
    return {
      ok: result.ok,
      message: result.message ?? (result.ok ? 'Placa de vídeo salva.' : 'Não foi possível salvar a placa de vídeo.'),
    }
  } catch {
    return { ok: false, message: 'Não foi possível salvar a placa de vídeo.' }
  }
}

export async function acknowledgeGpuFallback(): Promise<void> {
  try {
    await graphicsBridge()?.acknowledgeGpuFallback?.()
  } finally {
    if (snapshot) publish({ ...snapshot, fallback: null })
  }
}

export function useGpuStatus(): GpuPreferenceStatus | null {
  return useSyncExternalStore(subscribeGpuStatus, getGpuStatusSnapshot, () => null)
}

/** Só para testes: volta o módulo ao estado inicial. */
export function resetGpuStatusStoreForTests() {
  snapshot = null
  pending = null
  stopBridge?.()
  stopBridge = null
  listeners.clear()
}

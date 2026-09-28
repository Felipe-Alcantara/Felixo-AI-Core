import { useEffect, useState, useSyncExternalStore } from 'react'
import {
  getSharedAccountChainStore,
  type AccountChainSnapshot,
  type AccountChainStore,
} from '../services/account-chain-client'

/**
 * Estado da cadeia de contas para quem está montado.
 *
 * Todos os consumidores (painel "Limites e uso", blocos, notificações) leem o
 * mesmo store da janela; montar liga a assinatura dos pushes e busca o estado,
 * e o último a desmontar desliga. O hook não decide nada: repassa o que o
 * processo principal mandou.
 */
export function useAccountChain(): { snapshot: AccountChainSnapshot; store: AccountChainStore } {
  const store = getSharedAccountChainStore()

  useEffect(() => store.retain(), [store])

  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  return { snapshot, store }
}

/**
 * Relógio da tela para os textos "há N min": só força a releitura a cada
 * intervalo, sem buscar nada. Ler `Date.now()` no render deixaria o texto
 * instável entre renders.
 */
export function useClockTick(intervalMs = 30_000): number {
  const [nowMs, setNowMs] = useState(() => Date.now())
  useEffect(() => {
    const intervalId = window.setInterval(() => setNowMs(Date.now()), intervalMs)
    return () => window.clearInterval(intervalId)
  }, [intervalMs])
  return nowMs
}

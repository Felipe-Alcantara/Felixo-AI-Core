'use strict'

/**
 * @module gpu-info-watcher
 * Diz quando `app.getGPUFeatureStatus()` passa a valer.
 *
 * A doc do Electron 41 avisa que o status "só é utilizável depois do evento
 * `gpu-info-update`". Medido em 26/09/2026 (Linux, Electron 41.10.7): no
 * `whenReady` o status é sempre `disabled_software` (o padrão de antes de o
 * processo de GPU responder); o evento chega ~1,2–1,4 s depois, e o
 * `did-finish-load` de uma página leve pode vir ANTES dele. Ler o status sem
 * esperar faz uma GPU saudável parecer desligada.
 *
 * Precisa ser criado antes do `app.whenReady()`, para não perder um evento
 * que chegue cedo.
 */

const DEFAULT_GPU_INFO_TIMEOUT_MS = 30_000

/**
 * @param {{ on: (event: string, listener: () => void) => void }} app
 * @returns {{
 *   isReady: () => boolean,
 *   wait: (timeoutMs?: number) => Promise<boolean>,
 *   onUpdate: (listener: () => void) => () => void,
 * }}
 */
function createGpuInfoWatcher(app) {
  let ready = false
  const waiters = new Set()
  const subscribers = new Set()

  app.on('gpu-info-update', () => {
    if (!ready) {
      ready = true
      for (const resolve of waiters) resolve(true)
      waiters.clear()
    }
    for (const listener of [...subscribers]) listener()
  })

  return {
    isReady: () => ready,
    /**
     * Avisa cada `gpu-info-update` (não só o primeiro): o status da GPU pode
     * mudar logo depois, como quando ela cai para software. Devolve a função
     * que cancela.
     */
    onUpdate(listener) {
      subscribers.add(listener)
      return () => subscribers.delete(listener)
    },
    /** `true` quando a GPU já respondeu; `false` se o prazo acabar antes. */
    wait(timeoutMs = DEFAULT_GPU_INFO_TIMEOUT_MS) {
      if (ready) return Promise.resolve(true)
      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          waiters.delete(done)
          resolve(false)
        }, timeoutMs)
        timer.unref?.()
        const done = (value) => {
          clearTimeout(timer)
          resolve(value)
        }
        waiters.add(done)
      })
    },
  }
}

module.exports = { DEFAULT_GPU_INFO_TIMEOUT_MS, createGpuInfoWatcher }

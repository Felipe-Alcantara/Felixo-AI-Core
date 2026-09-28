/**
 * Um único ouvinte de um canal do PTY (`pty:data`), com despacho por sessão.
 *
 * O preload cria um `ipcRenderer.on` a cada `pty.onData(...)`, e o store
 * assinava uma vez por sessão: com N terminais abertos, cada pedaço de saída
 * de UM terminal acordava N callbacks, e N-1 deles só comparavam o
 * `sessionId` e descartavam. Com 20 terminais transmitindo, isso é
 * O(pedaços × sessões) no renderer — o mesmo processo que desenha o canvas e
 * trata o teclado. Aqui o canal é assinado uma vez; cada evento custa uma
 * busca no `Map`.
 */
export type PtyRoutedEvent = { sessionId: string }

export type PtyEventRouter<E extends PtyRoutedEvent> = {
  /**
   * Passa a entregar os eventos de `sessionId` para `handler`. Devolve a
   * função que desfaz a rota — ela só remove a rota se ainda for a mesma
   * (uma sessão reiniciada com o mesmo id pode já ter registrado outra).
   */
  route: (sessionId: string, handler: (event: E) => void) => () => void
  /** Quantas sessões estão roteadas agora (para testes e diagnóstico). */
  readonly size: number
}

export function createPtyEventRouter<E extends PtyRoutedEvent>(
  subscribe: (listener: (event: E) => void) => () => void,
): PtyEventRouter<E> {
  const routes = new Map<string, (event: E) => void>()
  let unsubscribe: (() => void) | null = null

  const dispatch = (event: E) => {
    routes.get(event?.sessionId)?.(event)
  }

  return {
    route(sessionId, handler) {
      routes.set(sessionId, handler)
      // A assinatura só existe enquanto houver alguém para receber: o último
      // terminal fechado solta o canal, e o próximo aberto assina de novo.
      unsubscribe ??= subscribe(dispatch)

      let active = true
      return () => {
        if (!active) return
        active = false
        if (routes.get(sessionId) === handler) {
          routes.delete(sessionId)
        }
        if (routes.size === 0 && unsubscribe) {
          const release = unsubscribe
          unsubscribe = null
          release()
        }
      }
    },
    get size() {
      return routes.size
    },
  }
}

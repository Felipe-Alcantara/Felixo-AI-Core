/**
 * O acoplamento entre o container do drawer e o `fit()` do xterm, extraído do
 * `useEffect` de `TerminalDrawer.tsx` para poder ser testado sem montar um
 * componente (este repositório não usa jsdom/`@testing-library/react`;
 * `vitest.config.ts` só roda `.ts`, nunca `.tsx` — ver `useExitAnimation`/
 * `exit-animation-controller.ts` para o mesmo padrão).
 *
 * Não é um risco de retroalimentação: `store.fit(sessionId)` lê o tamanho do
 * CONTAINER (que o CSS/flex de fora decide) e ajusta linhas/colunas do
 * terminal por dentro dele — nunca escreve de volta no tamanho do container
 * que o `ResizeObserver` observa. Esta extração existe para provar (e manter
 * provado) que anexar/desmontar não duplica observer nem deixa RAF/observer
 * pendente — os critérios de aceite de "Canvas — unificar medição geométrica"
 * sobre cleanup, aplicados a este ponto específico.
 */

export type TerminalFitStore = {
  attach: (sessionId: string, container: HTMLElement) => void
  fit: (sessionId: string) => void
}

export type TerminalFitLifecycleDeps = {
  requestAnimationFrame?: (callback: FrameRequestCallback) => number
  cancelAnimationFrame?: (handle: number) => void
  ResizeObserverImpl?: typeof ResizeObserver
}

/**
 * Anexa o terminal ao container e mantém o `fit()` em dia enquanto o efeito
 * viver. Devolve a função de limpeza (cancela o RAF e desconecta o
 * observer) — chamar exatamente uma vez, no cleanup do `useEffect`.
 */
export function attachTerminalFitLifecycle(
  container: HTMLElement,
  store: TerminalFitStore,
  sessionId: string,
  {
    requestAnimationFrame: raf = window.requestAnimationFrame.bind(window),
    cancelAnimationFrame: cancelRaf = window.cancelAnimationFrame.bind(window),
    ResizeObserverImpl = ResizeObserver,
  }: TerminalFitLifecycleDeps = {},
): () => void {
  store.attach(sessionId, container)
  store.fit(sessionId)

  const rafId = raf(() => store.fit(sessionId))

  // Re-fit sempre que a caixa de montagem se assenta (fim da animação de
  // abrir, redimensionamento da janela, mudança de largura do drawer). Sem
  // isto a última linha pode ficar cortada porque o primeiro fit rodou no
  // meio da animação, numa caixa menor.
  const observer = new ResizeObserverImpl(() => store.fit(sessionId))
  observer.observe(container)

  let disposed = false
  return () => {
    if (disposed) return // idempotente: um segundo cleanup não desconecta de novo à toa
    disposed = true
    cancelRaf(rafId)
    observer.disconnect()
  }
}

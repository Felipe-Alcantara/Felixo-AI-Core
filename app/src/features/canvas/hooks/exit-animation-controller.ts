/**
 * Núcleo sem React de `useExitAnimation` — só timer e estado, para poder ser
 * testado sem montar um componente (este repositório não usa jsdom nem
 * `@testing-library/react`; os testes de `.ts` rodam em `environment: 'node'`,
 * ver `vitest.config.ts`). O hook em `useExitAnimation.ts` é a casca fina que
 * liga isto a `useState`/`useEffect`.
 */

export type ExitAnimationCallbacks = {
  onClosed: () => void
  /** Verdadeiro quando não há animação pra esperar (reduced motion / Modo Performance). */
  shouldSkipAnimation: () => boolean
}

export type ExitAnimationController = {
  /**
   * Começa o fechamento. Chamar de novo enquanto já está fechando não faz
   * nada — nem reinicia a contagem, nem troca a duração já em curso.
   *
   * @param durationMs Lido no INSTANTE da chamada (não fixado na criação do
   *   controlador), para o hook poder repassar sempre o valor mais recente
   *   da prop sem precisar recriar o controlador a cada render.
   */
  close: (durationMs: number) => void
  /** Cancela o timer pendente, se houver, sem chamar `onClosed`. Chamar no cleanup do `useEffect`. */
  dispose: () => void
  /** Há um timer de fechamento pendente agora. */
  isClosing: () => boolean
  /**
   * Substitui `onClosed`/`shouldSkipAnimation` pelos valores mais novos da
   * prop. Chamado a cada render (não condicionalmente) — troca simples de
   * closures guardadas no controlador, sem envolver ref nem `useEffect`.
   */
  update: (callbacks: ExitAnimationCallbacks) => void
}

export type ExitAnimationControllerOptions = ExitAnimationCallbacks & {
  onClosingChange: (closing: boolean) => void
  setTimeoutFn?: (callback: () => void, ms: number) => ReturnType<typeof setTimeout>
  clearTimeoutFn?: (handle: ReturnType<typeof setTimeout>) => void
}

/**
 * Sem animação pra esperar, o fechamento ainda passa por um timer (delay 0)
 * em vez de chamar `onClosed` na hora: mantém o mesmo formato assíncrono do
 * caminho animado, para quem chama `close()` nunca precisar tratar "às vezes
 * é síncrono, às vezes não" — e o timer de delay 0 continua cancelável por
 * `dispose()`, como qualquer outro.
 */
export function createExitAnimationController({
  onClosed,
  shouldSkipAnimation,
  onClosingChange,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
}: ExitAnimationControllerOptions): ExitAnimationController {
  let timer: ReturnType<typeof setTimeout> | null = null
  let callbacks: ExitAnimationCallbacks = { onClosed, shouldSkipAnimation }

  return {
    close(durationMs) {
      if (timer !== null) return
      onClosingChange(true)
      const delay = callbacks.shouldSkipAnimation() ? 0 : durationMs
      timer = setTimeoutFn(() => {
        timer = null
        callbacks.onClosed()
      }, delay)
    },
    dispose() {
      if (timer === null) return
      clearTimeoutFn(timer)
      timer = null
    },
    isClosing() {
      return timer !== null
    },
    update(next) {
      callbacks = next
    },
  }
}

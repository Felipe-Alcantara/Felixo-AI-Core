import { useCallback, useEffect, useState } from 'react'
import { createExitAnimationController } from './exit-animation-controller'

/**
 * O app corta a animação (CSS `animation: none`) de duas formas independentes:
 * a preferência de acessibilidade do SO e o Modo Performance do próprio app
 * (ver `index.css`, blocos `prefers-reduced-motion` e
 * `[data-performance-mode='on']` — mantidos em sincronia de propósito). Este
 * hook precisa da MESMA resposta, ou o atraso do JS sobra sozinho: sem CSS
 * pra tocar, o elemento fica parado e totalmente visível pelos `durationMs`
 * inteiros antes de desmontar — o "loop" que o Modo Performance/reduced motion
 * deveriam remover continua lá, só que congelado em vez de animado.
 *
 * Leitura direta (não um hook React) de propósito: só importa o valor no
 * INSTANTE em que `close()` é chamado, não durante toda a vida do componente
 * — dispensa contexto/assinatura, e por isso não exige que quem usa
 * `useExitAnimation` esteja dentro de um `PerformanceModeProvider`.
 */
function prefersNoAnimation(): boolean {
  const reducedMotion =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const performanceMode =
    typeof document !== 'undefined' &&
    document.documentElement.getAttribute('data-performance-mode') === 'on'
  return Boolean(reducedMotion || performanceMode)
}

/**
 * Drives an open/close animation for a conditionally-rendered overlay. The
 * caller keeps the element mounted while `rendered` is true; calling `close()`
 * flips `closing` on (so an exit animation can play) and then, after
 * `durationMs`, invokes `onClosed` to actually unmount it.
 *
 * Sem animação (reduced motion ou Modo Performance), `onClosed` roda no
 * próximo tick em vez de esperar `durationMs` — não há CSS pra sincronizar
 * com, então esperar só atrasaria o desmonte à toa.
 *
 * A lógica de verdade (timer, idempotência, cancelamento) mora em
 * `exit-animation-controller.ts`, sem React — testada lá, sem precisar montar
 * este hook. O controlador é criado uma única vez (o timer pendente não pode
 * ser recriado a cada render); `onClosed`/`shouldSkipAnimation` são
 * atualizados a cada render via `controller.update(...)`, para nunca ficarem
 * presos na closure da primeira renderização.
 *
 * @param shouldSkipAnimation Injetável nos testes; o padrão lê a preferência de verdade.
 */
export function useExitAnimation(
  durationMs: number,
  onClosed: () => void,
  shouldSkipAnimation: () => boolean = prefersNoAnimation,
) {
  const [closing, setClosing] = useState(false)
  const [controller] = useState(() =>
    createExitAnimationController({ onClosed, shouldSkipAnimation, onClosingChange: setClosing }),
  )

  controller.update({ onClosed, shouldSkipAnimation })

  const close = useCallback(() => controller.close(durationMs), [controller, durationMs])

  useEffect(() => () => controller.dispose(), [controller])

  return { closing, close }
}

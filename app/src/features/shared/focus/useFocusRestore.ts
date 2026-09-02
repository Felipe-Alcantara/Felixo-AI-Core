import { useEffect, useRef } from 'react'
import { deveLembrarFoco, devePedirFoco, type Focusable } from './focus-restore'

/** O que a instalação precisa do ambiente, para poder ser testada sem DOM real. */
export type AmbienteDeFoco = {
  documento: Pick<
    Document,
    'addEventListener' | 'removeEventListener' | 'body' | 'activeElement' | 'visibilityState'
  >
  janela: Pick<Window, 'addEventListener' | 'removeEventListener'>
  agendarQuadro: (callback: () => void) => void
}

/**
 * Instala os ouvintes e devolve a limpeza. Separado do hook para que o teste
 * exercite o mesmo caminho que o app roda, sem precisar de um DOM completo.
 */
export function instalarRestauracaoDeFoco(
  ambiente: AmbienteDeFoco,
  lembradoRef: { current: Focusable | null },
): () => void {
  const { documento, janela, agendarQuadro } = ambiente

  const lembrar = (event: Event) => {
    const alvo = (event as FocusEvent).target
    if (alvo && deveLembrarFoco(alvo as Element, documento)) {
      lembradoRef.current = alvo as unknown as Focusable
    }
  }

  const restaurar = () => {
    // Um quadro de espera: no `focus` da janela o Chromium ainda não decidiu
    // onde o foco vai parar, e ler `activeElement` agora daria a resposta
    // errada — perderíamos a checagem que impede roubar o foco de um modal.
    agendarQuadro(() => {
      const lembrado = lembradoRef.current
      if (devePedirFoco(lembrado, documento.activeElement, documento)) {
        // `blur()` antes do `focus()`, mesmo quando o elemento já é o
        // `activeElement`: um `focus()` sozinho num elemento que o DOM já
        // considera focado costuma ser ignorado (nem dispara o evento), e é
        // exatamente esse caso — "ainda focado" na leitura do JS, mas surdo
        // pro teclado de verdade — que faltava cobrir. O ciclo completo é o
        // que reproduz, de propósito, o que minimizar/restaurar fazia de
        // graça no Windows.
        lembrado?.blur()
        lembrado?.focus()
      }
    })
  }

  const aoMudarVisibilidade = () => {
    if (documento.visibilityState === 'visible') {
      restaurar()
    }
  }

  // `capture` porque `focusout` não borbulha de dentro de um shadow root — e
  // o xterm monta seu `<textarea>` fora da árvore React.
  documento.addEventListener('focusout', lembrar, true)
  janela.addEventListener('focus', restaurar)
  documento.addEventListener('visibilitychange', aoMudarVisibilidade)

  return () => {
    documento.removeEventListener('focusout', lembrar, true)
    janela.removeEventListener('focus', restaurar)
    documento.removeEventListener('visibilitychange', aoMudarVisibilidade)
  }
}

/**
 * Mantém o último elemento focado e o reancora quando a janela volta.
 *
 * Ver `focus-restore.ts` para o porquê. Aqui fica só a parte que depende do
 * DOM: quando lembrar, quando tentar de novo, e a limpeza dos ouvintes.
 *
 * O `focusout` é quem registra o elemento — e não o `focusin` — porque o
 * `relatedTarget` nulo dele é justamente o sinal de "o foco saiu do documento",
 * o momento exato que precisamos capturar. Quando a janela volta, o `focus` da
 * janela chega antes de o Chromium terminar de assentar o foco, então a
 * restauração é adiada um quadro; se ela não pegar, o `visibilitychange`
 * (restaurar do minimizado) cobre a segunda tentativa.
 */
export function useFocusRestore(): void {
  const lembradoRef = useRef<Focusable | null>(null)

  useEffect(
    () =>
      instalarRestauracaoDeFoco(
        {
          documento: document,
          janela: window,
          agendarQuadro: (callback) => window.requestAnimationFrame(callback),
        },
        lembradoRef,
      ),
    [],
  )
}

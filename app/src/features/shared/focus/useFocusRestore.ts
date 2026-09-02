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
  /** Foco da BrowserWindow, que pode não virar evento de foco no DOM. */
  ouvirFocoNativo?: (callback: (focado: boolean) => void) => () => void
  /** Reenvia o blur nativo para listeners que mantêm estado de teclado. */
  emitirEventoDeJanela?: (tipo: 'blur') => void
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
  let quadroAgendado = false

  const lembrarElemento = (elemento: Element | null) => {
    if (elemento && deveLembrarFoco(elemento, documento)) {
      lembradoRef.current = elemento as unknown as Focusable
    }
  }

  const lembrar = (event: Event) => {
    lembrarElemento((event as FocusEvent).target as Element | null)
  }

  const lembrarAtivo = () => {
    // O blur nativo pode não produzir focusout no renderer. Nesse caminho o
    // activeElement ainda é a única fotografia confiável do campo em uso.
    lembrarElemento(documento.activeElement)
  }

  const restaurar = () => {
    if (quadroAgendado) {
      return
    }

    quadroAgendado = true
    // Um quadro de espera: no `focus` da janela o Chromium ainda não decidiu
    // onde o foco vai parar, e ler `activeElement` agora daria a resposta
    // errada — perderíamos a checagem que impede roubar o foco de um modal.
    agendarQuadro(() => {
      quadroAgendado = false
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

  const aoMudarFocoNativo = (focado: boolean) => {
    if (focado) {
      restaurar()
      return
    }

    lembrarAtivo()
    // React Flow e o xterm mantêm estado interno de teclas pressionadas e o
    // limpam em `window.blur`. No caminho Linux em que o DOM não recebe esse
    // evento, reemitimos o sinal para que Shift (e combinações que dependem
    // dele) não fique preso depois da troca de aplicativo.
    ambiente.emitirEventoDeJanela?.('blur')
  }

  const pararDeOuvirFocoNativo =
    ambiente.ouvirFocoNativo?.(aoMudarFocoNativo) ?? (() => {})

  // `capture` porque `focusout` não borbulha de dentro de um shadow root — e
  // o xterm monta seu `<textarea>` fora da árvore React.
  documento.addEventListener('focusout', lembrar, true)
  janela.addEventListener('focus', restaurar)
  documento.addEventListener('visibilitychange', aoMudarVisibilidade)

  return () => {
    pararDeOuvirFocoNativo()
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
 * O `focusout` continua registrando as transições normais do DOM. Para a
 * troca de aplicativo, o preload também entrega o foco nativo da
 * BrowserWindow: nele capturamos o `activeElement` mesmo quando o Chromium
 * não emite `focusout`/`window.blur`. Quando a janela volta, a restauração é
 * adiada um quadro; se ela não pegar, o `visibilitychange` cobre o retorno do
 * minimizado.
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
          ouvirFocoNativo: (callback) =>
            window.felixo?.windowFocus?.onChange?.(callback) ?? (() => {}),
          emitirEventoDeJanela: (tipo) => window.dispatchEvent(new Event(tipo)),
        },
        lembradoRef,
      ),
    [],
  )
}

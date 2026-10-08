import { useEffect, useRef, type RefObject } from 'react'
import { isFelixoPopoverTarget } from '../components/felixo-popover-target'

/** O que a instalação precisa do ambiente, para poder ser testada sem DOM real. */
export type AmbienteDeFechamento = {
  documento: Pick<Document, 'addEventListener' | 'removeEventListener'>
  janela: Pick<Window, 'addEventListener' | 'removeEventListener'>
}

type OpcoesDeFechamento = {
  /** True quando o alvo do clique faz parte do menu (inclusive o botão que o abre). */
  estaDentro: (alvo: EventTarget | null) => boolean
  fechar: () => void
  /**
   * Fecha também quando a janela perde o foco (padrão). Desligue em painéis
   * com formulário: a pessoa troca de app para copiar um token e volta.
   */
  fecharAoSairDaJanela?: boolean
}

/**
 * Instala os ouvintes que fecham um menu flutuante e devolve a limpeza.
 *
 * Ponteiro e teclado são ouvidos na fase de captura: os blocos do canvas
 * (React Flow / d3-drag) e o xterm param a propagação do `pointerdown`, e
 * outros menus param a do Esc; um ouvinte comum de documento nunca sabia que
 * a pessoa clicou num bloco ou apertou Esc — o menu ficava aberto. O `blur`
 * da janela cobre o clique dentro de uma página web ou iframe, que não gera
 * evento de ponteiro neste documento.
 */
export function instalarFechamentoAoClicarFora(
  ambiente: AmbienteDeFechamento,
  { estaDentro, fechar, fecharAoSairDaJanela = true }: OpcoesDeFechamento,
): () => void {
  const { documento, janela } = ambiente

  const aoApertarPonteiro = (event: Event) => {
    if (!estaDentro(event.target)) fechar()
  }
  const aoApertarTecla = (event: Event) => {
    if ((event as KeyboardEvent).key === 'Escape') fechar()
  }

  documento.addEventListener('pointerdown', aoApertarPonteiro, true)
  documento.addEventListener('keydown', aoApertarTecla, true)
  if (fecharAoSairDaJanela) janela.addEventListener('blur', fechar)

  return () => {
    documento.removeEventListener('pointerdown', aoApertarPonteiro, true)
    documento.removeEventListener('keydown', aoApertarTecla, true)
    if (fecharAoSairDaJanela) janela.removeEventListener('blur', fechar)
  }
}

/**
 * Fecha um menu/popover aberto quando a pessoa clica fora dele, aperta Esc ou
 * sai da janela. `containerRef` deve envolver o menu e o botão que o abre —
 * senão o clique no botão fecha e o `onClick` reabre na mesma hora; quando os
 * dois não têm um ancestral comum, passe uma lista de refs. Uma superfície
 * portaled de um select dentro do menu conta como dentro.
 */
export function useDismissOnOutside(
  open: boolean,
  containerRef: RefObject<HTMLElement | null> | ReadonlyArray<RefObject<HTMLElement | null>>,
  onDismiss: () => void,
  { fecharAoSairDaJanela = true }: { fecharAoSairDaJanela?: boolean } = {},
): void {
  const onDismissRef = useRef(onDismiss)
  useEffect(() => {
    onDismissRef.current = onDismiss
  })

  // A lista costuma ser criada a cada render; o efeito lê a mais recente
  // pela ref em vez de reinstalar os ouvintes toda vez.
  const refsRef = useRef(containerRef)
  useEffect(() => {
    refsRef.current = containerRef
  })

  useEffect(() => {
    if (!open) return
    return instalarFechamentoAoClicarFora(
      { documento: document, janela: window },
      {
        estaDentro: (alvo) => {
          const atual = refsRef.current
          const refs = Array.isArray(atual) ? atual : [atual as RefObject<HTMLElement | null>]
          return refs.some((ref) => Boolean(ref.current?.contains(alvo as Node | null))) || isFelixoPopoverTarget(alvo)
        },
        fechar: () => onDismissRef.current(),
        fecharAoSairDaJanela,
      },
    )
  }, [open, fecharAoSairDaJanela])
}

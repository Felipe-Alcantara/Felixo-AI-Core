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
  { estaDentro, fechar }: OpcoesDeFechamento,
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
  janela.addEventListener('blur', fechar)

  return () => {
    documento.removeEventListener('pointerdown', aoApertarPonteiro, true)
    documento.removeEventListener('keydown', aoApertarTecla, true)
    janela.removeEventListener('blur', fechar)
  }
}

/**
 * Fecha um menu/popover aberto quando a pessoa clica fora dele, aperta Esc ou
 * sai da janela. `containerRef` deve envolver o menu e o botão que o abre —
 * senão o clique no botão fecha e o `onClick` reabre na mesma hora. Uma
 * superfície portaled de um select dentro do menu conta como dentro.
 */
export function useDismissOnOutside(
  open: boolean,
  containerRef: RefObject<HTMLElement | null>,
  onDismiss: () => void,
): void {
  const onDismissRef = useRef(onDismiss)
  useEffect(() => {
    onDismissRef.current = onDismiss
  })

  useEffect(() => {
    if (!open) return
    return instalarFechamentoAoClicarFora(
      { documento: document, janela: window },
      {
        estaDentro: (alvo) =>
          Boolean(containerRef.current?.contains(alvo as Node | null)) || isFelixoPopoverTarget(alvo),
        fechar: () => onDismissRef.current(),
      },
    )
  }, [open, containerRef])
}

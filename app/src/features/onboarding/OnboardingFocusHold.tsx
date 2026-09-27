import type { Ref } from 'react'

type Props = { holdRef?: Ref<HTMLDivElement> }

/**
 * Ponto de espera do foco do tour enquanto um diálogo modal está por cima: o
 * card e o aviso ficam `inert` e não podem guardar o foco, e o body não serve,
 * porque ali o React Flow trata Delete e Backspace como teclas do canvas (apaga
 * o bloco selecionado por baixo do diálogo) e `q` troca o modo seleção/pan.
 * Aqui `nokey` faz o React Flow ignorar as teclas, e o canvas não conta um
 * elemento fora da própria região como "o canvas".
 *
 * Irmão do card (ou do aviso), nunca dentro dele. Invisível, fora do Tab
 * (`tabIndex=-1`: só a camada o foca) e sem papel, nome ou texto, para não
 * anunciar nada por cima do diálogo. Por ser focável, nunca `aria-hidden`.
 */
export function OnboardingFocusHold({ holdRef }: Props) {
  return <div ref={holdRef} tabIndex={-1} className="sr-only nokey" data-felixo-onboarding="espera" />
}

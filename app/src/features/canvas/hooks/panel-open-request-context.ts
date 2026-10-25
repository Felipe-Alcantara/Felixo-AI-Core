import { createContext, useContext } from 'react'

/**
 * Muda a cada pedido de abrir um painel de ferramenta, inclusive o que já está
 * aberto. `setActiveTool` com o valor que já está no estado não renderiza, então
 * sem este contador o painel que está na animação de saída nunca saberia do
 * pedido e fecharia mesmo assim: o `CanvasPanel` cancela o fechamento pendente
 * a cada mudança (a gaveta faz o mesmo com a prop `openRequest`).
 *
 * Contexto, e não prop, porque os ~13 painéis de ferramenta passam pelo
 * `CanvasPanel`. Fora do provider vale 0 e nada cancela, como antes.
 */
export const PanelOpenRequestContext = createContext(0)

export function usePanelOpenRequest(): number {
  return useContext(PanelOpenRequestContext)
}

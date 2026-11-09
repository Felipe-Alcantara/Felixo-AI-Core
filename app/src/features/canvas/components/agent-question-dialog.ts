import type { CanvasAgentQuestion } from '../types'

/** A pergunta mais antiga ainda pendente: a fila é atendida em ordem. */
export function pickPendingQuestion(
  requests: CanvasAgentQuestion[] | null | undefined,
): CanvasAgentQuestion | null {
  return (requests ?? []).find((pedido) => pedido.estado === 'pendente') ?? null
}

/** Atalho de teclado 1–4 para a opção correspondente; qualquer outra tecla não escolhe nada. */
export function optionIndexForKey(key: string, optionCount: number): number | null {
  if (!/^[1-9]$/.test(key)) return null
  const indice = Number(key) - 1
  return indice < optionCount ? indice : null
}

/** De onde a pergunta veio, em texto curto para o rodapé do diálogo. */
export function describeQuestionOrigin(question: CanvasAgentQuestion): string {
  return question.origem ? `Pergunta de um agente em ${question.origem}` : 'Pergunta de um agente'
}

/** O que uma tecla pressionada dentro da pergunta quer dizer. */
export type QuestionKeyAction =
  | { readonly tipo: 'dispensar' }
  | { readonly tipo: 'opcao'; readonly indice: number }
  | { readonly tipo: 'tab' }
  | { readonly tipo: 'nenhuma' }

/**
 * Classifica a tecla. O diálogo trata Esc, Tab e 1–N; qualquer outra tecla é
 * `nenhuma`, mas o diálogo a engole do mesmo jeito (nada age no canvas por baixo).
 * Tecla com Ctrl, Meta ou Alt é atalho de outra coisa e nunca escolhe uma opção.
 */
export function questionKeyAction(input: {
  key: string
  optionCount: number
  ctrlKey?: boolean
  metaKey?: boolean
  altKey?: boolean
}): QuestionKeyAction {
  if (input.key === 'Escape') return { tipo: 'dispensar' }
  if (input.key === 'Tab') return { tipo: 'tab' }
  if (input.ctrlKey || input.metaKey || input.altKey) return { tipo: 'nenhuma' }
  const indice = optionIndexForKey(input.key, input.optionCount)
  return indice === null ? { tipo: 'nenhuma' } : { tipo: 'opcao', indice }
}

/** O que sabemos de um elemento para decidir se o foco pode voltar a ele. */
export type FocusReturnCandidate = {
  readonly isConnected: boolean
  closest?: (selector: string) => unknown
}

/**
 * Para onde o foco vai quando a pergunta fecha: o elemento que o tinha ao abrir,
 * se ainda está na página e ninguém levou o foco para outro lugar (`focusLost`:
 * ele caiu no body com o diálogo). Sem esse elemento (saiu da página), o
 * `fallback` (a região do canvas); o foco nunca fica no body, onde Delete e `q`
 * agem no canvas.
 *
 * Um elemento `inert` não recebe foco (o card do tutorial, enquanto cede à
 * pergunta): devolve `null` e deixa o foco para quem o tornou inerte, que o
 * devolve quando retoma. Cair no fallback ali tiraria dele o foco a devolver.
 */
export function questionFocusReturnTarget<T extends FocusReturnCandidate>(input: {
  saved: T | null
  focusLost: boolean
  fallback: () => T | null
}): T | null {
  if (!input.focusLost) return null
  const { saved } = input
  if (saved?.isConnected) {
    return typeof saved.closest === 'function' && saved.closest('[inert]') !== null ? null : saved
  }
  const fallback = input.fallback()
  return fallback?.isConnected ? fallback : null
}

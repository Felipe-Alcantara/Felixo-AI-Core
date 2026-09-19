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

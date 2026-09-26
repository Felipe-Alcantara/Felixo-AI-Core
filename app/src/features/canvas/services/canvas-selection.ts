// O que está selecionado no canvas, lido do próprio estado de blocos e
// conexões (campo `selected` que o React Flow mantém) — sem estado paralelo.
import type { Edge, Node } from '@xyflow/react'

export type CanvasSelection = {
  nodeIds: string[]
  edgeIds: string[]
  /**
   * Frase curta para a barra de status ("1 conexão selecionada", "2 blocos
   * selecionados", "3 itens selecionados"); `null` quando nada está selecionado.
   */
  label: string | null
}

function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count === 1 ? singular : pluralForm}`
}

/** Quem está selecionado e como a barra de status descreve isso. */
export function summarizeCanvasSelection(
  nodes: readonly Node[],
  edges: readonly Edge[],
): CanvasSelection {
  const nodeIds = nodes.filter((node) => node.selected).map((node) => node.id)
  const edgeIds = edges.filter((edge) => edge.selected).map((edge) => edge.id)

  let label: string | null = null
  if (nodeIds.length > 0 && edgeIds.length > 0) {
    // Blocos e conexões juntos: a soma não é de nenhum dos dois.
    label = `${nodeIds.length + edgeIds.length} itens selecionados`
  } else if (nodeIds.length > 0) {
    label = plural(nodeIds.length, 'bloco selecionado', 'blocos selecionados')
  } else if (edgeIds.length > 0) {
    label = plural(edgeIds.length, 'conexão selecionada', 'conexões selecionadas')
  }

  return { nodeIds, edgeIds, label }
}

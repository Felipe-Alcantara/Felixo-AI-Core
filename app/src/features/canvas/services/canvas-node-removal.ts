import type { NodeChange } from '@xyflow/react'

/**
 * Libera os recursos pertencentes a nós removidos e devolve os ids que
 * realmente desapareceram.
 *
 * A remoção visual do React Flow e a remoção do dado persistido não desmontam
 * necessariamente a sessão do terminal: o store mantém sessões vivas de
 * propósito quando um cartão só troca de superfície (canvas ↔ gaveta). Por
 * isso, o mesmo evento de remoção precisa chegar explicitamente ao store.
 * Manter essa ponte fora do componente deixa o contrato testável sem montar o
 * canvas inteiro e torna a operação segura para remoções em lote.
 */
export function releaseRemovedCanvasNodes(
  changes: readonly NodeChange[],
  sessionNodeIds: ReadonlySet<string>,
  releaseSession: (nodeId: string) => void,
  removePersistedNode: (nodeId: string) => void,
): string[] {
  const removedIds = new Set<string>()

  for (const change of changes) {
    if (change.type !== 'remove' || removedIds.has(change.id)) {
      continue
    }

    removedIds.add(change.id)
    // Só terminais possuem PTY/xterm/listeners. Não chamar o store para os
    // outros tipos também preserva o carregamento lazy quando alguém remove
    // uma nota ou arquivo antes de abrir qualquer terminal.
    if (sessionNodeIds.has(change.id)) {
      releaseSession(change.id)
    }
    removePersistedNode(change.id)
  }

  return [...removedIds]
}

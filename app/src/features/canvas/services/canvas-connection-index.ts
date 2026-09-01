// Índices derivados das conexões do canvas. A construção é linear em nodes e
// edges e é reaproveitada pelo render e pela resolução assíncrona dos arquivos
// ligados aos terminais.
import type { Edge, Node } from '@xyflow/react'

type FileData = {
  fileName?: unknown
}

export type CanvasConnectionIndex = {
  /** Terminais na ordem do array original, para o menu de cada arquivo. */
  terminalNodes: readonly Node[]
  /** Retorna os ids dos terminais ligados ao arquivo em qualquer direção. */
  getLinkedAgentIds: (fileNodeId: string) => ReadonlySet<string>
  /** Retorna nomes de arquivos únicos na ordem da primeira aresta. */
  getConnectedCanvasFileNames: (terminalId: string) => readonly string[]
}

const EMPTY_IDS: ReadonlySet<string> = new Set()
const EMPTY_FILE_NAMES: readonly string[] = []

/**
 * Cria os índices de conectividade observáveis pelo canvas.
 *
 * Arestas são não direcionais para os links arquivo↔terminal: tanto a conexão
 * criada de arquivo para terminal quanto a criada no sentido inverso tem o
 * mesmo significado. Pontas ausentes, links entre outros tipos de bloco e
 * arquivos sem nome não entram no índice de nomes; um arquivo sem nome ainda
 * conserva o terminal ligado para o menu de agentes.
 */
export function createCanvasConnectionIndex(
  nodes: readonly Node[],
  edges: readonly Edge[],
): CanvasConnectionIndex {
  const nodeById = new Map<string, Node>()
  const terminalNodes: Node[] = []

  for (const node of nodes) {
    if (!nodeById.has(node.id)) {
      nodeById.set(node.id, node)
    }
    if (node.type === 'terminal') {
      terminalNodes.push(node)
    }
  }

  const linkedAgentIdsByFileId = new Map<string, Set<string>>()
  const connectedFileNamesByTerminalId = new Map<string, string[]>()
  const seenFileNamesByTerminalId = new Map<string, Set<string>>()

  for (const edge of edges) {
    const source = nodeById.get(edge.source)
    const target = nodeById.get(edge.target)
    if (!source || !target) {
      continue
    }

    const fileNode = source.type === 'file' ? source : target.type === 'file' ? target : null
    const terminalNode =
      source.type === 'terminal' ? source : target.type === 'terminal' ? target : null
    if (!fileNode || !terminalNode) {
      continue
    }

    const linkedAgentIds = linkedAgentIdsByFileId.get(fileNode.id) ?? new Set<string>()
    linkedAgentIds.add(terminalNode.id)
    linkedAgentIdsByFileId.set(fileNode.id, linkedAgentIds)

    const fileName = (fileNode.data as FileData | undefined)?.fileName
    if (typeof fileName !== 'string' || !fileName) {
      continue
    }

    const fileNames = connectedFileNamesByTerminalId.get(terminalNode.id) ?? []
    const seenFileNames = seenFileNamesByTerminalId.get(terminalNode.id) ?? new Set<string>()
    if (!seenFileNames.has(fileName)) {
      seenFileNames.add(fileName)
      fileNames.push(fileName)
    }
    connectedFileNamesByTerminalId.set(terminalNode.id, fileNames)
    seenFileNamesByTerminalId.set(terminalNode.id, seenFileNames)
  }

  return {
    terminalNodes,
    getLinkedAgentIds(fileNodeId) {
      return linkedAgentIdsByFileId.get(fileNodeId) ?? EMPTY_IDS
    },
    getConnectedCanvasFileNames(terminalId) {
      return connectedFileNamesByTerminalId.get(terminalId) ?? EMPTY_FILE_NAMES
    },
  }
}

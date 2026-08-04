// Reorganização explícita dos agentes já existentes no canvas. Mantém a
// decisão de quais terminais são agentes fora da view e delega a geometria
// da matriz para node-geometry.ts.
import type { Node } from '@xyflow/react'
import { isKnownAgentCommand } from './agent-launch-options'
import {
  DEFAULT_SIZE,
  findFreeNodePositions,
  type CanvasBounds,
} from './node-geometry'

function commandOf(node: Node): string | undefined {
  const command = (node.data as { command?: unknown } | undefined)?.command
  return typeof command === 'string' ? command.trim() : undefined
}

/** Only independent agent terminals are safe to move as a canvas matrix. */
function isTopLevelAgentNode(node: Node): boolean {
  return (
    node.type === 'terminal' &&
    !node.parentId &&
    isKnownAgentCommand(commandOf(node))
  )
}

export function countTopLevelAgentNodes(nodes: Node[]): number {
  return nodes.filter(isTopLevelAgentNode).length
}

/**
 * Moves independent known-agent terminals into one free near-square matrix.
 * Every other top-level block remains an obstacle, while child terminals are
 * deliberately left in their group because their coordinates are relative to
 * that group.
 */
export function arrangeTopLevelAgentsAsMatrix<TNode extends Node>(
  nodes: TNode[],
  viewport?: CanvasBounds,
): TNode[] {
  const agents = nodes.filter(isTopLevelAgentNode)
  if (agents.length < 2) {
    return nodes
  }

  const agentIds = new Set(agents.map((node) => node.id))
  const fixedNodes = nodes.filter((node) => !agentIds.has(node.id))
  const positions = findFreeNodePositions(
    fixedNodes,
    agents.length,
    DEFAULT_SIZE.terminal,
    viewport,
  )
  const positionsById = new Map(
    agents.map((node, index) => [node.id, positions[index]]),
  )

  return nodes.map((node) => {
    const position = positionsById.get(node.id)
    return position ? { ...node, position } : node
  })
}

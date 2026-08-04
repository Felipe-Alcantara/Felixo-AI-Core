import { describe, expect, it } from 'vitest'
import type { Node } from '@xyflow/react'
import {
  arrangeTopLevelAgentsAsMatrix,
  countTopLevelAgentNodes,
} from './agent-matrix-layout'

function terminal(
  id: string,
  command: string | undefined,
  position: { x: number; y: number },
  parentId?: string,
): Node {
  return {
    id,
    type: 'terminal',
    position,
    width: 520,
    height: 360,
    data: { command },
    ...(parentId ? { parentId } : {}),
  }
}

describe('agent matrix layout', () => {
  it('reorganizes independent agents while preserving every other block', () => {
    const first = terminal('agent-a', 'codex', { x: 1800, y: 800 })
    const second = terminal('agent-b', 'claude', { x: 2200, y: 800 })
    const third = terminal('agent-c', 'gemini', { x: 1800, y: 1300 })
    const fourth = terminal('agent-d', 'codex', { x: 2200, y: 1300 })
    const fixedNote: Node = {
      id: 'note',
      type: 'note',
      position: { x: 120, y: 120 },
      width: 100,
      height: 100,
      data: {},
    }
    const shell = terminal('shell', undefined, { x: 1600, y: 120 })
    const group: Node = {
      id: 'group',
      type: 'group',
      position: { x: 3000, y: 3000 },
      width: 480,
      height: 320,
      data: {},
    }
    const groupedAgent = terminal('grouped-agent', 'claude', { x: 20, y: 20 }, 'group')
    const nodes = [first, fixedNote, second, third, fourth, shell, group, groupedAgent]

    const arranged = arrangeTopLevelAgentsAsMatrix(nodes)

    expect(countTopLevelAgentNodes(nodes)).toBe(4)
    expect(arranged.find((node) => node.id === 'agent-a')?.position).toEqual({ x: 252, y: 120 })
    expect(arranged.find((node) => node.id === 'agent-b')?.position).toEqual({ x: 804, y: 120 })
    expect(arranged.find((node) => node.id === 'agent-c')?.position).toEqual({ x: 252, y: 512 })
    expect(arranged.find((node) => node.id === 'agent-d')?.position).toEqual({ x: 804, y: 512 })
    expect(arranged.find((node) => node.id === 'note')).toBe(fixedNote)
    expect(arranged.find((node) => node.id === 'shell')).toBe(shell)
    expect(arranged.find((node) => node.id === 'grouped-agent')).toBe(groupedAgent)
  })

  it('does not create a new layout until two independent agents exist', () => {
    const onlyAgent = terminal('agent', 'codex', { x: 800, y: 800 })
    const groupedAgent = terminal('grouped-agent', 'claude', { x: 20, y: 20 }, 'group')
    const nodes = [onlyAgent, groupedAgent]

    expect(countTopLevelAgentNodes(nodes)).toBe(1)
    expect(arrangeTopLevelAgentsAsMatrix(nodes)).toBe(nodes)
  })
})

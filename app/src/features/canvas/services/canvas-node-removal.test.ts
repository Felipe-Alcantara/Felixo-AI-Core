import { describe, expect, it } from 'vitest'
import type { NodeChange } from '@xyflow/react'
import { releaseRemovedCanvasNodes } from './canvas-node-removal'

describe('releaseRemovedCanvasNodes', () => {
  it('libera a sessão e o dado persistido uma vez por nó removido', () => {
    const sessions: string[] = []
    const persisted: string[] = []
    const changes: NodeChange[] = [
      { type: 'position', id: 'terminal-keep', position: { x: 1, y: 2 } },
      { type: 'remove', id: 'terminal-1' },
      { type: 'remove', id: 'note-1' },
      { type: 'remove', id: 'terminal-1' },
    ]

    const removed = releaseRemovedCanvasNodes(
      changes,
      new Set(['terminal-1']),
      (nodeId) => sessions.push(nodeId),
      (nodeId) => persisted.push(nodeId),
    )

    expect(removed).toEqual(['terminal-1', 'note-1'])
    expect(sessions).toEqual(['terminal-1'])
    expect(persisted).toEqual(['terminal-1', 'note-1'])
  })
})

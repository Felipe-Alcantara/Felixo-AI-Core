import { describe, expect, it } from 'vitest'
import type { Connection, Node } from '@xyflow/react'
import { announceAgentCollaboration } from './agent-collaboration-links'

function terminalNode(
  id: string,
  label: string,
  command?: string,
  cwd?: string,
): Node {
  return {
    id,
    type: 'terminal',
    position: { x: 0, y: 0 },
    data: { label, command, cwd },
  }
}

function connection(source: string, target: string): Connection {
  return { source, sourceHandle: null, target, targetHandle: null }
}

describe('agent collaboration links', () => {
  it('announces a shared project to both connected agents', () => {
    const sent: Array<{ id: string; text: string }> = []
    const nodes = [
      terminalNode('agent-a', 'Planejador', 'codex', '/repo'),
      terminalNode('agent-b', 'Implementador', 'claude', '/repo'),
    ]

    const announced = announceAgentCollaboration(connection('agent-a', 'agent-b'), nodes, {
      sendText: (id, text) => sent.push({ id, text }),
    })

    expect(announced).toBe(true)
    expect(sent).toHaveLength(2)
    expect(sent[0]).toMatchObject({ id: 'agent-a' })
    expect(sent[0].text).toContain('agente "Implementador"')
    expect(sent[0].text).toContain('mesmo diretório de trabalho')
    expect(sent[0].text.endsWith('\r')).toBe(true)
    expect(sent[1]).toMatchObject({ id: 'agent-b' })
    expect(sent[1].text).toContain('agente "Planejador"')
  })

  it('marks different directories as related canvas contexts', () => {
    const sent: Array<{ id: string; text: string }> = []
    const nodes = [
      terminalNode('agent-a', 'Pesquisa', 'gemini', '/research'),
      terminalNode('agent-b', 'Código', 'codex', '/application'),
    ]

    announceAgentCollaboration(connection('agent-a', 'agent-b'), nodes, {
      sendText: (id, text) => sent.push({ id, text }),
    })

    expect(sent[0].text).toContain('contextos de trabalho são relacionados')
    expect(sent[1].text).toContain('contextos de trabalho são relacionados')
  })

  it('treats a directly configured Openia spawn as an agent terminal', () => {
    const sent: Array<{ id: string; text: string }> = []
    const nodes = [
      {
        ...terminalNode('openia', 'Openia', 'openia', '/repo'),
        data: { label: 'Openia', command: 'openia', cwd: '/repo', args: ['run', 'orchat'] },
      },
      terminalNode('agent', 'Implementador', 'codex', '/repo'),
    ]

    expect(
      announceAgentCollaboration(connection('openia', 'agent'), nodes, {
        sendText: (id, text) => sent.push({ id, text }),
      }),
    ).toBe(true)
    expect(sent).toHaveLength(2)
    expect(sent[0].text).toContain('agente "Implementador"')
  })

  it('ignores pairs that are not two known agent terminals', () => {
    const sent: Array<{ id: string; text: string }> = []
    const nodes = [
      terminalNode('agent', 'Agente', 'codex', '/repo'),
      terminalNode('shell', 'Shell', undefined, '/repo'),
    ]

    expect(
      announceAgentCollaboration(connection('agent', 'shell'), nodes, {
        sendText: (id, text) => sent.push({ id, text }),
      }),
    ).toBe(false)
    expect(sent).toEqual([])
  })
})

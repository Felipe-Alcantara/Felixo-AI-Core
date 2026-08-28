import type { Connection, Node } from '@xyflow/react'
import {
  isDirectOpeniaLaunch,
  isKnownAgentCommand,
} from './agent-launch-options'
import { toSubmittedTerminalText } from '../terminal/terminal-input'
import type { ContextFileKind } from './context-file-delivery'

type TerminalTextSink = {
  sendText: (id: string, text: string, options?: { kind?: ContextFileKind }) => void
}

type AgentPair = { first: Node; second: Node }

function textFromNode(node: Node, key: 'label' | 'command' | 'cwd'): string {
  const value = (node.data as Record<string, unknown> | undefined)?.[key]
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''
}

function isAgentTerminal(node: Node): boolean {
  if (node.type !== 'terminal') return false

  const command = textFromNode(node, 'command')
  const data = node.data as Record<string, unknown> | undefined
  const args = Array.isArray(data?.args)
    ? data.args.filter((value): value is string => typeof value === 'string')
    : undefined

  return isKnownAgentCommand(command) || isDirectOpeniaLaunch(command, args)
}

function agentPairFromConnection(connection: Connection, nodes: Node[]): AgentPair | null {
  if (!connection.source || !connection.target || connection.source === connection.target) {
    return null
  }

  const first = nodes.find((node) => node.id === connection.source)
  const second = nodes.find((node) => node.id === connection.target)
  return first && second && isAgentTerminal(first) && isAgentTerminal(second)
    ? { first, second }
    : null
}

function agentLabel(node: Node): string {
  return textFromNode(node, 'label') || textFromNode(node, 'command') || 'Agente sem nome'
}

function collaborationScope(agent: Node, partner: Node): string {
  const agentCwd = textFromNode(agent, 'cwd')
  const partnerCwd = textFromNode(partner, 'cwd')

  if (agentCwd && partnerCwd && agentCwd === partnerCwd) {
    return 'Vocês compartilham o mesmo diretório de trabalho e atuam no mesmo projeto.'
  }

  if (agentCwd && partnerCwd) {
    return 'Vocês usam diretórios diferentes, mas esta ligação declara que os contextos de trabalho são relacionados.'
  }

  return 'Esta ligação declara que os contextos de trabalho de vocês são relacionados no canvas.'
}

/** Builds the reciprocal instruction an agent receives after a terminal-to-terminal link. */
export function buildAgentCollaborationPrompt(agent: Node, partner: Node): string {
  return toSubmittedTerminalText(
    [
      'COLABORAÇÃO ENTRE AGENTES NO CANVAS',
      `Você foi conectado ao agente "${agentLabel(partner)}" no canvas.`,
      collaborationScope(agent, partner),
      'Tratem as tarefas como partes do mesmo contexto de trabalho.',
      'Coordenem a divisão de responsabilidades, decisões, mudanças nos mesmos arquivos e bloqueios.',
      'A conexão não transfere automaticamente conversa ou saída entre terminais. Use arquivos .md e notas compartilhados no canvas para registrar contexto e sinais entre agentes.',
    ].join('\n'),
  )
}

/**
 * Notifies both endpoints of a newly drawn agent-to-agent connection. Shells,
 * arbitrary commands, self-links, and non-terminal pairs deliberately do not
 * receive an agent prompt.
 */
export function announceAgentCollaboration(
  connection: Connection,
  nodes: Node[],
  store: TerminalTextSink,
): boolean {
  const pair = agentPairFromConnection(connection, nodes)
  if (!pair) {
    return false
  }

  store.sendText(pair.first.id, buildAgentCollaborationPrompt(pair.first, pair.second), {
    kind: 'collaboration',
  })
  store.sendText(pair.second.id, buildAgentCollaborationPrompt(pair.second, pair.first), {
    kind: 'collaboration',
  })
  return true
}

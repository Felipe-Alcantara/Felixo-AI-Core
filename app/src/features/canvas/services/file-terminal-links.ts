// Regras de ligação entre blocos de arquivo .md e terminais de agente:
// descobrir pares conectados, anunciar o arquivo ao agente e disparar o
// diagnóstico de repositório sob demanda.
import type { Connection, Edge, Node } from '@xyflow/react'
import {
  buildBootstrapPrompt,
  buildFileLinkPrompt,
} from './file-link-prompt'
import type { DiagnosisRequestStatus } from '../types'
import type { ContextFileKind } from './context-file-delivery'

type TerminalTextSink = {
  sendText: (id: string, text: string, options?: { kind?: ContextFileKind }) => void
}

/** The file + terminal a connection links, in either direction (or null). */
function filePairFromConnection(
  connection: Connection,
  nodes: Node[],
): { fileNode: Node; terminalNode: Node } | null {
  const a = nodes.find((node) => node.id === connection.source)
  const b = nodes.find((node) => node.id === connection.target)
  if (!a || !b) {
    return null
  }
  const fileNode = a.type === 'file' ? a : b.type === 'file' ? b : null
  const terminalNode = a.type === 'terminal' ? a : b.type === 'terminal' ? b : null
  return fileNode && terminalNode ? { fileNode, terminalNode } : null
}

const agentNameOf = (terminalNode: Node): string => {
  const command = (terminalNode.data as { command?: string } | undefined)?.command
  return command ? command : 'este agente'
}

/** Friendly label for a terminal block: its name, else its command. */
export function agentLabelOf(terminalNode: Node): string {
  const data = terminalNode.data as { label?: string; command?: string } | undefined
  return data?.label?.trim() || data?.command?.trim() || 'Terminal'
}

/**
 * If a connection links a file block and a terminal block, resolve the file's
 * absolute path and type the shared-scratchpad instruction into the terminal so
 * the running agent learns it can read/edit that file. The repo diagnosis
 * (bootstrap) is no longer fired here — it's an explicit, on-demand action on
 * the file block (see requestRepoDiagnosis).
 */
export async function announceFileToTerminal(
  connection: Connection,
  nodes: Node[],
  store: TerminalTextSink,
  template: string,
): Promise<void> {
  const pair = filePairFromConnection(connection, nodes)
  if (!pair) {
    return
  }

  await announceFileNodeToTerminalNode(pair.fileNode, pair.terminalNode, store, template)
}

/**
 * Resolve a file block's path and type the shared-scratchpad instruction into a
 * terminal block, so its agent learns it can read/edit that file. Shared by the
 * drag-to-connect flow and the explicit "+ Ligar agente" button.
 */
export async function announceFileNodeToTerminalNode(
  fileNode: Node,
  terminalNode: Node,
  store: TerminalTextSink,
  template: string,
): Promise<void> {
  const fileName = (fileNode.data as { fileName?: string } | undefined)?.fileName
  if (!fileName) {
    return
  }

  const resolved = await window.felixo?.canvasFiles?.resolve({ name: fileName })
  if (!resolved?.ok || !resolved.path) {
    return
  }

  store.sendText(
    terminalNode.id,
    buildFileLinkPrompt(template, resolved.path, agentNameOf(terminalNode)),
    { kind: 'scratchpad-link' },
  )
}

/**
 * Fires the repo-diagnosis (bootstrap) prompt into the terminal connected to a
 * file block, on demand. The agent surveys the repo and writes the diagnosis
 * (problems, incomplete, helpers, improvements) into the file. Returns a status
 * so the UI can explain why nothing happened (e.g. no terminal linked yet).
 */
export async function requestRepoDiagnosis(
  fileNodeId: string,
  nodes: Node[],
  edges: Edge[],
  store: TerminalTextSink,
  bootstrapTemplate: string,
): Promise<DiagnosisRequestStatus> {
  const fileNode = nodes.find((node) => node.id === fileNodeId)
  const fileName = (fileNode?.data as { fileName?: string } | undefined)?.fileName
  if (!fileName) {
    return 'no-file'
  }

  const terminalNode = edges
    .flatMap((edge) => {
      if (edge.source !== fileNodeId && edge.target !== fileNodeId) {
        return []
      }
      const otherId = edge.source === fileNodeId ? edge.target : edge.source
      const other = nodes.find((node) => node.id === otherId)
      return other?.type === 'terminal' ? [other] : []
    })
    .at(0)
  if (!terminalNode) {
    return 'no-terminal'
  }

  const resolved = await window.felixo?.canvasFiles?.resolve({ name: fileName })
  if (!resolved?.ok || !resolved.path) {
    return 'resolve-failed'
  }

  store.sendText(
    terminalNode.id,
    buildBootstrapPrompt(bootstrapTemplate, resolved.path, agentNameOf(terminalNode)),
    { kind: 'scratchpad-link' },
  )
  return 'ok'
}

/** Ids of terminals linked to a file block, in any edge direction. */
export function getLinkedAgentIds(fileNodeId: string, edges: Edge[]): Set<string> {
  const ids = new Set<string>()
  for (const edge of edges) {
    if (edge.source === fileNodeId) ids.add(edge.target)
    else if (edge.target === fileNodeId) ids.add(edge.source)
  }
  return ids
}

export function getConnectedCanvasFileNames(
  terminalId: string,
  nodes: Node[],
  edges: Edge[],
): string[] {
  const names = edges.flatMap((edge) => {
    if (edge.source !== terminalId && edge.target !== terminalId) {
      return []
    }

    const otherNodeId = edge.source === terminalId ? edge.target : edge.source
    const otherNode = nodes.find((node) => node.id === otherNodeId)
    if (otherNode?.type !== 'file') {
      return []
    }

    const fileName = (otherNode.data as { fileName?: string }).fileName
    return fileName ? [fileName] : []
  })

  return [...new Set(names)]
}

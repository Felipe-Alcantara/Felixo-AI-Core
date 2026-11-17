import type { Edge } from '@xyflow/react'
import type {
  CanvasTransferBundle,
  PersistedCanvasEdge,
  PersistedCanvasNode,
} from '../types'
import {
  clearPersistenceFailure,
  describeFailure,
  reportPersistenceFailure,
} from './canvas-persistence-status'

/**
 * Thin wrapper over the `window.felixo.canvas` bridge. Each call degrades
 * gracefully when the bridge is unavailable (e.g. web preview), so the canvas
 * still works in-memory without a backend.
 */

export type LoadedCanvasNodes = {
  nodes: PersistedCanvasNode[]
  /** A leitura falhou: `nodes` vazio quer dizer "não consegui ler", não "canvas vazio". */
  failed: boolean
}

export async function loadCanvasNodes(): Promise<LoadedCanvasNodes> {
  const bridge = window.felixo?.canvas

  if (!bridge) {
    return { nodes: [], failed: false }
  }

  try {
    const result = await bridge.list()
    if (result.ok && Array.isArray(result.nodes)) {
      clearPersistenceFailure('load:nodes')
      return { nodes: result.nodes as PersistedCanvasNode[], failed: false }
    }
    reportPersistenceFailure(
      'load:nodes',
      describeFailure(result, 'Não foi possível ler o canvas salvo.'),
    )
  } catch (error) {
    reportPersistenceFailure(
      'load:nodes',
      describeFailure(error, 'Não foi possível ler o canvas salvo.'),
    )
  }
  return { nodes: [], failed: true }
}

/** Confere a resposta de uma gravação e a registra para a barra de status. */
function trackWrite(key: string, what: string, outcome: { result?: unknown; error?: unknown }) {
  const result = outcome.result as { ok?: boolean; message?: string } | undefined
  if (!outcome.error && result?.ok) {
    clearPersistenceFailure(key)
    return
  }
  const detail = describeFailure(outcome.error ?? result, 'falha desconhecida')
  console.error(`[canvas] ${what}`, key, detail)
  reportPersistenceFailure(key, `${what}: ${detail}`)
}

async function attempt<T>(run: () => Promise<T>): Promise<{ result?: T; error?: unknown }> {
  try {
    return { result: await run() }
  } catch (error) {
    return { error }
  }
}

export async function saveCanvasNode(node: PersistedCanvasNode): Promise<void> {
  const bridge = window.felixo?.canvas

  if (!bridge) {
    return
  }

  // A rejected write (e.g. a node type the stored schema doesn't accept
  // yet) must not vanish silently: the block would keep working for this
  // session and disappear on the next launch. Persistence stays best-effort —
  // the canvas remains usable in-memory — but the failure is shown in the
  // status bar and logged.
  trackWrite(
    `node:${node.id}`,
    'Não foi possível gravar um bloco; ele pode não voltar ao reabrir',
    await attempt(() => bridge.save(node)),
  )
}

export async function deleteCanvasNode(nodeId: string): Promise<void> {
  const bridge = window.felixo?.canvas

  if (!bridge) {
    return
  }

  trackWrite(
    `node:${nodeId}`,
    'Não foi possível remover um bloco; ele pode voltar ao reabrir',
    await attempt(() => bridge.delete(nodeId)),
  )
}

export async function clearCanvas(): Promise<{ ok: boolean; message?: string }> {
  const bridge = window.felixo?.canvas

  if (!bridge) {
    return { ok: true }
  }

  try {
    const result = await bridge.clear()
    return result.ok
      ? { ok: true }
      : { ok: false, message: result.message ?? 'Nao foi possivel limpar o canvas.' }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Nao foi possivel limpar o canvas.',
    }
  }
}

type TransferResult = {
  ok: boolean
  message?: string
  bundle?: CanvasTransferBundle
  nodes?: PersistedCanvasNode[]
  edges?: PersistedCanvasEdge[]
}

export async function exportCanvasBundle(
  nodes: PersistedCanvasNode[],
  edges: PersistedCanvasEdge[],
  options: { includeTerminalOutput?: boolean } = {},
): Promise<TransferResult> {
  const bridge = window.felixo?.canvas
  if (!bridge) {
    return { ok: false, message: 'Exportação disponível apenas no aplicativo.' }
  }

  try {
    const result = await bridge.exportBundle({
      nodes,
      edges,
      ...(options.includeTerminalOutput ? { includeTerminalOutput: true } : {}),
    })
    if (!result.ok || !result.bundle) {
      return { ok: false, message: result.message ?? 'Não foi possível exportar.' }
    }
    return { ok: true, bundle: result.bundle as CanvasTransferBundle }
  } catch (error) {
    return { ok: false, message: toTransferError(error, 'Não foi possível exportar.') }
  }
}

export async function importCanvasBundle(content: string): Promise<TransferResult> {
  const bridge = window.felixo?.canvas
  if (!bridge) {
    return { ok: false, message: 'Importação disponível apenas no aplicativo.' }
  }

  try {
    const result = await bridge.importBundle(content)
    if (!result.ok || !Array.isArray(result.nodes) || !Array.isArray(result.edges)) {
      return { ok: false, message: result.message ?? 'Não foi possível importar.' }
    }
    return { ok: true, nodes: result.nodes, edges: result.edges }
  } catch (error) {
    return { ok: false, message: toTransferError(error, 'Não foi possível importar.') }
  }
}

export async function validateCanvasBundle(content: string): Promise<TransferResult> {
  const bridge = window.felixo?.canvas
  if (!bridge) {
    return { ok: false, message: 'Importação disponível apenas no aplicativo.' }
  }

  try {
    const result = await bridge.validateImport(content)
    return result.ok
      ? { ok: true }
      : { ok: false, message: result.message ?? 'Arquivo .fxcanvas inválido.' }
  } catch (error) {
    return { ok: false, message: toTransferError(error, 'Arquivo .fxcanvas inválido.') }
  }
}

function toTransferError(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

export async function loadCanvasEdges(): Promise<Edge[]> {
  const bridge = window.felixo?.canvas

  if (!bridge) {
    return []
  }

  try {
    const result = await bridge.listEdges()
    if (result.ok && Array.isArray(result.edges)) {
      clearPersistenceFailure('load:edges')
      return result.edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
      }))
    }
    reportPersistenceFailure(
      'load:edges',
      describeFailure(result, 'Não foi possível ler as conexões salvas.'),
    )
  } catch (error) {
    reportPersistenceFailure(
      'load:edges',
      describeFailure(error, 'Não foi possível ler as conexões salvas.'),
    )
  }
  return []
}

export async function saveCanvasEdge(edge: Edge): Promise<void> {
  const bridge = window.felixo?.canvas

  if (!bridge) {
    return
  }

  trackWrite(
    `edge:${edge.id}`,
    'Não foi possível gravar uma conexão; ela pode sumir ao reabrir',
    await attempt(() =>
      bridge.saveEdge({ id: edge.id, source: edge.source, target: edge.target }),
    ),
  )
}

export async function deleteCanvasEdge(edgeId: string): Promise<void> {
  const bridge = window.felixo?.canvas

  if (!bridge) {
    return
  }

  trackWrite(
    `edge:${edgeId}`,
    'Não foi possível remover uma conexão; ela pode voltar ao reabrir',
    await attempt(() => bridge.deleteEdge(edgeId)),
  )
}

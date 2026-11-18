import type {
  CanvasAgentLaunchTask,
  GroupNodeData,
  GroupOrchestration,
  OrchestrationTask,
  OrchestrationTaskState,
} from '../types'
import type { SessionActivity } from '../terminal/terminal-session-api'

/** O mesmo teto por pedido de `felixo canvas abrir-agentes` (ver `normalizarPedido`). */
export const MAX_BATCH_TASKS = 20
const TITLE_MAX = 120
/** Numa linha, o que vem depois deste separador é o contexto da task. */
export const CONTEXT_SEPARATOR = ' :: '

/**
 * Lê o lote que a pessoa escreveu: uma task por linha, linhas em branco
 * ignoradas, e `título :: contexto` quando ela quer dar mais detalhe ao
 * agente. Passar de 20 tasks corta o resto e conta quantas ficaram de fora.
 */
export function parseBatchText(text: string): { tasks: CanvasAgentLaunchTask[]; ignored: number } {
  const all = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line): CanvasAgentLaunchTask => {
      // Com folga nas pontas, o separador também vale no começo ou no fim da linha.
      const padded = ` ${line} `
      const at = padded.indexOf(CONTEXT_SEPARATOR)
      const title = (at === -1 ? line : padded.slice(0, at)).trim().slice(0, TITLE_MAX)
      const context = at === -1 ? '' : padded.slice(at + CONTEXT_SEPARATOR.length).trim()
      return context ? { titulo: title, contexto: context } : { titulo: title }
    })
    .filter((task) => task.titulo !== '')
  return { tasks: all.slice(0, MAX_BATCH_TASKS), ignored: Math.max(0, all.length - MAX_BATCH_TASKS) }
}

export type OrchestrationLayout = {
  groupSize: { width: number; height: number }
  /** Posição de cada terminal DENTRO do grupo (relativa, como o React Flow espera de um filho). */
  childPositions: { x: number; y: number }[]
}

const GROUP_HEADER = 48
const GROUP_PADDING = 24
const GROUP_GAP = 24

/**
 * Tamanho do grupo e posição dos terminais dentro dele: uma matriz quase
 * quadrada, com a faixa do título do grupo livre no alto.
 */
export function layoutOrchestrationGroup(count: number, child: { width: number; height: number }): OrchestrationLayout {
  const total = Math.max(1, count)
  const columns = Math.ceil(Math.sqrt(total))
  const rows = Math.ceil(total / columns)
  return {
    groupSize: {
      width: GROUP_PADDING * 2 + columns * child.width + (columns - 1) * GROUP_GAP,
      height: GROUP_HEADER + GROUP_PADDING * 2 + rows * child.height + (rows - 1) * GROUP_GAP,
    },
    childPositions: Array.from({ length: count }, (_, index) => ({
      x: GROUP_PADDING + (index % columns) * (child.width + GROUP_GAP),
      y: GROUP_HEADER + GROUP_PADDING + Math.floor(index / columns) * (child.height + GROUP_GAP),
    })),
  }
}

/**
 * O lote gravado no grupo: as primeiras tasks já têm terminal (começam
 * rodando) e as que passaram do teto esperam, com o motivo.
 */
export function createOrchestration(params: {
  tasks: readonly CanvasAgentLaunchTask[]
  terminalIds: readonly string[]
  waitingNote?: string
  cwd?: string
  now: Date
  newId: () => string
}): GroupOrchestration {
  return {
    createdAt: params.now.toISOString(),
    ...(params.cwd ? { cwd: params.cwd } : {}),
    tasks: params.tasks.map((task, index): OrchestrationTask => {
      const terminalId = params.terminalIds[index]
      return terminalId
        ? { id: params.newId(), titulo: task.titulo, terminalId, state: 'running' }
        : {
            id: params.newId(),
            titulo: task.titulo,
            state: 'waiting',
            ...(params.waitingNote ? { note: params.waitingNote } : {}),
          }
    }),
  }
}

/**
 * Estado de uma task a partir da atividade do terminal dela.
 *
 * Um agente de CLI não sai quando acaba a task, então "concluída" é o agente
 * ter voltado a esperar (`idle`) depois de trabalhar; "ocioso" sem ter
 * trabalhado ainda é "rodando". Sair com código 0 também conclui; erro ou
 * código diferente de 0 é falha. O que a pessoa marcou à mão vale mais que a
 * atividade, e depois de reiniciar o app (`starting`) o último estado final
 * conhecido continua valendo em vez de voltar para "rodando".
 */
export function deriveTaskState(
  task: OrchestrationTask,
  activity: SessionActivity | undefined,
  exitCode?: number,
): { state: OrchestrationTaskState; worked: boolean } {
  const worked = task.worked === true
  if (task.manual && task.state === 'done') return { state: 'done', worked }
  if (!task.terminalId) return { state: 'waiting', worked }

  switch (activity) {
    case 'error':
      return { state: 'failed', worked }
    case 'exited':
      return { state: exitCode !== undefined && exitCode !== 0 ? 'failed' : 'done', worked }
    case 'working':
    case 'waiting_approval':
      return { state: 'running', worked: true }
    case 'idle':
      return { state: worked ? 'done' : 'running', worked }
    default:
      // 'starting' ou sem leitura ainda: não desfaz um estado final já gravado.
      return { state: task.state === 'done' || task.state === 'failed' ? task.state : 'running', worked }
  }
}

export function summarizeOrchestration(tasks: readonly OrchestrationTask[]): Record<OrchestrationTaskState | 'total', number> {
  const summary = { total: tasks.length, waiting: 0, running: 0, done: 0, failed: 0 }
  for (const task of tasks) summary[task.state] += 1
  return summary
}

/** Aplica um patch a uma task; `null` quando nada muda (quem grava não grava à toa). */
export function patchOrchestrationTask(
  orchestration: GroupOrchestration,
  taskId: string,
  patch: Partial<Omit<OrchestrationTask, 'id'>>,
): GroupOrchestration | null {
  const current = orchestration.tasks.find((task) => task.id === taskId)
  if (!current) return null
  const changed = (Object.keys(patch) as (keyof typeof patch)[]).some((key) => current[key] !== patch[key])
  if (!changed) return null
  return {
    ...orchestration,
    tasks: orchestration.tasks.map((task) => (task.id === taskId ? { ...task, ...patch } : task)),
  }
}

export type OrchestrationBatch = { groupId: string; label: string; orchestration: GroupOrchestration }

/** Os lotes do canvas: os grupos que carregam um `orchestration`, do mais novo ao mais antigo. */
export function listOrchestrationBatches(
  nodes: readonly { id: string; type?: string; data?: unknown }[],
): OrchestrationBatch[] {
  return nodes
    .flatMap((node): OrchestrationBatch[] => {
      if (node.type !== 'group') return []
      const data = (node.data ?? {}) as GroupNodeData
      const orchestration = data.orchestration
      if (!orchestration || !Array.isArray(orchestration.tasks)) return []
      return [{ groupId: node.id, label: data.label || 'Orquestração', orchestration }]
    })
    .sort((left, right) => right.orchestration.createdAt.localeCompare(left.orchestration.createdAt))
}

export const TASK_STATE_LABEL: Record<OrchestrationTaskState, string> = {
  waiting: 'Esperando',
  running: 'Rodando',
  done: 'Concluída',
  failed: 'Falhou',
}

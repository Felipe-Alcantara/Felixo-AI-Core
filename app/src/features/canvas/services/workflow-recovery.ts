// Retomada de um workflow multiagente depois de o app (ou o PC) cair no meio do
// trabalho. Cada agente guarda no próprio bloco um "ponto de salvamento"
// (`workMark`): a última vez que o app o viu trabalhando ou esperando uma
// decisão. A conversa de cada agente já volta sozinha pelo ID (ver
// `agent-session.ts`); o que faltava era saber QUEM estava no meio de um turno
// e mandar cada um continuar. Puro e sem DOM, para o vitest rodar em node.
import { isAgentSessionReference } from './agent-session'
import type { SessionActivity } from '../terminal/terminal-session-api'

/** O ponto de salvamento do agente; some quando o agente termina o turno. */
export type WorkMark = { state: 'working' | 'waiting_approval'; at: number }

export const MAX_PARALLEL_RESUMES = 4
/** Quanto esperar o agente restaurado ficar pronto para receber texto. */
export const READY_TIMEOUT_MS = 90_000
/** Depois deste tempo sem o agente aparecer trabalhando, o envio vale como entregue. */
export const SETTLE_MS = 120_000

export const RECOVERY_PROMPT =
  'O app fechou de repente enquanto você trabalhava e esta conversa foi retomada. ' +
  'Releia o plano compartilhado, confira no disco e no git o que já está pronto e continue de onde parou, ' +
  'sem refazer o que foi concluído. Se já tinha terminado, responda só "nada pendente".'

export function isWorkMark(value: unknown): value is WorkMark {
  if (!value || typeof value !== 'object') return false
  const { state, at } = value as Partial<WorkMark>
  return (state === 'working' || state === 'waiting_approval') && typeof at === 'number'
}

/**
 * O que gravar no bloco quando a atividade do agente muda; `null` quando nada
 * muda. Só `idle` apaga o ponto: sair (`exited`) é o que o fechamento do app
 * causa em todos, e justamente aí o ponto precisa sobreviver.
 */
export function workMarkPatch(
  activity: SessionActivity,
  current: unknown,
  now: number,
): { workMark: WorkMark | undefined } | null {
  if (activity === 'working' || activity === 'waiting_approval') {
    if (isWorkMark(current) && current.state === activity) return null
    return { workMark: { state: activity, at: now } }
  }
  if (activity === 'idle' && current !== undefined) return { workMark: undefined }
  return null
}

type RecoveryNode = { id: string; type?: string; data?: unknown }
type RecoveryEdge = { source: string; target: string }

/**
 * Os agentes interrompidos que dá para retomar: com ponto de salvamento e com a
 * conversa associada (sem ela, a CLI só abriria a lista e o texto iria para o
 * lugar errado).
 */
export function interruptedAgentIds(nodes: readonly RecoveryNode[]): string[] {
  return nodes
    .filter((node) => {
      if (node.type !== 'terminal') return false
      const data = (node.data ?? {}) as { workMark?: unknown; agentSession?: unknown }
      return isWorkMark(data.workMark) && isAgentSessionReference(data.agentSession)
    })
    .map((node) => node.id)
}

/**
 * Quem entrega vem antes de quem recebe (coordenador, produtores, checador),
 * seguindo as ligações do canvas; a ordem original desempata e um ciclo cai de
 * volta nela em vez de travar.
 */
export function orderByDelivery(ids: readonly string[], edges: readonly RecoveryEdge[]): string[] {
  const inSet = new Set(ids)
  const pending = new Map(ids.map((id) => [id, 0]))
  for (const { source, target } of edges) {
    if (inSet.has(source) && inSet.has(target) && source !== target) {
      pending.set(target, (pending.get(target) ?? 0) + 1)
    }
  }
  const ordered: string[] = []
  const left = [...ids]
  while (left.length > 0) {
    const index = left.findIndex((id) => pending.get(id) === 0)
    const [id] = left.splice(index === -1 ? 0 : index, 1)
    ordered.push(id)
    for (const { source, target } of edges) {
      if (source === id && inSet.has(target) && source !== target) {
        pending.set(target, Math.max(0, (pending.get(target) ?? 0) - 1))
      }
    }
  }
  return ordered
}

export type ResumeEntry = {
  phase: 'waiting' | 'sent' | 'done' | 'skipped'
  sentAt?: number
  sawWorking?: boolean
}
export type ResumeRun = { startedAt: number; order: string[]; entries: Record<string, ResumeEntry> }

export function startResumeRun(order: readonly string[], now: number): ResumeRun {
  return {
    startedAt: now,
    order: [...order],
    entries: Object.fromEntries(order.map((id) => [id, { phase: 'waiting' } as ResumeEntry])),
  }
}

export function isResumeRunFinished(run: ResumeRun): boolean {
  return run.order.every((id) => run.entries[id].phase === 'done' || run.entries[id].phase === 'skipped')
}

/**
 * Um passo da retomada: fecha os envios que terminaram, desiste dos agentes que
 * não ficaram prontos a tempo e libera o envio para os que estão prontos,
 * no máximo `MAX_PARALLEL_RESUMES` trabalhando ao mesmo tempo (a conta do
 * provedor é uma só). Quem espera uma decisão da pessoa não ocupa vaga.
 */
export function advanceResumeRun(
  run: ResumeRun,
  activities: Readonly<Record<string, SessionActivity | undefined>>,
  now: number,
): { run: ResumeRun; send: string[] } {
  const entries: Record<string, ResumeEntry> = {}
  for (const id of run.order) entries[id] = { ...run.entries[id] }

  for (const id of run.order) {
    const entry = entries[id]
    if (entry.phase !== 'sent') continue
    const activity = activities[id]
    if (activity === 'working') entry.sawWorking = true
    const finished = activity === 'idle' && entry.sawWorking
    if (finished || now - (entry.sentAt ?? now) > SETTLE_MS) entry.phase = 'done'
  }

  let free =
    MAX_PARALLEL_RESUMES -
    run.order.filter((id) => entries[id].phase === 'sent' && activities[id] !== 'waiting_approval').length
  const send: string[] = []
  for (const id of run.order) {
    const entry = entries[id]
    if (entry.phase !== 'waiting') continue
    if (activities[id] === 'idle') {
      if (free <= 0) continue
      free -= 1
      entry.phase = 'sent'
      entry.sentAt = now
      send.push(id)
    } else if (now - run.startedAt > READY_TIMEOUT_MS) {
      entry.phase = 'skipped'
    }
  }
  return { run: { ...run, entries }, send }
}

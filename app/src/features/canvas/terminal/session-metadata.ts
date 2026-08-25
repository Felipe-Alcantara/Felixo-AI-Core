import type { SessionActivity } from './terminal-session-store'
import type { AgentSessionReference } from '../services/agent-session'

export type SessionMetadata = {
  elementId: string
  ptySessionId: string
  activity: SessionActivity
  startedAt?: number
  cwd?: string
  command?: string
  args: string[]
  label?: string
  /** Agent-owned resume/session id, when a CLI exposes one explicitly. */
  agentSessionId?: string
  agentSession?: AgentSessionReference
}

export const SESSION_ACTIVITY_LABEL: Record<SessionActivity, string> = {
  starting: 'Iniciando',
  working: 'Trabalhando',
  idle: 'Ocioso',
  waiting_approval: 'Aguardando aprovação',
  exited: 'Encerrado',
  error: 'Erro',
}

/** Formats the PTY lifetime without pretending to know time before spawn. */
export function formatSessionAge(startedAt: number | undefined, now = Date.now()): string {
  if (startedAt == null || !Number.isFinite(startedAt)) {
    return 'tempo indisponível'
  }

  const elapsed = Math.max(0, now - startedAt)
  const totalSeconds = Math.floor(elapsed / 1000)
  const days = Math.floor(totalSeconds / 86_400)
  const hours = Math.floor((totalSeconds % 86_400) / 3_600)
  const minutes = Math.floor((totalSeconds % 3_600) / 60)
  const seconds = totalSeconds % 60

  if (days > 0) return `${days}d ${hours}h ${minutes}min`
  if (hours > 0) return `${hours}h ${minutes}min`
  if (minutes > 0) return `${minutes}min ${seconds}s`
  return `${seconds}s`
}

export function formatSessionStart(startedAt: number | undefined): string {
  if (startedAt == null || !Number.isFinite(startedAt)) {
    return 'início indisponível'
  }
  return new Date(startedAt).toLocaleString('pt-BR')
}

export function activityLabel(activity: SessionActivity): string {
  return SESSION_ACTIVITY_LABEL[activity]
}

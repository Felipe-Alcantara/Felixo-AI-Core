import type { TerminalResumeChooser } from './terminal-resume-banner'

/**
 * Uma conversa da CLI como a lista a mostra: só ID, pasta e data. O ID é o que
 * a retomada usa e nunca aparece em texto; título e conteúdo nem saem do
 * processo principal (podem ter dado sensível).
 */
export type ListedAgentSession = {
  sessionId: string
  cwd: string
  /** Última modificação do histórico, em ms. */
  modifiedAt: number
}

export type AgentSessionList = {
  /** Da pasta do bloco: a retomada exata aceita. */
  folder: ListedAgentSession[]
  /** De outras pastas da mesma conta: o bloco muda de pasta para retomá-las. */
  account: ListedAgentSession[]
}

const SESSION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,255}$/

function readSessions(value: unknown): ListedAgentSession[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item): ListedAgentSession[] => {
    const session = item as Partial<ListedAgentSession> | null
    return session &&
      typeof session.sessionId === 'string' &&
      SESSION_ID_PATTERN.test(session.sessionId) &&
      typeof session.cwd === 'string' &&
      session.cwd.trim().length > 0 &&
      typeof session.modifiedAt === 'number' &&
      Number.isFinite(session.modifiedAt)
      ? [{ sessionId: session.sessionId, cwd: session.cwd, modifiedAt: session.modifiedAt }]
      : []
  })
}

/**
 * Pede ao processo principal as conversas da pasta e da conta do bloco.
 * `null` quando não dá para listar (sem ponte, erro): a faixa segue com as
 * outras saídas.
 */
export async function loadAgentSessionList(lookup: TerminalResumeChooser): Promise<AgentSessionList | null> {
  const read = window.felixo?.pty?.listSessions
  if (!read) return null
  try {
    const result = await read(lookup)
    if (!result?.ok) return null
    return { folder: readSessions(result.folder), account: readSessions(result.account) }
  } catch {
    return null
  }
}

/** "17/11 14:26 · Felixo-AI-Core": a pessoa reconhece pela data e pela pasta, nunca pelo ID. */
export function describeListedSession(session: ListedAgentSession, showFolder: boolean): string {
  const when = new Date(session.modifiedAt).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
  if (!showFolder) return when
  const name = session.cwd.split(/[\\/]/).filter(Boolean).at(-1) ?? session.cwd
  return `${when} · ${name}`
}

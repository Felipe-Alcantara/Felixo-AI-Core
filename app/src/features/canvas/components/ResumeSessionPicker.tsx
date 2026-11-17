import { useEffect, useState } from 'react'
import {
  describeListedSession,
  loadAgentSessionList,
  type AgentSessionList,
  type ListedAgentSession,
} from '../services/agent-session-list'
import type { TerminalResumeChooser } from '../services/terminal-resume-banner'

const VISIBLE_PER_GROUP = 8

type Props = {
  lookup: TerminalResumeChooser
  /** Tamanho do texto: o cartão é compacto, a gaveta não. */
  compact?: boolean
  onChoose: (session: ListedAgentSession) => void
  onClose: () => void
}

/**
 * Lista das conversas da pasta do bloco e das outras pastas da mesma conta,
 * para retomar uma delas sem sair do app. Só data e pasta: nenhum ID, título
 * ou texto de conversa aparece. Uma conversa de outra pasta muda a pasta do
 * bloco, então pede confirmação antes.
 */
export function ResumeSessionPicker({ lookup, compact = false, onChoose, onClose }: Props) {
  const [list, setList] = useState<AgentSessionList | null | undefined>(undefined)

  const { command, cwd, accountId, providerId } = lookup
  useEffect(() => {
    let active = true
    void loadAgentSessionList({ command, cwd, accountId, providerId }).then((loaded) => {
      if (active) setList(loaded)
    })
    return () => {
      active = false
    }
  }, [command, cwd, accountId, providerId])

  const choose = (session: ListedAgentSession) => {
    if (
      session.cwd !== lookup.cwd &&
      !window.confirm(`Esta conversa é da pasta ${session.cwd}. O bloco passa a abrir nessa pasta. Continuar?`)
    ) {
      return
    }
    onChoose(session)
  }

  const size = compact ? 'text-[10px]' : 'text-[11px]'
  const group = (title: string, sessions: ListedAgentSession[], showFolder: boolean) =>
    sessions.length > 0 && (
      <div>
        <p className="font-semibold text-zinc-300">{title}</p>
        <ul className="mt-0.5 flex flex-col gap-0.5">
          {sessions.slice(0, VISIBLE_PER_GROUP).map((session) => (
            <li key={session.sessionId}>
              <button
                type="button"
                onClick={() => choose(session)}
                title={showFolder ? session.cwd : undefined}
                className="felixo-btn w-full truncate rounded-sm bg-black/25 px-1.5 py-0.5 text-left text-zinc-100 hover:bg-black/40"
              >
                {describeListedSession(session, showFolder)}
              </button>
            </li>
          ))}
        </ul>
      </div>
    )

  return (
    <div data-terminal-resume-picker className={`mt-1 flex flex-col gap-1 ${size} text-zinc-200`}>
      {list === undefined && <p>Procurando conversas…</p>}
      {list === null && <p>Não foi possível listar as conversas agora.</p>}
      {list && list.folder.length === 0 && list.account.length === 0 && (
        <p>Nenhuma outra conversa encontrada nesta conta.</p>
      )}
      {list && group('Nesta pasta', list.folder, false)}
      {list && group('Em outras pastas da conta', list.account, true)}
      <div>
        <button
          type="button"
          onClick={onClose}
          className="felixo-btn rounded-sm bg-black/25 px-1.5 py-0.5 text-zinc-100 hover:bg-black/40"
        >
          Fechar lista
        </button>
      </div>
    </div>
  )
}

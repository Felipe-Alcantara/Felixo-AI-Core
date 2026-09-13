import { History } from 'lucide-react'
import type { GitCommit } from '../../../chat/types'
import { formatRelativeTime } from '../notification-time'

type GitHistoryProps = {
  commits: GitCommit[]
  loading: boolean
  /** Quantos commits a branch tem à frente do upstream — eles ganham marca. */
  ahead: number
  /** Instante em que a lista foi lida; o "há X" é relativo a ele. */
  now: number
}

/**
 * Histórico recente da branch.
 *
 * Uma linha por commit: assunto, autor e há quanto tempo. Os que ainda não
 * subiram para o remoto vêm marcados — é a pergunta que se faz antes de dar
 * push ("o que vai junto?"), e a lista responde sem abrir terminal.
 */
export function GitHistory({ commits, loading, ahead, now }: GitHistoryProps) {
  if (loading && commits.length === 0) {
    return <p className="felixo-scm-note">Lendo o histórico…</p>
  }

  if (commits.length === 0) {
    return (
      <p className="felixo-scm-note">
        <History size={13} aria-hidden />
        Nenhum commit ainda.
      </p>
    )
  }

  return (
    <ol className="felixo-scm-log">
      {commits.map((commit, index) => {
        const local = index < ahead
        const when = Date.parse(commit.date)
        return (
          <li key={commit.hash} className={`felixo-scm-log-item ${local ? 'is-local' : ''}`}>
            <span className="felixo-scm-log-subject" title={commit.subject}>
              {commit.subject}
            </span>
            <span className="felixo-scm-log-meta">
              <code>{commit.shortHash}</code>
              <span>{commit.author}</span>
              {Number.isFinite(when) && <span>{formatRelativeTime(when, now)}</span>}
              {local && <span className="felixo-scm-log-local">não enviado</span>}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

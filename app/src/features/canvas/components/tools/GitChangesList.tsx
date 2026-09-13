import type { ReactNode } from 'react'
import { Undo2 } from 'lucide-react'
import { splitPath, statusDescriptor, type GitStatusEntry } from './git-status'

export type SelectedFile = {
  path: string
  staged: boolean
  untracked: boolean
  /** Aberto pelo explorador sem ter alteração nenhuma pendente. */
  clean?: boolean
}

type GitChangesListProps = {
  title: string
  entries: GitStatusEntry[]
  selected: SelectedFile | null
  /** `true` no grupo que mostra o lado do stage. */
  stagedSide: boolean
  actionLabel: string
  actionIcon: ReactNode
  bulkLabel: string
  disabled: boolean
  onOpen: (entry: GitStatusEntry) => void
  onFileAction: (entry: GitStatusEntry) => void
  onBulk: () => void
  /** Só no grupo de alterações: joga fora o que mudou no arquivo. */
  onDiscard?: (entry: GitStatusEntry) => void
}

/**
 * Um grupo da lista de alterações ("Stage" ou "Alterações").
 *
 * A lista é por arquivo, não as linhas cruas do `git status --short`: quem vai
 * revisar um commit precisa ver o que mudou em cada arquivo e escolher, um a
 * um, o que entra — e não decorar o formato porcelain. Um mesmo arquivo pode
 * aparecer nos dois grupos (editado depois de adicionado é o caso comum), que
 * é exatamente o que a lista antiga escondia ao mostrar só uma linha de texto.
 */
export function GitChangesList({
  title,
  entries,
  selected,
  stagedSide,
  actionLabel,
  actionIcon,
  bulkLabel,
  disabled,
  onOpen,
  onFileAction,
  onBulk,
  onDiscard,
}: GitChangesListProps) {
  if (entries.length === 0) return null

  return (
    <section className="felixo-scm-group">
      <header className="felixo-scm-group-head">
        <span className="felixo-scm-group-title">{title}</span>
        <span className="felixo-scm-count">{entries.length}</span>
        <button
          type="button"
          onClick={onBulk}
          disabled={disabled}
          className="felixo-btn-icon felixo-scm-group-action"
          title={bulkLabel}
          aria-label={bulkLabel}
        >
          {actionIcon}
        </button>
      </header>
      <ul className="felixo-scm-list">
        {entries.map((entry) => {
          const { dir, name } = splitPath(entry.path)
          const badge = statusDescriptor(entry, stagedSide)
          const active =
            selected?.path === entry.path && selected.staged === stagedSide && !selected.clean
          return (
            <li key={entry.path}>
              <div className={`felixo-scm-row ${active ? 'is-active' : ''}`}>
                <button
                  type="button"
                  onClick={() => onOpen(entry)}
                  className="felixo-scm-open"
                  title={entry.path}
                >
                  <span className="felixo-scm-name">{name}</span>
                  {dir && <span className="felixo-scm-dir">{dir}</span>}
                </button>
                {onDiscard && (
                  <button
                    type="button"
                    onClick={() => onDiscard(entry)}
                    disabled={disabled}
                    className="felixo-btn-icon felixo-scm-row-action is-danger"
                    title={`Descartar alterações: ${entry.path}`}
                    aria-label={`Descartar alterações: ${entry.path}`}
                  >
                    <Undo2 size={13} aria-hidden />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onFileAction(entry)}
                  disabled={disabled}
                  className="felixo-btn-icon felixo-scm-row-action"
                  title={`${actionLabel}: ${entry.path}`}
                  aria-label={`${actionLabel}: ${entry.path}`}
                >
                  {actionIcon}
                </button>
                <span
                  className={`felixo-scm-badge is-${badge.tone}`}
                  title={badge.label}
                  aria-label={badge.label}
                >
                  {badge.letter}
                </span>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

import { useMemo, type ReactNode } from 'react'
import { parseDiff } from './git-diff'

type DiffFile = { path: string; staged: boolean; untracked: boolean } | null

type GitDiffViewProps = {
  file: DiffFile
  /** Saída bruta do `git diff`; `null` quando a leitura falhou. */
  diff: string | null
  loading: boolean
  icone: ReactNode
}

/**
 * Leitor de diferenças de um arquivo.
 *
 * Mostra os números das linhas dos dois lados: um diff sem eles obriga a abrir
 * o arquivo para saber onde a mudança caiu.
 */
export function GitDiffView({ file, diff, loading, icone }: GitDiffViewProps) {
  const lines = useMemo(() => parseDiff(diff), [diff])

  if (!file) {
    return (
      <div className="felixo-scm-diff is-empty">
        {icone}
        <p>Escolha um arquivo para ver o que mudou.</p>
      </div>
    )
  }

  return (
    <div className="felixo-scm-diff">
      <header className="felixo-scm-diff-head">
        <span className="felixo-scm-diff-path" title={file.path}>
          {file.path}
        </span>
        <span className="felixo-scm-diff-side">
          {file.untracked ? 'arquivo novo' : file.staged ? 'no stage' : 'não preparado'}
        </span>
      </header>

      {loading && <p className="felixo-scm-diff-status">Lendo diferenças…</p>}

      {!loading && lines.length === 0 && (
        <p className="felixo-scm-diff-status">
          {diff === null
            ? 'Não foi possível ler as diferenças deste arquivo.'
            : 'Sem diferenças de texto para mostrar — pode ser arquivo binário ou apenas mudança de permissão.'}
        </p>
      )}

      {!loading && lines.length > 0 && (
        <div className="felixo-scm-diff-body">
          <table className="felixo-scm-diff-table">
            <tbody>
              {lines.map((line, index) => (
                <tr key={index} className={`felixo-diff-${line.kind}`}>
                  <td className="felixo-diff-num" aria-hidden>
                    {line.oldNumber ?? ''}
                  </td>
                  <td className="felixo-diff-num" aria-hidden>
                    {line.newNumber ?? ''}
                  </td>
                  <td className="felixo-diff-text">
                    <pre>{line.text === '' ? ' ' : line.text}</pre>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

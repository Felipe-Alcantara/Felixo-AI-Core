import { useMemo, type ReactNode } from 'react'
import type { GitRepoFile } from '../../../chat/types'
import { parseDiff } from './git-diff'

type DiffFile = {
  path: string
  staged: boolean
  untracked: boolean
  /** Aberto pelo explorador sem alteração pendente: mostra o conteúdo, não um diff. */
  clean?: boolean
} | null

type GitDiffViewProps = {
  file: DiffFile
  /** Saída bruta do `git diff`; `null` quando a leitura falhou. */
  diff: string | null
  loading: boolean
  /** Conteúdo do arquivo, quando ele foi aberto limpo pelo explorador. */
  content?: GitRepoFile | null
  icone: ReactNode
}

/**
 * Leitor do arquivo escolhido: o diff de quem mudou, o conteúdo de quem não.
 *
 * Os dois usam a mesma tabela com números de linha — um diff sem eles obriga
 * a abrir o arquivo para saber onde a mudança caiu, e um arquivo sem eles
 * não dá referência para conversar sobre ele.
 */
export function GitDiffView({ file, diff, loading, content, icone }: GitDiffViewProps) {
  const lines = useMemo(() => parseDiff(diff), [diff])
  const contentLines = useMemo(
    () => (content && !content.binary && !content.truncated ? splitLines(content.content) : []),
    [content],
  )

  if (!file) {
    return (
      <div className="felixo-scm-diff is-empty">
        {icone}
        <p>Escolha um arquivo para ver o que mudou.</p>
      </div>
    )
  }

  const side = file.clean
    ? 'sem alterações'
    : file.untracked
      ? 'arquivo novo'
      : file.staged
        ? 'no stage'
        : 'não preparado'

  return (
    <div className="felixo-scm-diff">
      <header className="felixo-scm-diff-head">
        <span className="felixo-scm-diff-path" title={file.path}>
          {file.path}
        </span>
        <span className="felixo-scm-diff-side">
          {side}
          {content && !content.binary && ` · ${formatSize(content.size)}`}
        </span>
      </header>

      {loading && (
        <p className="felixo-scm-diff-status">
          {file.clean ? 'Lendo o arquivo…' : 'Lendo diferenças…'}
        </p>
      )}

      {!loading && file.clean && content?.binary && (
        <p className="felixo-scm-diff-status">
          Arquivo binário ({formatSize(content.size)}) — não há texto para mostrar.
        </p>
      )}

      {!loading && file.clean && content?.truncated && (
        <p className="felixo-scm-diff-status">
          Arquivo grande demais para abrir aqui ({formatSize(content.size)}). Abra no editor.
        </p>
      )}

      {!loading && file.clean && !content && (
        <p className="felixo-scm-diff-status">Não foi possível ler este arquivo.</p>
      )}

      {!loading && file.clean && contentLines.length > 0 && (
        <div className="felixo-scm-diff-body">
          <table className="felixo-scm-diff-table is-plain">
            <tbody>
              {contentLines.map((text, index) => (
                <tr key={index} className="felixo-diff-context">
                  <td className="felixo-diff-num" aria-hidden>
                    {index + 1}
                  </td>
                  <td className="felixo-diff-text">
                    <pre>{text === '' ? ' ' : text}</pre>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && !file.clean && lines.length === 0 && (
        <p className="felixo-scm-diff-status">
          {diff === null
            ? 'Não foi possível ler as diferenças deste arquivo.'
            : 'Sem diferenças de texto para mostrar — pode ser arquivo binário ou apenas mudança de permissão.'}
        </p>
      )}

      {!loading && !file.clean && lines.length > 0 && (
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

/** Quebra em linhas sem inventar uma linha vazia extra no final do arquivo. */
function splitLines(text: string): string[] {
  const lines = text.split(/\r?\n/)
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop()
  return lines
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

import { useMemo } from 'react'
import {
  ChevronDown,
  ChevronRight,
  File,
  Folder,
  FolderOpen,
  ListFilter,
  Search,
} from 'lucide-react'
import { statusDescriptor } from './git-status'
import {
  filterRepoTree,
  type RepoDirNode,
  type RepoNode,
} from './repo-tree'

type GitExplorerProps = {
  root: RepoDirNode
  /** Pastas abertas, por caminho. */
  expanded: ReadonlySet<string>
  selectedPath: string | null
  query: string
  changedOnly: boolean
  loading: boolean
  truncated: boolean
  total: number
  onQueryChange: (value: string) => void
  onChangedOnlyChange: (value: boolean) => void
  onToggleDir: (path: string) => void
  onOpenFile: (path: string) => void
}

/**
 * Explorador do repositório.
 *
 * É a árvore que o git enxerga, não a do disco: o que o .gitignore exclui não
 * chega até aqui, então a raiz abre sem `node_modules` nem pasta de build
 * enterrando o projeto. Cada pasta carrega quantos arquivos alterados existem
 * dentro dela — é o que permite achar a mudança de fora para dentro, sem abrir
 * pasta por pasta, e é a parte que o explorador de arquivos comum não dá.
 */
export function GitExplorer({
  root,
  expanded,
  selectedPath,
  query,
  changedOnly,
  loading,
  truncated,
  total,
  onQueryChange,
  onChangedOnlyChange,
  onToggleDir,
  onOpenFile,
}: GitExplorerProps) {
  const visible = useMemo(
    () => (query.trim() || changedOnly ? filterRepoTree(root, { query, changedOnly }) : root),
    [changedOnly, query, root],
  )

  // Com filtro ativo a árvore inteira abre: esconder o resultado atrás de uma
  // pasta fechada seria pedir para procurar duas vezes.
  const forceOpen = Boolean(query.trim()) || changedOnly

  return (
    <section className="felixo-scm-explorer" aria-label="Explorador do repositório">
      <header className="felixo-scm-explorer-head">
        <span className="felixo-scm-group-title">Explorer</span>
        <span className="felixo-scm-count">{total}</span>
        <button
          type="button"
          onClick={() => onChangedOnlyChange(!changedOnly)}
          className={`felixo-btn-icon felixo-scm-explorer-toggle ${changedOnly ? 'is-on' : ''}`}
          title={changedOnly ? 'Mostrar todo o repositório' : 'Mostrar só o que mudou'}
          aria-pressed={changedOnly}
        >
          <ListFilter size={13} aria-hidden />
        </button>
      </header>

      <div className="felixo-scm-explorer-search">
        <Search size={12} aria-hidden />
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Filtrar arquivos…"
          aria-label="Filtrar arquivos do repositório"
          spellCheck={false}
        />
      </div>

      <div className="felixo-scm-tree" role="tree">
        {loading && <p className="felixo-scm-explorer-note">Lendo o repositório…</p>}

        {!loading && visible.children.length === 0 && (
          <p className="felixo-scm-explorer-note">
            {changedOnly ? 'Nada alterado por aqui.' : 'Nenhum arquivo corresponde ao filtro.'}
          </p>
        )}

        {visible.children.map((node) => (
          <TreeRow
            key={node.path}
            node={node}
            depth={0}
            expanded={expanded}
            forceOpen={forceOpen}
            selectedPath={selectedPath}
            onToggleDir={onToggleDir}
            onOpenFile={onOpenFile}
          />
        ))}

        {truncated && (
          <p className="felixo-scm-explorer-note">
            Repositório grande: a árvore mostra os primeiros arquivos. Use o filtro para
            chegar no resto.
          </p>
        )}
      </div>
    </section>
  )
}

type TreeRowProps = {
  node: RepoNode
  depth: number
  expanded: ReadonlySet<string>
  forceOpen: boolean
  selectedPath: string | null
  onToggleDir: (path: string) => void
  onOpenFile: (path: string) => void
}

function TreeRow({
  node,
  depth,
  expanded,
  forceOpen,
  selectedPath,
  onToggleDir,
  onOpenFile,
}: TreeRowProps) {
  // O recuo é do botão, não de um espaçador à parte: assim a faixa de clique
  // cobre a linha inteira, como em qualquer árvore de arquivos.
  const indent = { paddingLeft: `${depth * 0.7 + 0.3}rem` }

  if (node.kind === 'dir') {
    const open = forceOpen || expanded.has(node.path)
    return (
      <>
        <button
          type="button"
          onClick={() => onToggleDir(node.path)}
          className="felixo-scm-tree-row is-dir"
          style={indent}
          title={node.path}
          aria-expanded={open}
        >
          {open ? (
            <ChevronDown size={12} className="felixo-scm-tree-chevron" aria-hidden />
          ) : (
            <ChevronRight size={12} className="felixo-scm-tree-chevron" aria-hidden />
          )}
          {open ? (
            <FolderOpen size={13} className="felixo-scm-tree-icon" aria-hidden />
          ) : (
            <Folder size={13} className="felixo-scm-tree-icon" aria-hidden />
          )}
          <span className="felixo-scm-tree-name">{node.name}</span>
          {node.changed > 0 && (
            <span
              className="felixo-scm-tree-changed"
              title={`${node.changed} arquivo(s) alterado(s) aqui dentro`}
            >
              {node.changed}
            </span>
          )}
        </button>

        {open &&
          node.children.map((child) => (
            <TreeRow
              key={child.path}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              forceOpen={forceOpen}
              selectedPath={selectedPath}
              onToggleDir={onToggleDir}
              onOpenFile={onOpenFile}
            />
          ))}
      </>
    )
  }

  const badge = node.entry
    ? statusDescriptor(node.entry, node.entry.staged && !node.entry.unstaged)
    : null

  return (
    <button
      type="button"
      onClick={() => onOpenFile(node.path)}
      className={`felixo-scm-tree-row is-file ${selectedPath === node.path ? 'is-active' : ''} ${
        badge ? `is-${badge.tone}` : ''
      }`}
      style={indent}
      title={node.path}
    >
      <span className="felixo-scm-tree-chevron" aria-hidden />
      <File size={13} className="felixo-scm-tree-icon" aria-hidden />
      <span className="felixo-scm-tree-name">{node.name}</span>
      {badge && (
        <span className={`felixo-scm-badge is-${badge.tone}`} title={badge.label}>
          {badge.letter}
        </span>
      )}
    </button>
  )
}

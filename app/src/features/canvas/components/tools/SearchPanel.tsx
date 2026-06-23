import { useMemo, useState } from 'react'
import type { Node } from '@xyflow/react'
import { FileText, Notebook, Search, Square, Terminal } from 'lucide-react'
import { CanvasPanel } from './CanvasPanel'
import type { CanvasNodeData } from '../../types'

type SearchPanelProps = {
  nodes: Node<CanvasNodeData>[]
  /** Centers/zooms the canvas on a node and selects it. */
  onFocusNode: (nodeId: string) => void
  onClose: () => void
}

type SearchHit = {
  id: string
  type: string
  title: string
  /** A short snippet of the matched text, for context. */
  snippet: string
}

const TYPE_ICON: Record<string, typeof FileText> = {
  file: FileText,
  note: Notebook,
  terminal: Terminal,
  group: Square,
}

/** All searchable text for a node, lowercased once for matching. */
function searchableText(node: Node<CanvasNodeData>): string {
  const data = node.data ?? {}
  return [data.label, data.fileName, data.text, data.command]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toLowerCase()
}

/** A human title for a node when it has no explicit label. */
function nodeTitle(node: Node<CanvasNodeData>): string {
  const data = node.data ?? {}
  return (
    data.label ||
    data.fileName ||
    data.command ||
    (data.text ? data.text.slice(0, 40) : '') ||
    `${node.type ?? 'bloco'} ${node.id.slice(0, 6)}`
  )
}

/**
 * Visual search for the canvas — the counterpart to the chat's session search.
 * Instead of messages, it finds BLOCKS by their title, file name, note text or
 * terminal command; picking a result centers and selects that block.
 */
export function SearchPanel({ nodes, onFocusNode, onClose }: SearchPanelProps) {
  const [query, setQuery] = useState('')

  const hits = useMemo<SearchHit[]>(() => {
    const term = query.trim().toLowerCase()
    if (!term) {
      return []
    }
    return nodes.flatMap((node) => {
      const haystack = searchableText(node)
      const at = haystack.indexOf(term)
      if (at === -1) {
        return []
      }
      const start = Math.max(0, at - 16)
      const snippet = `${start > 0 ? '…' : ''}${haystack.slice(start, at + term.length + 24)}`
      return [
        {
          id: node.id,
          type: node.type ?? 'bloco',
          title: nodeTitle(node),
          snippet,
        },
      ]
    })
  }, [nodes, query])

  return (
    <CanvasPanel title="Pesquisar" icon={<Search size={15} />} onClose={onClose}>
      <input
        autoFocus
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Buscar blocos por título, arquivo, nota ou comando…"
        className="mb-3 w-full rounded border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-sky-500/50"
      />

      {query.trim() && hits.length === 0 && (
        <p className="text-sm text-zinc-500">Nenhum bloco encontrado.</p>
      )}

      <ul className="flex flex-col gap-1">
        {hits.map((hit) => {
          const Icon = TYPE_ICON[hit.type] ?? Square
          return (
            <li key={hit.id}>
              <button
                type="button"
                onClick={() => onFocusNode(hit.id)}
                className="flex w-full items-start gap-2 rounded px-2 py-1.5 text-left hover:bg-white/5"
              >
                <Icon size={14} className="mt-0.5 shrink-0 text-zinc-400" />
                <span className="min-w-0">
                  <span className="block truncate text-sm text-zinc-100">{hit.title}</span>
                  <span className="block truncate text-xs text-zinc-500">{hit.snippet}</span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </CanvasPanel>
  )
}

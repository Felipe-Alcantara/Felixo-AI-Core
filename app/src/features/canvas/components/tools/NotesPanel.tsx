import { useCallback, useEffect, useRef, useState } from 'react'
import type { Node } from '@xyflow/react'
import { Notebook, Plus, StickyNote, Trash2 } from 'lucide-react'
import { CanvasPanel } from './CanvasPanel'
import type { CanvasNodeData } from '../../types'

type CanvasNote = {
  id: string
  title: string
  content: string
  projectIds: string[]
  createdAt: string
  updatedAt: string
}

type NotesPanelProps = {
  /** All canvas nodes; the panel lists the ones of type "note". */
  nodes: Node<CanvasNodeData>[]
  /** Centers/zooms the canvas on a note block and selects it. */
  onFocusNode: (nodeId: string) => void
  /** Creates a new note block on the canvas. */
  onAddNote: () => void
  onClose: () => void
}

const SAVE_DEBOUNCE_MS = 500

/**
 * Canvas-side notes manager. The top section lists the note BLOCKS living on
 * the canvas (click to focus one); the bottom section manages the saved notes
 * shared with the chat, persisted through IPC. Edits to saved notes update
 * local state immediately and persist with a debounce, so typing never waits
 * on an IPC round-trip nor loses focus to a list reload.
 */
export function NotesPanel({ nodes, onFocusNode, onAddNote, onClose }: NotesPanelProps) {
  const [notes, setNotes] = useState<CanvasNote[]>([])
  const saveTimers = useRef(new Map<string, number>())

  const canvasNotes = nodes.filter((node) => node.type === 'note')

  useEffect(() => {
    let cancelled = false
    void window.felixo?.notes?.list().then((result) => {
      if (!cancelled && result?.ok && Array.isArray(result.notes)) {
        setNotes(result.notes as CanvasNote[])
      }
    })
    const timers = saveTimers.current
    return () => {
      cancelled = true
      timers.forEach((timer) => window.clearTimeout(timer))
      timers.clear()
    }
  }, [])

  const persistNote = useCallback((note: CanvasNote) => {
    void window.felixo?.notes?.save({ ...note, updatedAt: new Date().toISOString() })
  }, [])

  /** Updates the note in local state and schedules a debounced save. */
  const editNote = useCallback(
    (noteId: string, patch: Partial<CanvasNote>) => {
      setNotes((current) => {
        const next = current.map((note) =>
          note.id === noteId ? { ...note, ...patch } : note,
        )
        const edited = next.find((note) => note.id === noteId)
        if (edited) {
          const pending = saveTimers.current.get(noteId)
          if (pending) {
            window.clearTimeout(pending)
          }
          saveTimers.current.set(
            noteId,
            window.setTimeout(() => {
              saveTimers.current.delete(noteId)
              persistNote(edited)
            }, SAVE_DEBOUNCE_MS),
          )
        }
        return next
      })
    },
    [persistNote],
  )

  const addSavedNote = useCallback(async () => {
    const now = new Date().toISOString()
    const note: CanvasNote = {
      id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
      title: 'Nova nota',
      content: '',
      projectIds: [],
      createdAt: now,
      updatedAt: now,
    }
    await window.felixo?.notes?.save(note)
    setNotes((current) => [...current, note])
  }, [])

  const removeSavedNote = useCallback(async (noteId: string) => {
    const pending = saveTimers.current.get(noteId)
    if (pending) {
      window.clearTimeout(pending)
      saveTimers.current.delete(noteId)
    }
    await window.felixo?.notes?.delete(noteId)
    setNotes((current) => current.filter((note) => note.id !== noteId))
  }, [])

  return (
    <CanvasPanel title="Notas" icon={<Notebook size={15} />} onClose={onClose}>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Notas no canvas
        </span>
        <button
          type="button"
          onClick={onAddNote}
          className="felixo-btn flex items-center gap-1 rounded bg-emerald-700 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-600"
        >
          <Plus size={13} />
          Nova nota
        </button>
      </div>

      {canvasNotes.length === 0 ? (
        <p className="mb-3 text-sm text-zinc-500">Nenhum bloco de nota no canvas.</p>
      ) : (
        <ul className="mb-3 flex flex-col gap-1">
          {canvasNotes.map((node) => {
            const data = node.data ?? {}
            const title = data.label || data.text?.slice(0, 40) || 'Nota sem título'
            return (
              <li key={node.id}>
                <button
                  type="button"
                  onClick={() => onFocusNode(node.id)}
                  className="felixo-btn flex w-full items-start gap-2 rounded px-2 py-1.5 text-left hover:bg-white/5"
                  title="Centralizar esta nota no canvas"
                >
                  <StickyNote size={14} className="mt-0.5 shrink-0 text-amber-300/80" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-zinc-100">{title}</span>
                    {data.text && (
                      <span className="block truncate text-xs text-zinc-500">
                        {data.text}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <div className="my-3 border-t border-white/10" />

      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Notas salvas
        </span>
        <button
          type="button"
          onClick={() => void addSavedNote()}
          className="felixo-btn flex items-center gap-1 rounded bg-zinc-700 px-2 py-1 text-xs text-zinc-100 hover:bg-zinc-600"
        >
          <Plus size={13} />
          Nova
        </button>
      </div>

      {notes.length === 0 ? (
        <p className="text-sm text-zinc-500">Nenhuma nota salva ainda.</p>
      ) : (
        <ul className="felixo-anim-stagger-list flex flex-col gap-2">
          {notes.map((note) => (
            <li key={note.id} className="rounded bg-zinc-800/60 p-2">
              <div className="mb-1 flex items-center gap-2">
                <input
                  value={note.title}
                  onChange={(event) => editNote(note.id, { title: event.target.value })}
                  className="min-w-0 flex-1 bg-transparent text-sm font-medium text-zinc-100 outline-none"
                />
                <button
                  type="button"
                  onClick={() => void removeSavedNote(note.id)}
                  className="felixo-btn-icon rounded p-1 text-zinc-400 hover:bg-white/10 hover:text-red-400"
                  aria-label="Remover nota"
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <textarea
                value={note.content}
                onChange={(event) => editNote(note.id, { content: event.target.value })}
                placeholder="Conteúdo…"
                rows={2}
                className="w-full resize-y rounded bg-zinc-900/60 p-2 text-xs text-zinc-300 outline-none placeholder:text-zinc-600"
              />
            </li>
          ))}
        </ul>
      )}
    </CanvasPanel>
  )
}

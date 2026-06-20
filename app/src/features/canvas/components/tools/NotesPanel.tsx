import { useCallback, useEffect, useState } from 'react'
import { Notebook, Plus, Trash2 } from 'lucide-react'
import { CanvasPanel } from './CanvasPanel'

type CanvasNote = {
  id: string
  title: string
  content: string
  projectIds: string[]
  createdAt: string
  updatedAt: string
}

type NotesPanelProps = {
  onClose: () => void
}

/** Canvas-side notes manager — list/create/edit/delete straight through IPC. */
export function NotesPanel({ onClose }: NotesPanelProps) {
  const [notes, setNotes] = useState<CanvasNote[]>([])

  useEffect(() => {
    let cancelled = false
    void window.felixo?.notes?.list().then((result) => {
      if (!cancelled && result?.ok && Array.isArray(result.notes)) {
        setNotes(result.notes as CanvasNote[])
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  const reload = useCallback(async () => {
    const result = await window.felixo?.notes?.list()
    if (result?.ok && Array.isArray(result.notes)) {
      setNotes(result.notes as CanvasNote[])
    }
  }, [])

  const saveNote = useCallback(
    async (note: CanvasNote) => {
      await window.felixo?.notes?.save(note)
      await reload()
    },
    [reload],
  )

  const addNote = useCallback(async () => {
    const now = new Date().toISOString()
    await saveNote({
      id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
      title: 'Nova nota',
      content: '',
      projectIds: [],
      createdAt: now,
      updatedAt: now,
    })
  }, [saveNote])

  const removeNote = useCallback(
    async (noteId: string) => {
      await window.felixo?.notes?.delete(noteId)
      await reload()
    },
    [reload],
  )

  return (
    <CanvasPanel title="Notas" icon={<Notebook size={15} />} onClose={onClose}>
      <button
        type="button"
        onClick={() => void addNote()}
        className="mb-3 flex w-full items-center justify-center gap-2 rounded bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-600"
      >
        <Plus size={15} />
        Nova nota
      </button>

      {notes.length === 0 ? (
        <p className="text-sm text-zinc-500">Nenhuma nota ainda.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {notes.map((note) => (
            <li key={note.id} className="rounded bg-zinc-800/60 p-2">
              <div className="mb-1 flex items-center gap-2">
                <input
                  value={note.title}
                  onChange={(event) =>
                    void saveNote({ ...note, title: event.target.value })
                  }
                  className="min-w-0 flex-1 bg-transparent text-sm font-medium text-zinc-100 outline-none"
                />
                <button
                  type="button"
                  onClick={() => void removeNote(note.id)}
                  className="rounded p-1 text-zinc-400 hover:bg-white/10 hover:text-red-400"
                  aria-label="Remover nota"
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <textarea
                value={note.content}
                onChange={(event) =>
                  void saveNote({ ...note, content: event.target.value })
                }
                placeholder="Conteudo…"
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

import { useMemo, useState } from 'react'
import { FilePlus, Save, Search, StickyNote, Trash2, X } from 'lucide-react'
import type { ProjectNote } from '../types'
import { createEmptyNote } from '../services/note-storage'

type NotesModalProps = {
  isOpen: boolean
  notes: ProjectNote[]
  hasMessages: boolean
  onClose: () => void
  onSaveNote: (note: ProjectNote) => void
  onDeleteNote: (noteId: string) => void
  onUseAsContext: (note: ProjectNote) => void
  onCreateFromChat: () => void
}

export function NotesModal({
  isOpen,
  notes,
  hasMessages,
  onClose,
  onSaveNote,
  onDeleteNote,
  onUseAsContext,
  onCreateFromChat,
}: NotesModalProps) {
  const [query, setQuery] = useState('')
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null)
  const filteredNotes = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    return [...notes]
      .sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      )
      .filter((note) => {
        if (!normalizedQuery) {
          return true
        }

        return `${note.title}\n${note.content}`
          .toLowerCase()
          .includes(normalizedQuery)
      })
  }, [notes, query])
  const selectedNote = selectedNoteId
    ? notes.find((note) => note.id === selectedNoteId) ?? null
    : filteredNotes[0] ?? null

  if (!isOpen) {
    return null
  }

  function selectNote(note: ProjectNote) {
    setSelectedNoteId(note.id)
  }

  function createNote() {
    const note = createEmptyNote()
    onSaveNote(note)
    selectNote(note)
  }

  function saveSelectedNote() {
    if (!selectedNote) {
      return
    }

    onSaveNote({
      ...selectedNote,
      title: selectedNote.title.trim() || 'Nota sem título',
      updatedAt: new Date().toISOString(),
    })
  }

  function deleteSelectedNote() {
    if (!selectedNote) {
      return
    }

    if (!window.confirm(`Excluir a nota "${selectedNote.title}"?`)) {
      return
    }

    onDeleteNote(selectedNote.id)
    setSelectedNoteId(null)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <section
        className="flex h-[82vh] w-full max-w-[900px] flex-col rounded-3xl border border-white/10 bg-[var(--color-panel)] shadow-shell"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-white/[0.08] px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-zinc-100">Notas</h2>
            <p className="mt-1 text-xs text-zinc-500">
              Tasklists, ideias e rascunhos locais.
            </p>
          </div>

          <button
            type="button"
            title="Fechar"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 transition hover:bg-white/[0.08] hover:text-zinc-100"
          >
            <X size={16} aria-hidden="true" />
            <span className="sr-only">Fechar</span>
          </button>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-[280px_minmax(0,1fr)] max-md:grid-cols-1">
          <aside className="flex min-h-0 flex-col border-r border-white/[0.08] p-3 max-md:hidden">
            <div className="mb-3 flex gap-2">
              <button
                type="button"
                onClick={createNote}
                className="flex h-9 flex-1 items-center justify-center gap-2 rounded-2xl border border-white/[0.08] text-xs text-zinc-200 transition hover:bg-white/[0.08]"
              >
                <FilePlus size={14} aria-hidden="true" />
                Nova
              </button>
              <button
                type="button"
                onClick={onCreateFromChat}
                disabled={!hasMessages}
                className="flex h-9 flex-1 items-center justify-center gap-2 rounded-2xl border border-white/[0.08] text-xs text-zinc-200 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:text-zinc-600 disabled:hover:bg-transparent"
              >
                <StickyNote size={14} aria-hidden="true" />
                Chat
              </button>
            </div>

            <label className="relative mb-3 block">
              <Search
                size={14}
                aria-hidden="true"
                className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600"
              />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar"
                className="h-9 w-full rounded-2xl border border-white/[0.08] bg-black/15 pl-9 pr-3 text-xs text-zinc-100 outline-none placeholder:text-zinc-600 focus:ring-2 focus:ring-cyan-200/30"
              />
            </label>

            <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
              {filteredNotes.length === 0 ? (
                <p className="px-2 py-5 text-center text-xs text-zinc-500">
                  Nenhuma nota encontrada.
                </p>
              ) : (
                filteredNotes.map((note) => (
                  <button
                    key={note.id}
                    type="button"
                    onClick={() => selectNote(note)}
                    className={[
                      'w-full rounded-2xl px-3 py-2 text-left text-xs transition',
                      selectedNoteId === note.id
                        ? 'bg-cyan-300/10 text-cyan-100'
                        : 'text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-200',
                    ].join(' ')}
                  >
                    <span className="block truncate font-medium">{note.title}</span>
                    <span className="mt-1 block truncate text-[11px] text-zinc-600">
                      {note.content || 'Sem conteúdo'}
                    </span>
                  </button>
                ))
              )}
            </div>
          </aside>

          <main className="flex min-h-0 flex-col p-4">
            {selectedNote ? (
              <>
                <input
                  value={selectedNote.title}
                  onChange={(event) =>
                    onSaveNote({
                      ...selectedNote,
                      title: event.target.value,
                      updatedAt: new Date().toISOString(),
                    })
                  }
                  className="mb-3 h-10 w-full rounded-2xl border border-white/[0.08] bg-[#1a1a19] px-3 text-sm font-medium text-zinc-100 outline-none placeholder:text-zinc-600 focus:ring-2 focus:ring-cyan-200/30"
                />
                <textarea
                  value={selectedNote.content}
                  onChange={(event) =>
                    onSaveNote({
                      ...selectedNote,
                      content: event.target.value,
                      updatedAt: new Date().toISOString(),
                    })
                  }
                  className="min-h-0 flex-1 resize-none rounded-2xl border border-white/[0.08] bg-[#1a1a19] px-3 py-3 font-mono text-[13px] leading-relaxed text-zinc-100 outline-none placeholder:text-zinc-600 focus:ring-2 focus:ring-cyan-200/30"
                />
                <div className="mt-3 flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => onUseAsContext(selectedNote)}
                    className="h-9 rounded-2xl border border-white/[0.08] px-3 text-xs text-zinc-200 transition hover:bg-white/[0.08]"
                  >
                    Usar como contexto
                  </button>
                  <button
                    type="button"
                    onClick={deleteSelectedNote}
                    className="flex h-9 items-center gap-2 rounded-2xl border border-red-300/20 px-3 text-xs text-red-200 transition hover:bg-red-400/10"
                  >
                    <Trash2 size={14} aria-hidden="true" />
                    Excluir
                  </button>
                  <button
                    type="button"
                    onClick={saveSelectedNote}
                    className="flex h-9 items-center gap-2 rounded-2xl bg-zinc-100 px-3 text-xs font-medium text-zinc-950 transition hover:bg-white"
                  >
                    <Save size={14} aria-hidden="true" />
                    Salvar
                  </button>
                </div>
              </>
            ) : (
              <div className="flex min-h-0 flex-1 items-center justify-center">
                <button
                  type="button"
                  onClick={createNote}
                  className="flex h-10 items-center justify-center gap-2 rounded-2xl border border-white/[0.08] px-4 text-sm text-zinc-200 transition hover:bg-white/[0.08]"
                >
                  <FilePlus size={16} aria-hidden="true" />
                  Criar nota
                </button>
              </div>
            )}
          </main>
        </div>
      </section>
    </div>
  )
}

import { useCallback, useEffect, useState } from 'react'
import { resultadoDeIpc } from '../../../shared/ipc/ipc-result'
import type { Node } from '@xyflow/react'
import { Notebook, Pencil, PenTool, Plus, StickyNote, Trash2 } from 'lucide-react'
import { CanvasPanel } from './CanvasPanel'
import { createDebouncedSaveQueue } from '../../services/debounced-save-queue'
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
  /** Creates a new lightweight freehand drawing block on the canvas. */
  onAddDrawing: () => void
  /** Creates a new full Excalidraw drawing block on the canvas (lazy-loaded). */
  onAddExcalidrawDrawing: () => void
  onClose: () => void
  /** Widens the toolbar column; the panel slides over to clear it. */
  toolsMenuOpen?: boolean
}

const SAVE_DEBOUNCE_MS = 500

/**
 * Canvas-side notes manager. The top section lists the note BLOCKS living on
 * the canvas (click to focus one); the bottom section manages the saved notes
 * shared with the chat, persisted through IPC. Edits to saved notes update
 * local state immediately and persist with a debounce, so typing never waits
 * on an IPC round-trip nor loses focus to a list reload.
 */
export function NotesPanel({
  nodes,
  onFocusNode,
  onAddNote,
  onAddDrawing,
  onAddExcalidrawDrawing,
  onClose,
  toolsMenuOpen,
}: NotesPanelProps) {
  const [notes, setNotes] = useState<CanvasNote[]>([])
  // Falha de gravar/apagar (ou de listar) aparece no painel: antes a nota parecia salva e voltava diferente ao reabrir.
  const [error, setError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveQueue] = useState(() =>
    createDebouncedSaveQueue<CanvasNote>(
      (_id, note) =>
        void resultadoDeIpc(
          () => window.felixo?.notes?.save({ ...note, updatedAt: new Date().toISOString() }),
          'Não foi possível salvar a nota.',
        ).then((result) => setError(result.ok ? null : result.message)),
      SAVE_DEBOUNCE_MS,
    ),
  )

  const canvasNotes = nodes.filter((node) => node.type === 'note')
  const canvasDrawings = nodes.filter((node) => node.type === 'drawing')
  const canvasExcalidrawDrawings = nodes.filter((node) => node.type === 'excalidrawDrawing')

  useEffect(() => {
    let cancelled = false
    void resultadoDeIpc(() => window.felixo?.notes?.list(), 'Não foi possível carregar as notas salvas.').then((outcome) => {
      if (cancelled) return
      if (outcome.ok && Array.isArray(outcome.value.notes)) {
        setNotes(outcome.value.notes as CanvasNote[])
        setLoadError(null)
      } else {
        // Lista que falhou NÃO é lista vazia: o painel diz que não carregou.
        setLoadError(outcome.ok ? 'Não foi possível carregar as notas salvas.' : outcome.message)
      }
    })
    return () => {
      cancelled = true
      // Fechar o painel não pode levar a última edição junto.
      saveQueue.flush()
    }
  }, [saveQueue])

  /** Updates the note in local state and schedules a debounced save. */
  const editNote = useCallback(
    (noteId: string, patch: Partial<CanvasNote>) => {
      setNotes((current) => {
        const next = current.map((note) =>
          note.id === noteId ? { ...note, ...patch } : note,
        )
        const edited = next.find((note) => note.id === noteId)
        if (edited) saveQueue.schedule(noteId, edited)
        return next
      })
    },
    [saveQueue],
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
    const saved = await resultadoDeIpc(() => window.felixo?.notes?.save(note), 'Não foi possível criar a nota.')
    if (!saved.ok) {
      setError(saved.message)
      return
    }
    setError(null)
    setNotes((current) => [...current, note])
  }, [])

  const removeSavedNote = useCallback(async (noteId: string) => {
    saveQueue.cancel(noteId)
    const removed = await resultadoDeIpc(() => window.felixo?.notes?.delete(noteId), 'Não foi possível apagar a nota.')
    if (!removed.ok) {
      // A nota continua na lista: ela não foi apagada.
      setError(removed.message)
      return
    }
    setError(null)
    setNotes((current) => current.filter((note) => note.id !== noteId))
  }, [saveQueue])

  return (
    <CanvasPanel
      title="Notas"
      panelId="notes"
      icon={<Notebook size={15} />}
      onClose={onClose}
      toolsMenuOpen={toolsMenuOpen}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Notas no canvas
        </span>
        <button
          type="button"
          onClick={onAddNote}
          className="felixo-btn flex items-center gap-1 rounded-sm felixo-primary-action px-2 py-1 text-xs font-medium text-white hover:bg-white/16"
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
                  className="felixo-btn flex w-full items-start gap-2 rounded-sm px-2 py-1.5 text-left hover:bg-white/5"
                  title="Centralizar esta nota no canvas"
                >
                  <StickyNote size={14} className="mt-0.5 shrink-0 text-(--color-warning)" />
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
          Desenhos no canvas
        </span>
        <button
          type="button"
          onClick={onAddDrawing}
          className="felixo-btn flex items-center gap-1 rounded-sm felixo-primary-action px-2 py-1 text-xs font-medium text-white hover:bg-white/16"
        >
          <Plus size={13} />
          Novo desenho
        </button>
      </div>

      {canvasDrawings.length === 0 ? (
        <p className="mb-3 text-sm text-zinc-500">Nenhum bloco de desenho no canvas.</p>
      ) : (
        <ul className="mb-3 flex flex-col gap-1">
          {canvasDrawings.map((node) => {
            const data = node.data ?? {}
            const title = data.label || 'Desenho sem título'
            return (
              <li key={node.id}>
                <button
                  type="button"
                  onClick={() => onFocusNode(node.id)}
                  className="felixo-btn flex w-full items-start gap-2 rounded-sm px-2 py-1.5 text-left hover:bg-white/5"
                  title="Centralizar este desenho no canvas"
                >
                  <Pencil size={14} className="mt-0.5 shrink-0 text-(--f-core-white-soft)" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-zinc-100">{title}</span>
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
          Desenhos Excalidraw no canvas
        </span>
        <button
          type="button"
          onClick={onAddExcalidrawDrawing}
          className="felixo-btn flex items-center gap-1 rounded-sm felixo-primary-action px-2 py-1 text-xs font-medium text-white hover:bg-white/16"
          title="Modo avançado: formas, texto, setas — carrega o Excalidraw sob demanda"
        >
          <Plus size={13} />
          Novo (Excalidraw)
        </button>
      </div>

      {canvasExcalidrawDrawings.length === 0 ? (
        <p className="mb-3 text-sm text-zinc-500">Nenhum bloco Excalidraw no canvas.</p>
      ) : (
        <ul className="mb-3 flex flex-col gap-1">
          {canvasExcalidrawDrawings.map((node) => {
            const data = node.data ?? {}
            const title = data.label || 'Desenho Excalidraw sem título'
            return (
              <li key={node.id}>
                <button
                  type="button"
                  onClick={() => onFocusNode(node.id)}
                  className="felixo-btn flex w-full items-start gap-2 rounded-sm px-2 py-1.5 text-left hover:bg-white/5"
                  title="Centralizar este desenho no canvas"
                >
                  <PenTool size={14} className="mt-0.5 shrink-0 text-(--f-core-white-soft)" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-zinc-100">{title}</span>
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
          className="felixo-btn flex items-center gap-1 rounded-sm bg-zinc-700 px-2 py-1 text-xs text-zinc-100 hover:bg-zinc-600"
        >
          <Plus size={13} />
          Nova
        </button>
      </div>

      {error && (
        <p role="alert" className="mb-2 text-xs text-theme-error">
          {error}
        </p>
      )}

      {loadError ? (
        <p role="alert" className="text-sm text-theme-error">
          {loadError}
        </p>
      ) : notes.length === 0 ? (
        <p className="text-sm text-zinc-500">Nenhuma nota salva ainda.</p>
      ) : (
        <ul className="felixo-anim-stagger-list flex flex-col gap-2">
          {notes.map((note) => (
            <li key={note.id} className="rounded-sm bg-zinc-800/60 p-2">
              <div className="mb-1 flex items-center gap-2">
                <input
                  value={note.title}
                  onChange={(event) => editNote(note.id, { title: event.target.value })}
                  className="min-w-0 flex-1 bg-transparent text-sm font-medium text-zinc-100 outline-hidden"
                />
                <button
                  type="button"
                  onClick={() => void removeSavedNote(note.id)}
                  className="felixo-btn-icon rounded-sm p-1 text-zinc-400 hover:bg-white/10 hover:text-theme-error"
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
                className="w-full resize-y rounded-sm bg-zinc-900/60 p-2 text-xs text-zinc-300 outline-hidden placeholder:text-zinc-600"
              />
            </li>
          ))}
        </ul>
      )}
    </CanvasPanel>
  )
}

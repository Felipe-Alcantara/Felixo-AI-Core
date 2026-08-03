import { useEffect, useRef, useState } from 'react'
import {
  deleteNoteFromBackend,
  hasNotesBackendMigrationRun,
  loadNotes,
  loadNotesFromBackend,
  markNotesBackendMigrationRun,
  saveNoteToBackend,
  saveNotes,
  saveNotesToBackend,
} from '../services/note-storage'
import type { ProjectNote } from '../types'

/**
 * Owns project notes: local-first state, the local<->backend migration/sync
 * dance (same shape as models/projects/automations in ChatWorkspace), and the
 * save/delete mutations. Extracted from ChatWorkspace so that migration
 * bookkeeping doesn't sit alongside chat streaming and UI state.
 */
export function useNotes() {
  const [notes, setNotes] = useState<ProjectNote[]>(() => loadNotes())
  const notesRef = useRef(notes)
  const notesUserEditedRef = useRef(false)

  useEffect(() => {
    notesRef.current = notes
  }, [notes])

  useEffect(() => {
    let cancelled = false

    loadNotesFromBackend()
      .then((backendNotes) => {
        if (cancelled || backendNotes === null) {
          return
        }

        if (backendNotes.length > 0) {
          if (notesUserEditedRef.current) {
            void saveNotesToBackend(notesRef.current)
            markNotesBackendMigrationRun()
            return
          }

          setNotes(backendNotes)
          markNotesBackendMigrationRun()
          return
        }

        if (!hasNotesBackendMigrationRun() && notesRef.current.length > 0) {
          void saveNotesToBackend(notesRef.current).then((saved) => {
            if (saved) {
              markNotesBackendMigrationRun()
            }
          })
          return
        }

        markNotesBackendMigrationRun()
      })
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    saveNotes(notes)
  }, [notes])

  function saveNote(note: ProjectNote) {
    notesUserEditedRef.current = true
    setNotes((currentNotes) => {
      const exists = currentNotes.some((item) => item.id === note.id)

      return exists
        ? currentNotes.map((item) => (item.id === note.id ? note : item))
        : [note, ...currentNotes]
    })
    void saveNoteToBackend(note)
  }

  function deleteNote(noteId: string) {
    notesUserEditedRef.current = true
    setNotes((currentNotes) => currentNotes.filter((note) => note.id !== noteId))
    void deleteNoteFromBackend(noteId)
  }

  return { notes, saveNote, deleteNote }
}

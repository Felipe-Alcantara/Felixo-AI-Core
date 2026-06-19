import type { NoteColor } from '../types'

type NoteTheme = {
  /** Outer container (background + border). */
  container: string
  /** Header bar background + text. */
  header: string
  /** Body text color. */
  text: string
  /** Swatch fill for the color picker. */
  swatch: string
}

export const NOTE_COLORS: NoteColor[] = ['amber', 'emerald', 'sky', 'rose', 'zinc']

export const DEFAULT_NOTE_COLOR: NoteColor = 'amber'

export const NOTE_THEMES: Record<NoteColor, NoteTheme> = {
  amber: {
    container: 'border-amber-300/30 bg-amber-100/95 text-amber-950',
    header: 'bg-amber-200/80 text-amber-900',
    text: 'text-amber-950 placeholder:text-amber-800/40',
    swatch: 'bg-amber-300',
  },
  emerald: {
    container: 'border-emerald-300/30 bg-emerald-100/95 text-emerald-950',
    header: 'bg-emerald-200/80 text-emerald-900',
    text: 'text-emerald-950 placeholder:text-emerald-800/40',
    swatch: 'bg-emerald-300',
  },
  sky: {
    container: 'border-sky-300/30 bg-sky-100/95 text-sky-950',
    header: 'bg-sky-200/80 text-sky-900',
    text: 'text-sky-950 placeholder:text-sky-800/40',
    swatch: 'bg-sky-300',
  },
  rose: {
    container: 'border-rose-300/30 bg-rose-100/95 text-rose-950',
    header: 'bg-rose-200/80 text-rose-900',
    text: 'text-rose-950 placeholder:text-rose-800/40',
    swatch: 'bg-rose-300',
  },
  zinc: {
    container: 'border-zinc-300/30 bg-zinc-200/95 text-zinc-900',
    header: 'bg-zinc-300/80 text-zinc-800',
    text: 'text-zinc-900 placeholder:text-zinc-600/40',
    swatch: 'bg-zinc-300',
  },
}

export function resolveNoteTheme(color: NoteColor | undefined): NoteTheme {
  return NOTE_THEMES[color ?? DEFAULT_NOTE_COLOR] ?? NOTE_THEMES[DEFAULT_NOTE_COLOR]
}

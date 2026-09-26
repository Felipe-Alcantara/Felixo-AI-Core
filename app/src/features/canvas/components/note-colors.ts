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

/**
 * Cinco papéis, não cinco matizes.
 *
 * Os temas eram âmbar, verde, azul e rosa saturados — uma ilha colorida num
 * produto monocromático. Agora ficam todos na mesma banda de luminosidade do
 * branco da marca, separados por um sussurro de matiz: passam no teste do
 * manual (em preto e branco viram praticamente o mesmo cinza) e ainda assim
 * dá para distinguir uma nota da outra lado a lado.
 *
 * A nota continua sendo a única superfície clara do canvas, de propósito: é
 * papel sobre a mesa escura, e é isso que a faz ler como anotação humana no
 * meio dos blocos de máquina.
 *
 * As chaves não mudam: `NoteColor` é persistido no canvas de quem já usa, e
 * renomeá-las apagaria a escolha feita em notas antigas.
 */
export const NOTE_THEMES: Record<NoteColor, NoteTheme> = {
  amber: {
    container: 'border-black/10 bg-[#ede9e0] text-[#151515]',
    header: 'bg-black/6 text-[#262626]',
    text: 'text-[#151515] placeholder:text-black/35',
    swatch: 'bg-[#ede9e0]',
  },
  emerald: {
    container: 'border-black/10 bg-[#e6ebe7] text-[#151515]',
    header: 'bg-black/6 text-[#262626]',
    text: 'text-[#151515] placeholder:text-black/35',
    swatch: 'bg-[#e6ebe7]',
  },
  sky: {
    container: 'border-black/10 bg-[#e4e9ee] text-[#151515]',
    header: 'bg-black/6 text-[#262626]',
    text: 'text-[#151515] placeholder:text-black/35',
    swatch: 'bg-[#e4e9ee]',
  },
  rose: {
    container: 'border-black/10 bg-[#efe6e7] text-[#151515]',
    header: 'bg-black/6 text-[#262626]',
    text: 'text-[#151515] placeholder:text-black/35',
    swatch: 'bg-[#efe6e7]',
  },
  zinc: {
    container: 'border-black/10 bg-[#ededea] text-[#151515]',
    header: 'bg-black/6 text-[#262626]',
    text: 'text-[#151515] placeholder:text-black/35',
    swatch: 'bg-[#ededea]',
  },
}

export function resolveNoteTheme(color: NoteColor | undefined): NoteTheme {
  return NOTE_THEMES[color ?? DEFAULT_NOTE_COLOR] ?? NOTE_THEMES[DEFAULT_NOTE_COLOR]
}

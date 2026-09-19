import type { FrameColor } from '../types'

/** Paleta curta de tokens (não hex livre): cada cor precisa ler bem sobre o canvas escuro. */
export const FRAME_COLORS: readonly FrameColor[] = [
  'sky',
  'emerald',
  'amber',
  'rose',
  'violet',
  'zinc',
]

export const FRAME_COLOR_LABELS: Record<FrameColor, string> = {
  sky: 'Azul',
  emerald: 'Verde',
  amber: 'Âmbar',
  rose: 'Rosa',
  violet: 'Violeta',
  zinc: 'Cinza',
}

/** Cor de exibição do seletor; a moldura no canvas usa as mesmas via CSS (`.felixo-frame-*`). */
export const FRAME_COLOR_SWATCHES: Record<FrameColor, string> = {
  sky: '#5aa9e6',
  emerald: '#4cbf8b',
  amber: '#e0a93b',
  rose: '#e26d8a',
  violet: '#9b7be0',
  zinc: '#8a8a86',
}

/**
 * Valida o que veio do disco: um canvas antigo, importado ou editado à mão
 * pode trazer um valor que a paleta não conhece — vira "sem cor", nunca uma
 * classe CSS inventada.
 */
export function readFrameColor(value: unknown): FrameColor | undefined {
  return typeof value === 'string' && (FRAME_COLORS as readonly string[]).includes(value)
    ? (value as FrameColor)
    : undefined
}

/** Classe aplicada ao wrapper do nó no React Flow; vazio quando não há cor. */
export function frameClassName(value: unknown): string | undefined {
  const color = readFrameColor(value)
  return color ? `felixo-frame felixo-frame-${color}` : undefined
}

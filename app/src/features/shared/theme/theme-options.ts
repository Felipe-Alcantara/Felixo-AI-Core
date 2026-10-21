import type { FelixoSelectOption } from '../components/FelixoSelect'

/**
 * Opções do seletor de tema. Moram aqui, e não em cada tela, porque o canvas e
 * o chat têm seletores próprios: com duas listas, um tema novo entrava num e
 * faltava no outro.
 */
export const THEME_OPTIONS: readonly FelixoSelectOption[] = [
  { value: 'dark', label: 'Escuro' },
  { value: 'light', label: 'Claro' },
  { value: 'high_contrast', label: 'Alto contraste' },
]

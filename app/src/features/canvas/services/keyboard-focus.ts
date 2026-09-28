/**
 * Retorna o próximo destino quando o foco está prestes a sair de um diálogo.
 * `null` significa que a navegação normal por Tab deve continuar.
 * Separado do DOM para que o ciclo de foco possa ser testado sem navegador.
 */
export function tabTrapTarget<T>(
  focusableElements: readonly T[],
  activeElement: T | null,
  backwards: boolean,
  activeElementIsInside = true,
): T | null {
  if (focusableElements.length === 0) return null

  if (!activeElementIsInside) {
    return backwards
      ? focusableElements[focusableElements.length - 1]
      : focusableElements[0]
  }

  if (!activeElement || !focusableElements.includes(activeElement)) {
    return backwards
      ? focusableElements[focusableElements.length - 1]
      : focusableElements[0]
  }

  if (backwards && activeElement === focusableElements[0]) {
    return focusableElements[focusableElements.length - 1]
  }

  if (!backwards && activeElement === focusableElements[focusableElements.length - 1]) {
    return focusableElements[0]
  }

  return null
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"]):not([disabled])',
].join(',')

/** Apenas controles visíveis e fora de regiões ocultas entram no ciclo do modal. */
export function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) =>
      !element.matches(':disabled') &&
      !element.closest('[hidden], [inert], [aria-hidden="true"]') &&
      element.getClientRects().length > 0,
  )
}

/**
 * Próximo índice de um grupo com foco itinerante (por exemplo, `role="tablist"`):
 * as setas da orientação circulam e Home/End vão às pontas. `null` = a tecla
 * não navega o grupo e segue o caminho normal.
 */
export function rovingIndex(
  current: number,
  key: string,
  count: number,
  orientation: 'horizontal' | 'vertical' = 'horizontal',
): number | null {
  if (count <= 0) return null
  const previousKey = orientation === 'horizontal' ? 'ArrowLeft' : 'ArrowUp'
  const nextKey = orientation === 'horizontal' ? 'ArrowRight' : 'ArrowDown'
  if (key === 'Home') return 0
  if (key === 'End') return count - 1
  if (key === previousKey) return (current - 1 + count) % count
  if (key === nextKey) return (current + 1) % count
  return null
}

/**
 * Para onde o foco volta ao fechar um diálogo: o gatilho, se ainda estiver na
 * página; senão, o alvo estável que `fallback` achar (por exemplo, o próprio
 * bloco do canvas). A faixa que tinha o gatilho some depois de uma recusa ou
 * de fixar a conta, e o foco não pode cair no `body`. `null` = nada a focar.
 */
export function focusReturnTarget<T extends { isConnected: boolean }>(
  trigger: T | null,
  fallback: () => T | null,
): T | null {
  if (trigger?.isConnected) return trigger
  const target = fallback()
  return target?.isConnected ? target : null
}

/** O foco se perdeu: saiu de todo controle e caiu no `body` (ou em nada). */
export function focusWasLost<T>(active: T | null, body: T | null): boolean {
  return active === null || active === body
}

/** Seletor do bloco do canvas (o nó do React Flow é focável). */
export function canvasNodeSelector(nodeId: string): string {
  return `.react-flow__node[data-id="${nodeId.replace(/["\\]/g, '\\$&')}"]`
}

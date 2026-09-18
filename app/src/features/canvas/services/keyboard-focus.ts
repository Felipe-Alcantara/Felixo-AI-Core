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

/** True for a portaled Felixo menu, even when it lives outside its form. */
export function isFelixoPopoverTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest('[data-felixo-popover-surface]'))
}

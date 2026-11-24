/**
 * O que o jsdom não implementa e os componentes usam (rolagem e medição). Não calculam layout: só evitam que a
 * chamada lance. Testes que dependem de posição real ficam no smoke (Electron de verdade).
 */
export function instalarShimsDeLayout(): void {
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {}
  if (typeof globalThis.ResizeObserver === 'undefined') {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  }
}

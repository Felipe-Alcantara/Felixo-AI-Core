import { lazy, type ComponentType, type LazyExoticComponent } from 'react'

/**
 * `React.lazy` guarda a rejeição para sempre: renderizar o mesmo componente de novo lança o mesmo erro, então o
 * "Tentar de novo" de `BlockErrorBoundary` não adiantaria. `renovar()` cria um `lazy` novo, que importa outra vez;
 * `atual()` entrega o vigente (quem usa lê dentro da função filha do boundary).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- as props do componente carregado entram pelo tipo T
export function lazyRecarregavel<T extends ComponentType<any>>(
  load: () => Promise<{ default: T }>,
): { atual: () => LazyExoticComponent<T>; renovar: () => void } {
  let componente = lazy(load)
  return {
    atual: () => componente,
    renovar: () => {
      componente = lazy(load)
    },
  }
}

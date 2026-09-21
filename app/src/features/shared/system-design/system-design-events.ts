import type { SystemDesignConfig } from './types'

/**
 * Aviso de que a configuração do System Design mudou (carregou, sincronizou,
 * trocou de fonte, limpou o cache).
 *
 * Existe porque a fonte do padrão de qualidade é lida em telas diferentes (o
 * canvas monta o texto que vai para os agentes; o painel de configurações mostra
 * e edita esse texto) e nenhuma delas é dona da outra. Sem o aviso, quem já
 * carregou a fonte continuaria citando a antiga depois de uma troca.
 */
export const SYSTEM_DESIGN_CONFIG_EVENT = 'felixo:system-design-config'

export function announceSystemDesignConfig(config: SystemDesignConfig): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent<SystemDesignConfig>(SYSTEM_DESIGN_CONFIG_EVENT, { detail: config }))
}

export function subscribeSystemDesignConfig(
  listener: (config: SystemDesignConfig) => void,
): () => void {
  if (typeof window === 'undefined') return () => {}

  const handler = (event: Event) => {
    const config = (event as CustomEvent<SystemDesignConfig>).detail
    if (config) listener(config)
  }
  window.addEventListener(SYSTEM_DESIGN_CONFIG_EVENT, handler)
  return () => window.removeEventListener(SYSTEM_DESIGN_CONFIG_EVENT, handler)
}

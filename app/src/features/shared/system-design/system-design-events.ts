import type { SystemDesignConfig, SystemDesignLoginNeeded } from './types'

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

/**
 * Aviso de que a camada de PROJETO mudou (arquivo confirmado ou ignorado,
 * guias escolhidos para um projeto, pasta ligada/desligada, projeto
 * sincronizado). `root` é a raiz que mudou, ou ausente para "releia tudo".
 */
export const SYSTEM_DESIGN_PROJECTS_EVENT = 'felixo:system-design-projects'

export function announceSystemDesignProjects(root?: string): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent<{ root?: string }>(SYSTEM_DESIGN_PROJECTS_EVENT, { detail: { root } }))
}

export function subscribeSystemDesignProjects(listener: (root: string | undefined) => void): () => void {
  if (typeof window === 'undefined') return () => {}

  const handler = (event: Event) => {
    listener((event as CustomEvent<{ root?: string }>).detail?.root)
  }
  window.addEventListener(SYSTEM_DESIGN_PROJECTS_EVENT, handler)
  return () => window.removeEventListener(SYSTEM_DESIGN_PROJECTS_EVENT, handler)
}

/**
 * Aviso de que a sincronização AUTOMÁTICA não atualizou um guia porque ele
 * pede login (privado, ou endereço errado). Sem clique o Git nunca pede; quem
 * mostra o aviso na tela oferece o clique que pode pedir.
 */
export const SYSTEM_DESIGN_LOGIN_NEEDED_EVENT = 'felixo:system-design-login-needed'

export function announceSystemDesignLoginNeeded(notice: SystemDesignLoginNeeded): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent<SystemDesignLoginNeeded>(SYSTEM_DESIGN_LOGIN_NEEDED_EVENT, { detail: notice }))
}

export function subscribeSystemDesignLoginNeeded(listener: (notice: SystemDesignLoginNeeded) => void): () => void {
  if (typeof window === 'undefined') return () => {}

  const handler = (event: Event) => {
    const notice = (event as CustomEvent<SystemDesignLoginNeeded>).detail
    if (notice) listener(notice)
  }
  window.addEventListener(SYSTEM_DESIGN_LOGIN_NEEDED_EVENT, handler)
  return () => window.removeEventListener(SYSTEM_DESIGN_LOGIN_NEEDED_EVENT, handler)
}

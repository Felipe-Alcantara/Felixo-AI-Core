import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AGENTS,
  type AgentDefinition,
  type EffortLevel,
} from '../services/agent-launch-options'
import {
  applyDiscoveredCatalog,
  type AgentModelCatalog,
} from '../services/agent-model-overlay'

/**
 * Agentes com a lista de modelos que as CLIs oferecem agora.
 *
 * A lista fixa em `agent-launch-options` envelhecia a cada release das
 * empresas. Aqui ela vira apenas o último recurso: o cache em disco responde
 * de imediato (o menu abre com a lista certa), e a consulta às CLIs roda em
 * background e substitui assim que chega.
 *
 * Sem `window.felixo` — testes, execução via navegador — o hook devolve a
 * lista fixa e nunca tenta descobrir nada.
 */
export function useAgentModelCatalog(): {
  agents: AgentDefinition[]
  refreshing: boolean
  refresh: () => void
  discoveredAt: string | null
} {
  const [discovered, setDiscovered] = useState<AgentModelCatalog | null>(null)
  // Já nasce `true` quando há ponte: o efeito abaixo dispara a descoberta no
  // primeiro render, e ligar o estado lá dentro obrigaria a um render extra só
  // para refletir algo que se sabe desde o início.
  const [refreshing, setRefreshing] = useState(() => Boolean(window.felixo?.agentModels))

  const applyCatalog = useCallback((catalog: AgentModelCatalog | undefined) => {
    // Catálogo vazio significa "não descobri" — manter o que já está na tela
    // é melhor do que regredir para a lista fixa.
    if (catalog && Object.keys(catalog).length > 0) {
      setDiscovered(catalog)
    }
  }, [])

  const refresh = useCallback(() => {
    const bridge = window.felixo?.agentModels
    if (!bridge) {
      return
    }

    setRefreshing(true)
    void bridge
      .refresh()
      .then((result) => applyCatalog(result?.catalog))
      .finally(() => setRefreshing(false))
  }, [applyCatalog])

  useEffect(() => {
    const bridge = window.felixo?.agentModels
    if (!bridge) {
      return
    }

    let cancelled = false

    // Cache primeiro: é o que faz o menu abrir já com a lista certa.
    void bridge.get().then((result) => {
      if (!cancelled) {
        applyCatalog(result?.catalog)
      }
    })

    // E, em seguida, a consulta às CLIs — uma vez por sessão do app. O estado
    // `refreshing` já entra ligado (ver useState acima), então aqui só resta
    // desligá-lo quando a consulta terminar.
    void bridge
      .refresh()
      .then((result) => {
        if (!cancelled) {
          applyCatalog(result?.catalog)
        }
      })
      .finally(() => {
        if (!cancelled) {
          setRefreshing(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [applyCatalog])

  const agents = useMemo(
    () => applyDiscoveredCatalog(AGENTS, discovered),
    [discovered],
  )

  return {
    agents,
    refreshing,
    refresh,
    discoveredAt: typeof discovered?.discoveredAt === 'string' ? discovered.discoveredAt : null,
  }
}

export type { AgentDefinition, EffortLevel }

import { formatRelativeTime } from '../components/notification-time'
import type { AgentDefinition, EffortLevel } from './agent-launch-options'

/** Catálogo descoberto, como o processo principal o entrega. */
export type AgentModelCatalog = Record<
  string,
  {
    models?: string[]
    labels?: Record<string, string>
    effortLevels?: Record<string, string[]>
    discoveredAt?: string
  }
> & { discoveredAt?: string }

/** De onde vem a lista de modelos de um agente depois da última rodada. */
export type AgentModelStatus = {
  origem: 'descoberta' | 'cache' | 'fixa'
  motivo: string | null
  discoveredAt: string | null
}

/** Resposta do `agent-models:refresh`. */
export type AgentModelRefreshResult = {
  ok?: boolean
  message?: string
  catalog?: AgentModelCatalog
  agents?: Record<string, AgentModelStatus>
}

/**
 * A linha que fica sob o seletor de modelo: diz de onde vem a lista e, quando
 * não é a da CLI, por quê — em vez de deixar a lista fixa passar por atual.
 */
export function describeModelListStatus(
  status: AgentModelStatus | undefined,
  now: number = Date.now(),
): string | null {
  if (!status) {
    return null
  }

  const motivo = status.motivo ? ` (${status.motivo.replace(/\.$/, '')})` : ''
  const data = status.discoveredAt ? Date.parse(status.discoveredAt) : Number.NaN
  const idade = Number.isNaN(data) ? '' : ` há ${formatRelativeTime(data, now)}`

  if (status.origem === 'descoberta') {
    return `Lista da CLI, atualizada${idade === ' há agora' ? ' agora' : idade}.`
  }
  if (status.origem === 'cache') {
    return `Lista guardada da última consulta${idade}${motivo}.`
  }
  return `Lista fixa do app${motivo}.`
}

/**
 * Aplica sobre o catálogo fixo os modelos que as CLIs anunciaram.
 *
 * A lista em `agent-launch-options` deixa de ser a verdade e passa a ser o
 * último recurso: quando a descoberta traz dados para um agente, eles vencem;
 * quando não traz, o agente segue com a lista fixa, para que o menu nunca
 * abra vazio.
 *
 * A decisão vale por agente, não para o catálogo todo — no ambiente do dono
 * do projeto o Gemini falha por elegibilidade da conta enquanto Claude e
 * Codex respondem, e ele não pode ficar sem opção nenhuma por causa disso.
 */

/** Níveis que o app sabe transformar em flag; espelha o parser do backend. */
const KNOWN_EFFORT_LEVELS: EffortLevel[] = ['low', 'medium', 'high', 'max', 'xhigh', 'ultra']

export function applyDiscoveredCatalog(
  agents: AgentDefinition[],
  discovered: AgentModelCatalog | null | undefined,
): AgentDefinition[] {
  if (!discovered || Object.keys(discovered).length === 0) {
    return agents
  }

  return agents.map((agent) => {
    const entrada = discovered[agent.id]
    // Lista vazia é "não descobri", não "não há modelos".
    const models = Array.isArray(entrada?.models) && entrada.models.length > 0 ? entrada.models : null

    if (!models) {
      return agent
    }

    return {
      ...agent,
      models: [...models],
      effortLevels: resolveEffortLevels(agent, entrada?.effortLevels),
    }
  })
}

function resolveEffortLevels(
  agent: AgentDefinition,
  discovered: Record<string, string[]> | undefined,
): AgentDefinition['effortLevels'] {
  if (!discovered || Object.keys(discovered).length === 0) {
    return agent.effortLevels
  }

  const porModelo: Record<string, EffortLevel[]> = {}

  for (const [modelo, niveis] of Object.entries(discovered)) {
    // Um nível desconhecido viraria uma flag inválida na linha de comando.
    const validos = niveis.filter((nivel): nivel is EffortLevel =>
      (KNOWN_EFFORT_LEVELS as string[]).includes(nivel),
    )

    if (validos.length > 0) {
      porModelo[modelo] = validos
    }
  }

  return Object.keys(porModelo).length > 0 ? porModelo : agent.effortLevels
}

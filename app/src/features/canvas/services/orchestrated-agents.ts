import type { CanvasAgentLaunchTask } from '../types'
import { buildAgentArgs, getAgent, isEffortValidForModel, type AgentId, type EffortLevel } from './agent-launch-options'
import { CHAIN_ACCOUNT_VALUE, SHELL_AGENT_VALUE, type AgentLaunchPreferences } from './agent-launch-preferences'
import type { NewTerminalOptions } from './new-terminal-options'

const TITLE_MAX = 40
const FALLBACK_AGENT: AgentId = 'claude'

const ORCHESTRATED_RULES =
  'Você é um sub-agente aberto por um coordenador, com uma task só. Execute SOMENTE a task abaixo e não abra outros agentes. Ao terminar, diga o que foi feito, o que foi medido e o que ficou pendente; se faltar decisão, pergunte à pessoa em vez de supor.'

/**
 * Um terminal por task que um coordenador pediu e a pessoa aceitou
 * (`felixo canvas abrir-agentes`). Usa as mesmas escolhas do launcher
 * "Agente" — CLI, modelo, esforço, modo e conta —, e o contexto de cada task
 * segue por arquivo (preset), nunca digitado. Os terminais saem com o mesmo
 * rótulo de lote e a mesma moldura, para ficarem juntos no canvas.
 *
 * Módulo puro: quem cria os blocos é o canvas.
 */
export function buildOrchestratedAgentOptions(
  tasks: readonly CanvasAgentLaunchTask[],
  preferences: AgentLaunchPreferences,
  cwd?: string,
): NewTerminalOptions[] {
  const wanted = preferences.agentValue === SHELL_AGENT_VALUE ? FALLBACK_AGENT : preferences.agentValue
  const agent = getAgent(wanted) ?? getAgent(FALLBACK_AGENT)
  if (!agent) return []

  const effort = isEffortValidForModel(agent, preferences.model, preferences.effort)
    ? ((preferences.effort || undefined) as EffortLevel | undefined)
    : undefined
  const args =
    buildAgentArgs({
      agentId: agent.id,
      model: preferences.model,
      effort,
      yolo: preferences.yolo,
      fast: preferences.fast,
    }) ?? undefined
  // Conta fixa só quando é uma conta de verdade: a cadeia exige ticket de uso único.
  const accountId =
    preferences.accountId && preferences.accountId !== CHAIN_ACCOUNT_VALUE ? preferences.accountId : undefined

  return tasks.map((task, index) => {
    const title = task.titulo.trim() || 'sem título'
    return {
      command: agent.command,
      args,
      providerId: agent.id,
      cwd: cwd || undefined,
      ...(accountId ? { accountId } : {}),
      label: `Orquestração ${index + 1}/${tasks.length} · ${title.length > TITLE_MAX ? `${title.slice(0, TITLE_MAX - 1)}…` : title}`,
      preset: {
        name: 'Sub-agente do orquestrador',
        contextPrompt: [ORCHESTRATED_RULES, '## Task', `- Título: ${title}`, task.contexto ? `\n${task.contexto}` : '']
          .filter(Boolean)
          .join('\n'),
        skillIds: [],
        color: 'violet',
      },
    }
  })
}

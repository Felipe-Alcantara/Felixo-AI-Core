import { useCallback, useState } from 'react'
import {
  buildAgentArgs,
  describeLaunch,
  getAgent,
  getEffortLevels,
  isEffortValidForModel,
  type AgentDefinition,
  type EffortLevel,
} from '../services/agent-launch-options'
import {
  readAgentLaunchPreferences,
  saveAgentLaunchPreferences,
  SHELL_AGENT_VALUE,
  type AgentLaunchPreferences,
} from '../services/agent-launch-preferences'
import { useAgentModelCatalog } from './useAgentModelCatalog'
import type { NewTerminalOptions } from '../services/new-terminal-options'

export type AgentConfigProject = { id: string; name: string; path: string }

/** Sentinel do select de projeto que dispara o seletor de pasta. */
export const ADD_FOLDER_VALUE = '__add_folder__'

/**
 * Estado de "como abrir um agente": qual CLI, modelo, esforço, projeto, nome.
 *
 * Vive num hook, e não dentro do menu da toolbar, porque a mesma configuração
 * é pedida em dois lugares — abrir um agente novo e passar responsabilidade
 * para outro agente. Enquanto isso morava só no `TerminalMenu`, o segundo caso
 * não tinha como oferecer as mesmas opções sem copiar o formulário inteiro.
 */
export function useAgentConfig(projects: readonly AgentConfigProject[]) {
  const [inicial] = useState(readAgentLaunchPreferences)
  const [agentValue, setAgentValue] = useState<AgentLaunchPreferences['agentValue']>(
    inicial.agentValue,
  )
  const [model, setModel] = useState(inicial.model)
  const [effort, setEffort] = useState(inicial.effort)
  const [yolo, setYolo] = useState(inicial.yolo)
  const [projectId, setProjectId] = useState(inicial.projectId)
  const [planningFile, setPlanningFile] = useState(inicial.planningFile)
  const [name, setName] = useState('')

  // Modelos que as CLIs oferecem agora; cai na lista fixa se a descoberta não
  // trouxer nada, para o formulário nunca aparecer sem opções.
  const { agents, refreshing, refresh } = useAgentModelCatalog()
  const agent: AgentDefinition | undefined =
    agentValue === SHELL_AGENT_VALUE
      ? undefined
      : (agents.find((item) => item.id === agentValue) ?? getAgent(agentValue))
  const effortLevels = agent ? getEffortLevels(agent, model) : null

  const changeAgent = useCallback((valor: AgentLaunchPreferences['agentValue']) => {
    setAgentValue(valor)
    setModel('')
    setEffort('')
  }, [])

  const changeModel = useCallback(
    (valor: string) => {
      setModel(valor)
      // Um modelo pode não aceitar o nível de esforço escolhido para o
      // anterior; deixar o valor inválido aí produziria um argumento que a CLI
      // recusa na hora de subir.
      if (agent && !isEffortValidForModel(agent, valor, effort)) {
        setEffort('')
      }
    },
    [agent, effort],
  )

  const savePreferences = useCallback(() => {
    saveAgentLaunchPreferences({ agentValue, model, effort, yolo, projectId, planningFile })
  }, [agentValue, effort, model, planningFile, projectId, yolo])

  /** Traduz a configuração atual nas opções de abertura de um terminal. */
  const buildOptions = useCallback((): NewTerminalOptions => {
    const project = projects.find((item) => item.id === projectId)
    const place = project ? project.name : 'local'
    const customName = name.trim()

    if (!agent) {
      return { cwd: project?.path, label: customName || `Shell · ${place}` }
    }

    const choices = {
      agentId: agent.id,
      model: model || undefined,
      effort: (effort || undefined) as EffortLevel | undefined,
      yolo,
    }
    return {
      command: agent.command,
      args: buildAgentArgs(choices) ?? undefined,
      cwd: project?.path,
      label: customName || `${describeLaunch(choices)} · ${place}`,
      planningFile: planningFile.trim() || undefined,
    }
  }, [agent, effort, model, name, planningFile, projectId, projects, yolo])

  return {
    agents,
    agent,
    agentValue,
    changeAgent,
    model,
    changeModel,
    effort,
    setEffort,
    effortLevels,
    yolo,
    setYolo,
    projectId,
    setProjectId,
    planningFile,
    setPlanningFile,
    name,
    setName,
    refreshing,
    refresh,
    savePreferences,
    buildOptions,
  }
}

export type AgentConfig = ReturnType<typeof useAgentConfig>

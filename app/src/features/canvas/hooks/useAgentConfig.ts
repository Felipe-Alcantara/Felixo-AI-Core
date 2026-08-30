import { useCallback, useEffect, useRef, useState } from 'react'
import type { CliAccount } from '../../shared/types/cli-accounts'
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
import {
  buildOpeniaRunArgs,
  normalizeOpeniaInterfaces,
  normalizeOpeniaModels,
  type OpeniaInterfaceDefinition,
  type OpeniaModel,
} from '../services/openia-launch-config'

export type AgentConfigProject = { id: string; name: string; path: string }

/** Sentinel do select de projeto que dispara o seletor de pasta. */
export const ADD_FOLDER_VALUE = '__add_folder__'

type OpeniaLoadResult = {
  interfaces: OpeniaInterfaceDefinition[]
  models: OpeniaModel[]
  configured?: boolean
}

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
  // Contas com login próprio do provedor escolhido. Vazio = só o login do
  // sistema, que continua sendo o padrão.
  const [accountId, setAccountId] = useState(inicial.accountId)
  // A preferência é lida uma vez, na montagem: guardá-la em ref deixa o efeito
  // com a lista de dependências certa sem reagir a uma leitura que não muda.
  const contaSalvaRef = useRef(inicial.accountId)
  const [accounts, setAccounts] = useState<CliAccount[]>([])
  const [model, setModel] = useState(inicial.model)
  const [effort, setEffort] = useState(inicial.effort)
  const [yolo, setYolo] = useState(inicial.yolo)
  const [projectId, setProjectId] = useState(inicial.projectId)
  const [planningFile, setPlanningFile] = useState(inicial.planningFile)
  const [name, setName] = useState('')
  const [openiaInterfaceKey, setOpeniaInterfaceKeyState] = useState(inicial.openiaInterface)
  const [openiaModel, setOpeniaModelState] = useState(inicial.openiaModel)
  const [openiaInterfaces, setOpeniaInterfaces] = useState<OpeniaInterfaceDefinition[]>([])
  const [openiaModels, setOpeniaModels] = useState<OpeniaModel[]>([])
  const [openiaKeyDraft, setOpeniaKeyDraft] = useState('')
  const [openiaKeyConfigured, setOpeniaKeyConfiguredState] = useState(false)
  const [openiaLoading, setOpeniaLoading] = useState(false)
  const [openiaSaving, setOpeniaSaving] = useState(false)
  const [openiaError, setOpeniaError] = useState<string | undefined>()
  const openiaInterfaceRef = useRef(inicial.openiaInterface)
  const openiaModelRef = useRef(inicial.openiaModel)
  const openiaKeyConfiguredRef = useRef(false)
  const openiaLoadRef = useRef<Promise<OpeniaLoadResult> | null>(null)

  // Modelos que as CLIs oferecem agora; cai na lista fixa se a descoberta não
  // trouxer nada, para o formulário nunca aparecer sem opções.
  const { agents, refreshing, refresh } = useAgentModelCatalog()
  const agent: AgentDefinition | undefined =
    agentValue === SHELL_AGENT_VALUE
      ? undefined
      : (agents.find((item) => item.id === agentValue) ?? getAgent(agentValue))
  const effortLevels = agent ? getEffortLevels(agent, model) : null

  const setOpeniaInterfaceKey = useCallback((value: string) => {
    openiaInterfaceRef.current = value
    setOpeniaInterfaceKeyState(value)
  }, [])

  const changeOpeniaModel = useCallback((value: string) => {
    openiaModelRef.current = value
    setOpeniaModelState(value)
  }, [])

  const loadOpenia = useCallback((refreshModels = false): Promise<OpeniaLoadResult> => {
    const bridge = window.felixo?.openia
    if (!bridge) {
      const result = Promise.resolve({ interfaces: [], models: [] })
      setOpeniaError('A integração do Openia não está disponível nesta versão do Felixo.')
      return result
    }
    if (openiaLoadRef.current && !refreshModels) {
      return openiaLoadRef.current
    }

    setOpeniaLoading(true)
    const request = Promise.allSettled([
      bridge.listInterfaces(),
      bridge.listModels({ refresh: refreshModels }),
      bridge.keyStatus(),
    ]).then(([interfacesResult, modelsResult, keyResult]) => {
      const errors: string[] = []
      const interfaces = interfacesResult.status === 'fulfilled' && interfacesResult.value.ok
        ? normalizeOpeniaInterfaces(interfacesResult.value.interfaces)
        : []
      const models = modelsResult.status === 'fulfilled' && modelsResult.value.ok
        ? normalizeOpeniaModels(modelsResult.value.models)
        : []

      if (interfaces.length > 0) {
        setOpeniaInterfaces(interfaces)
        setOpeniaInterfaceKeyState((current) => {
          const next = interfaces.some((item) => item.key === current)
            ? current
            : interfaces[0].key
          openiaInterfaceRef.current = next
          return next
        })
      } else {
        errors.push(
          interfacesResult.status === 'fulfilled'
            ? interfacesResult.value.message ?? 'Nenhuma interface do Openia foi encontrada.'
            : 'Não foi possível consultar as interfaces do Openia.',
        )
      }

      if (models.length > 0) {
        setOpeniaModels(models)
        setOpeniaModelState((current) => {
          const next = models.some((item) => item.id === current) ? current : ''
          openiaModelRef.current = next
          return next
        })
      } else if (modelsResult.status === 'fulfilled' && !modelsResult.value.ok) {
        errors.push(modelsResult.value.message ?? 'Não foi possível carregar os modelos.')
      }

      let configured: boolean | undefined
      if (keyResult.status === 'fulfilled' && keyResult.value.ok) {
        configured = keyResult.value.configured === true
        openiaKeyConfiguredRef.current = configured
        setOpeniaKeyConfiguredState(configured)
      } else {
        errors.push(
          keyResult.status === 'fulfilled'
            ? keyResult.value.message ?? 'Não foi possível consultar a chave do Openia.'
            : 'Não foi possível consultar a chave do Openia.',
        )
      }

      setOpeniaError(errors.length > 0 ? errors.join(' ') : undefined)
      return { interfaces, models, configured }
    }).finally(() => {
      setOpeniaLoading(false)
      if (openiaLoadRef.current === request) {
        openiaLoadRef.current = null
      }
    })
    openiaLoadRef.current = request
    return request
  }, [])

  useEffect(() => {
    if (agentValue !== 'openia') return undefined

    // A consulta externa é iniciada depois do commit do formulário; além de
    // evitar uma renderização em cascata no effect, isso deixa o clique imediato
    // em "Agente" usar a mesma promessa via prepareForLaunch.
    const timer = window.setTimeout(() => {
      void loadOpenia()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [agentValue, loadOpenia])

  const providerId = agentValue === SHELL_AGENT_VALUE ? '' : agentValue

  const carregarContas = useCallback(async () => {
    if (!providerId) {
      return [] as CliAccount[]
    }

    const resultado = await window.felixo?.cliAccounts?.list(providerId)
    const lista = resultado?.ok ? (resultado.accounts ?? []) : []
    setAccounts(lista)
    return lista
  }, [providerId])

  /**
   * Cria a conta e já a deixa escolhida — quem acabou de cadastrar quer abrir
   * o terminal nela, não escolher de novo numa lista.
   */
  const createAccount = useCallback(
    async (label: string, secret?: string) => {
      if (!providerId) {
        return { ok: false, message: 'Escolha um agente antes de criar a conta.' }
      }

      const criada = await window.felixo?.cliAccounts?.create({ providerId, label })

      if (!criada?.ok || !criada.account) {
        return { ok: false, message: criada?.message ?? 'Não foi possível criar a conta.' }
      }

      if (secret?.trim()) {
        const guardada = await window.felixo?.cliAccounts?.setSecret({
          accountId: criada.account.id,
          secret: secret.trim(),
        })

        if (!guardada?.ok) {
          // A conta existe, mas sem a chave ela não serve: desfaz para não
          // deixar uma conta pela metade na lista.
          await window.felixo?.cliAccounts?.remove(criada.account.id)
          return { ok: false, message: guardada?.message ?? 'Não foi possível guardar a chave.' }
        }
      }

      await carregarContas()
      setAccountId(criada.account.id)
      return { ok: true, message: null }
    },
    [carregarContas, providerId],
  )

  const removeAccount = useCallback(
    async (id: string) => {
      await window.felixo?.cliAccounts?.remove(id)
      const lista = await carregarContas()
      setAccountId((atual) => (lista.some((c) => c.id === atual) ? atual : ''))
    },
    [carregarContas],
  )

  useEffect(() => {
    let cancelado = false
    const provedor = providerId

    if (!provedor) {
      // O timeout tira o setState do corpo do efeito: sem ele o lint acusa
      // renderização em cascata, e com razão.
      const limpar = window.setTimeout(() => {
        setAccounts([])
        setAccountId('')
      }, 0)

      return () => window.clearTimeout(limpar)
    }

    void window.felixo?.cliAccounts?.list(provedor).then((resultado) => {
      if (cancelado) {
        return
      }

      const lista = resultado?.ok ? (resultado.accounts ?? []) : []
      setAccounts(lista)
      setAccountId((atual) => {
        if (lista.some((conta) => conta.id === atual)) {
          return atual
        }

        // Reabrir o configurador volta para a última conta usada naquele
        // agente; trocar de agente não arrasta a conta do agente anterior.
        const salva = contaSalvaRef.current
        return lista.some((conta) => conta.id === salva) ? salva : ''
      })
    })

    return () => {
      cancelado = true
    }
  }, [providerId])

  const changeAgent = useCallback((valor: AgentLaunchPreferences['agentValue']) => {
    setAgentValue(valor)
    setModel('')
    setEffort('')
  }, [])

  const refreshOpenia = useCallback(() => {
    void loadOpenia(true)
  }, [loadOpenia])

  const saveOpeniaKey = useCallback(async (): Promise<boolean> => {
    const bridge = window.felixo?.openia
    const key = openiaKeyDraft.trim()
    if (!bridge) {
      setOpeniaError('A integração do Openia não está disponível nesta versão do Felixo.')
      return false
    }
    if (!key) {
      setOpeniaError('Informe uma chave do OpenRouter para salvar.')
      return false
    }

    setOpeniaSaving(true)
    setOpeniaError(undefined)
    try {
      const result = await bridge.setKey({ name: 'felixo', key })
      if (!result.ok) {
        setOpeniaError(result.message ?? 'Não foi possível salvar a chave no Openia.')
        return false
      }
      openiaKeyConfiguredRef.current = true
      setOpeniaKeyConfiguredState(true)
      setOpeniaKeyDraft('')
      return true
    } catch (error) {
      setOpeniaError(
        error instanceof Error ? error.message : 'Não foi possível salvar a chave no Openia.',
      )
      return false
    } finally {
      setOpeniaSaving(false)
    }
  }, [openiaKeyDraft])

  /** Garante que a configuração da interface já foi feita antes de criar o node. */
  const prepareForLaunch = useCallback(async (): Promise<boolean> => {
    if (!agent?.isLauncher) return true

    let interfaces = openiaInterfaces
    let models = openiaModels
    const pendingLoad = openiaLoadRef.current ?? (interfaces.length === 0 ? loadOpenia() : null)
    if (pendingLoad) {
      // A seleção do agente e o clique em "abrir" podem acontecer no mesmo
      // ciclo de renderização, antes do effect que dispara a carga inicial.
      // Iniciar a carga aqui evita transformar essa corrida num falso erro de
      // instalação e ainda mantém uma única requisição em andamento.
      const loaded = await pendingLoad
      if (interfaces.length === 0) interfaces = loaded.interfaces
      if (loaded.models.length > 0) models = loaded.models
    }
    if (interfaces.length === 0) {
      setOpeniaError('Não foi possível carregar as interfaces do Openia. Instale-o e tente novamente.')
      return false
    }

    if (!interfaces.some((item) => item.key === openiaInterfaceRef.current)) {
      openiaInterfaceRef.current = interfaces[0].key
      setOpeniaInterfaceKeyState(interfaces[0].key)
    }

    const selectedInterface = interfaces.find(
      (item) => item.key === openiaInterfaceRef.current,
    )
    const project = projects.find((item) => item.id === projectId)
    if (selectedInterface?.isCodeAgent && !project?.path) {
      setOpeniaError('Selecione um projeto antes de abrir um agente de código do Openia.')
      return false
    }

    if (models.length > 0 && !models.some((item) => item.id === openiaModelRef.current)) {
      openiaModelRef.current = ''
      setOpeniaModelState('')
    }

    if (openiaKeyDraft.trim()) {
      return saveOpeniaKey()
    }

    if (openiaKeyConfiguredRef.current) return true

    const bridge = window.felixo?.openia
    if (!bridge) {
      setOpeniaError('A integração do Openia não está disponível nesta versão do Felixo.')
      return false
    }
    try {
      const status = await bridge.keyStatus()
      if (status.ok && status.configured) {
        openiaKeyConfiguredRef.current = true
        setOpeniaKeyConfiguredState(true)
        return true
      }
    } catch {
      // A mensagem abaixo é a mesma para ausência de chave e falha de consulta;
      // não expõe detalhes do processo nem transforma o segredo em diagnóstico.
    }
    setOpeniaError('Configure a chave do OpenRouter na interface antes de abrir o Openia.')
    return false
  }, [agent, loadOpenia, openiaInterfaces, openiaKeyDraft, openiaModels, projectId, projects, saveOpeniaKey])

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
    saveAgentLaunchPreferences({
      agentValue,
      model,
      effort,
      yolo,
      projectId,
      planningFile,
      openiaInterface: openiaInterfaceRef.current,
      openiaModel: openiaModelRef.current,
      accountId,
    })
  }, [accountId, agentValue, effort, model, planningFile, projectId, yolo])

  /** Traduz a configuração atual nas opções de abertura de um terminal. */
  const buildOptions = useCallback((): NewTerminalOptions => {
    const project = projects.find((item) => item.id === projectId)
    const place = project ? project.name : 'local'
    const customName = name.trim()

    if (!agent) {
      return { cwd: project?.path, label: customName || `Shell · ${place}` }
    }

    // A conta escolhida acompanha o terminal desde o nascimento: é ela que
    // decide em qual login a CLI abre.
    const conta = accountId || undefined

    const choices = {
      agentId: agent.id,
      model: model || undefined,
      effort: (effort || undefined) as EffortLevel | undefined,
      yolo,
    }
    if (agent.isLauncher) {
      const launcherArgs = buildOpeniaRunArgs(
        openiaInterfaceRef.current,
        openiaModelRef.current,
        project?.path,
      )
      const selectedInterface = openiaInterfaces.find(
        (item) => item.key === openiaInterfaceRef.current,
      )
      const modelLabel = openiaModelRef.current ? ` · ${openiaModelRef.current}` : ''
      return {
        accountId: conta,
        command: agent.command,
        args: launcherArgs ?? undefined,
        cwd: project?.path,
        label:
          customName ||
          `${agent.label} · ${selectedInterface?.name ?? openiaInterfaceRef.current}${modelLabel} · ${place}`,
        launchMode: 'launcher',
      }
    }
    return {
      accountId: conta,
      command: agent.command,
      args: buildAgentArgs(choices) ?? undefined,
      cwd: project?.path,
      label: customName || `${describeLaunch(choices)} · ${place}`,
      planningFile: planningFile.trim() || undefined,
    }
  }, [
    accountId,
    agent,
    effort,
    model,
    name,
    openiaInterfaces,
    planningFile,
    projectId,
    projects,
    yolo,
  ])

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
    openiaInterfaceKey,
    setOpeniaInterfaceKey,
    openiaInterfaces,
    openiaModel,
    changeOpeniaModel,
    openiaModels,
    openiaKeyDraft,
    setOpeniaKeyDraft,
    openiaKeyConfigured,
    openiaLoading,
    openiaSaving,
    openiaError,
    refreshOpenia,
    saveOpeniaKey,
    accountId,
    setAccountId,
    accounts,
    createAccount,
    removeAccount,
    prepareForLaunch,
    savePreferences,
    buildOptions,
  }
}

export type AgentConfig = ReturnType<typeof useAgentConfig>

import { useCallback, useEffect, useRef, useState, type SetStateAction } from 'react'
import type { CliAccount } from '../../shared/types/cli-accounts'
import {
  buildAgentArgs,
  describeLaunch,
  getAgent,
  getEffortLevels,
  isEffortValidForModel,
  supportsFastMode,
  type AgentDefinition,
  type EffortLevel,
} from '../services/agent-launch-options'
import {
  CHAIN_ACCOUNT_VALUE,
  readAgentLaunchPreferences,
  saveAgentLaunchPreferences,
  SHELL_AGENT_VALUE,
  type AgentLaunchPreferences,
} from '../services/agent-launch-preferences'
import { useAccountChain } from './useAccountChain'
import {
  confirmChainLaunch,
  getAccountChainBridge,
  previewChainLaunch,
  type ChainLaunchPreview,
  type ChainLaunchTicket,
} from '../services/account-chain-client'
import type { AccountChainProviderId } from '../../shared/types/account-chain'
import { useAgentModelCatalog } from './useAgentModelCatalog'
import { useAgentPresets } from './useAgentPresets'
import type { AgentPreset, AgentPresetAgentId } from '../services/agent-preset'
import type { NewTerminalOptions } from '../services/new-terminal-options'
import {
  removeAccountWithConfirmation,
  type AccountRemovalOutcome,
} from '../services/account-removal'
import {
  buildOpeniaRunArgs,
  normalizeOpeniaInterfaces,
  normalizeOpeniaModels,
  type OpeniaInterfaceDefinition,
  type OpeniaModel,
} from '../services/openia-launch-config'
import {
  resolveOpeniaKeyStatus,
  describeAccountSelectionIssue,
  describeChainSelectionIssue,
  resolveIssueAfterExplicitChoice,
  selectAccountFromList,
  selectionAfterAccountRemoved,
  shouldApplyAccountListResult,
  type AccountListing,
  type AccountSelectionIssue,
} from '../services/agent-account-selection'

export type AgentConfigProject = { id: string; name: string; path: string }

type UseAgentConfigOptions = {
  /** Persiste alterações enquanto o formulário é preenchido. */
  persistPreferences?: boolean
}

/** Sentinel do select de projeto que dispara o seletor de pasta. */
export const ADD_FOLDER_VALUE = '__add_folder__'

type OpeniaLoadResult = {
  interfaces: OpeniaInterfaceDefinition[]
  models: OpeniaModel[]
}

/**
 * Estado de "como abrir um agente": qual CLI, modelo, esforço, projeto, nome.
 *
 * Vive num hook, e não dentro do menu da toolbar, porque a mesma configuração
 * é pedida em dois lugares — abrir um agente novo e passar responsabilidade
 * para outro agente. Enquanto isso morava só no `TerminalMenu`, o segundo caso
 * não tinha como oferecer as mesmas opções sem copiar o formulário inteiro.
 */
export function useAgentConfig(
  projects: readonly AgentConfigProject[],
  { persistPreferences = true }: UseAgentConfigOptions = {},
) {
  const [inicial] = useState(readAgentLaunchPreferences)
  const [agentValue, setAgentValue] = useState<AgentLaunchPreferences['agentValue']>(
    inicial.agentValue,
  )
  // Contas com login próprio do provedor escolhido. Vazio = só o login do
  // sistema, que continua sendo o padrão.
  const accountIdRef = useRef(inicial.accountId)
  const [accountId, setAccountIdState] = useState(inicial.accountId)
  // A preferência é lida uma vez, na montagem: guardá-la em ref deixa o efeito
  // com a lista de dependências certa sem reagir a uma leitura que não muda.
  // O provedor vai junto: a conta salva de outro provedor não está "ausente",
  // só não se aplica.
  const contaSalvaRef = useRef({
    providerId: inicial.agentValue === SHELL_AGENT_VALUE ? '' : inicial.agentValue,
    accountId: inicial.accountId,
    label: inicial.accountLabel ?? '',
  })
  const [accounts, setAccounts] = useState<CliAccount[]>([])
  // Conta que não pode abrir (lista ilegível ou conta salva que sumiu). Com
  // ele a abertura fica bloqueada até uma escolha explícita ou uma nova carga.
  const [accountSelectionIssue, setAccountSelectionIssueState] =
    useState<AccountSelectionIssue | null>(null)
  const accountSelectionIssueRef = useRef<AccountSelectionIssue | null>(null)
  const [model, setModel] = useState(inicial.model)
  const [effort, setEffort] = useState(inicial.effort)
  const [yolo, setYolo] = useState(inicial.yolo)
  const [fast, setFast] = useState(inicial.fast)
  // Preset aplicado + o contexto editável do agente. O contexto é um rascunho
  // próprio (não o do preset): dá para ajustá-lo antes de abrir e salvar o
  // resultado como um preset novo.
  const agentPresets = useAgentPresets()
  const [activePreset, setActivePreset] = useState<AgentPreset | null>(null)
  const [contextDraft, setContextDraft] = useState('')
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
  const accountListRequestRef = useRef(0)
  const openiaKeyStatusRequestRef = useRef(0)

  // Modelos que as CLIs oferecem agora; cai na lista fixa se a descoberta não
  // trouxer nada, para o formulário nunca aparecer sem opções.
  const { agents, refreshing, refresh } = useAgentModelCatalog()
  const agent: AgentDefinition | undefined =
    agentValue === SHELL_AGENT_VALUE
      ? undefined
      : (agents.find((item) => item.id === agentValue) ?? getAgent(agentValue))
  const effortLevels = agent ? getEffortLevels(agent, model) : null
  const fastSupported = supportsFastMode(agent, model)

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
    ]).then(([interfacesResult, modelsResult]) => {
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

      setOpeniaError(errors.length > 0 ? errors.join(' ') : undefined)
      return { interfaces, models }
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
  const providerIdRef = useRef(providerId)

  useEffect(() => {
    providerIdRef.current = providerId
  }, [providerId])

  // "Automática (cadeia)": o main escolhe a conta e a abertura confirma. A
  // prévia é pedida uma vez por provedor (e de novo depois de cada abertura
  // ou recusa); cada pedido cria uma proposta `launch` no main.
  const { snapshot: chainSnapshot } = useAccountChain()
  const chainState = chainSnapshot.state
  const chainEnabled = chainState?.settings.enabled === true
  const providerHasChainCheck = Boolean(
    providerId &&
      chainState?.members.some((member) => member.providerId === providerId && !member.locked),
  )
  const chainLaunchAvailable = chainEnabled && providerHasChainCheck
  const isChainSelection = accountId === CHAIN_ACCOUNT_VALUE
  const [chainPreviewNonce, setChainPreviewNonce] = useState(0)
  const chainPreviewKey = `${providerId}:${chainPreviewNonce}`
  const [chainPreviewEntry, setChainPreviewEntry] = useState<{
    key: string
    preview: ChainLaunchPreview
  } | null>(null)
  const chainPreview =
    chainPreviewEntry && chainPreviewEntry.key === chainPreviewKey ? chainPreviewEntry.preview : null
  const [chainLaunchError, setChainLaunchError] = useState<string | undefined>()
  const chainLaunchRef = useRef<ChainLaunchTicket | null>(null)

  useEffect(() => {
    if (!isChainSelection || !chainLaunchAvailable || !providerId) return
    let cancelled = false
    void previewChainLaunch(getAccountChainBridge(), providerId as AccountChainProviderId).then(
      (preview) => {
        if (!cancelled) setChainPreviewEntry({ key: chainPreviewKey, preview })
      },
    )
    return () => {
      cancelled = true
    }
  }, [chainLaunchAvailable, chainPreviewKey, isChainSelection, providerId])

  const chainSelectionIssue = describeChainSelectionIssue(accountId, {
    chainStatus: chainSnapshot.status,
    enabled: chainEnabled,
    providerHasLoginCheck: providerHasChainCheck,
    preview: chainPreview
      ? chainPreview.status === 'ready'
        ? { status: 'ready' }
        : chainPreview
      : { status: 'pending' },
  })

  const refreshChainPreview = useCallback(() => {
    setChainLaunchError(undefined)
    setChainPreviewNonce((value) => value + 1)
  }, [])

  /** Abrir com "Automática (cadeia)" é a confirmação: `confirm` e ticket. */
  const confirmarCadeia = useCallback(async (): Promise<boolean> => {
    chainLaunchRef.current = null
    setChainLaunchError(undefined)
    if (chainSelectionIssue) return false
    if (!chainPreview || chainPreview.status !== 'ready') {
      setChainLaunchError('A cadeia ainda está escolhendo a conta. Tente de novo em instantes.')
      return false
    }
    const result = await confirmChainLaunch(getAccountChainBridge(), chainPreview.proposal)
    if (result.ok) {
      chainLaunchRef.current = result.launch
      return true
    }
    setChainLaunchError(result.message)
    if (result.preview) {
      setChainPreviewEntry({ key: chainPreviewKey, preview: result.preview })
    } else {
      setChainPreviewNonce((value) => value + 1)
    }
    return false
  }, [chainPreview, chainPreviewKey, chainSelectionIssue])

  const setAccountSelectionIssue = useCallback((issue: AccountSelectionIssue | null) => {
    accountSelectionIssueRef.current = issue
    setAccountSelectionIssueState(issue)
  }, [])

  /**
   * Escolha explícita da conta (o campo, criar ou remover conta). Só ela
   * resolve o aviso de conta ausente; a carga da lista usa
   * `aplicarListagem`, que nunca troca a seleção para o login do sistema.
   */
  const setAccountId = useCallback(
    (value: SetStateAction<string>) => {
      // A seleção do campo e o clique em abrir podem acontecer em eventos
      // consecutivos antes de a renderização que contém o novo state. O ref
      // evita que esse intervalo use a conta anterior, e é a base da forma
      // funcional porque acompanha toda escrita no state.
      const proxima = typeof value === 'function' ? value(accountIdRef.current) : value
      accountIdRef.current = proxima
      setAccountIdState(proxima)
      setAccountSelectionIssue(
        resolveIssueAfterExplicitChoice(accountSelectionIssueRef.current, proxima),
      )
    },
    [setAccountSelectionIssue],
  )

  /**
   * Aplica a listagem ao campo. Lista ilegível mantém a seleção; conta que
   * sumiu continua escolhida (o campo mostra "Selecionar…"). Nos dois casos o
   * aviso bloqueia a abertura: nunca cai no login do sistema em silêncio, e
   * como a seleção não muda, a preferência salva também não vira ''.
   */
  const aplicarListagem = useCallback(
    (provedor: string, listing: AccountListing) => {
      if (listing.ok) {
        setAccounts([...listing.accounts])
      }
      const salva = contaSalvaRef.current.providerId === provedor ? contaSalvaRef.current : null
      const selection = selectAccountFromList(listing, accountIdRef.current, salva?.accountId ?? '')
      accountIdRef.current = selection.accountId
      setAccountIdState(selection.accountId)
      setAccountSelectionIssue(
        describeAccountSelectionIssue(
          selection,
          salva && selection.accountId === salva.accountId ? salva.label : '',
        ),
      )
    },
    [setAccountSelectionIssue],
  )

  /** Lista as contas do provedor; só a resposta mais recente do provedor atual vale. */
  const listarContasDoProvedor = useCallback(
    (provedor: string) => {
      const requestId = ++accountListRequestRef.current
      const bridge = window.felixo?.cliAccounts
      // Sem a ponte (versão sem contas) nada muda, como antes: o processo
      // principal ainda confere a conta no nascimento do terminal.
      if (!bridge) return

      const aindaVale = () =>
        shouldApplyAccountListResult({
          requestProviderId: provedor,
          currentProviderId: providerIdRef.current,
          requestId,
          latestRequestId: accountListRequestRef.current,
        })

      void bridge.list(provedor).then(
        (resultado) => {
          if (!aindaVale()) return
          aplicarListagem(
            provedor,
            resultado?.ok
              ? { ok: true, accounts: resultado.accounts ?? [] }
              : { ok: false, message: resultado?.message },
          )
        },
        () => {
          if (!aindaVale()) return
          aplicarListagem(provedor, { ok: false })
        },
      )
    },
    [aplicarListagem],
  )

  /** "Tentar de novo" do aviso de lista ilegível. */
  const retryAccountList = useCallback(() => {
    if (providerIdRef.current) {
      listarContasDoProvedor(providerIdRef.current)
    }
  }, [listarContasDoProvedor])

  const carregarContas = useCallback(async () => {
    if (!providerId) {
      return [] as CliAccount[]
    }

    const requestId = ++accountListRequestRef.current
    const resultado = await window.felixo?.cliAccounts?.list(providerId)
    if (
      !shouldApplyAccountListResult({
        requestProviderId: providerId,
        currentProviderId: providerIdRef.current,
        requestId,
        latestRequestId: accountListRequestRef.current,
      })
    ) {
      return [] as CliAccount[]
    }

    const lista = resultado?.ok ? (resultado.accounts ?? []) : []
    setAccounts(lista)
    return lista
  }, [providerId])

  /**
   * Atualiza o indicador sem misturar a chave global com a conta escolhida.
   * A lista traz apenas `secretConfigured`; o segredo continua no processo
   * principal e nunca atravessa o IPC.
   */
  const syncOpeniaKeyStatus = useCallback(
    async (availableAccounts: readonly CliAccount[] = accounts): Promise<boolean> => {
      const requestId = ++openiaKeyStatusRequestRef.current
      const selectedAccountId = accountIdRef.current.trim()

      if (selectedAccountId) {
        const resolved = resolveOpeniaKeyStatus(availableAccounts, selectedAccountId, false)
        if (
          requestId !== openiaKeyStatusRequestRef.current ||
          accountIdRef.current.trim() !== selectedAccountId ||
          providerIdRef.current !== 'openia'
        ) {
          return resolved.configured
        }
        openiaKeyConfiguredRef.current = resolved.configured
        setOpeniaKeyConfiguredState(resolved.configured)
        return resolved.configured
      }

      const bridge = window.felixo?.openia
      if (!bridge) {
        setOpeniaError('A integração do Openia não está disponível nesta versão do Felixo.')
        return false
      }

      try {
        const status = await bridge.keyStatus()
        if (
          requestId !== openiaKeyStatusRequestRef.current ||
          accountIdRef.current.trim() !== '' ||
          providerIdRef.current !== 'openia'
        ) {
          return false
        }
        const resolved = resolveOpeniaKeyStatus([], '', status.ok && status.configured === true)
        openiaKeyConfiguredRef.current = resolved.configured
        setOpeniaKeyConfiguredState(resolved.configured)
        return resolved.configured
      } catch {
        if (
          requestId === openiaKeyStatusRequestRef.current &&
          accountIdRef.current.trim() === '' &&
          providerIdRef.current === 'openia'
        ) {
          setOpeniaError('Não foi possível consultar a chave do Openia.')
        }
        return false
      }
    },
    [accounts],
  )

  useEffect(() => {
    if (agentValue !== 'openia') return undefined
    void syncOpeniaKeyStatus(accounts)
    return undefined
  }, [accountId, accounts, agentValue, syncOpeniaKeyStatus])

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
          // Desfazer a criação não é uma remoção escolhida pela pessoa: a
          // conta acabou de nascer e nenhum terminal abriu nela.
          await window.felixo?.cliAccounts?.remove(criada.account.id, { confirmed: true })
          return { ok: false, message: guardada?.message ?? 'Não foi possível guardar a chave.' }
        }
      }

      await carregarContas()
      // A conta pode ter sido criada enquanto o usuário trocava de agente;
      // nesse caso ela existe, mas não pode virar a seleção do agente atual.
      if (providerIdRef.current !== providerId) {
        return { ok: true, message: null }
      }
      setAccountId(criada.account.id)
      return { ok: true, message: null }
    },
    [carregarContas, providerId, setAccountId],
  )

  /**
   * Remove a conta depois da confirmação que nomeia os terminais vivos nela.
   * `confirm` é quem pergunta (o componente decide como); a trava que exige a
   * resposta fica no processo principal.
   */
  const removeAccount = useCallback(
    async (
      id: string,
      label: string,
      confirm: (message: string) => boolean | Promise<boolean>,
    ): Promise<AccountRemovalOutcome> => {
      const bridge = window.felixo?.cliAccounts
      if (!bridge) {
        return { status: 'failed', message: 'Não foi possível remover a conta.' }
      }

      const resultado = await removeAccountWithConfirmation({
        accountLabel: label,
        remove: (options) => bridge.remove(id, options),
        confirm,
      })
      if (resultado.status !== 'removed') {
        return resultado
      }

      const provedorDaOperacao = providerId
      await carregarContas()
      if (providerIdRef.current !== provedorDaOperacao) {
        return resultado
      }
      // Só a remoção da conta escolhida mexe na seleção, e mesmo assim não
      // vira login do sistema: a seleção fica na conta removida ("Selecionar…")
      // e a abertura fica bloqueada até uma escolha explícita. Decidir pela
      // lista recarregada faria uma falha de listagem derrubar outra conta.
      const depois = selectionAfterAccountRemoved(accountIdRef.current, id, label)
      if (depois) {
        setAccountSelectionIssue(depois.issue)
      }
      return resultado
    },
    [carregarContas, providerId, setAccountSelectionIssue],
  )

  useEffect(() => {
    const provedor = providerId

    if (!provedor) {
      accountListRequestRef.current += 1
      // O timeout tira o setState do corpo do efeito: sem ele o lint acusa
      // renderização em cascata, e com razão.
      const limpar = window.setTimeout(() => {
        setAccounts([])
        setAccountId('')
      }, 0)

      return () => window.clearTimeout(limpar)
    }

    listarContasDoProvedor(provedor)

    return () => {
      // O token é a guarda principal; o cleanup ainda invalida imediatamente
      // uma resposta que esteja prestes a continuar a cadeia de microtasks.
      accountListRequestRef.current += 1
    }
  }, [listarContasDoProvedor, providerId, setAccountId])

  const changeAgent = useCallback((valor: AgentLaunchPreferences['agentValue']) => {
    // Limpa antes de a nova lista chegar. Assim nenhum clique no mesmo ciclo
    // consegue carregar a conta do agente anterior para o novo processo.
    accountListRequestRef.current += 1
    openiaKeyStatusRequestRef.current += 1
    providerIdRef.current = valor === SHELL_AGENT_VALUE ? '' : valor
    accountIdRef.current = ''
    setAccounts([])
    setAccountIdState('')
    // O aviso era do provedor anterior; a lista do novo decide de novo.
    setAccountSelectionIssue(null)
    setAgentValue(valor)
    setModel('')
    setEffort('')
    setFast(false)
    // Um preset descreve uma CLI: trocar de agente sai do preset.
    setActivePreset((atual) => (atual && atual.agentId === valor ? atual : null))
  }, [setAccountSelectionIssue])

  const refreshOpenia = useCallback(() => {
    void Promise.all([loadOpenia(true), carregarContas()]).then(([, lista]) => {
      void syncOpeniaKeyStatus(lista)
    })
  }, [carregarContas, loadOpenia, syncOpeniaKeyStatus])

  const saveOpeniaKey = useCallback(async (): Promise<boolean> => {
    const key = openiaKeyDraft.trim()
    const selectedAccountId = accountIdRef.current.trim()
    const openiaBridge = window.felixo?.openia
    const accountsBridge = window.felixo?.cliAccounts

    if (selectedAccountId && !accountsBridge) {
      setOpeniaError('A integração de contas do Openia não está disponível nesta versão do Felixo.')
      return false
    }
    if (!selectedAccountId && !openiaBridge) {
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
      const result = selectedAccountId
        ? await accountsBridge!.setSecret({ accountId: selectedAccountId, secret: key })
        : await openiaBridge!.setKey({ name: 'felixo', key })
      if (!result.ok) {
        setOpeniaError(
          result.message ??
            (selectedAccountId
              ? 'Não foi possível salvar a chave nesta conta do Openia.'
              : 'Não foi possível salvar a chave no Openia.'),
        )
        return false
      }
      if (selectedAccountId) {
        await carregarContas()
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
  }, [carregarContas, openiaKeyDraft])

  /** Garante que a configuração da interface já foi feita antes de criar o node. */
  const prepareForLaunch = useCallback(async (): Promise<boolean> => {
    // Conta que não pode ser conferida nunca abre, nem cai no login do sistema.
    if (accountSelectionIssueRef.current) return false
    const viaCadeia = accountIdRef.current === CHAIN_ACCOUNT_VALUE
    if (!agent?.isLauncher) return viaCadeia ? confirmarCadeia() : true

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

    // Pela cadeia, a chave é da conta que o main escolher: a elegibilidade
    // dele já exclui conta Openia sem chave ('sem-chave').
    if (viaCadeia) {
      return confirmarCadeia()
    }

    if (openiaKeyDraft.trim()) {
      return saveOpeniaKey()
    }

    const selectedAccountId = accountIdRef.current.trim()
    if (selectedAccountId) {
      const freshAccounts = await carregarContas()
      const selectedAccount = freshAccounts.find((item) => item.id === selectedAccountId)
      const resolved = resolveOpeniaKeyStatus(freshAccounts, selectedAccountId, false)
      openiaKeyConfiguredRef.current = resolved.configured
      setOpeniaKeyConfiguredState(resolved.configured)

      if (!selectedAccount) {
        setOpeniaError('A conta selecionada não existe mais. Escolha outra conta ou use o login do sistema.')
        return false
      }
      if (!resolved.configured) {
        setOpeniaError('Configure a chave do OpenRouter nesta conta antes de abrir o Openia.')
        return false
      }
      return true
    }

    const bridge = window.felixo?.openia
    if (!bridge) {
      setOpeniaError('A integração do Openia não está disponível nesta versão do Felixo.')
      return false
    }
    try {
      const status = await bridge.keyStatus()
      const resolved = resolveOpeniaKeyStatus([], '', status.ok && status.configured === true)
      openiaKeyConfiguredRef.current = resolved.configured
      setOpeniaKeyConfiguredState(resolved.configured)
      if (resolved.configured) {
        return true
      }
    } catch {
      // A mensagem abaixo é a mesma para ausência de chave e falha de consulta;
      // não expõe detalhes do processo nem transforma o segredo em diagnóstico.
    }
    setOpeniaError('Configure a chave do OpenRouter na interface antes de abrir o Openia.')
    return false
  }, [agent, carregarContas, confirmarCadeia, loadOpenia, openiaInterfaces, openiaKeyDraft, openiaModels, projectId, projects, saveOpeniaKey])

  const changeModel = useCallback(
    (valor: string) => {
      setModel(valor)
      // Um modelo pode não aceitar o nível de esforço escolhido para o
      // anterior; deixar o valor inválido aí produziria um argumento que a CLI
      // recusa na hora de subir.
      if (agent && !isEffortValidForModel(agent, valor, effort)) {
        setEffort('')
      }
      if (!supportsFastMode(agent, valor)) {
        setFast(false)
      }
    },
    [agent, effort],
  )

  /** Carrega a receita de um preset no formulário (`null` = voltar ao manual). */
  const applyPreset = useCallback(
    (preset: AgentPreset | null) => {
      if (!preset) {
        setActivePreset(null)
        setContextDraft('')
        return
      }
      // Trocar de CLI zera conta/modelo/esforço; só chama quando muda de fato,
      // para não perder a conta escolhida ao aplicar um preset da mesma CLI.
      if (agentValue !== preset.agentId) {
        changeAgent(preset.agentId)
      }
      setModel(preset.model)
      setEffort(preset.effort)
      setFast(preset.fast)
      setYolo(preset.yolo)
      const project = preset.cwd ? projects.find((item) => item.path === preset.cwd) : undefined
      if (project) setProjectId(project.id)
      setContextDraft(preset.contextPrompt)
      setActivePreset(preset)
    },
    [agentValue, changeAgent, projects],
  )

  /** Salva a configuração atual como preset novo (mantém as skills do preset ativo). */
  const saveAsPreset = useCallback(
    async (presetName: string) => {
      if (!agent || agent.isLauncher || agentValue === SHELL_AGENT_VALUE) return null
      const project = projects.find((item) => item.id === projectId)
      const saved = await agentPresets.create({
        name: presetName,
        description: '',
        icon: activePreset?.icon ?? '',
        ...(activePreset?.color ? { color: activePreset.color } : {}),
        agentId: agent.id as AgentPresetAgentId,
        model,
        effort,
        fast: fast && fastSupported,
        yolo,
        contextPrompt: contextDraft,
        skillIds: activePreset?.skillIds ?? [],
        cwd: project?.path ?? '',
      })
      if (saved) setActivePreset(saved)
      return saved
    },
    [activePreset, agent, agentPresets, agentValue, contextDraft, effort, fast, fastSupported, model, projectId, projects, yolo],
  )

  const savePreferences = useCallback(() => {
    const conta = accountIdRef.current
    // O nome acompanha o id para o aviso de conta ausente. Se a conta já não
    // está na lista, fica o nome guardado antes (nunca some junto com ela).
    const accountLabel =
      accounts.find((item) => item.id === conta)?.label ??
      (conta && conta === contaSalvaRef.current.accountId ? contaSalvaRef.current.label : '')
    saveAgentLaunchPreferences({
      agentValue,
      model,
      effort,
      yolo,
      fast: fast && fastSupported,
      projectId,
      planningFile,
      openiaInterface: openiaInterfaceRef.current,
      openiaModel: openiaModelRef.current,
      accountId: conta,
      ...(accountLabel ? { accountLabel } : {}),
    })
  }, [
    accounts,
    agentValue,
    effort,
    fast,
    fastSupported,
    model,
    planningFile,
    projectId,
    yolo,
  ])

  // A configuração do botão principal acompanha a última escolha feita no
  // formulário, mesmo quando a pessoa apenas fecha o painel sem iniciar um
  // terminal. O nome fica de fora de propósito: ele é uma identificação
  // pontual do próximo node, não uma preferência global.
  useEffect(() => {
    if (!persistPreferences) return
    savePreferences()
  }, [
    accountId,
    effort,
    fast,
    model,
    openiaInterfaceKey,
    openiaModel,
    persistPreferences,
    planningFile,
    projectId,
    savePreferences,
    yolo,
  ])

  /** Traduz a configuração atual nas opções de abertura de um terminal. */
  const buildOptions = useCallback((): NewTerminalOptions => {
    const project = projects.find((item) => item.id === projectId)
    const place = project ? project.name : 'local'
    const customName = name.trim()

    if (!agent) {
      return { cwd: project?.path, label: customName || `Shell · ${place}` }
    }

    // A conta escolhida acompanha o terminal desde o nascimento: é ela que
    // decide em qual login a CLI abre. Pela cadeia, vale a conta confirmada,
    // com o ticket de uso único; o ticket é consumido aqui para que uma
    // segunda abertura peça uma prévia e uma confirmação próprias. Sem ticket,
    // o valor especial segue adiante e o main o recusa — nunca vira Login do
    // sistema.
    const cadeia = chainLaunchRef.current
    if (cadeia) {
      chainLaunchRef.current = null
      setChainPreviewNonce((value) => value + 1)
    }
    const conta = cadeia ? cadeia.accountId : accountIdRef.current || undefined
    const modoDaConta = cadeia
      ? { accountMode: 'chain' as const, chainTicket: cadeia.ticket }
      : {}

    const choices = {
      agentId: agent.id,
      model: model || undefined,
      effort: (effort || undefined) as EffortLevel | undefined,
      yolo,
      fast: fast && fastSupported,
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
        providerId: agent.id,
        ...modoDaConta,
        command: agent.command,
        args: launcherArgs ?? undefined,
        cwd: project?.path,
        label:
          customName ||
          `${agent.label} · ${selectedInterface?.name ?? openiaInterfaceRef.current}${modelLabel} · ${place}`,
        launchMode: 'launcher',
      }
    }
    // Contexto/skills/cor do preset acompanham o terminal desde o nascimento.
    // Sem preset nem contexto digitado, nada é acrescentado.
    const context = contextDraft.trim()
    const preset =
      activePreset || context
        ? {
            id: activePreset?.id,
            name: activePreset?.name ?? 'Contexto do agente',
            contextPrompt: context,
            skillIds: activePreset?.skillIds ?? [],
            ...(activePreset?.color ? { color: activePreset.color } : {}),
          }
        : undefined
    return {
      accountId: conta,
      providerId: agent.id,
      ...modoDaConta,
      command: agent.command,
      args: buildAgentArgs(choices) ?? undefined,
      cwd: project?.path,
      label:
        customName ||
        (activePreset ? `${activePreset.name} · ${place}` : `${describeLaunch(choices)} · ${place}`),
      planningFile: planningFile.trim() || undefined,
      ...(preset ? { preset } : {}),
    }
  }, [
    activePreset,
    agent,
    contextDraft,
    effort,
    fast,
    fastSupported,
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
    fast,
    setFast,
    fastSupported,
    presets: agentPresets,
    activePreset,
    applyPreset,
    saveAsPreset,
    contextDraft,
    setContextDraft,
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
    // O bloqueio da cadeia entra no mesmo aviso: os botões de abrir já
    // respeitam `accountSelectionIssue` em todo lugar que usa este hook.
    accountSelectionIssue: accountSelectionIssue ?? chainSelectionIssue,
    chainLaunchAvailable,
    chainPreview,
    chainLaunchError,
    refreshChainPreview,
    retryAccountList,
    createAccount,
    removeAccount,
    prepareForLaunch,
    savePreferences,
    buildOptions,
  }
}

export type AgentConfig = ReturnType<typeof useAgentConfig>

/**
 * Contrato tipado da cadeia de contas entre o renderer e o processo principal.
 *
 * O renderer só consome: quem decide elegibilidade, ordem, espera, proposta e
 * ticket é o serviço da cadeia no main (`accounts/account-chain-service.cjs`).
 * Este arquivo fixa o formato dos canais `account-chain:*` (§2.5 do plano) e do
 * namespace `window.felixo.accountChain` no preload, para que as duas pontas
 * sejam escritas contra a mesma coisa.
 *
 * Nada aqui carrega segredo: nenhum caminho de perfil, env, token ou e-mail. A
 * identidade circula só como estado (`identityStatus`), e todo texto que veio
 * da CLI (evidência, motivo, plano) chega já redigido pelo main.
 *
 * Horários são sempre ISO 8601 em UTC; a UI converte para o horário local.
 */

/** Provedores que a cadeia conhece (os mesmos de `cli-account-profiles.cjs`). */
export type AccountChainProviderId = 'codex' | 'claude' | 'gemini' | 'openia'

/** As quatro estratégias da decisão 3. `manual` é a de partida ao ligar. */
export type AccountChainStrategy =
  | 'manual'
  | 'round_robin'
  | 'most_capacity'
  | 'subscription_first'

/**
 * Modo da conta de um bloco. Ausente vale `pinned` (decisão 5): só nasce
 * `chain` o bloco aberto com "Automática (cadeia)" ou criado como continuação
 * confirmada.
 */
export type AccountMode = 'pinned' | 'chain'

/** Classe fechada da taxonomia de falhas do main (§5.1). */
export type AccountFailureClass =
  | 'limit'
  | 'billing'
  | 'auth'
  | 'network'
  | 'provider'
  | 'timeout'
  | 'cancelled'
  | 'unknown'

/** `model`: limite só daquele modelo (Codex); não põe a conta em espera. */
export type AccountFailureScope = 'account' | 'model'

/** Classe de cobrança. Ausência (`null`) = desconhecida, nunca presumida assinatura. */
export type AccountBillingClass = 'assinatura' | 'uso'

/** Classes que põem a conta em espera. */
export type AccountCooldownClass = 'limit' | 'auth' | 'billing'

/** De onde veio o fim da espera (§6.4). */
export type AccountCooldownUntilSource =
  | 'medicao'
  | 'texto'
  | 'texto_fuso_local'
  | 'padrao'
  | 'checagem'

export type AccountCooldownReleaseReason =
  | 'vencimento'
  | 'checagem'
  | 'nao_era_limite'
  | 'recarregou'
  | 'manual'

/** Resultado da última checagem de login da conta (§6.2). */
export type AccountLoginStatus =
  | 'logged_in'
  | 'logged_out'
  | 'unknown'
  | 'cli_ausente'
  | 'tempo_esgotado'
  | 'erro'
  | 'sem_checagem'

export type AccountLoginCheckSource = 'checagem' | 'amostra_do_painel'

export type AccountIdentityStatus = 'matched' | 'unbound' | 'different' | 'duplicate' | 'missing'

/** Primeira razão que bloqueia um membro (§6.1), na ordem em que é avaliada. */
export type AccountIneligibilityReason =
  | 'cadeia-desligada'
  | 'membro-desabilitado'
  | 'conta-removida'
  | 'sem-checagem-de-login'
  | 'sem-chave'
  | 'em-espera'
  | 'esgotada-pela-medicao'
  | 'login-nao-conferido'
  | 'deslogada'
  | 'cli-ausente'
  | 'tempo-esgotado'
  | 'identidade-diferente'
  | 'identidade-duplicada'
  | 'origem'
  | 'ja-visitada-na-linhagem'

/** De onde veio o multiplicador do plano (§7.3). Sem nenhum, vale 1 "não declarado". */
export type AccountMultiplierSource = 'cli' | 'declarado' | 'nao_declarado'

/** Tipos de linha do registro de trocas (`account_switch_events.kind`). */
export type AccountSwitchKind = 'continuation' | 'launch' | 'manual' | 'notice' | 'provider_switch'

/** Estados do registro de trocas (§4.1). */
export type AccountSwitchState =
  | 'noticed'
  | 'proposed'
  | 'confirmed'
  | 'spawning'
  | 'spawned'
  | 'declined'
  | 'dismissed'
  | 'expired'
  | 'superseded'
  | 'spawn_failed'
  | 'no_candidate'
  | 'accepted'
  | 'refused'

export type AccountSwitchChosenBy = 'chain' | 'person'

// ---------------------------------------------------------------------------
// Estado
// ---------------------------------------------------------------------------

/** Configuração global. Sem linha no banco = desligada (decisão 4). */
export type AccountChainSettings = {
  enabled: boolean
  strategy: AccountChainStrategy
  /** Teto de saltos por linhagem (1 a 10; padrão 3). */
  maxHopsPerLineage: number
  updatedAt: string | null
}

/** Última checagem de login conhecida da conta. */
export type AccountLoginCheck = {
  status: AccountLoginStatus
  checkedAt: string
  source: AccountLoginCheckSource
  /** Método de login como a CLI imprimiu, redigido (ex.: "Logged in using ChatGPT"). */
  method: string | null
  /** Plano como a CLI publicou, redigido (ex.: "max", "plus"). */
  plan: string | null
  identityStatus: AccountIdentityStatus | null
}

/** Espera ativa (ou vencida sem nova checagem) de uma conta. */
export type AccountCooldown = {
  accountId: string
  providerId: AccountChainProviderId
  failureClass: AccountCooldownClass
  detectedAt: string
  /** `null` = até checagem ou ação da pessoa (auth, billing). */
  untilAt: string | null
  untilSource: AccountCooldownUntilSource
  /**
   * Quando medição e texto divergem vale o mais tarde (`untilAt`), e a UI
   * mostra também o outro horário com a fonte dele.
   */
  alternativeUntilAt: string | null
  alternativeUntilSource: AccountCooldownUntilSource | null
  /** Linha que a CLI imprimiu, redigida pelo main, até 200 caracteres. */
  evidence: string | null
  /** Espera vencida que ainda exige checagem de login para a conta voltar. */
  needsCheck: boolean
}

/**
 * Capacidade absoluta = restante% × multiplicador (§7.3). Só existe com
 * medição atual; ausência nunca vira 0 nem 100.
 */
export type AccountCapacity = {
  /** `null` sem medição atual, sem janela em % ou quando não é comparável. */
  value: number | null
  /** A janela % mais apertada da medição atual. */
  remainingPercent: number | null
  /** Horário da medição atual usada no cálculo. */
  measuredAt: string | null
  /** Última medição conhecida, mesmo antiga — só para dizer "última às 13:02". */
  lastMeasuredAt: string | null
  /** `false` quando a medida não é em % (Openia, créditos em US$). */
  comparable: boolean
}

/** O que a UI precisa saber de uma conta para mostrá-la como opção. */
export type AccountChainAccountView = {
  accountId: string
  providerId: AccountChainProviderId
  /** Rótulo dado pela pessoa (fotografia do momento no registro). */
  label: string
  /** Posição na ordem manual, a partir de 0. */
  position: number
  billingDeclared: AccountBillingClass | null
  billingDetected: AccountBillingClass | null
  /** Plano publicado pela CLI, redigido. */
  planText: string | null
  multiplierDeclared: number | null
  multiplierDetected: number | null
  /** Multiplicador efetivo (CLI > declarado > 1). */
  multiplier: number
  multiplierSource: AccountMultiplierSource
  capacity: AccountCapacity
  login: AccountLoginCheck | null
}

/** Uma linha da lista da cadeia, com o que bloqueia a conta agora. */
export type AccountChainMember = AccountChainAccountView & {
  enabled: boolean
  /**
   * O provedor não tem checagem de login (hoje, o Gemini): fica na lista,
   * desabilitado e travado, sem o código da política citar o nome dele.
   */
  locked: boolean
  eligible: boolean
  reason: AccountIneligibilityReason | null
  /** Texto pt-BR da razão, como o main a explica. */
  reasonText: string | null
  cooldown: AccountCooldown | null
  /** A CLI disse que há chave de API no ambiente do perfil (só o fato). */
  apiKeySourcePresent: boolean
}

/** Conta que ficou fora de uma proposta, com o motivo. */
export type AccountChainExclusion = {
  accountId: string
  providerId: AccountChainProviderId
  label: string
  reason: AccountIneligibilityReason
  reasonText: string | null
}

/** Conta apta oferecida como destino de uma proposta. */
export type AccountSwitchCandidate = AccountChainAccountView & {
  /** O main está conferindo o login desta conta agora (`aria-busy`). */
  checkingLogin: boolean
}

/** Ponta de origem de uma proposta ou troca. `accountId` nulo = Login do sistema. */
export type AccountSwitchEndpoint = {
  accountId: string | null
  providerId: AccountChainProviderId
  label: string | null
}

/**
 * Proposta aberta pelo main. `continuation` nasce de uma detecção num bloco
 * `chain`; `launch` nasce de "Automática (cadeia)" ao abrir um bloco (§8.5).
 * O `id` é o uuid gerado no main: chave de idempotência e, depois do
 * `confirm`, o próprio ticket.
 */
export type AccountSwitchProposal = {
  id: string
  kind: 'continuation' | 'launch'
  state: AccountSwitchState
  /** Sessão PTY de origem (`canvas:<nodeId>`); nula no `launch`. */
  sourceSessionId: string | null
  lineageId: string | null
  hop: number
  /** Agrupa as sessões da mesma conta na mesma detecção. */
  incidentKey: string | null
  from: AccountSwitchEndpoint & {
    billingDeclared: AccountBillingClass | null
    billingDetected: AccountBillingClass | null
    multiplier: number | null
    multiplierSource: AccountMultiplierSource | null
  }
  /** Nulos no `launch`, que não nasce de falha. */
  failureClass: AccountFailureClass | null
  scope: AccountFailureScope | null
  /** Motivo redigido (até 400 caracteres). */
  reason: string
  /** Linha que a CLI imprimiu, redigida, até 200 caracteres. */
  evidence: string | null
  detectedAt: string | null
  proposedAt: string
  expiresAt: string
  /** Espera em que a origem entrou (fim e fonte). */
  cooldown: AccountCooldown | null
  strategy: AccountChainStrategy
  /** Aptos na ordem da estratégia; o primeiro é o recomendado. */
  candidates: AccountSwitchCandidate[]
  recommendedAccountId: string | null
  /** "Fora agora": contas não aptas, com o motivo de cada uma. */
  excluded: AccountChainExclusion[]
  /** Última saída do terminal de origem (§8.4); nula se nunca houve. */
  sourceLastOutputAt: string | null
  /** O Claude da origem vai continuar sozinho neste horário, na conta antiga. */
  sourceAutoResumeAt: string | null
  /** Quantos outros blocos da mesma conta pararam na mesma detecção. */
  otherSessionsInIncident: number
}

export type AccountChainState = {
  settings: AccountChainSettings
  /** Revisão de settings + membros, para o compare-and-set. */
  revision: number
  members: AccountChainMember[]
  pendingProposals: AccountSwitchProposal[]
  cooldowns: AccountCooldown[]
  /** Só os NOMES das variáveis de credencial presentes no ambiente do app. */
  envCredentialNames: string[]
}

// ---------------------------------------------------------------------------
// Resultados
// ---------------------------------------------------------------------------

/** Falha genérica de um canal: formato inválido, main sem serviço, exceção. */
export type AccountChainFailure = {
  ok: false
  code?: string
  message?: string
}

export type AccountChainStateResult = ({ ok: true } & AccountChainState) | AccountChainFailure

/** Outra janela mudou a cadeia: o main devolve o estado atual para a UI mostrar. */
export type AccountChainRevisionConflict = {
  ok: false
  code: 'REVISION_CONFLICT'
  current: AccountChainState
  message?: string
}

export type AccountChainMutationResult =
  | { ok: true; state: AccountChainState }
  | AccountChainRevisionConflict
  | AccountChainFailure

export type AccountChainSettingsUpdate = {
  enabled?: boolean
  strategy?: AccountChainStrategy
  maxHops?: number
  expectedRevision: number
}

/** Uma linha da lista regravada inteira, na ordem (posição = índice). */
export type AccountChainMemberUpdate = {
  accountId: string
  enabled: boolean
  billingDeclared: AccountBillingClass | null
  /** 1 a 100, ou `null` = não declarado. */
  multiplierDeclared: number | null
}

export type AccountChainMembersUpdate = {
  members: AccountChainMemberUpdate[]
  expectedRevision: number
}

/** Resultado redigido da checagem de uma conta. */
export type AccountLoginCheckResult = {
  accountId: string
  login: AccountLoginCheck
}

export type AccountChainCheckLoginResult =
  | { ok: true; results: AccountLoginCheckResult[] }
  | AccountChainFailure

export type AccountChainPreviewLaunchResult =
  | { ok: true; proposal: AccountSwitchProposal }
  | {
      ok: false
      code: 'CHAIN_DISABLED' | 'NO_CANDIDATE' | 'INVALID'
      reasons: AccountChainExclusion[]
      message?: string
    }

/** Códigos de recusa do `confirm` (§4.1, revalidações no main). */
export type AccountChainConfirmErrorCode =
  | 'SUPERSEDED'
  | 'EXPIRED'
  | 'SOURCE_ACTIVE'
  | 'NOT_ELIGIBLE'
  | 'NOT_PENDING'

export type AccountChainConfirmParams = {
  proposalId: string
  destinationAccountId: string
  /** Segunda confirmação explícita: "o terminal antigo ainda produz saída; abrir mesmo assim". */
  acknowledgeSourceActive?: boolean
}

export type AccountChainConfirmResult =
  | {
      ok: true
      /** Uso único; vale só para `destination.accountId`. */
      ticket: string
      destination: AccountSwitchEndpoint & { accountId: string }
      /** Segundo `confirm` da mesma proposta, para o mesmo destino. */
      alreadyConfirmed?: boolean
    }
  | {
      ok: false
      code: AccountChainConfirmErrorCode
      message?: string
      /**
       * Em `SUPERSEDED` e `NOT_ELIGIBLE`: a proposta recalculada, para a lista
       * do diálogo se atualizar sem trocar sozinha.
       */
      proposal?: AccountSwitchProposal
    }
  | AccountChainFailure

export type AccountChainDeclineReason = 'later' | 'not-a-limit'

export type AccountChainSimpleResult = { ok: true } | AccountChainFailure

export type AccountChainDeclineResult =
  | { ok: true }
  | { ok: false; code: 'NOT_PENDING'; message?: string }
  | AccountChainFailure

export type AccountChainReleaseReason = 'not-a-limit' | 'recharged' | 'manual'

export type AccountChainReleaseResult =
  | {
      ok: true
      /** Auth e billing só saem da espera depois de uma checagem OK. */
      requiresCheck: boolean
    }
  | AccountChainFailure

export type AccountChainRedactResult =
  | { ok: true; text: string; chars: number }
  | AccountChainFailure

export type AccountChainRecordManualParams = {
  /** Sessão PTY do bloco de origem (`canvas:<nodeId>`). */
  sourceSessionId: string
  /** `null` = Login do sistema. */
  toAccountId: string | null
  toProviderId: AccountChainProviderId
  reasonClass: AccountFailureClass
}

export type AccountChainRecordManualResult =
  | { ok: true; eventId: string }
  | AccountChainFailure

/** Uma linha do registro de trocas (aba Trocas e "Trocas deste bloco"). */
export type AccountSwitchHistoryEntry = {
  id: string
  kind: AccountSwitchKind
  state: AccountSwitchState
  from: AccountSwitchEndpoint
  /** Nulo em `notice` e `no_candidate`. */
  to: {
    accountId: string | null
    providerId: AccountChainProviderId | null
    label: string | null
  } | null
  failureClass: AccountFailureClass | null
  /** Motivo redigido. */
  reason: string
  strategy: AccountChainStrategy | null
  chosenBy: AccountSwitchChosenBy | null
  sourceSessionId: string | null
  targetSessionId: string | null
  detectedAt: string | null
  proposedAt: string
  decidedAt: string | null
  spawnedAt: string | null
  sourceActiveAck: boolean
  transcriptChars: number | null
  /** Classe de falha vista no bloco novo logo depois de nascer. */
  postSwitchFailure: AccountFailureClass | null
}

export type AccountChainHistoryParams = {
  /** Até 50. */
  limit: number
  /** Cursor: `proposedAt` da última linha já mostrada. */
  before?: string
}

export type AccountChainHistoryResult =
  | { ok: true; entries: AccountSwitchHistoryEntry[]; hasMore: boolean }
  | AccountChainFailure

// ---------------------------------------------------------------------------
// Eventos empurrados pelo main
// ---------------------------------------------------------------------------

/**
 * O que o main fez com uma detecção (§5.5):
 * - `noticed`: bloco fixo, Login do sistema ou cadeia desligada — só aviso;
 * - `proposed`: bloco `chain` com a cadeia ligada — há proposta aberta;
 * - `no_candidate`: bloco `chain`, mas nenhuma conta apta (motivos em `exclusions`);
 * - `ambiguous`: a pessoa decide se trata como limite;
 * - `informational`: rede, provedor, tempo ou limite só do modelo — trocar de
 *   conta não resolve;
 * - `source_resumed`: o terminal antigo voltou a trabalhar na conta antiga.
 */
export type AccountChainDetectionOutcome =
  | 'noticed'
  | 'proposed'
  | 'no_candidate'
  | 'ambiguous'
  | 'informational'
  | 'source_resumed'

export type AccountChainDetection = {
  /** Id da detecção; é o que `resolve-ambiguous` recebe. */
  id: string
  /** Sessão PTY (`canvas:<nodeId>`). */
  sessionId: string
  accountId: string | null
  accountLabel: string | null
  providerId: AccountChainProviderId
  accountMode: AccountMode
  failureClass: AccountFailureClass
  scope: AccountFailureScope
  ambiguous: boolean
  /** Linha redigida, até 200 caracteres. */
  evidence: string | null
  detectedAt: string
  cooldown: AccountCooldown | null
  outcome: AccountChainDetectionOutcome
  /** Presente quando `outcome === 'proposed'`. */
  proposalId: string | null
  /** Linha do registro (`notice`, `no_candidate`). */
  switchEventId: string | null
  exclusions: AccountChainExclusion[]
  /** O bloco nasceu de uma troca há menos de 3 min e a conta de destino já falhou. */
  postSwitchFailure: boolean
}

export type AccountChainProposalEvent =
  | { type: 'opened'; proposal: AccountSwitchProposal }
  | {
      type: 'closed'
      proposalId: string
      state: AccountSwitchState
      sourceSessionId: string | null
    }

// ---------------------------------------------------------------------------
// Ponte do preload (`window.felixo.accountChain`)
// ---------------------------------------------------------------------------

/**
 * Namespace do preload. Cada método é um `ipcRenderer.invoke` fino no canal
 * `account-chain:<nome-em-kebab>`; os `on*` assinam os pushes
 * `account-chain:changed`, `account-chain:proposal` e `account-chain:detection`
 * e devolvem a função que cancela a assinatura.
 */
export type AccountChainBridge = {
  getState: () => Promise<AccountChainStateResult>
  updateSettings: (params: AccountChainSettingsUpdate) => Promise<AccountChainMutationResult>
  updateMembers: (params: AccountChainMembersUpdate) => Promise<AccountChainMutationResult>
  /** Até 5 contas por chamada. */
  checkLogin: (params: { accountIds: string[] }) => Promise<AccountChainCheckLoginResult>
  previewLaunch: (params: {
    providerId: AccountChainProviderId
  }) => Promise<AccountChainPreviewLaunchResult>
  confirm: (params: AccountChainConfirmParams) => Promise<AccountChainConfirmResult>
  decline: (params: {
    proposalId: string
    reason: AccountChainDeclineReason
  }) => Promise<AccountChainDeclineResult>
  resolveAmbiguous: (params: {
    detectionId: string
    treatAs: 'limit' | 'ignore'
  }) => Promise<AccountChainSimpleResult>
  /** Fixar expira as propostas abertas da sessão. */
  setSessionMode: (params: {
    sessionId: string
    mode: AccountMode
  }) => Promise<AccountChainSimpleResult>
  releaseCooldown: (params: {
    accountId: string
    reason: AccountChainReleaseReason
  }) => Promise<AccountChainReleaseResult>
  /** Passa o transcript por `redactSecrets` no main (até 32 MB). */
  redactTranscript: (params: { text: string }) => Promise<AccountChainRedactResult>
  recordManual: (
    params: AccountChainRecordManualParams,
  ) => Promise<AccountChainRecordManualResult>
  history: (params: AccountChainHistoryParams) => Promise<AccountChainHistoryResult>
  onChanged: (callback: (state: AccountChainState) => void) => () => void
  onProposal: (callback: (event: AccountChainProposalEvent) => void) => () => void
  onDetection: (callback: (detection: AccountChainDetection) => void) => () => void
}

/** Código do `pty:spawn` quando o ticket da cadeia é recusado (§4.1). */
export const CHAIN_TICKET_REFUSED_CODE = 'CHAIN_TICKET_REFUSED'

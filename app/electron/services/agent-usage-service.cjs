'use strict'

const os = require('node:os')
const { randomUUID } = require('node:crypto')
const {
  listOfficialCliCatalog,
  runBufferedCommand,
} = require('./official-cli-service.cjs')
const { createCliEnv } = require('./cli-process-manager.cjs')
const { buildAccountProcessEnv } = require('./cli-account-profiles.cjs')
const {
  getAgentUsageSource,
  listAgentUsageSources,
} = require('./agent-usage-sources.cjs')
const {
  classifyUsageCapability,
  createIdentityFingerprint,
  normalizeTimestamp,
  sampleHasMetrics,
} = require('./agent-usage-model.cjs')
const {
  mergeAuthIdentity,
  parseAgentAuth,
  parseAgentUsage,
} = require('./agent-usage-report.cjs')
const { runLocalProbe } = require('./agent-usage-local-probes.cjs')
const { applyProfileEnv } = require('./cli-account-profiles.cjs')
const {
  createAgentUsageRepository,
} = require('./storage/agent-usage-repository.cjs')

const COMMAND_TIMEOUT_MS = 30_000
/**
 * Teto da rodada inteira de atualização. Cada comando já tinha o seu limite,
 * mas a consulta ao vivo é uma função injetada que só RECEBE `timeoutMs` —
 * se ela nunca resolver, nada a encerrava, e o `refreshPromise` compartilhado
 * prendia o botão Atualizar até o app ser reiniciado (task "reconectar o
 * monitor quando o Claude dessincroniza", 05/10/2026). Folga sobre o
 * COMMAND_TIMEOUT_MS: as contas rodam em paralelo, e a do Claude abre um PTY.
 */
const REFRESH_DEADLINE_MS = 90_000
/** Depois do teto, quanto esperar a rodada assentar antes de soltar o botão. */
const REFRESH_SETTLE_GRACE_MS = 5_000
const STALE_AFTER_MS = 15 * 60 * 1000
const SECRET_LIKE_INPUT_PATTERN =
  /(api[_ -]?key|access[_ -]?token|auth[_ -]?token|bearer|cookie|password|secret|sk-|eyJ[A-Za-z0-9_-]{8,})/i

const DISCOVERED_ACCOUNT_LABEL = 'Conta desta máquina'
const NO_SAFE_IDENTITY_MESSAGE =
  'A fonte não informou uma identidade estável; nenhuma métrica foi associada.'
const IDENTITY_MISMATCH_MESSAGE =
  'A CLI informou outra conta; nenhuma métrica foi copiada para esta conta.'
const AMBIGUOUS_IDENTITY_MESSAGE =
  'Há mais de uma conta sem identidade vinculada; a amostra ficou sem associação para evitar mistura de histórico.'
const CLI_QUERY_FAILED_MESSAGE =
  'A consulta da CLI falhou; o estado desta rodada não está disponível.'
const LOGGED_OUT_MESSAGE =
  'A CLI informa que não há uma sessão autenticada, então não há uso a mostrar.'

/**
 * Orquestra a coleta das fontes de uso sem transportar credenciais ao
 * renderer. A consulta é deduplicada por provider: duas janelas ou dois
 * terminais pedindo atualização ao mesmo tempo compartilham a mesma rodada.
 */
function createAgentUsageService({
  database,
  repository = createAgentUsageRepository(database),
  now = () => Date.now(),
  runCommand = runBufferedCommand,
  listCatalog = listOfficialCliCatalog,
  probe = runLocalProbe,
  // Consultas ao vivo por capacidade declarada. Pode ser uma função única
  // (compatibilidade com testes/fonte única) ou um mapa como
  // `{ 'claude-status': queryClaudeUsage, 'codex-rate-limits': ... }`.
  // Cada conta ainda recebe o ambiente do próprio perfil.
  queryLiveUsage = null,
  // Consulta opcional aos resets bancados do Codex (ver
  // codex-account-rate-limits.cjs) — só chamada pra fontes que declaram
  // `resetCreditsQuery`. Estritamente leitura; nunca consome um reset.
  queryResetCredits = null,
  // Ação explícita do botão "Usar reset". Só é chamada depois da confirmação
  // no renderer e depois de conferir, no processo principal, que o crédito
  // pertence à última leitura disponível desta conta.
  consumeResetCreditQuery = null,
  // Observador opcional de falha da consulta ao vivo. Existe porque o sintoma
  // "às vezes falha, mais no Mac" (task Limites) não tinha nenhum rastro
  // gravado — sem isso, a próxima falha real também vira "sem motivo
  // aparente" em vez de virar evidência. Nunca recebe saída crua do PTY, só
  // a mensagem já redigida que a consulta produz.
  onLiveQueryFailure = null,
  // Contas com login próprio. Cada uma tem pasta de credencial separada, então
  // a quota delas é lida da pasta delas — não do login do sistema.
  listProfiles = () => [],
  refreshDeadlineMs = REFRESH_DEADLINE_MS,
} = {}) {
  let refreshPromise = null
  let lastRefreshAt = null
  // Cada rodada ganha um número. Só a rodada corrente grava amostras: uma
  // rodada abandonada (teto ou Reconectar) que termine depois nunca
  // sobrescreve o resultado de uma mais nova.
  let generation = 0
  let currentRound = null

  async function list() {
    const catalog = await readCatalog(listCatalog)
    const accounts = ensureDiscoveredAccounts({
      catalog,
      repository,
      now,
      profiles: listProfiles(),
    })
    return {
      ok: true,
      ...buildDashboard({
        accounts,
        catalog,
        repository,
        now,
        lastRefreshAt,
      }),
    }
  }

  async function refresh() {
    if (refreshPromise) {
      return refreshPromise
    }

    const round = { id: ++generation, controller: new AbortController(), reason: null }
    currentRound = round
    const deadlineTimer = setTimeout(() => abortRound(round, 'deadline'), refreshDeadlineMs)
    deadlineTimer.unref?.()

    const work = refreshInternal(round)
    // Rede de segurança para um passo que ignore o cancelamento (o catálogo,
    // um runCommand injetado): passado o teto e a folga, o botão é solto com
    // o painel atual em vez de ficar preso na promessa.
    const safety = new Promise((resolve) => {
      const timer = setTimeout(async () => {
        abortRound(round, 'deadline')
        resolve({ ...(await list()), refreshError: deadlineMessage() })
      }, refreshDeadlineMs + REFRESH_SETTLE_GRACE_MS)
      timer.unref?.()
      work.finally(() => clearTimeout(timer)).catch(() => {})
    })

    const promise = Promise.race([work, safety]).finally(() => {
      clearTimeout(deadlineTimer)
      if (refreshPromise === promise) {
        refreshPromise = null
      }
    })
    refreshPromise = promise
    return promise
  }

  /**
   * "Reconectar": abandona a rodada em andamento (cancelando as consultas
   * dela, que encerram o processo descartável) e começa outra do zero. É a
   * saída que antes exigia reiniciar o app.
   */
  async function reconnect() {
    if (currentRound) {
      abortRound(currentRound, 'reconnect')
    }
    refreshPromise = null
    return refresh()
  }

  function abortRound(round, reason) {
    if (round.controller.signal.aborted) return
    round.reason = reason
    round.controller.abort()
  }

  function deadlineMessage() {
    return `A consulta não respondeu em ${Math.round(refreshDeadlineMs / 1000)} s; a rodada foi encerrada e o processo da consulta, cancelado. Use Reconectar para tentar de novo.`
  }

  async function refreshInternal(round = { id: ++generation, controller: new AbortController(), reason: null }) {
    const catalog = await readCatalog(listCatalog)
    const accounts = ensureDiscoveredAccounts({
      catalog,
      repository,
      now,
      profiles: listProfiles(),
    })
    const catalogById = new Map(catalog.map((item) => [item.id, item]))
    const providerIds = [
      ...new Set(accounts.map((account) => account.providerId)),
    ]

    const perfis = listProfiles()
    const snapshots = await Promise.all([
      ...providerIds.map((providerId) =>
        collectProviderSnapshot({
          providerId,
          runCommand,
          now,
          probe,
          queryLiveUsage,
          onLiveQueryFailure,
          queryResetCredits,
          signal: round.controller.signal,
          abortMessage: () => (round.reason === 'reconnect' ? 'A consulta foi cancelada pelo Reconectar.' : deadlineMessage()),
        }),
      ),
      // A conta com login próprio não precisa de adivinhação de identidade: a
      // amostra vai para ela porque foi a pasta dela que produziu o número.
      ...perfis.map((perfil) =>
        collectProviderSnapshot({
          providerId: perfil.providerId,
          runCommand,
          now,
          probe,
          probeOptions: perfil.probeOptions,
          profileEnv: perfil.profileEnv,
          targetAccountId: perfil.id,
          queryLiveUsage,
          onLiveQueryFailure,
          queryResetCredits,
          signal: round.controller.signal,
          abortMessage: () => (round.reason === 'reconnect' ? 'A consulta foi cancelada pelo Reconectar.' : deadlineMessage()),
        }),
      ),
    ])

    const idsDePerfil = new Set(perfis.map((perfil) => perfil.id))

    // Rodada abandonada pelo Reconectar: uma mais nova já está valendo.
    if (round.id !== generation) {
      return list()
    }

    for (const snapshot of snapshots) {
      // A amostra do login do sistema não disputa as contas com login próprio:
      // elas têm amostra endereçada. Sem esta exclusão, duas contas de perfil
      // recém-criadas faziam a linha do sistema cair em "identidade ambígua".
      const providerAccounts = accounts.filter(
        (account) =>
          account.providerId === snapshot.providerId &&
          (snapshot.targetAccountId
            ? account.id === snapshot.targetAccountId
            : !idsDePerfil.has(account.id)),
      )

      saveProviderSamples({
        snapshot,
        accounts: providerAccounts,
        repository,
        now,
        providerVersion: catalogById.get(snapshot.providerId)?.version ?? null,
      })
    }

    lastRefreshAt = nowIso(now)

    return {
      ok: true,
      ...buildDashboard({
        accounts: repository.listAccounts(),
        catalog,
        repository,
        now,
        lastRefreshAt,
      }),
    }
  }

  async function addAccount(params = {}) {
    const providerId = requireProviderId(params.providerId)
    const source = getAgentUsageSource(providerId)
    const label = normalizeInput(params.label, 80)
    const identityHint = normalizeInput(params.identityHint, 160, {
      optional: true,
    })

    if (!source) {
      throw new Error('Provider de agente desconhecido.')
    }

    if (!label) {
      throw new Error('Informe um nome para a conta de agente.')
    }

    assertSafeInput(label, 'O nome da conta contém um valor que não deve ser salvo.')
    if (identityHint) {
      assertSafeInput(
        identityHint,
        'Informe somente um identificador público; nunca uma chave ou token.',
      )
    }

    const identity = identityHint
      ? createIdentityFingerprint(providerId, identityHint)
      : null

    if (identity && repository.findAccountByIdentity(providerId, identity.identityKey)) {
      throw new Error('Já existe uma conta deste provider com esse identificador.')
    }

    const createdAt = nowIso(now)
    const account = repository.createAccount({
      id: randomUUID(),
      providerId,
      label,
      identityKey: identity?.identityKey ?? null,
      identityDisplay: identity?.identityDisplay ?? null,
      identitySource: identity ? 'manual' : null,
      createdAt,
      updatedAt: createdAt,
    })

    return {
      ok: true,
      account,
      dashboard: await list(),
    }
  }

  async function removeAccount(accountId) {
    const id = requireString(accountId, 'ID da conta de agente inválido.')

    if (!repository.archiveAccount(id)) {
      throw new Error('Conta de agente não encontrada.')
    }

    return {
      ok: true,
      removed: true,
      dashboard: await list(),
    }
  }

  /**
   * Resgata um crédito de reset para uma conta específica.
   *
   * O renderer nunca recebe o ambiente do perfil. Para contas isoladas, o
   * mesmo perfil que produziu a leitura é usado no consumo; para a conta do
   * sistema, o ambiente fica vazio e a CLI usa o login padrão.
   */
  async function consumeResetCredit({ accountId, creditId } = {}) {
    const normalizedAccountId = requireString(
      accountId,
      'ID da conta de agente inválido.',
    )
    const normalizedCreditId = requireOpaqueId(
      creditId,
      'ID do reset inválido.',
    )
    const account = repository.getAccount(normalizedAccountId)

    if (!account) {
      throw new Error('Conta de agente não encontrada.')
    }

    const source = getAgentUsageSource(account.providerId)
    if (!source?.resetCreditsQuery || typeof consumeResetCreditQuery !== 'function') {
      throw new Error('Este provider não permite usar resets pelo painel.')
    }

    const latest = repository.getLatestSample(account.id)
    const credits = latest?.metadata?.statusDetails?.usageCredits?.credits
    const credit = Array.isArray(credits)
      ? credits.find((item) => item?.id === normalizedCreditId)
      : null

    if (!credit || credit.status !== 'available') {
      throw new Error(
        'Este reset não está mais disponível. Atualize os limites antes de tentar novamente.',
      )
    }

    const profile = listProfiles().find((item) => item.id === account.id)
    let result
    try {
      result = await consumeResetCreditQuery({
        env: profile?.profileEnv ?? {},
        creditId: normalizedCreditId,
        timeoutMs: COMMAND_TIMEOUT_MS,
      })
    } catch {
      result = { ok: false, message: 'Não foi possível usar o reset do Codex.' }
    }

    // Uma resposta negativa também merece releitura: outro terminal pode ter
    // resgatado o crédito entre a renderização e o clique.
    const dashboard = await refresh()

    return {
      ok: result?.ok === true,
      consumed: result?.consumed === true,
      outcome: result?.outcome ?? null,
      message:
        result?.message ??
        (result?.ok === true
          ? 'Reset aplicado com sucesso.'
          : 'Não foi possível usar o reset.'),
      dashboard,
    }
  }

  /**
   * Releitura barata, só do arquivo que a CLI escreve, usada pelos fallbacks
   * locais (e pelo watcher). O Claude usa o `/status` ao vivo na rodada
   * explícita; esta função não substitui aquela consulta.
   *
   * Para acompanhar o consumo enquanto ele muda, relemos só o arquivo e
   * trocamos os números; conta, plano e estado de login continuam sendo os da
   * última rodada completa, que é o que eles são.
   *
   * Devolve `null` quando não há número novo para mostrar, para quem chama não
   * gravar amostra nem avisar a interface à toa.
   */
  async function refreshLocal(providerId) {
    const source = getAgentUsageSource(providerId)

    if (!source?.localProbe) {
      return null
    }

    const local = probe(source.localProbe)

    if (!local?.metrics?.length) {
      return null
    }

    const accounts = repository
      .listAccounts()
      .filter((account) => account.providerId === providerId)
    const target = pickLocalTarget(accounts, providerId, local.identity)

    if (!target) {
      return null
    }

    const previous = repository.getLatestSample(target.id)

    if (isSameLocalReading(previous, local)) {
      return null
    }

    const localSource = getLocalUsageSource(providerId, source)

    repository.saveSample({
      id: randomUUID(),
      accountId: target.id,
      status: 'current',
      sourceKind: localSource.kind,
      sourceLabel: localSource.label,
      sourceCommand: source.auth?.label ?? null,
      sourceUrl: localSource.docsUrl ?? null,
      collectedAt: nowIso(now),
      metrics: local.metrics,
      observedIdentityKey: target.identityKey,
      observedIdentityDisplay: target.identityDisplay,
      errorMessage: null,
      metadata: {
        // Autenticação e plano vêm da última rodada completa: esta leitura não
        // consultou a CLI e não tem como saber que eles mudaram.
        ...(previous?.metadata ?? {}),
        measuredAt: local.collectedAt ?? undefined,
      },
    })

    return {
      ok: true,
      ...buildDashboard({
        accounts: repository.listAccounts(),
        catalog: await readCatalog(listCatalog),
        repository,
        now,
        lastRefreshAt,
      }),
    }
  }

  return {
    addAccount,
    getDashboard: list,
    list,
    reconnect,
    refresh,
    refreshLocal,
    removeAccount,
    consumeResetCredit,
  }
}

function getLocalUsageSource(providerId, source) {
  if (providerId === 'codex') {
    return {
      ...source.usage,
      kind: 'local-execution',
      label: 'Codex rollout da sessão (fallback local)',
      docsUrl: 'https://developers.openai.com/codex/cli',
    }
  }

  if (providerId !== 'claude') {
    return source.usage
  }

  return {
    ...source.usage,
    kind: 'assisted-event',
    label: 'Claude Code status line (fallback local)',
    docsUrl: 'https://code.claude.com/docs/en/statusline',
  }
}

/**
 * A conta que recebe uma leitura local.
 *
 * Mesma regra da rodada completa: identidade bate, ou provider tem uma conta
 * só. Com duas contas e nenhuma identidade, a amostra fica sem dono em vez de
 * ir para a conta errada.
 */
function pickLocalTarget(accounts, providerId, identity) {
  if (accounts.length === 0) {
    return null
  }

  const fingerprint = identity
    ? createIdentityFingerprint(providerId, identity)
    : null

  if (fingerprint) {
    const matched = accounts.find(
      (account) => account.identityKey === fingerprint.identityKey,
    )

    if (matched) {
      return matched
    }
  }

  return accounts.length === 1 ? accounts[0] : null
}

/** Nada mudou desde a última amostra: mesma medição, mesmos números. */
function isSameLocalReading(previous, local) {
  if (!previous) {
    return false
  }

  const sameMeasurement =
    (previous.metadata?.measuredAt ?? null) === (local.collectedAt ?? null)

  return (
    sameMeasurement &&
    JSON.stringify(previous.metrics) === JSON.stringify(local.metrics)
  )
}

async function collectProviderSnapshot({
  providerId,
  runCommand,
  now,
  probe,
  probeOptions,
  profileEnv = {},
  targetAccountId,
  queryLiveUsage,
  onLiveQueryFailure,
  queryResetCredits,
  signal = new AbortController().signal,
  abortMessage = () => 'A consulta foi cancelada.',
}) {
  const source = getAgentUsageSource(providerId)
  const collectedAt = nowIso(now)

  if (!source) {
    return {
      providerId,
      source: createFallbackSource(providerId),
      collectedAt,
      commandOk: false,
      auth: { authStatus: 'unknown' },
      metrics: [],
      queryFailed: true,
    }
  }

  // A conta com login próprio confere o login com o mesmo ambiente com que o
  // terminal dela nasce (sem as chaves de API herdadas do app): senão o painel
  // diria "logado" por causa de uma chave do ambiente que o terminal não vê,
  // e a cadeia de contas reaproveitaria essa amostra como prova de login.
  const { local, result, safeOutput, auth } = await checkAccountAuth({
    providerId,
    source,
    runCommand,
    probe,
    probeOptions,
    env: targetAccountId
      ? createProfileCommandEnv({ providerId, profileEnv })
      : createCommandEnv(providerId, profileEnv),
  })

  if (!source.auth) {
    return {
      providerId,
      source,
      targetAccountId,
      collectedAt,
      measuredAt: local?.collectedAt ?? null,
      commandOk: true,
      auth,
      metrics: local?.metrics ?? [],
      queryFailed: false,
    }
  }

  // Uma fonte ao vivo nunca mistura arquivo/statusline antigo com a rodada
  // atual: se a consulta falhar, o sample vira erro e o painel pode mostrar
  // explicitamente o último valor conhecido. A consulta `usage-command` usa
  // o comando oficial da própria fonte; as demais vêm do mapa injetado.
  const liveQueryFunction = resolveLiveQuery(queryLiveUsage, source.liveQuery)
  const liveQueryEnabled =
    source.liveQuery === 'usage-command' || Boolean(liveQueryFunction)
  let liveResult = null
  if (
    liveQueryEnabled &&
    result?.ok === true &&
    auth.authStatus !== 'logged_out'
  ) {
    if (source.liveQuery === 'usage-command') {
      liveResult = await runLiveUsageCommand({
        source,
        providerId,
        runCommand,
        profileEnv,
        now,
      })
    } else if (liveQueryFunction) {
      try {
        liveResult = await untilAborted(
          liveQueryFunction({
            env: profileEnv,
            cwd: os.tmpdir(),
            timeoutMs: COMMAND_TIMEOUT_MS,
            signal,
          }),
          signal,
          () => ({ ok: false, message: `${source.name}: ${abortMessage()}` }),
        )
      } catch {
        liveResult = {
          ok: false,
          message: `A consulta ao vivo de ${source.name} falhou.`,
        }
      }
    }
  }

  // O Codex devolve quota e créditos bancados na mesma leitura do app-server.
  // O caminho separado continua como fallback para testes/fontes que só
  // declaram `resetCreditsQuery`; nunca abrimos dois processos para a mesma
  // conta quando a leitura ao vivo já trouxe os resets.
  const resetCreditsQueryEnabled =
    Boolean(source.resetCreditsQuery) &&
    typeof queryResetCredits === 'function' &&
    !liveQueryEnabled
  let resetCreditsResult = null
  if (
    resetCreditsQueryEnabled &&
    result?.ok === true &&
    auth.authStatus !== 'logged_out'
  ) {
    try {
      resetCreditsResult = await untilAborted(
        queryResetCredits({
          env: profileEnv,
          timeoutMs: COMMAND_TIMEOUT_MS,
          signal,
        }),
        signal,
        () => ({ ok: false }),
      )
    } catch {
      resetCreditsResult = { ok: false }
    }
  }

  // Algumas CLIs devolvem quota na própria saída de auth; quando não devolvem,
  // vale o comando de uso declarado pela fonte, e só então a leitura local.
  // A exceção é a consulta live: ela tem precedência e não aceita fallback
  // silencioso para uma leitura velha.
  const authMetrics =
    result?.ok === true ? parseAgentUsage(providerId, safeOutput).metrics : []
  const commandMetrics = liveQueryEnabled
    ? liveResult?.ok === true
      ? liveResult.metrics ?? []
      : []
    : authMetrics.length > 0
      ? authMetrics
      : await runUsageCommand({ source, providerId, runCommand, profileEnv })
  const metrics = liveQueryEnabled
    ? commandMetrics
    : commandMetrics.length > 0
      ? commandMetrics
      : local?.metrics ?? []
  const liveQueryFailed =
    liveQueryEnabled &&
    auth.authStatus !== 'logged_out' &&
    liveResult !== null &&
    liveResult.ok !== true

  // O observador vale para toda consulta ao vivo (Codex, Claude e comandos
  // declarados por fonte), não só para o PTY do Claude. `message` já é uma
  // string estática produzida pelo adaptador; nunca registramos stdout/stderr.
  if (liveQueryFailed && typeof onLiveQueryFailure === 'function') {
    try {
      onLiveQueryFailure({
        providerId,
        targetAccountId,
        platform: process.platform,
        message: liveResult?.message ?? null,
      })
    } catch {
      // Ver comentário acima: observador nunca pode quebrar a coleta.
    }
  }

  const snapshotSource = liveQueryEnabled
    ? {
        ...source,
        usage: {
          ...source.usage,
          kind: 'live-query',
        },
      }
    : source

  return {
    providerId,
    source: snapshotSource,
    targetAccountId,
    collectedAt,
    // Quando o número vem de um arquivo, medição e leitura são momentos
    // diferentes. Os dois são guardados: `collectedAt` ordena as amostras da
    // rodada e `measuredAt` é o que envelhece o valor — sem isso um rate limit
    // de três horas atrás apareceria como se fosse de agora.
    measuredAt: liveQueryEnabled
      ? liveResult?.measuredAt ?? liveResult?.collectedAt ?? null
      : commandMetrics.length === 0
        ? local?.collectedAt ?? null
        : null,
    commandOk: result?.ok === true,
    auth,
    metrics,
    queryFailed: result?.ok !== true || liveQueryFailed,
    queryErrorMessage: liveQueryFailed ? liveResult?.message ?? null : null,
    statusDetails: mergeStatusDetails({
      liveDetails: liveResult?.ok === true ? liveResult.details ?? null : null,
      resetCreditsResult,
    }),
  }
}

/**
 * Checagem de login de uma conta: o comando de auth da fonte (`codex login
 * status`, `claude auth status --json`, `openia key status --json`) e o probe
 * local de identidade, que só lê arquivo. Não roda a consulta ao vivo de uso,
 * que é cara (o `/status` do Claude abre um PTY).
 *
 * É o pedaço que o painel e a elegibilidade da cadeia de contas compartilham:
 * os dois leem o login do mesmo jeito, então uma amostra recente do painel
 * vale como checagem.
 *
 * - O stdout é interpretado mesmo com `ok: false`: `claude auth status` sai
 *   com código 1 quando não há login e imprime o JSON mesmo assim.
 * - A saída é redigida antes de qualquer parser; `safeOutput` nunca sai do
 *   processo principal.
 * - Fonte sem comando de auth (hoje o Gemini) não roda nada: `result` vem
 *   `null` e o login fica `unknown`.
 *
 * @returns {Promise<{ source: object | null, local: object | null, result: object | null, safeOutput: string, auth: object, durationMs: number }>}
 */
async function checkAccountAuth({
  providerId,
  source = getAgentUsageSource(providerId),
  runCommand = runBufferedCommand,
  probe = runLocalProbe,
  probeOptions,
  env = createCommandEnv(),
  timeoutMs = COMMAND_TIMEOUT_MS,
  clock = () => Date.now(),
}) {
  const startedAt = clock()

  if (!source) {
    return {
      source: null,
      local: null,
      result: null,
      safeOutput: '',
      auth: { authStatus: 'unknown' },
      durationMs: 0,
    }
  }

  // Leitura de arquivo que a CLI já escreveu: não custa processo nem rede, e é
  // o único caminho de quota em fontes que não respondem número por comando.
  const local = source.localProbe ? probe(source.localProbe, probeOptions) : null

  if (!source.auth) {
    return {
      source,
      local,
      result: null,
      safeOutput: '',
      auth: mergeAuthIdentity(providerId, { authStatus: 'unknown' }, local),
      durationMs: Math.max(0, clock() - startedAt),
    }
  }

  let result
  try {
    result = await runCommand({
      command: source.auth.command,
      args: [...source.auth.args],
      cwd: os.homedir(),
      env,
      timeoutMs,
    })
  } catch {
    result = { ok: false }
  }

  // A saída é reduzida antes de qualquer parser. O snapshot nunca retorna a
  // saída crua para outro módulo que não seja o parser de campos permitidos.
  const safeOutput = redactOutput(
    `${result?.stdout ?? ''}\n${result?.stderr ?? ''}`,
  )

  const auth = mergeAuthIdentity(
    providerId,
    parseAgentAuth(providerId, safeOutput),
    local,
  )

  return {
    source,
    local,
    result: result ?? { ok: false },
    safeOutput,
    auth,
    durationMs: Math.max(0, clock() - startedAt),
  }
}

/**
 * Espera `promise`, mas resolve com `onAbort()` assim que `signal` for
 * abortado — a consulta pode ignorar o cancelamento, a rodada não espera por
 * ela. Rejeição continua rejeição (os `try/catch` de quem chama tratam).
 */
function untilAborted(promise, signal, onAbort) {
  if (signal.aborted) return Promise.resolve(onAbort())
  return new Promise((resolve, reject) => {
    const abort = () => resolve(onAbort())
    signal.addEventListener('abort', abort, { once: true })
    Promise.resolve(promise).then(
      (value) => {
        signal.removeEventListener('abort', abort)
        resolve(value)
      },
      (error) => {
        signal.removeEventListener('abort', abort)
        reject(error)
      },
    )
  })
}

function mergeStatusDetails({ liveDetails, resetCreditsResult }) {
  const details =
    liveDetails && typeof liveDetails === 'object' && !Array.isArray(liveDetails)
      ? { ...liveDetails }
      : {}

  if (resetCreditsResult?.ok === true) {
    details.usageCredits = {
      availableCount: resetCreditsResult.availableCount,
      credits: Array.isArray(resetCreditsResult.credits)
        ? resetCreditsResult.credits
        : [],
    }
  }

  return Object.keys(details).length > 0 ? details : null
}

/**
 * Roda o comando de uso quando a fonte declara um diferente do de
 * autenticação — o caso do `openia statusline`, que consulta o saldo da conta
 * com a chave que o próprio launcher guarda.
 *
 * A falha aqui não derruba a rodada: sem métrica, o painel mostra o estado de
 * autenticação e a limitação, como em qualquer fonte sem número.
 */
async function runUsageCommand({ source, providerId, runCommand, profileEnv = {} }) {
  if (source.usage.kind !== 'cli-command' || !source.usage.command) {
    return []
  }

  let result
  try {
    result = await runCommand({
      command: source.usage.command,
      args: [...(source.usage.args ?? [])],
      cwd: os.homedir(),
      env: createCommandEnv(providerId, profileEnv),
      timeoutMs: COMMAND_TIMEOUT_MS,
    })
  } catch {
    return []
  }

  if (result?.ok !== true) {
    return []
  }

  return parseAgentUsage(
    providerId,
    redactOutput(`${result.stdout ?? ''}\n${result.stderr ?? ''}`),
  ).metrics
}

async function runLiveUsageCommand({
  source,
  providerId,
  runCommand,
  profileEnv = {},
  now,
}) {
  let result
  try {
    result = await runCommand({
      command: source.usage.command,
      args: [...(source.usage.args ?? [])],
      cwd: os.homedir(),
      env: createCommandEnv(providerId, profileEnv),
      timeoutMs: COMMAND_TIMEOUT_MS,
    })
  } catch {
    return {
      ok: false,
      collectedAt: null,
      measuredAt: null,
      metrics: [],
      details: null,
      message: `A consulta ao uso ao vivo de ${source.name} falhou.`,
    }
  }

  if (result?.ok !== true) {
    return {
      ok: false,
      collectedAt: null,
      measuredAt: null,
      metrics: [],
      details: null,
      message: `A consulta ao uso ao vivo de ${source.name} falhou.`,
    }
  }

  const metrics = parseAgentUsage(
    providerId,
    redactOutput(`${result.stdout ?? ''}\n${result.stderr ?? ''}`),
  ).metrics
  const measuredAt = nowIso(now)

  return {
    ok: true,
    collectedAt: measuredAt,
    measuredAt,
    metrics,
    details: null,
    message: null,
  }
}

function resolveLiveQuery(queryLiveUsage, liveQueryName) {
  if (typeof queryLiveUsage === 'function') {
    return queryLiveUsage
  }

  if (!queryLiveUsage || typeof queryLiveUsage !== 'object' || !liveQueryName) {
    return null
  }

  return typeof queryLiveUsage[liveQueryName] === 'function'
    ? queryLiveUsage[liveQueryName]
    : null
}

/**
 * Conta com perfil: sem as credenciais que o app herdou (com
 * `ANTHROPIC_API_KEY` ou `CLAUDE_CODE_USE_BEDROCK` no ambiente, o status
 * leria outra conta, não a do perfil). Login do sistema: o ambiente da pessoa.
 */
function createCommandEnv(providerId, profileEnv = {}) {
  return createCliEnv(buildAccountProcessEnv(process.env, { providerId, profileEnv }))
}

/**
 * Ambiente de um comando que roda NA conta com perfil: o mesmo que o terminal
 * dela recebe no spawn (`pty-process-manager.cjs`), sem as credenciais de API
 * herdadas do app. Assim o que é conferido é o que será lançado.
 */
function createProfileCommandEnv({ providerId, profileEnv = {} }, platformName = process.platform) {
  return applyProfileEnv(createCliEnv(), { providerId, profileEnv }, platformName)
}

function saveProviderSamples({
  snapshot,
  accounts,
  repository,
  now,
  providerVersion,
}) {
  const resolution = resolveObservedIdentity({
    providerId: snapshot.providerId,
    accounts,
    auth: snapshot.auth,
    repository,
  })

  const alvo = snapshot.targetAccountId
  const destino = alvo ? accounts.filter((account) => account.id === alvo) : accounts

  for (const account of destino) {
    const previous = repository.getLastAvailableSample(account.id)
    const base = createSampleBase({
      accountId: account.id,
      snapshot,
      providerVersion,
      resolution,
    })

    if (snapshot.queryFailed) {
      repository.saveSample({
        ...base,
        status: 'error',
        errorMessage: snapshot.queryErrorMessage ?? CLI_QUERY_FAILED_MESSAGE,
      })
      continue
    }

    if (snapshot.source.usage.kind === 'unsupported' || !snapshot.source.auth) {
      repository.saveSample({
        ...base,
        status: 'unavailable',
        errorMessage: snapshot.source.usage.limitation,
      })
      continue
    }

    // Amostra de conta com login próprio: veio da pasta daquela conta, então
    // a atribuição é certa por construção e não passa pela resolução de
    // identidade — que existe para o caso oposto, o do login compartilhado.
    if (alvo) {
      repository.saveSample({
        ...base,
        status: sampleHasMetrics(snapshot) ? 'current' : 'unavailable',
        metrics: snapshot.metrics,
        errorMessage: sampleHasMetrics(snapshot)
          ? null
          : 'Esta conta ainda não tem número: abra um terminal nela para a CLI registrar o uso.',
        metadata: withStatusDetails(base.metadata, snapshot),
      })
      continue
    }

    if (
      (resolution.kind === 'different' || resolution.kind === 'matched') &&
      resolution.targetId !== account.id
    ) {
      repository.saveSample({
        ...base,
        status: 'error',
        errorMessage: IDENTITY_MISMATCH_MESSAGE,
      })
      continue
    }

    // Sem sessão não há identidade a resolver: isso é ausência de dado, não
    // falha. Marcar como erro pintava de vermelho a CLI em que a pessoa
    // simplesmente ainda não entrou.
    if (snapshot.auth.authStatus === 'logged_out') {
      repository.saveSample({
        ...base,
        status: 'unavailable',
        errorMessage: LOGGED_OUT_MESSAGE,
      })
      continue
    }

    // Nem toda CLI diz de qual conta é a sessão — o launcher que lê a chave do
    // ambiente, por exemplo, não tem nome de conta para publicar. Exigir
    // identidade aí jogava fora número verdadeiro. A regra protege contra
    // misturar histórico de contas diferentes, e esse risco só existe quando
    // há mais de uma conta no provider: com uma só, a amostra é dela.
    const singleAccountProvider = accounts.length === 1

    if (
      resolution.kind === 'ambiguous' ||
      (resolution.kind === 'missing' && !singleAccountProvider)
    ) {
      const message =
        resolution.kind === 'ambiguous'
          ? AMBIGUOUS_IDENTITY_MESSAGE
          : NO_SAFE_IDENTITY_MESSAGE
      repository.saveSample({
        ...base,
        status: 'error',
        errorMessage: message,
      })
      continue
    }

    const attributable =
      resolution.kind === 'matched'
        ? resolution.targetId === account.id
        : resolution.kind === 'missing' && singleAccountProvider

    if (!attributable) {
      repository.saveSample({
        ...base,
        status: 'unavailable',
        errorMessage: NO_SAFE_IDENTITY_MESSAGE,
      })
      continue
    }

    if (sampleHasMetrics(snapshot)) {
      repository.saveSample({
        ...base,
        status: 'current',
        metrics: snapshot.metrics,
        errorMessage: null,
        metadata: withStatusDetails(base.metadata, snapshot),
      })
      continue
    }

    repository.saveSample({
      ...base,
      status: previous ? 'stale' : 'unavailable',
      errorMessage: snapshot.source.usage.limitation,
      // Chegou até aqui só quem já passou pela checagem de `attributable`
      // acima — sem métrica ao vivo, mas os resets bancados (por exemplo)
      // continuam sendo desta conta de verdade.
      metadata: withStatusDetails(base.metadata, snapshot),
    })
  }
}

/** Só quem já recebeu `metrics: snapshot.metrics` (identidade resolvida pra
 * esta conta) pode ganhar `statusDetails` de volta — ver o comentário em
 * `createSampleBase`. */
function withStatusDetails(metadata, snapshot) {
  return snapshot.statusDetails
    ? { ...metadata, statusDetails: snapshot.statusDetails }
    : metadata
}

function createSampleBase({
  accountId,
  snapshot,
  providerVersion,
  resolution,
}) {
  return {
    id: randomUUID(),
    accountId,
    sourceKind: snapshot.source.usage.kind,
    sourceLabel: snapshot.source.usage.label,
    sourceCommand: snapshot.source.auth?.label ?? null,
    sourceUrl: snapshot.source.usage.docsUrl ?? null,
    collectedAt: snapshot.collectedAt,
    metrics: [],
    observedIdentityKey: snapshot.auth.identityKey ?? null,
    observedIdentityDisplay: snapshot.auth.identityDisplay ?? null,
    metadata: {
      authStatus: snapshot.auth.authStatus,
      method: snapshot.auth.method,
      plan: snapshot.auth.plan,
      organization: snapshot.auth.organization,
      // Só o nome da fonte de chave (Claude), nunca a chave: é o que a cadeia
      // de contas usa para avisar que a conta pode estar cobrando por uso.
      apiKeySource: snapshot.auth.apiKeySource ?? undefined,
      identityMatched: resolution.kind === 'matched',
      identityAmbiguous: resolution.kind === 'ambiguous',
      limitation: snapshot.source.usage.limitation,
      measuredAt: snapshot.measuredAt ?? undefined,
      providerVersion: providerVersion ?? undefined,
      // `statusDetails` (inclui os resets bancados do Codex) NÃO entra aqui.
      // Uma rodada sem `targetAccountId` (login do sistema) compartilha o
      // mesmo snapshot entre TODAS as contas do provider em `destino` — se
      // ele viesse por padrão, uma conta com identidade não resolvida
      // (`error`/mismatch) mostraria dados/sessão de OUTRA conta, com botão
      // de consumir reset incluso. Cada branch de `saveProviderSamples` que
      // já atribui `metrics: snapshot.metrics` a esta conta específica
      // adiciona `statusDetails` de volta explicitamente — nunca aqui.
    },
  }
}

function resolveObservedIdentity({
  providerId,
  accounts,
  auth,
  repository,
}) {
  if (!auth.identityKey) {
    return { kind: 'missing', targetId: null }
  }

  const exact = accounts.find((account) => account.identityKey === auth.identityKey)
  if (exact) {
    // Conta já vinculada pode ter sido gravada com outra forma de exibição —
    // é o caso das que nasceram quando o painel mostrava o identificador
    // abreviado. O fingerprint é o mesmo, então é a mesma conta: só o texto
    // exibido é atualizado.
    if (auth.identityDisplay && auth.identityDisplay !== exact.identityDisplay) {
      repository.updateIdentity(exact.id, {
        identityKey: exact.identityKey,
        identityDisplay: auth.identityDisplay,
        source: exact.identitySource ?? 'cli',
      })
    }

    return { kind: 'matched', targetId: exact.id }
  }

  const conflictingAccount = repository.findAccountByIdentity(
    providerId,
    auth.identityKey,
  )
  if (conflictingAccount) {
    return { kind: 'matched', targetId: conflictingAccount.id }
  }

  const unbound = accounts.filter((account) => !account.identityKey)
  if (unbound.length === 1) {
    const account = repository.updateIdentity(unbound[0].id, {
      identityKey: auth.identityKey,
      identityDisplay: auth.identityDisplay,
      source: 'cli',
    })
    return { kind: 'matched', targetId: account?.id ?? unbound[0].id }
  }

  if (unbound.length > 1) {
    return { kind: 'ambiguous', targetId: null }
  }

  return { kind: 'different', targetId: null }
}

/**
 * Cria a primeira conta de cada CLI detectada na máquina.
 *
 * Sem isto o painel abre vazio e exige que a pessoa cadastre na mão a conta em
 * que ela já está logada — trabalho que o app consegue fazer sozinho, já que a
 * CLI está instalada e responde qual é a conta. A conta nasce sem
 * `identityKey`: quem preenche é a primeira coleta, pelo caminho que vincula
 * uma conta não vinculada à identidade observada.
 *
 * Só a primeira conta é criada. Quem usa duas contas do mesmo provider
 * continua adicionando a segunda no formulário — automatizar isso exigiria
 * adivinhar identidade, que é justamente o que o contrato proíbe.
 */
function ensureDiscoveredAccounts({ catalog, repository, now, profiles = [] }) {
  const accounts = repository.listAccounts()
  const providersWithAccount = new Set(
    accounts.map((account) => account.providerId),
  )
  const detected = new Map(
    catalog
      .filter((item) => item.detected === true)
      .map((item) => [item.id, item]),
  )

  const created = []

  // Cada conta com login próprio vira uma linha do painel, com o mesmo id do
  // perfil: é esse id que liga a pasta de credencial à linha, sem depender de
  // adivinhar identidade.
  for (const perfil of profiles) {
    if (accounts.some((account) => account.id === perfil.id)) {
      continue
    }

    const createdAt = nowIso(now)
    created.push(
      repository.createAccount({
        id: perfil.id,
        providerId: perfil.providerId,
        label: perfil.label,
        identityKey: null,
        identityDisplay: null,
        identitySource: null,
        createdAt,
        updatedAt: createdAt,
      }),
    )
  }

  for (const source of listAgentUsageSources()) {
    if (providersWithAccount.has(source.id) || !detected.has(source.id)) {
      continue
    }

    const createdAt = nowIso(now)
    created.push(
      repository.createAccount({
        id: randomUUID(),
        providerId: source.id,
        label: DISCOVERED_ACCOUNT_LABEL,
        identityKey: null,
        identityDisplay: null,
        identitySource: null,
        createdAt,
        updatedAt: createdAt,
      }),
    )
  }

  return created.length > 0 ? repository.listAccounts() : accounts
}

function buildDashboard({
  accounts,
  catalog,
  repository,
  now,
  lastRefreshAt,
}) {
  const providers = buildProviders(catalog, accounts)
  const dashboardAccounts = accounts.map((account) => {
    const latestSample = normalizeDashboardSample(
      repository.getLatestSample(account.id),
      now,
    )
    const lastKnownSample = normalizeDashboardSample(
      repository.getLastAvailableSample(account.id),
      now,
    )

    return {
      ...account,
      latestSample,
      lastKnownSample,
    }
  })

  return {
    providers,
    accounts: dashboardAccounts,
    refreshedAt: lastRefreshAt,
  }
}

function buildProviders(catalog, accounts) {
  const catalogById = new Map(catalog.map((item) => [item.id, item]))
  const sourceProviders = listAgentUsageSources()
  const knownIds = new Set(sourceProviders.map((source) => source.id))

  return [
    ...sourceProviders.map((source) => {
      const detected = catalogById.get(source.id)
      return {
        id: source.id,
        name: detected?.name ?? source.name,
        provider: detected?.provider ?? source.provider,
        command: detected?.command ?? source.command,
        detected: detected?.detected === true,
        version: detected?.version ?? null,
        usageSource: {
          kind: source.usage.kind,
          label: source.usage.label,
          docsUrl: source.usage.docsUrl ?? null,
          limitation: source.usage.limitation,
          capability: classifyUsageCapability(source),
        },
      }
    }),
    ...accounts
      .filter((account) => !knownIds.has(account.providerId))
      .map((account) => ({
        id: account.providerId,
        name: account.providerId,
        provider: account.providerId,
        command: account.providerId,
        detected: false,
        version: null,
        usageSource: {
          kind: 'unsupported',
          label: 'Fonte não catalogada',
          docsUrl: null,
          limitation: 'Este provider ainda não tem fonte de uso configurada.',
          capability: 'unsupported',
        },
      }))
      .filter((provider, index, all) =>
        all.findIndex((candidate) => candidate.id === provider.id) === index,
      ),
  ]
}

function normalizeDashboardSample(sample, now) {
  if (!sample) {
    return null
  }

  // O que envelhece é a medição. Reler um arquivo antigo não rejuvenesce o
  // número que estava escrito nele.
  const measuredAt = sample.metadata?.measuredAt ?? sample.collectedAt

  if (sample.status === 'current' && isOlderThan(measuredAt, now, STALE_AFTER_MS)) {
    return { ...sample, status: 'stale' }
  }

  return sample
}

function isOlderThan(value, now, thresholdMs) {
  const timestamp = Date.parse(value)
  const current = Number(now())
  return Number.isFinite(timestamp) && Number.isFinite(current)
    ? current - timestamp > thresholdMs
    : false
}

async function readCatalog(listCatalog) {
  try {
    const result = await listCatalog()
    if (Array.isArray(result)) {
      return result
    }
    if (Array.isArray(result?.clis)) {
      return result.clis
    }
  } catch {
    // O painel ainda consegue informar as fontes e limitações sem detecção.
  }

  return []
}

function createFallbackSource(providerId) {
  return {
    id: providerId,
    name: providerId,
    provider: providerId,
    command: providerId,
    auth: null,
    usage: {
      kind: 'unsupported',
      label: 'Fonte não catalogada',
      docsUrl: null,
      limitation: 'Este provider ainda não tem fonte de uso configurada.',
    },
  }
}

function redactOutput(value) {
  // Importação tardia evita duplicar a implementação de redaction nos
  // parsers e mantém a garantia na fronteira do comando.
  const { redactSecrets } = require('./official-cli-account-status.cjs')
  return redactSecrets(value).slice(-12_000).trim()
}

function requireProviderId(value) {
  const id = requireString(value, 'Provider de agente inválido.')
  if (!getAgentUsageSource(id)) {
    throw new Error('Provider de agente desconhecido.')
  }
  return id
}

function requireString(value, message) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(message)
  }
  return value.trim()
}

function requireOpaqueId(value, message) {
  const normalized = requireString(value, message)
  if (normalized.length > 256 || /[\u0000-\u001f\u007f]/.test(normalized)) {
    throw new Error(message)
  }
  return normalized
}

function normalizeInput(value, maxLength, { optional = false } = {}) {
  if (value === undefined || value === null) {
    return optional ? null : ''
  }
  if (typeof value !== 'string') {
    throw new Error('Valor de conta de agente inválido.')
  }

  const normalized = value
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .trim()
    .slice(0, maxLength)
  return normalized || (optional ? null : '')
}

function assertSafeInput(value, message) {
  if (SECRET_LIKE_INPUT_PATTERN.test(value)) {
    throw new Error(message)
  }
}

function nowIso(now) {
  const value = typeof now === 'function' ? now() : now
  const timestamp = normalizeTimestamp(value)
  if (timestamp) {
    return timestamp
  }
  return new Date().toISOString()
}

module.exports = {
  REFRESH_DEADLINE_MS,
  COMMAND_TIMEOUT_MS,
  STALE_AFTER_MS,
  createAgentUsageService,
  buildDashboard,
  checkAccountAuth,
  collectProviderSnapshot,
  createProfileCommandEnv,
  resolveObservedIdentity,
}

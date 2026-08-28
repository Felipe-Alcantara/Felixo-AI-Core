'use strict'

const os = require('node:os')
const { randomUUID } = require('node:crypto')
const {
  listOfficialCliCatalog,
  runBufferedCommand,
} = require('./official-cli-service.cjs')
const { createCliEnv } = require('./cli-process-manager.cjs')
const {
  getAgentUsageSource,
  listAgentUsageSources,
} = require('./agent-usage-sources.cjs')
const {
  createIdentityFingerprint,
  normalizeTimestamp,
  sampleHasMetrics,
} = require('./agent-usage-model.cjs')
const {
  parseAgentAuth,
  parseAgentUsage,
} = require('./agent-usage-report.cjs')
const {
  createAgentUsageRepository,
} = require('./storage/agent-usage-repository.cjs')

const COMMAND_TIMEOUT_MS = 30_000
const STALE_AFTER_MS = 15 * 60 * 1000
const SECRET_LIKE_INPUT_PATTERN =
  /(api[_ -]?key|access[_ -]?token|auth[_ -]?token|bearer|cookie|password|secret|sk-|eyJ[A-Za-z0-9_-]{8,})/i

const NO_SAFE_IDENTITY_MESSAGE =
  'A fonte não informou uma identidade estável; nenhuma métrica foi associada.'
const IDENTITY_MISMATCH_MESSAGE =
  'A CLI informou outra conta; nenhuma métrica foi copiada para esta conta.'
const AMBIGUOUS_IDENTITY_MESSAGE =
  'Há mais de uma conta sem identidade vinculada; a amostra ficou sem associação para evitar mistura de histórico.'
const CLI_QUERY_FAILED_MESSAGE =
  'A consulta da CLI falhou; o estado desta rodada não está disponível.'

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
} = {}) {
  let refreshPromise = null
  let lastRefreshAt = null

  async function list() {
    const accounts = repository.listAccounts()
    const catalog = await readCatalog(listCatalog)
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

    refreshPromise = refreshInternal().finally(() => {
      refreshPromise = null
    })

    return refreshPromise
  }

  async function refreshInternal() {
    const accounts = repository.listAccounts()
    const catalog = await readCatalog(listCatalog)
    const catalogById = new Map(catalog.map((item) => [item.id, item]))
    const providerIds = [
      ...new Set(accounts.map((account) => account.providerId)),
    ]

    const snapshots = await Promise.all(
      providerIds.map((providerId) =>
        collectProviderSnapshot({
          providerId,
          runCommand,
          now,
        }),
      ),
    )

    for (const snapshot of snapshots) {
      const providerAccounts = accounts.filter(
        (account) => account.providerId === snapshot.providerId,
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

  return {
    addAccount,
    getDashboard: list,
    list,
    refresh,
    removeAccount,
  }
}

async function collectProviderSnapshot({ providerId, runCommand, now }) {
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

  if (!source.auth) {
    return {
      providerId,
      source,
      collectedAt,
      commandOk: true,
      auth: { authStatus: 'unknown' },
      metrics: [],
      queryFailed: false,
    }
  }

  let result
  try {
    result = await runCommand({
      command: source.auth.command,
      args: [...source.auth.args],
      cwd: os.homedir(),
      env: createCliEnv(),
      timeoutMs: COMMAND_TIMEOUT_MS,
    })
  } catch {
    result = { ok: false }
  }

  // A saída é reduzida antes de qualquer parser. O snapshot nunca retorna a
  // saída crua para outro módulo que não seja o parser de campos permitidos.
  const safeOutput = redactOutput(
    `${result?.stdout ?? ''}\n${result?.stderr ?? ''}`,
  )

  return {
    providerId,
    source,
    collectedAt,
    commandOk: result?.ok === true,
    auth: parseAgentAuth(providerId, safeOutput),
    metrics: result?.ok === true ? parseAgentUsage(providerId, safeOutput).metrics : [],
    queryFailed: result?.ok !== true,
  }
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

  for (const account of accounts) {
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
        errorMessage: CLI_QUERY_FAILED_MESSAGE,
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

    if (resolution.kind === 'ambiguous' || resolution.kind === 'missing') {
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

    if (resolution.kind !== 'matched' || resolution.targetId !== account.id) {
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
      })
      continue
    }

    repository.saveSample({
      ...base,
      status: previous ? 'stale' : 'unavailable',
      errorMessage: snapshot.auth.authStatus === 'logged_out'
        ? 'A CLI informa que não há uma sessão autenticada.'
        : snapshot.source.usage.limitation,
    })
  }
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
      identityMatched: resolution.kind === 'matched',
      identityAmbiguous: resolution.kind === 'ambiguous',
      limitation: snapshot.source.usage.limitation,
      providerVersion: providerVersion ?? undefined,
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

  if (
    sample.status === 'current' &&
    isOlderThan(sample.collectedAt, now, STALE_AFTER_MS)
  ) {
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
  COMMAND_TIMEOUT_MS,
  STALE_AFTER_MS,
  createAgentUsageService,
  buildDashboard,
  collectProviderSnapshot,
  resolveObservedIdentity,
}

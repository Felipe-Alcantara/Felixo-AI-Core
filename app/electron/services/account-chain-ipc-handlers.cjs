'use strict'

/**
 * @module account-chain-ipc-handlers
 * Canais `account-chain:*` da cadeia de contas (§2.5 da política).
 *
 * Fino de propósito: cada handler valida só o formato (texto, enum, uuid,
 * faixa), chama o serviço da cadeia (`accounts/account-chain-service.cjs`) e
 * devolve o resultado no formato do contrato do renderer
 * (`src/features/shared/types/account-chain.ts`) pela visão
 * (`accounts/account-chain-view.cjs`). Nenhuma regra de negócio mora aqui.
 *
 * Também traduz os pushes do serviço para o contrato:
 * - `account-chain:changed` leva o estado inteiro (a interface não relê);
 * - `account-chain:proposal` leva `opened` e, comparando as propostas abertas
 *   a cada mudança, `closed` quando uma sai (confirmada, recusada, vencida);
 * - `account-chain:detection` leva a detecção com o desfecho.
 *
 * Nada de caminho de perfil, env ou segredo sai por aqui: a visão só lê fatos
 * já redigidos, e o `redact-transcript` passa o texto por `redactSecrets`.
 */

const crypto = require('node:crypto')
const { ipcMain } = require('electron')

const { CONFIRM_ERROR_CODES } = require('./accounts/account-chain-view.cjs')
const {
  BILLING_CLASSES,
  CHAIN_PROVIDER_IDS,
  CHAIN_STRATEGIES,
  COOLDOWN_FAILURE_CLASSES,
  MAX_MAX_HOPS_PER_LINEAGE,
  MAX_PLAN_MULTIPLIER,
  MIN_MAX_HOPS_PER_LINEAGE,
  MIN_PLAN_MULTIPLIER,
  SWITCH_HISTORY_PAGE_MAX,
} = require('./accounts/account-chain-constants.cjs')
const { redactSecrets } = require('./official-cli-account-status.cjs')

/** Mesmo teto do contexto de passagem (`context-files-ipc-handlers.cjs`). */
const MAX_TRANSCRIPT_BYTES = 32 * 1024 * 1024
const MAX_CHECK_LOGIN_ACCOUNTS = 5
const ID_MAX_CHARS = 200
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SESSION_MODES = Object.freeze(['pinned', 'chain'])
const DECLINE_REASONS = Object.freeze(['later', 'not-a-limit'])
const RELEASE_REASONS = Object.freeze(['not-a-limit', 'recharged', 'manual'])
const AMBIGUOUS_CHOICES = Object.freeze(['limit', 'ignore'])

/** Mensagens pt-BR dos códigos que a interface mostra como estão. */
const MESSAGES = Object.freeze({
  INVALID: 'Pedido inválido para a cadeia de contas.',
  UNAVAILABLE: 'A cadeia de contas não está disponível nesta janela.',
  FAILED: 'A cadeia de contas não conseguiu concluir o pedido.',
  REVISION_CONFLICT: 'A cadeia mudou em outra janela; confira a lista atual.',
  NOT_PENDING: 'Esta proposta não está mais aguardando resposta.',
  EXPIRED: 'Esta proposta venceu.',
  SUPERSEDED: 'A conta recomendada mudou; confira a nova proposta.',
  SOURCE_ACTIVE: 'O terminal antigo ainda está produzindo saída.',
  NOT_ELIGIBLE: 'Esta conta não está apta agora.',
  SESSION_NOT_FOUND: 'O terminal deste bloco não está mais aberto.',
  UNKNOWN_ACCOUNT: 'Uma das contas da lista não existe mais.',
  CHAIN_DISABLED: 'A cadeia de contas está desligada.',
  NO_CANDIDATE: 'Nenhuma conta apta agora.',
})

// ── Validação de formato ───────────────────────────────────────────────────

function isText(value, maxChars = ID_MAX_CHARS) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxChars
}

function isUuid(value) {
  return typeof value === 'string' && UUID_PATTERN.test(value)
}

function isRevision(value) {
  return Number.isInteger(value) && value >= 0
}

function isIso(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function fail(code, extra = {}) {
  return { ok: false, code, message: MESSAGES[code] ?? MESSAGES.FAILED, ...extra }
}

function invalid() {
  return fail('INVALID')
}

function parseSettingsUpdate(params) {
  if (!isPlainObject(params) || !isRevision(params.expectedRevision)) return null
  const update = { expectedRevision: params.expectedRevision }
  if (params.enabled !== undefined) {
    if (typeof params.enabled !== 'boolean') return null
    update.enabled = params.enabled
  }
  if (params.strategy !== undefined) {
    if (!CHAIN_STRATEGIES.includes(params.strategy)) return null
    update.strategy = params.strategy
  }
  if (params.maxHops !== undefined) {
    if (!Number.isInteger(params.maxHops) || params.maxHops < MIN_MAX_HOPS_PER_LINEAGE || params.maxHops > MAX_MAX_HOPS_PER_LINEAGE) {
      return null
    }
    update.maxHops = params.maxHops
  }
  return update
}

function parseMemberUpdate(member) {
  if (!isPlainObject(member) || !isText(member.accountId) || typeof member.enabled !== 'boolean') return null
  const billing = member.billingDeclared ?? null
  if (billing !== null && !BILLING_CLASSES.includes(billing)) return null
  const multiplier = member.multiplierDeclared ?? null
  if (
    multiplier !== null &&
    !(typeof multiplier === 'number' && Number.isFinite(multiplier) && multiplier >= MIN_PLAN_MULTIPLIER && multiplier <= MAX_PLAN_MULTIPLIER)
  ) {
    return null
  }
  return { accountId: member.accountId, enabled: member.enabled, billingDeclared: billing, multiplierDeclared: multiplier }
}

function parseMembersUpdate(params) {
  if (!isPlainObject(params) || !isRevision(params.expectedRevision) || !Array.isArray(params.members)) return null
  const members = []
  const seen = new Set()
  for (const item of params.members) {
    const member = parseMemberUpdate(item)
    if (!member || seen.has(member.accountId)) return null
    seen.add(member.accountId)
    members.push(member)
  }
  return { members, expectedRevision: params.expectedRevision }
}

// ── Registro ───────────────────────────────────────────────────────────────

/**
 * @param {object} deps
 * @param {() => (object | null)} deps.getService - Serviço da cadeia (ou `null` se não montou).
 * @param {object} deps.view - `createAccountChainView`.
 * @param {() => (import('electron').BrowserWindow | null)} [deps.getMainWindow]
 * @param {() => string[]} [deps.listEnvCredentialNames] - Só os nomes das credenciais do ambiente do app.
 * @param {(fn: () => void) => void} [deps.schedule] - Agenda o push do estado (coalescido).
 * @param {{ handle: Function }} [deps.ipc]
 * @returns {{ emit: (channel: string, payload: unknown) => void }}
 */
function registerAccountChainIpcHandlers({
  getService,
  view,
  getMainWindow = () => null,
  listEnvCredentialNames = () => [],
  schedule = (fn) => setTimeout(fn, 0),
  ipc = ipcMain,
} = {}) {
  function envNames() {
    try {
      return listEnvCredentialNames() ?? []
    } catch {
      return []
    }
  }

  function buildState(service) {
    return view.state(service.getState(), envNames())
  }

  /** Envolve cada canal: serviço ausente e exceção viram falha no formato do contrato. */
  function handle(channel, run) {
    ipc.handle(channel, async (_event, params) => {
      const service = getService()
      if (!service) return fail('UNAVAILABLE')
      try {
        return await run(service, params)
      } catch {
        // A mensagem crua pode trazer caminho; a interface recebe o código.
        return fail('FAILED')
      }
    })
  }

  function mutationResult(service, result) {
    if (result?.ok) return { ok: true, state: buildState(service) }
    if (result?.code === 'REVISION_CONFLICT') {
      return { ok: false, code: 'REVISION_CONFLICT', current: buildState(service), message: MESSAGES.REVISION_CONFLICT }
    }
    return fail(result?.code ?? 'FAILED')
  }

  handle('account-chain:get-state', (service) => ({ ok: true, ...buildState(service) }))

  handle('account-chain:update-settings', (service, params) => {
    const update = parseSettingsUpdate(params)
    if (!update) return invalid()
    return mutationResult(service, service.updateSettings(update))
  })

  handle('account-chain:update-members', (service, params) => {
    const update = parseMembersUpdate(params)
    if (!update) return invalid()
    return mutationResult(service, service.updateMembers(update))
  })

  handle('account-chain:check-login', async (service, params) => {
    const ids = params?.accountIds
    if (!Array.isArray(ids) || ids.length === 0 || ids.length > MAX_CHECK_LOGIN_ACCOUNTS || !ids.every((id) => isText(id))) {
      return invalid()
    }
    const result = await service.checkLoginNow({ accountIds: ids })
    if (!result?.ok) return fail(result?.code ?? 'FAILED')
    return {
      ok: true,
      results: result.results
        .filter((item) => item?.loginCheck)
        .map((item) => ({ accountId: item.accountId, login: view.loginCheck(item.loginCheck) })),
    }
  })

  handle('account-chain:preview-launch', async (service, params) => {
    if (!isPlainObject(params) || !CHAIN_PROVIDER_IDS.includes(params.providerId)) {
      return { ok: false, code: 'INVALID', reasons: [], message: MESSAGES.INVALID }
    }
    const result = await service.previewLaunch({ providerId: params.providerId })
    if (result?.ok) return { ok: true, proposal: view.proposal(result.proposal) }
    const code = result?.code === 'CHAIN_DISABLED' || result?.code === 'NO_CANDIDATE' ? result.code : 'INVALID'
    return { ok: false, code, reasons: view.launchReasons(result?.reasons), message: MESSAGES[code] }
  })

  handle('account-chain:confirm', async (service, params) => {
    if (!isPlainObject(params) || !isUuid(params.proposalId) || !isText(params.destinationAccountId)) return invalid()
    if (params.acknowledgeSourceActive !== undefined && typeof params.acknowledgeSourceActive !== 'boolean') return invalid()
    const result = await service.confirm({
      proposalId: params.proposalId,
      destinationAccountId: params.destinationAccountId,
      acknowledgeSourceActive: params.acknowledgeSourceActive === true,
    })
    if (result?.ok) {
      return {
        ok: true,
        ticket: result.ticket,
        destination: {
          accountId: result.destination.accountId,
          providerId: result.destination.providerId,
          label: result.destination.label ?? null,
        },
        ...(result.alreadyConfirmed ? { alreadyConfirmed: true } : {}),
      }
    }
    if (!CONFIRM_ERROR_CODES.includes(result?.code)) return fail(result?.code === 'INVALID' ? 'INVALID' : 'FAILED')
    const proposal = result.proposal && result.proposal.state === 'proposed' ? view.proposal(result.proposal) : null
    return { ok: false, code: result.code, message: MESSAGES[result.code], ...(proposal ? { proposal } : {}) }
  })

  handle('account-chain:decline', async (service, params) => {
    if (!isPlainObject(params) || !isUuid(params.proposalId) || !DECLINE_REASONS.includes(params.reason)) return invalid()
    const result = await service.decline({ proposalId: params.proposalId, reason: params.reason })
    if (result?.ok) return { ok: true }
    return result?.code === 'NOT_PENDING' ? { ok: false, code: 'NOT_PENDING', message: MESSAGES.NOT_PENDING } : fail(result?.code ?? 'FAILED')
  })

  handle('account-chain:resolve-ambiguous', async (service, params) => {
    if (!isPlainObject(params) || !isUuid(params.detectionId) || !AMBIGUOUS_CHOICES.includes(params.treatAs)) return invalid()
    const result = await service.resolveAmbiguous({ detectionId: params.detectionId, treatAs: params.treatAs })
    return result?.ok ? { ok: true } : fail(result?.code ?? 'FAILED')
  })

  handle('account-chain:set-session-mode', (service, params) => {
    if (!isPlainObject(params) || !isText(params.sessionId) || !SESSION_MODES.includes(params.mode)) return invalid()
    const result = service.setSessionMode({ sessionId: params.sessionId, mode: params.mode })
    return result?.ok ? { ok: true } : fail(result?.code ?? 'FAILED')
  })

  handle('account-chain:release-cooldown', async (service, params) => {
    if (!isPlainObject(params) || !isText(params.accountId) || !RELEASE_REASONS.includes(params.reason)) return invalid()
    const result = await service.releaseCooldown({ accountId: params.accountId, reason: params.reason })
    // Login e crédito só saem depois de uma checagem OK: a pessoa vê "precisa conferir".
    if (result?.code === 'CHECK_REQUIRED') return { ok: true, requiresCheck: true }
    return result?.ok ? { ok: true, requiresCheck: false } : fail(result?.code ?? 'FAILED')
  })

  handle('account-chain:redact-transcript', (_service, params) => {
    if (!isPlainObject(params) || typeof params.text !== 'string') return invalid()
    if (Buffer.byteLength(params.text, 'utf8') > MAX_TRANSCRIPT_BYTES) return invalid()
    const text = redactSecrets(params.text)
    return { ok: true, text, chars: text.length }
  })

  handle('account-chain:record-manual', (service, params) => {
    if (
      !isPlainObject(params) ||
      !isText(params.sourceSessionId) ||
      !(params.toAccountId === null || isText(params.toAccountId)) ||
      !CHAIN_PROVIDER_IDS.includes(params.toProviderId) ||
      !COOLDOWN_FAILURE_CLASSES.includes(params.reasonClass)
    ) {
      return invalid()
    }
    const result = service.recordManual({
      sourceSessionId: params.sourceSessionId,
      toAccountId: params.toAccountId,
      toProviderId: params.toProviderId,
      reasonClass: params.reasonClass,
    })
    return result?.ok ? { ok: true, eventId: result.eventId } : fail(result?.code ?? 'FAILED')
  })

  handle('account-chain:history', (service, params) => {
    if (
      !isPlainObject(params) ||
      !Number.isInteger(params.limit) ||
      params.limit < 1 ||
      params.limit > SWITCH_HISTORY_PAGE_MAX ||
      (params.before !== undefined && !isIso(params.before))
    ) {
      return invalid()
    }
    const result = service.history({ limit: params.limit, ...(params.before ? { before: params.before } : {}) })
    if (!result?.ok) return fail(result?.code ?? 'FAILED')
    return { ok: true, entries: result.events.map((event) => view.historyEntry(event)), hasMore: result.events.length === params.limit }
  })

  // ── Pushes ───────────────────────────────────────────────────────────────

  function send(channel, payload) {
    const window = getMainWindow()
    if (!window || window.isDestroyed?.()) return
    window.webContents.send(channel, payload)
  }

  /** Propostas abertas já anunciadas, para anunciar quando cada uma sai. */
  const openProposals = new Map()
  let statePushScheduled = false
  let buildingState = false

  function pushState() {
    statePushScheduled = false
    const service = getService()
    if (!service) return
    buildingState = true
    try {
      const state = buildState(service)
      const stillOpen = new Set(state.pendingProposals.map((proposal) => proposal.id))
      for (const proposal of state.pendingProposals) {
        openProposals.set(proposal.id, proposal.sourceSessionId ?? null)
      }
      for (const [proposalId, sourceSessionId] of openProposals) {
        if (stillOpen.has(proposalId)) continue
        openProposals.delete(proposalId)
        send('account-chain:proposal', {
          type: 'closed',
          proposalId,
          state: view.proposalState(proposalId) ?? 'expired',
          sourceSessionId,
        })
      }
      send('account-chain:changed', state)
    } catch {
      // O renderer relê com get-state ao montar; um push perdido não decide nada.
    } finally {
      buildingState = false
    }
  }

  function scheduleStatePush() {
    // Ler o estado varre prazos e pode emitir outra mudança: uma só leitura por rodada.
    if (statePushScheduled || buildingState) return
    statePushScheduled = true
    schedule(pushState)
  }

  function emit(channel, payload) {
    try {
      if (channel === 'account-chain:changed') {
        scheduleStatePush()
        return
      }
      if (channel === 'account-chain:proposal') {
        const proposal = view.proposal(payload)
        if (!proposal) return
        openProposals.set(proposal.id, proposal.sourceSessionId ?? null)
        send('account-chain:proposal', { type: 'opened', proposal })
        return
      }
      if (channel === 'account-chain:detection') {
        send('account-chain:detection', view.detection(payload, { id: crypto.randomUUID() }))
      }
    } catch {
      // Push é melhor esforço: a decisão já está gravada no SQLite.
    }
  }

  return { emit }
}

module.exports = {
  MAX_CHECK_LOGIN_ACCOUNTS,
  MAX_TRANSCRIPT_BYTES,
  parseMembersUpdate,
  parseSettingsUpdate,
  registerAccountChainIpcHandlers,
}

import {
  CLOUD_SESSION_ERROR_CODES,
  type CloudSessionErrorCode,
  type CloudSessionLaunchResult,
} from '../../shared/types/cloud-session'
import type { CloudSessionFollowUp, CloudSessionNodeData, CloudSessionStatus } from '../types'

/**
 * Estado do cartão "Agente na nuvem", sem I/O: cada função recebe os dados do
 * nó e devolve os campos `cloud*` novos para mesclar no nó. Quem chama o main
 * (`window.felixo.cloudSession`) é o componente; aqui só mora a regra, para ela
 * ter teste de verdade.
 *
 * Transições (spec §5.3):
 *   draft ──Disparar──▶ launching ──ok──▶ created
 *                           └──erro──▶ failed ──Tentar de novo──▶ launching
 *   created ──Nova sessão──▶ draft
 *   carregado com `launching` ──▶ failed (interrupted)
 */

export const CLOUD_TASK_MAX = 4000
export const CLOUD_FOLLOW_UP_MAX = 2000
export const CLOUD_FOLLOW_UP_LIMIT = 20
const CLOUD_TITLE_MAX = 200
const CLOUD_MESSAGE_MAX = 2000
const CLOUD_TITLE_FALLBACK = 'Sessão na nuvem'
const SESSION_ID_PATTERN = /^session_[A-Za-z0-9]+$/
const SESSION_URL_PATTERN = /^https:\/\/claude\.ai\/code\/(session_[A-Za-z0-9]+)(?:\?[^\s#]*)?$/

const INTERRUPTED_MESSAGE =
  'O app foi fechado durante o disparo. A sessão pode ter sido criada: confira em claude.ai/code.'
const UNKNOWN_MESSAGE = 'O Claude devolveu uma resposta que o app não reconheceu.'

/** Erros que provam que nenhuma sessão foi criada: tentar de novo não duplica nada. */
const SAFE_TO_RETRY: ReadonlySet<CloudSessionErrorCode> = new Set([
  'trust-required',
  'login-required',
  'limit-reached',
  'invalid-input',
])

const STATUSES: readonly CloudSessionStatus[] = ['draft', 'launching', 'created', 'failed']

/** Só o link de sessão do claude.ai/code; o main confere de novo antes de abrir. */
export function isCloudSessionUrl(url: unknown): url is string {
  return typeof url === 'string' && url.length <= 300 && SESSION_URL_PATTERN.test(url)
}

/** Copia só os campos do cartão, sem carregar campos de outros tipos de bloco. */
function cloudFields(data: CloudSessionNodeData): CloudSessionNodeData {
  return {
    cloudTask: data.cloudTask,
    cloudCwd: data.cloudCwd,
    cloudAccountId: data.cloudAccountId,
    cloudStatus: data.cloudStatus,
    cloudSession: data.cloudSession,
    cloudFollowUps: data.cloudFollowUps,
    cloudError: data.cloudError,
  }
}

export function createDraft(input: { cwd: string; accountId?: string }): CloudSessionNodeData {
  return {
    cloudStatus: 'draft',
    cloudTask: '',
    cloudCwd: input.cwd,
    cloudAccountId: input.accountId || undefined,
    cloudFollowUps: [],
  }
}

export function markLaunching(data: CloudSessionNodeData): CloudSessionNodeData {
  return { ...cloudFields(data), cloudStatus: 'launching', cloudError: undefined }
}

export function applyLaunchResult(
  data: CloudSessionNodeData,
  result: CloudSessionLaunchResult,
  nowIso: string,
): CloudSessionNodeData {
  if (result.ok) {
    return {
      ...cloudFields(data),
      cloudStatus: 'created',
      cloudSession: { ...result.session, createdAt: nowIso },
      cloudFollowUps: [],
      cloudError: undefined,
    }
  }
  return {
    ...cloudFields(data),
    cloudStatus: 'failed',
    cloudSession: undefined,
    cloudError: { code: result.code, message: result.message },
  }
}

export function appendFollowUp(
  data: CloudSessionNodeData,
  entry: CloudSessionFollowUp,
): CloudSessionNodeData {
  const next = { ...entry, text: entry.text.slice(0, CLOUD_FOLLOW_UP_MAX) }
  return {
    ...cloudFields(data),
    cloudFollowUps: [...(data.cloudFollowUps ?? []), next].slice(-CLOUD_FOLLOW_UP_LIMIT),
  }
}

/** Volta ao rascunho mantendo tarefa, pasta e conta; some a sessão e os follow-ups. */
export function startNewSession(data: CloudSessionNodeData): CloudSessionNodeData {
  return {
    cloudTask: data.cloudTask,
    cloudCwd: data.cloudCwd,
    cloudAccountId: data.cloudAccountId,
    cloudStatus: 'draft',
    cloudSession: undefined,
    cloudFollowUps: [],
    cloudError: undefined,
  }
}

/** Disparar vale em rascunho ou depois de uma falha; nunca depois de criada (I3). */
export function canLaunch(data: CloudSessionNodeData): boolean {
  const status = data.cloudStatus ?? 'draft'
  return (
    (status === 'draft' || status === 'failed') &&
    (data.cloudTask ?? '').trim().length > 0 &&
    (data.cloudCwd ?? '').trim().length > 0
  )
}

export function canFollowUp(data: CloudSessionNodeData): boolean {
  return data.cloudStatus === 'created' && Boolean(data.cloudSession)
}

export function canRetryWithoutConfirmation(code: CloudSessionErrorCode): boolean {
  return SAFE_TO_RETRY.has(code)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readErrorCode(value: unknown): CloudSessionErrorCode {
  return CLOUD_SESSION_ERROR_CODES.includes(value as CloudSessionErrorCode)
    ? (value as CloudSessionErrorCode)
    : 'unknown'
}

function readSession(value: unknown): CloudSessionNodeData['cloudSession'] {
  if (!isRecord(value)) return undefined
  const { id, url, title, createdAt } = value
  if (typeof id !== 'string' || !SESSION_ID_PATTERN.test(id)) return undefined
  if (!isCloudSessionUrl(url) || !url.includes(id)) return undefined
  if (typeof createdAt !== 'string' || createdAt.length === 0 || createdAt.length > 64) return undefined
  return {
    id,
    url,
    title: typeof title === 'string' && title.trim() ? title.slice(0, CLOUD_TITLE_MAX) : CLOUD_TITLE_FALLBACK,
    createdAt,
  }
}

function readFollowUps(value: unknown): CloudSessionFollowUp[] {
  if (!Array.isArray(value)) return []
  const valid: CloudSessionFollowUp[] = []
  for (const entry of value) {
    if (!isRecord(entry)) continue
    if (typeof entry.at !== 'string' || typeof entry.text !== 'string' || typeof entry.ok !== 'boolean') continue
    valid.push({
      at: entry.at,
      text: entry.text.slice(0, CLOUD_FOLLOW_UP_MAX),
      ok: entry.ok,
      ...(entry.error === undefined ? {} : { error: readErrorCode(entry.error) }),
    })
  }
  return valid.slice(-CLOUD_FOLLOW_UP_LIMIT)
}

function readError(value: unknown): NonNullable<CloudSessionNodeData['cloudError']> {
  if (!isRecord(value)) return { code: 'unknown', message: UNKNOWN_MESSAGE }
  return {
    code: readErrorCode(value.code),
    message:
      typeof value.message === 'string' && value.message.trim()
        ? value.message.slice(0, CLOUD_MESSAGE_MAX)
        : UNKNOWN_MESSAGE,
  }
}

/**
 * Lê o que veio do SQLite ou de uma importação e devolve um cartão coerente.
 * Nunca devolve `launching` (o processo morreu com o app; a sessão pode ou não
 * ter sido criada) nem um `created` sem sessão válida.
 */
export function normalizeLoaded(raw: unknown): CloudSessionNodeData {
  const source = isRecord(raw) ? raw : {}
  const task = typeof source.cloudTask === 'string' ? source.cloudTask.slice(0, CLOUD_TASK_MAX) : ''
  const base: CloudSessionNodeData = {
    cloudTask: task,
    cloudCwd: typeof source.cloudCwd === 'string' ? source.cloudCwd : undefined,
    cloudAccountId:
      typeof source.cloudAccountId === 'string' && source.cloudAccountId ? source.cloudAccountId : undefined,
  }

  const rawStatus = STATUSES.includes(source.cloudStatus as CloudSessionStatus)
    ? (source.cloudStatus as CloudSessionStatus)
    : 'draft'

  if (rawStatus === 'launching') {
    return {
      ...base,
      cloudStatus: 'failed',
      cloudFollowUps: [],
      cloudError: { code: 'interrupted', message: INTERRUPTED_MESSAGE },
    }
  }
  if (rawStatus === 'failed') {
    return { ...base, cloudStatus: 'failed', cloudFollowUps: [], cloudError: readError(source.cloudError) }
  }
  if (rawStatus === 'created') {
    const session = readSession(source.cloudSession)
    if (session) {
      return { ...base, cloudStatus: 'created', cloudSession: session, cloudFollowUps: readFollowUps(source.cloudFollowUps) }
    }
  }
  return { ...base, cloudStatus: 'draft', cloudFollowUps: [] }
}

/**
 * Estado da conversa de um bloco do Claude por chave de API.
 *
 * Função pura: entra o estado e um evento do processo
 * (`window.felixo.claudeApi.onEvent`) ou uma ação da pessoa, sai o estado
 * novo. Quem guarda e persiste é `claude-api-conversation-store.ts`.
 */

import type {
  ClaudeApiErrorKind,
  ClaudeApiEvent,
  ClaudeApiTranscriptEntry,
} from '../../shared/types/claude-api'

export type ClaudeApiItem =
  | {
      id: string
      role: 'user'
      text: string
      context?: boolean
      /** Miniaturas (data URL) das imagens coladas nesta mensagem. */
      images?: string[]
      /** Quantas imagens havia, quando a conversa veio do `/resume` (sem miniatura). */
      imageCount?: number
    }
  | { id: string; role: 'assistant'; text: string }
  | {
      id: string
      role: 'tool'
      toolUseId: string
      name: string
      summary: string
      result?: string
      isError?: boolean
      denied?: boolean
    }
  | { id: string; role: 'notice'; text: string; tone: 'info' | 'error' }

export type ClaudeApiPermission = {
  requestId: string
  toolName: string
  toolUseId: string | null
  description: string
  summary: string
  input: Record<string, unknown>
}

export type ClaudeApiStatus = 'idle' | 'working' | 'waiting-permission'

export type ClaudeApiConversation = {
  status: ClaudeApiStatus
  items: ClaudeApiItem[]
  /** Texto da resposta que ainda está chegando (deltas). */
  streamingText: string
  permissions: ClaudeApiPermission[]
  claudeSessionId: string | null
  totalCostUsd: number
  lastErrorKind: ClaudeApiErrorKind | null
  /** Contador para ids locais; persistido para não repetir depois de reabrir. */
  seq: number
}

/** O que vai para o banco: sem o que só vale com o processo vivo. */
export type PersistedClaudeApiConversation = {
  items: ClaudeApiItem[]
  claudeSessionId: string | null
  totalCostUsd: number
  seq: number
}

export const MAX_ITEMS = 300
export const MAX_ITEM_TEXT = 20_000
/** Miniatura de 160 px em JPEG fica em ~5 a 15 KB; o teto barra lixo grande no banco. */
const MAX_THUMB_CHARS = 40_000
const MAX_THUMBS = 10
const THUMB = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/

export function createConversation(): ClaudeApiConversation {
  return {
    status: 'idle',
    items: [],
    streamingText: '',
    permissions: [],
    claudeSessionId: null,
    totalCostUsd: 0,
    lastErrorKind: null,
    seq: 0,
  }
}

function clip(text: string, max = MAX_ITEM_TEXT): string {
  return text.length > max ? `${text.slice(0, max)}\n… (texto cortado)` : text
}

type NewItem = ClaudeApiItem extends infer T ? (T extends ClaudeApiItem ? Omit<T, 'id'> : never) : never

function push(state: ClaudeApiConversation, item: NewItem): ClaudeApiConversation {
  const seq = state.seq + 1
  const items = [...state.items, { ...item, id: `i${seq}` } as ClaudeApiItem]
  return { ...state, seq, items: items.length > MAX_ITEMS ? items.slice(-MAX_ITEMS) : items }
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/** Uma linha que diz o que a ferramenta vai fazer, para a lista e o pedido de permissão. */
export function summarizeToolInput(name: string, input: Record<string, unknown>): string {
  const path = str(input.file_path) || str(input.path) || str(input.notebook_path)
  switch (name) {
    case 'Bash':
      return str(input.command) || str(input.description)
    case 'Read':
    case 'Write':
    case 'Edit':
    case 'MultiEdit':
    case 'NotebookEdit':
      return path
    case 'Glob':
    case 'Grep':
      return [str(input.pattern), path].filter(Boolean).join(' em ')
    case 'WebFetch':
      return str(input.url)
    case 'WebSearch':
      return str(input.query)
    case 'Task':
    case 'Agent':
      return str(input.description) || str(input.prompt).slice(0, 120)
    case 'TodoWrite':
      return 'atualizar a lista de tarefas'
    default: {
      const first = Object.values(input).find((value) => typeof value === 'string')
      return typeof first === 'string' ? first.slice(0, 200) : ''
    }
  }
}

const ERROR_TEXT: Record<ClaudeApiErrorKind, string> = {
  auth: 'A chave de API foi recusada. Confira a chave da conta (remova a conta e crie de novo com a chave certa).',
  credit:
    'Sem saldo para esta chave. No Console da Anthropic, confira o saldo e os créditos promocionais da organização.',
  'rate-limit': 'Limite de requisições da chave atingido. Espere um pouco e tente de novo.',
  overloaded: 'A API está sobrecarregada agora. Tente de novo em instantes.',
  other: '',
}

export function describeError(kind: ClaudeApiErrorKind | null, text: string): string {
  const base = kind ? ERROR_TEXT[kind] : ''
  if (base && text) return `${base}\n\nResposta do Claude Code: ${text}`
  return base || text || 'O turno terminou com erro.'
}

function flushStreaming(state: ClaudeApiConversation): ClaudeApiConversation {
  return state.streamingText ? { ...state, streamingText: '' } : state
}

export function userSent(
  state: ClaudeApiConversation,
  text: string,
  options: { context?: boolean; images?: string[] } = {},
): ClaudeApiConversation {
  const images = sanitizeThumbs(options.images)
  const next = push(state, {
    role: 'user',
    text: clip(text),
    ...(options.context ? { context: true } : {}),
    ...(images ? { images } : {}),
  })
  return { ...next, status: 'working', lastErrorKind: null }
}

/** Só miniatura que é imagem em data URL e pequena; `undefined` quando não sobra nenhuma. */
function sanitizeThumbs(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const thumbs = raw
    .filter((value): value is string => typeof value === 'string' && value.length <= MAX_THUMB_CHARS && THUMB.test(value))
    .slice(0, MAX_THUMBS)
  return thumbs.length > 0 ? thumbs : undefined
}

export function sendFailed(state: ClaudeApiConversation, message: string): ClaudeApiConversation {
  return { ...push(state, { role: 'notice', text: message, tone: 'error' }), status: 'idle' }
}

export function permissionAnswered(
  state: ClaudeApiConversation,
  requestId: string,
  allow: boolean,
): ClaudeApiConversation {
  const permission = state.permissions.find((item) => item.requestId === requestId)
  const permissions = state.permissions.filter((item) => item.requestId !== requestId)
  let items = state.items
  if (!allow && permission?.toolUseId) {
    items = items.map((item) =>
      item.role === 'tool' && item.toolUseId === permission.toolUseId ? { ...item, denied: true } : item,
    )
  }
  return {
    ...state,
    items,
    permissions,
    status: permissions.length > 0 ? 'waiting-permission' : state.status === 'idle' ? 'idle' : 'working',
  }
}

export function applyClaudeApiEvent(
  state: ClaudeApiConversation,
  event: ClaudeApiEvent,
): ClaudeApiConversation {
  switch (event.kind) {
    case 'ready':
      return event.claudeSessionId ? { ...state, claudeSessionId: event.claudeSessionId } : state
    case 'text-delta':
      return { ...state, streamingText: state.streamingText + event.text }
    case 'assistant-message': {
      let next = flushStreaming(state)
      for (const block of event.blocks) {
        if (block.type === 'text') {
          next = push(next, { role: 'assistant', text: clip(block.text) })
        } else {
          next = push(next, {
            role: 'tool',
            toolUseId: block.id,
            name: block.name,
            summary: clip(summarizeToolInput(block.name, block.input), 500),
          })
        }
      }
      return next
    }
    case 'tool-result':
      return {
        ...state,
        items: state.items.map((item) =>
          item.role === 'tool' && item.toolUseId === event.toolUseId
            ? { ...item, result: clip(event.text, 4000), isError: event.isError }
            : item,
        ),
      }
    case 'permission-request': {
      if (state.permissions.some((item) => item.requestId === event.requestId)) return state
      return {
        ...state,
        status: 'waiting-permission',
        permissions: [
          ...state.permissions,
          {
            requestId: event.requestId,
            toolName: event.toolName,
            toolUseId: event.toolUseId,
            description: event.description,
            summary: summarizeToolInput(event.toolName, event.input),
            input: event.input,
          },
        ],
      }
    }
    case 'notice': {
      const next = push(flushStreaming(state), {
        role: 'notice',
        text: event.errorKind ? describeError(event.errorKind, event.text) : event.text,
        tone: event.errorKind ? 'error' : 'info',
      })
      return { ...next, lastErrorKind: event.errorKind ?? next.lastErrorKind }
    }
    case 'turn-end': {
      let next: ClaudeApiConversation = {
        ...flushStreaming(state),
        status: 'idle',
        permissions: [],
        totalCostUsd: Math.round((state.totalCostUsd + (event.costUsd || 0)) * 1e6) / 1e6,
      }
      if (event.interrupted) {
        next = push(next, { role: 'notice', text: 'Interrompido.', tone: 'info' })
      } else if (event.isError) {
        // O aviso sintético do Claude Code já foi mostrado com o mesmo texto.
        const alreadyShown = state.lastErrorKind !== null && state.lastErrorKind === event.errorKind
        if (!alreadyShown) {
          next = push(next, { role: 'notice', text: describeError(event.errorKind, event.resultText), tone: 'error' })
        }
        next = { ...next, lastErrorKind: event.errorKind }
      }
      return next
    }
    case 'process-exit': {
      const next = { ...flushStreaming(state), status: 'idle' as const, permissions: [] }
      return event.message ? push(next, { role: 'notice', text: event.message, tone: 'error' }) : next
    }
    default:
      return state
  }
}

export function toPersisted(state: ClaudeApiConversation): PersistedClaudeApiConversation {
  return {
    items: state.items,
    claudeSessionId: state.claudeSessionId,
    totalCostUsd: state.totalCostUsd,
    seq: state.seq,
  }
}

function isItem(value: unknown): value is ClaudeApiItem {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  if (typeof item.id !== 'string') return false
  if (item.role === 'user' || item.role === 'assistant') return typeof item.text === 'string'
  if (item.role === 'tool') return typeof item.toolUseId === 'string' && typeof item.name === 'string'
  if (item.role === 'notice') return typeof item.text === 'string'
  return false
}

function cleanUserImages(item: ClaudeApiItem): ClaudeApiItem {
  if (item.role !== 'user' || (item.images === undefined && item.imageCount === undefined)) return item
  const { images: rawImages, imageCount: rawCount, ...rest } = item
  const images = sanitizeThumbs(rawImages)
  const imageCount = typeof rawCount === 'number' && Number.isInteger(rawCount) && rawCount > 0 ? Math.min(rawCount, 100) : undefined
  return { ...rest, ...(images ? { images } : {}), ...(imageCount ? { imageCount } : {}) }
}

/** Lê o que veio do banco; o que não reconhece fica de fora. */
export function fromPersisted(raw: unknown): ClaudeApiConversation {
  const base = createConversation()
  if (!raw || typeof raw !== 'object') return base
  const value = raw as Record<string, unknown>
  const items = Array.isArray(value.items)
    ? value.items.filter(isItem).slice(-MAX_ITEMS).map(cleanUserImages)
    : []
  return {
    ...base,
    items,
    claudeSessionId:
      typeof value.claudeSessionId === 'string' && /^[0-9a-f-]{8,64}$/i.test(value.claudeSessionId)
        ? value.claudeSessionId
        : null,
    totalCostUsd: typeof value.totalCostUsd === 'number' && value.totalCostUsd >= 0 ? value.totalCostUsd : 0,
    seq: typeof value.seq === 'number' && Number.isFinite(value.seq) ? Math.max(value.seq, items.length) : items.length,
  }
}

export function formatUsd(value: number): string {
  if (!value) return 'US$ 0,00'
  const digits = value < 0.01 ? 4 : 2
  return `US$ ${value.toFixed(digits).replace('.', ',')}`
}

/** Apelidos que o Claude Code aceita em `--model`; nomes completos também valem. */
export const CLAUDE_API_MODEL_ALIASES = ['sonnet', 'opus', 'haiku'] as const

const MODEL_NAME = /^[a-z0-9][a-z0-9.\-[\]]{0,79}$/i

export type ClaudeApiSlashCommand =
  | { kind: 'resume-list' }
  | { kind: 'resume-pick'; target: string }
  | { kind: 'model-show' }
  | { kind: 'model-set'; model: string | null }
  | { kind: 'model-invalid'; value: string }

/**
 * Comandos de barra que o próprio bloco atende. Sem a tela do Claude Code, o
 * `/model` dele não existe: o bloco troca o modelo e o próximo envio reabre o
 * processo com `--model` e `--resume`, continuando a mesma conversa.
 * `null` = não é comando do bloco; vai como mensagem normal.
 */
export function parseClaudeApiSlashCommand(text: string): ClaudeApiSlashCommand | null {
  const resume = /^\/resume(?:\s+(\S+))?\s*$/i.exec(text.trim())
  if (resume) return resume[1] ? { kind: 'resume-pick', target: resume[1] } : { kind: 'resume-list' }
  const match = /^\/model(?:\s+(.*))?$/i.exec(text.trim())
  if (!match) return null
  const value = (match[1] ?? '').trim()
  if (!value) return { kind: 'model-show' }
  if (/^(default|padr[aã]o)$/i.test(value)) return { kind: 'model-set', model: null }
  return MODEL_NAME.test(value) ? { kind: 'model-set', model: value } : { kind: 'model-invalid', value }
}

export function noticeAdded(
  state: ClaudeApiConversation,
  text: string,
  tone: 'info' | 'error' = 'info',
): ClaudeApiConversation {
  return push(state, { role: 'notice', text, tone })
}

/**
 * Conversa retomada pelo `/resume`: o histórico gravado pelo Claude Code vira
 * os itens do bloco, e o id passa a ser o da sessão escolhida (o próximo
 * envio abre com `--resume` nela). O gasto anterior não está no arquivo, então
 * o contador recomeça.
 */
export function conversationFromTranscript(
  entries: ClaudeApiTranscriptEntry[],
  claudeSessionId: string,
): ClaudeApiConversation {
  let state: ClaudeApiConversation = { ...createConversation(), claudeSessionId }
  for (const entry of entries) {
    if (entry.role === 'user') {
      const imageCount = typeof entry.images === 'number' && entry.images > 0 ? entry.images : undefined
      state = push(state, { role: 'user', text: clip(entry.text), ...(imageCount ? { imageCount } : {}) })
    } else if (entry.role === 'assistant') {
      state = applyClaudeApiEvent(state, { kind: 'assistant-message', messageId: null, blocks: [{ type: 'text', text: entry.text }] })
    } else if (entry.role === 'tool') {
      state = applyClaudeApiEvent(state, {
        kind: 'assistant-message',
        messageId: null,
        blocks: [{ type: 'tool_use', id: entry.toolUseId, name: entry.name, input: entry.input }],
      })
    } else {
      state = applyClaudeApiEvent(state, { kind: 'tool-result', toolUseId: entry.toolUseId, isError: entry.isError, text: entry.text })
    }
  }
  state = push(state, { role: 'notice', text: `Conversa ${claudeSessionId.slice(0, 8)} retomada. A próxima mensagem continua dela.`, tone: 'info' })
  return { ...state, status: 'idle' }
}

export function formatSessionList(
  sessions: { sessionId: string; updatedAt: string; firstPrompt: string; turns: number }[],
  currentId: string | null,
): string {
  if (sessions.length === 0) return 'Nenhuma conversa anterior desta conta neste projeto.'
  const lines = sessions.map((session, index) => {
    const date = new Date(session.updatedAt)
    const when = Number.isNaN(date.getTime()) ? session.updatedAt : date.toLocaleString('pt-BR')
    const mark = session.sessionId === currentId ? ' (atual)' : ''
    return `${index + 1}. ${when} · ${session.turns} msg · ${session.firstPrompt || '(sem texto)'}${mark}`
  })
  return `Conversas anteriores (use /resume <número>):\n${lines.join('\n')}`
}

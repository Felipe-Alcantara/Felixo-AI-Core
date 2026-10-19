/**
 * Guarda a conversa de cada bloco do Claude por chave de API fora do React.
 *
 * O canvas desmonta blocos fora da tela (`onlyRenderVisibleElements`), mas o
 * processo continua respondendo. Por isso os eventos chegam aqui, num ouvinte
 * único, e o bloco só lê (`useSyncExternalStore`). O CanvasView assina
 * `onPersist` para gravar a conversa no node mesmo com o bloco desmontado.
 */

import type { ClaudeApiBridge, ClaudeApiEvent, ClaudeApiStartParams } from '../../shared/types/claude-api'
import {
  applyClaudeApiEvent,
  createConversation,
  fromPersisted,
  permissionAnswered,
  sendFailed,
  toPersisted,
  userSent,
  type ClaudeApiConversation,
  type PersistedClaudeApiConversation,
} from './claude-api-conversation'

type Listener = () => void
type PersistListener = (sessionId: string, persisted: PersistedClaudeApiConversation) => void

export type ClaudeApiConversationStore = ReturnType<typeof createClaudeApiConversationStore>

export function createClaudeApiConversationStore(getBridge: () => ClaudeApiBridge | undefined) {
  const conversations = new Map<string, ClaudeApiConversation>()
  const listeners = new Set<Listener>()
  const persistListeners = new Set<PersistListener>()
  let unsubscribeBridge: (() => void) | null = null

  function emitChange(sessionId: string, persist = true) {
    for (const listener of listeners) listener()
    if (!persist) return
    const conversation = conversations.get(sessionId)
    if (!conversation) return
    const persisted = toPersisted(conversation)
    for (const listener of persistListeners) listener(sessionId, persisted)
  }

  function set(sessionId: string, next: ClaudeApiConversation, persist = true) {
    const previous = conversations.get(sessionId)
    if (previous === next) return
    conversations.set(sessionId, next)
    // Delta de texto muda a tela, mas não precisa ir ao banco a cada letra.
    const onlyStreaming =
      previous !== undefined &&
      previous.items === next.items &&
      previous.claudeSessionId === next.claudeSessionId &&
      previous.totalCostUsd === next.totalCostUsd
    emitChange(sessionId, persist && !onlyStreaming)
  }

  function ensureListening() {
    if (unsubscribeBridge) return
    const bridge = getBridge()
    if (!bridge?.onEvent) return
    unsubscribeBridge = bridge.onEvent(({ sessionId, event }) => {
      receive(sessionId, event)
    })
  }

  function receive(sessionId: string, event: ClaudeApiEvent) {
    const current = conversations.get(sessionId)
    if (!current) return
    set(sessionId, applyClaudeApiEvent(current, event))
  }

  function hydrate(sessionId: string, persisted: unknown) {
    ensureListening()
    if (conversations.has(sessionId)) return
    conversations.set(sessionId, fromPersisted(persisted))
  }

  function get(sessionId: string): ClaudeApiConversation {
    return conversations.get(sessionId) ?? EMPTY
  }

  async function send(
    sessionId: string,
    text: string,
    startParams: Omit<ClaudeApiStartParams, 'sessionId' | 'resumeSessionId'>,
    options: { context?: boolean } = {},
  ): Promise<boolean> {
    ensureListening()
    const bridge = getBridge()
    const current = conversations.get(sessionId) ?? createConversation()
    if (!bridge) {
      set(sessionId, sendFailed(current, 'Esta versão do app não tem o bloco de conversa do Claude.'))
      return false
    }
    set(sessionId, userSent(current, text, options))
    const started = await bridge.start({
      ...startParams,
      sessionId,
      ...(current.claudeSessionId ? { resumeSessionId: current.claudeSessionId } : {}),
    })
    if (!started.ok) {
      set(sessionId, sendFailed(get(sessionId), started.message ?? 'Não foi possível abrir a conversa.'))
      return false
    }
    const sent = await bridge.send({ sessionId, text })
    if (!sent.ok) {
      set(sessionId, sendFailed(get(sessionId), sent.message ?? 'Não foi possível enviar a mensagem.'))
      return false
    }
    return true
  }

  async function answerPermission(sessionId: string, requestId: string, allow: boolean) {
    const current = conversations.get(sessionId)
    const permission = current?.permissions.find((item) => item.requestId === requestId)
    if (!current || !permission) return
    set(sessionId, permissionAnswered(current, requestId, allow))
    const result = await getBridge()?.respondPermission({
      sessionId,
      requestId,
      allow,
      ...(allow ? { input: permission.input } : {}),
    })
    if (result && !result.ok && result.message) {
      set(sessionId, sendFailed(get(sessionId), result.message))
    }
  }

  async function interrupt(sessionId: string) {
    await getBridge()?.interrupt(sessionId)
  }

  /** Bloco removido do canvas: encerra o processo e esquece a conversa em memória. */
  function dispose(sessionId: string) {
    conversations.delete(sessionId)
    void getBridge()?.stop(sessionId)
    for (const listener of listeners) listener()
  }

  function subscribe(listener: Listener) {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }

  function onPersist(listener: PersistListener) {
    persistListeners.add(listener)
    return () => {
      persistListeners.delete(listener)
    }
  }

  function has(sessionId: string) {
    return conversations.has(sessionId)
  }

  return { hydrate, get, has, send, answerPermission, interrupt, dispose, subscribe, onPersist, receive }
}

const EMPTY = createConversation()

/** Instância do app. */
export const claudeApiConversations = createClaudeApiConversationStore(
  () => (typeof window !== 'undefined' ? window.felixo?.claudeApi : undefined),
)

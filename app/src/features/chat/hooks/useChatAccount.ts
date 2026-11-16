import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CHAT_ACCOUNT_STORAGE_KEY,
  chatProviderForCliType,
  effectiveChatAccount,
  readChatAccountSelection,
  type ChatAccountOption,
  type ChatAccountSelection,
} from '../services/chat-account'

function readStored(): ChatAccountSelection {
  try {
    return readChatAccountSelection(window.localStorage.getItem(CHAT_ACCOUNT_STORAGE_KEY))
  } catch {
    return { mode: 'system' }
  }
}

/**
 * Escolha de conta do chat, lembrada entre sessões, e as contas do provedor da
 * CLI selecionada. `notice` é o aviso do último envio (ex.: nenhuma conta da
 * cadeia apta, foi pelo Login do sistema).
 */
export function useChatAccount(cliType: string | null | undefined) {
  const providerId = chatProviderForCliType(cliType)
  const [selection, setSelectionState] = useState<ChatAccountSelection>(readStored)
  // As contas valem só para o provedor que as carregou: trocar de CLI não mostra as da anterior.
  const [loaded, setLoaded] = useState<{ providerId: string | null; accounts: ChatAccountOption[] }>({
    providerId: null,
    accounts: [],
  })
  const [chainEnabled, setChainEnabled] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const chainAvailable = Boolean(window.felixo?.accountChain)

  useEffect(() => {
    let alive = true
    const list = window.felixo?.cliAccounts?.list
    if (!providerId || !list) return undefined
    void list(providerId)
      .then((result) => {
        const accounts = result?.ok ? (result.accounts ?? []).map(({ id, label }) => ({ id, label })) : []
        if (alive) setLoaded({ providerId, accounts })
      })
      .catch(() => {
        if (alive) setLoaded({ providerId, accounts: [] })
      })
    return () => {
      alive = false
    }
  }, [providerId])
  const accounts = useMemo(
    () => (providerId && loaded.providerId === providerId ? loaded.accounts : []),
    [loaded, providerId],
  )

  useEffect(() => {
    const chain = window.felixo?.accountChain
    if (!chain) return undefined
    let alive = true
    void chain
      .getState()
      .then((state) => {
        if (alive) setChainEnabled(state.ok && state.settings.enabled === true)
      })
      .catch(() => {})
    const unsubscribe = chain.onChanged((state) => setChainEnabled(state.settings.enabled === true))
    return () => {
      alive = false
      unsubscribe()
    }
  }, [])

  const setSelection = useCallback((next: ChatAccountSelection) => {
    setSelectionState(next)
    setNotice(null)
    try {
      window.localStorage.setItem(CHAT_ACCOUNT_STORAGE_KEY, JSON.stringify(next))
    } catch {
      // Sem armazenamento, a escolha vale até fechar o app.
    }
  }, [])

  const effective = useMemo(() => effectiveChatAccount(selection, accounts), [selection, accounts])

  return { providerId, selection: effective, accounts, chainAvailable, chainEnabled, notice, setNotice, setSelection }
}

export type ChatAccount = ReturnType<typeof useChatAccount>

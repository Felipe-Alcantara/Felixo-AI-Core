import { useEffect, useState } from 'react'
import type { RepoBoardDetails } from '../services/notion-repo-board'

type NotionBridge = NonNullable<NonNullable<Window['felixo']>['notion']>

export type DetailsSourceTarget = { dataSourceId: string | null; databaseId: string | null }

export type DetailsSourceState = {
  details: RepoBoardDetails | null
  status: 'idle' | 'loading' | 'ready' | 'error'
  message: string | null
}

const IDLE: DetailsSourceState = { details: null, status: 'idle', message: null }

/**
 * Database de detalhes do Painel (a que a coluna de ligação das tarefas
 * aponta). Mesmo caminho das tarefas: mostra o snapshot local na hora e
 * revalida com o Notion; se a rede falhar e houver snapshot, fica com ele.
 * Recarrega quando o alvo muda, quando o Painel abre e a cada `refreshKey`.
 */
export function useNotionDetailsSource({
  api,
  connectionId,
  target,
  enabled,
  refreshKey,
}: {
  api: NotionBridge | undefined
  connectionId: string
  target: DetailsSourceTarget | null
  enabled: boolean
  refreshKey: number
}): DetailsSourceState {
  // `key` diz de qual alvo veio o estado: ao trocar de alvo, o que veio do
  // anterior some na hora em vez de enfeitar os cartões novos com links velhos.
  const [state, setState] = useState<DetailsSourceState & { key: string }>({ ...IDLE, key: '' })
  const dataSourceId = target?.dataSourceId || undefined
  const databaseId = target?.databaseId || undefined
  const key = `${connectionId}::${dataSourceId || ''}::${databaseId || ''}`
  const active = Boolean(enabled && api && connectionId && (dataSourceId || databaseId))

  useEffect(() => {
    if (!active || !api) return undefined
    let cancelled = false
    const input = { connectionId, dataSourceId, databaseId }

    const timer = window.setTimeout(() => {
      void (async () => {
        setState((current) => ({ ...(current.key === key ? current : IDLE), key, status: 'loading', message: null }))
        let cached: RepoBoardDetails | null = null
        try {
          const local = await api.getCachedTasks(input)
          if (cancelled) return
          if (local.ok && local.hasCache && local.tasks) {
            cached = { rows: local.tasks, schema: local.schema || {} }
            setState({ key, details: cached, status: 'loading', message: null })
          }
        } catch {
          // Snapshot local é atalho; sem ele a rede ainda responde.
        }

        try {
          const result = await api.listTasks(input)
          if (cancelled) return
          if (result.ok && result.tasks) {
            setState({ key, details: { rows: result.tasks, schema: result.schema || {} }, status: 'ready', message: null })
            return
          }
          setState({ key, details: cached, status: 'error', message: result.message || 'Não foi possível ler a database de detalhes.' })
        } catch (error) {
          if (cancelled) return
          setState({ key, details: cached, status: 'error', message: error instanceof Error ? error.message : 'Não foi possível ler a database de detalhes.' })
        }
      })()
    }, 0)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [active, api, connectionId, dataSourceId, databaseId, key, refreshKey])

  if (!active || state.key !== key) return active ? { ...IDLE, status: 'loading' } : IDLE
  return { details: state.details, status: state.status, message: state.message }
}

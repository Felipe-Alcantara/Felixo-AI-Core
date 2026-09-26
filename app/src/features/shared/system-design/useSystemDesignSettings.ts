import { useCallback, useEffect, useRef, useState } from 'react'

import { readSystemDesignDocument } from './system-design-document'
import { announceSystemDesignConfig, subscribeSystemDesignConfig } from './system-design-events'
import type {
  SystemDesignConfig,
  SystemDesignConfigChange,
  SystemDesignDocumentSummary,
} from './types'

/**
 * Placeholder de ANTES da primeira leitura — não é o default do produto.
 *
 * O default (e a precedência entre a fonte escolhida e ele) é resolvido só no
 * processo principal, em `electron/core/system-design-source.cjs`; antes havia
 * aqui um espelho dele que precisava ser mantido igual à mão. `loaded: false`
 * no estado indica que estes valores ainda não vieram de lá, e `repoUrl`
 * vazio impede qualquer tela de mostrar uma fonte que ninguém confirmou.
 */
export const UNLOADED_CONFIG: SystemDesignConfig = {
  schemaVersion: 0,
  enabled: true,
  repoUrl: '',
  branch: '',
  sourceMode: 'default',
  label: '',
  syncState: 'never-synced',
  delivered: null,
  lastSha: null,
  lastSyncedAt: null,
  lastError: null,
}

// Module-level flag so the auto-sync runs only once per app session even
// when the hook is mounted in multiple places (FelixoSettingsModal + ChatWorkspace).
let autoSyncTriggered = false

export type SystemDesignSettingsState = {
  config: SystemDesignConfig
  documents: SystemDesignDocumentSummary[]
  loaded: boolean
  syncing: boolean
  error: string | null
}

export function useSystemDesignSettings() {
  const [state, setState] = useState<SystemDesignSettingsState>({
    config: UNLOADED_CONFIG,
    documents: [],
    loaded: false,
    syncing: false,
    error: null,
  })
  const previousEnabledRef = useRef(false)
  const syncRef = useRef<() => Promise<void>>(async () => {})

  const refreshDocuments = useCallback(async () => {
    if (!window.felixo?.systemDesign?.listDocuments) {
      return
    }
    const result = await window.felixo.systemDesign.listDocuments()
    if (result.ok) {
      setState((current) => ({
        ...current,
        documents: result.documents ?? [],
      }))
    }
  }, [])

  const loadConfig = useCallback(async () => {
    if (!window.felixo?.systemDesign?.getConfig) {
      setState((current) => ({ ...current, loaded: true }))
      return
    }
    try {
      const result = await window.felixo.systemDesign.getConfig()
      const config = result.ok && result.config ? result.config : UNLOADED_CONFIG
      previousEnabledRef.current = config.enabled
      setState((current) => ({
        ...current,
        config,
        loaded: true,
        error: result.ok ? null : result.message ?? 'Falha ao carregar config.',
      }))
      if (result.ok && result.config) announceSystemDesignConfig(result.config)
      await refreshDocuments()

      // Once-per-session auto-sync when the toggle is enabled. Picks up new
      // commits without the user having to click "Sincronizar agora".
      // Module-level flag prevents duplicate syncs from multiple mount points.
      if (config.enabled && !autoSyncTriggered) {
        autoSyncTriggered = true
        void syncRef.current()
      }
    } catch (error) {
      setState((current) => ({
        ...current,
        loaded: true,
        error: error instanceof Error ? error.message : 'Falha desconhecida.',
      }))
    }
  }, [refreshDocuments])

  const sync = useCallback(async () => {
    if (!window.felixo?.systemDesign?.sync) {
      return
    }
    setState((current) => ({ ...current, syncing: true, error: null }))
    try {
      const result = await window.felixo.systemDesign.sync()
      if (result.ok && result.config) {
        setState((current) => ({
          ...current,
          config: result.config!,
          syncing: false,
          error: null,
        }))
        announceSystemDesignConfig(result.config)
        await refreshDocuments()
      } else {
        // A falha já foi gravada no processo principal (estado "usando o último
        // conteúdo"). Sem reler, esta tela continuaria dizendo "sincronizado".
        const fresh = await window.felixo.systemDesign.getConfig?.()
        setState((current) => ({
          ...current,
          config: fresh?.ok && fresh.config ? fresh.config : current.config,
          syncing: false,
          error: result.message ?? 'Falha no sync.',
        }))
        if (fresh?.ok && fresh.config) announceSystemDesignConfig(fresh.config)
      }
    } catch (error) {
      setState((current) => ({
        ...current,
        syncing: false,
        error: error instanceof Error ? error.message : 'Falha desconhecida.',
      }))
    }
  }, [refreshDocuments])

  const updateConfig = useCallback(
    async (change: SystemDesignConfigChange) => {
      if (!window.felixo?.systemDesign?.saveConfig) {
        return
      }
      const result = await window.felixo.systemDesign.saveConfig(change)
      if (!result.ok) {
        // O processo principal recusa o que não valida (ex.: URL inválida) sem
        // gravar nada — a pessoa precisa ver o motivo, não um botão que não fez nada.
        setState((current) => ({
          ...current,
          error: result.message ?? 'Não foi possível salvar a configuração.',
        }))
        return
      }
      if (result.config) {
        const wasEnabled = previousEnabledRef.current
        const willEnable = result.config.enabled
        previousEnabledRef.current = willEnable
        setState((current) => ({ ...current, config: result.config!, error: null }))
        announceSystemDesignConfig(result.config)
        // First time the user turns it on AND nothing has been synced yet → trigger sync.
        if (
          willEnable &&
          !wasEnabled &&
          (!result.config.lastSyncedAt || !result.config.lastSha)
        ) {
          autoSyncTriggered = true
          await sync()
        }
      }
    },
    [sync],
  )

  const resetCache = useCallback(async () => {
    if (!window.felixo?.systemDesign?.resetCache) {
      return
    }
    const result = await window.felixo.systemDesign.resetCache()
    if (result.ok && result.config) {
      previousEnabledRef.current = result.config.enabled
      setState((current) => ({
        ...current,
        config: result.config!,
        documents: [],
      }))
      announceSystemDesignConfig(result.config)
    }
  }, [])

  // O índice só traz o resumo de cada guia; o conteúdo é lido do cache local
  // quando a pessoa abre um item. Identidade estável: a prévia relê quando ela muda.
  const readDocument = useCallback(
    (documentPath: string) =>
      readSystemDesignDocument(window.felixo?.systemDesign, documentPath),
    [],
  )

  useEffect(() => {
    syncRef.current = sync
  }, [sync])

  // Outra instância deste hook (o painel do canvas e o modal do chat montam
  // cada uma a sua) pode ter mudado a configuração. Sem escutar o aviso, esta
  // tela continuaria mostrando a fonte e o estado de antes.
  useEffect(
    () =>
      subscribeSystemDesignConfig((incoming) => {
        previousEnabledRef.current = incoming.enabled
        setState((current) =>
          JSON.stringify(current.config) === JSON.stringify(incoming)
            ? current
            : { ...current, config: incoming },
        )
      }),
    [],
  )

  useEffect(() => {
    void loadConfig()
  }, [loadConfig])

  return {
    state,
    sync,
    updateConfig,
    resetCache,
    refreshDocuments,
    readDocument,
  }
}

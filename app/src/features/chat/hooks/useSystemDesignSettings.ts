import { useCallback, useEffect, useRef, useState } from 'react'

import type { SystemDesignConfig, SystemDesignDocumentSummary } from '../types'

const DEFAULT_CONFIG: SystemDesignConfig = {
  // Mirror of defaultConfig() in system-design-ipc-handlers.cjs.
  // Enabled by default so new users benefit from Felixo System Design without
  // needing to discover the toggle.
  enabled: true,
  repoUrl: 'https://github.com/Felipe-Alcantara/Felixo-System-Design.git',
  branch: 'main',
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
    config: DEFAULT_CONFIG,
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
      const config = result.ok && result.config ? result.config : DEFAULT_CONFIG
      previousEnabledRef.current = config.enabled
      setState((current) => ({
        ...current,
        config,
        loaded: true,
        error: result.ok ? null : result.message ?? 'Falha ao carregar config.',
      }))
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
        await refreshDocuments()
      } else {
        setState((current) => ({
          ...current,
          syncing: false,
          error: result.message ?? 'Falha no sync.',
        }))
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
    async (partial: Partial<SystemDesignConfig>) => {
      if (!window.felixo?.systemDesign?.saveConfig) {
        return
      }
      const result = await window.felixo.systemDesign.saveConfig(partial)
      if (result.ok && result.config) {
        const wasEnabled = previousEnabledRef.current
        const willEnable = result.config.enabled
        previousEnabledRef.current = willEnable
        setState((current) => ({ ...current, config: result.config! }))
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
    }
  }, [])

  useEffect(() => {
    syncRef.current = sync
  }, [sync])

  useEffect(() => {
    void loadConfig()
  }, [loadConfig])

  return {
    state,
    sync,
    updateConfig,
    resetCache,
    refreshDocuments,
  }
}

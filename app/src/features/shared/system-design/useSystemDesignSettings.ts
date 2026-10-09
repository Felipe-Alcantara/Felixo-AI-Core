import { useCallback, useEffect, useRef, useState } from 'react'

import { readSystemDesignDocument } from './system-design-document'
import { announceSystemDesignConfig, subscribeSystemDesignConfig } from './system-design-events'
import { runAutomaticSync } from './system-design-sync'
import type {
  SystemDesignConfig,
  SystemDesignConfigChange,
  SystemDesignDocumentSummary,
  SystemDesignGuide,
  SystemDesignGuideInput,
  SystemDesignSyncResult,
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
  guides: [],
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
  /** Índice do primeiro guia (forma de antes; o chat e telas antigas leem este). */
  documents: SystemDesignDocumentSummary[]
  /** Índice de cada guia da camada do usuário, pela chave do guia. */
  documentsByGuide: Record<string, SystemDesignDocumentSummary[]>
  loaded: boolean
  syncing: boolean
  error: string | null
}

export function useSystemDesignSettings() {
  const [state, setState] = useState<SystemDesignSettingsState>({
    config: UNLOADED_CONFIG,
    documents: [],
    documentsByGuide: {},
    loaded: false,
    syncing: false,
    error: null,
  })
  const previousEnabledRef = useRef(false)
  const syncRef = useRef<(options?: { interactive?: boolean }) => Promise<void>>(async () => {})

  // Um índice por guia: com a lista de guias, cada fonte tem o seu.
  const refreshDocuments = useCallback(async (guides?: SystemDesignGuide[]) => {
    const bridge = window.felixo?.systemDesign
    if (!bridge?.listDocuments) {
      return
    }
    const keys = (guides ?? []).map((guide) => guide.key)
    if (!keys.length) {
      const result = await bridge.listDocuments()
      if (result.ok) {
        setState((current) => ({ ...current, documents: result.documents ?? [] }))
      }
      return
    }
    const entries = await Promise.all(
      keys.map(async (key) => {
        const result = await bridge.listDocuments({ guideKey: key })
        return [key, result.ok ? result.documents ?? [] : []] as const
      }),
    )
    const documentsByGuide = Object.fromEntries(entries)
    setState((current) => ({
      ...current,
      documents: documentsByGuide[keys[0]] ?? [],
      documentsByGuide,
    }))
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
      await refreshDocuments(config.guides)

      // Once-per-session auto-sync when the toggle is enabled. Picks up new
      // commits without the user having to click "Sincronizar agora".
      // Module-level flag prevents duplicate syncs from multiple mount points.
      if (config.enabled && !autoSyncTriggered) {
        autoSyncTriggered = true
        // A da sessão é automática: o Git não pode pedir login (ver
        // system-design-sync.ts); um guia que pede vira aviso na tela.
        void syncRef.current({ interactive: false })
      }
    } catch (error) {
      setState((current) => ({
        ...current,
        loaded: true,
        error: error instanceof Error ? error.message : 'Falha desconhecida.',
      }))
    }
  }, [refreshDocuments])

  /**
   * Por padrão é um clique da pessoa (Sincronizar, trocar a lista, voltar ao
   * padrão, ligar): o Git pode abrir a janela de login. `interactive: false` é
   * a sincronização automática da sessão.
   */
  const sync = useCallback(async ({ interactive = true }: { interactive?: boolean } = {}) => {
    const bridge = window.felixo?.systemDesign
    if (!bridge?.sync) {
      return
    }
    setState((current) => ({ ...current, syncing: true, error: null }))
    try {
      const result: SystemDesignSyncResult | null = interactive
        ? await bridge.sync({ interactive: true })
        : await runAutomaticSync()
      if (!result) {
        setState((current) => ({ ...current, syncing: false }))
        return
      }
      if (result.ok && result.config) {
        setState((current) => ({
          ...current,
          config: result.config!,
          syncing: false,
          error: null,
        }))
        announceSystemDesignConfig(result.config)
        await refreshDocuments(result.config.guides)
      } else {
        // A falha já foi gravada no processo principal (estado "usando o último
        // conteúdo"). Sem reler, esta tela continuaria dizendo "sincronizado".
        const fresh = await bridge.getConfig?.()
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

  /**
   * Troca a lista de guias da pessoa (vazia = padrão do app) e sincroniza: um
   * guia novo só tem índice depois da primeira sincronização.
   */
  const replaceGuides = useCallback(
    async (guides: SystemDesignGuideInput[]) => {
      const result = await window.felixo?.systemDesign?.saveConfig?.({ guides })
      if (!result) return { ok: false, message: 'Indisponível fora do app desktop.' }
      if (!result.ok || !result.config) {
        setState((current) => ({ ...current, error: result.message ?? 'Não foi possível salvar os guias.' }))
        return { ok: false, message: result.message }
      }
      previousEnabledRef.current = result.config.enabled
      setState((current) => ({ ...current, config: result.config!, error: null }))
      announceSystemDesignConfig(result.config)
      await sync()
      return { ok: true }
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
        documentsByGuide: {},
      }))
      announceSystemDesignConfig(result.config)
    }
  }, [])

  // O índice só traz o resumo de cada guia; o conteúdo é lido do cache local
  // quando a pessoa abre um item. Identidade estável: a prévia relê quando ela muda.
  const readDocument = useCallback(
    (documentPath: string, guideKey?: string) =>
      readSystemDesignDocument(window.felixo?.systemDesign, documentPath, guideKey),
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
    replaceGuides,
    resetCache,
    refreshDocuments,
    readDocument,
  }
}

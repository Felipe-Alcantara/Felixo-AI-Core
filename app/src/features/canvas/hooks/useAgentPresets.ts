import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  NATIVE_PRESETS,
  duplicatePresetName,
  normalizePreset,
  type AgentPreset,
} from '../services/agent-preset'

function newPresetId(): string {
  return `preset-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Presets de agente: os nativos (no código) + os da pessoa (SQLite pelo
 * `window.felixo.agentPresets`). Sem a ponte (preview web) os da pessoa ficam
 * só em memória — o formulário continua funcionando, só não persiste.
 */
export function useAgentPresets() {
  const [custom, setCustom] = useState<AgentPreset[]>([])
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    void window.felixo?.agentPresets?.list().then((result) => {
      if (!mountedRef.current || !result?.ok) return
      // Uma linha que a versão atual não consegue reconstruir some da lista,
      // em vez de derrubar o formulário.
      setCustom(
        (result.presets ?? [])
          .map((item) => normalizePreset(item))
          .filter((item): item is AgentPreset => item !== null && !item.native),
      )
    })
    return () => {
      mountedRef.current = false
    }
  }, [])

  const presets = useMemo(() => [...NATIVE_PRESETS, ...custom], [custom])

  const save = useCallback(async (preset: AgentPreset): Promise<AgentPreset | null> => {
    const normalized = normalizePreset({ ...preset, native: false })
    if (!normalized) {
      setError('O preset está incompleto.')
      return null
    }
    const bridge = window.felixo?.agentPresets
    if (bridge) {
      const result = await bridge.save(normalized)
      if (!result?.ok) {
        setError(result?.message ?? 'Não foi possível salvar o preset.')
        return null
      }
    }
    setError(null)
    setCustom((current) => [...current.filter((item) => item.id !== normalized.id), normalized])
    return normalized
  }, [])

  const create = useCallback(
    (draft: Omit<AgentPreset, 'id' | 'native'>) => save({ ...draft, id: newPresetId() }),
    [save],
  )

  const duplicate = useCallback(
    (preset: AgentPreset) =>
      save({
        ...preset,
        id: newPresetId(),
        native: undefined,
        name: duplicatePresetName(preset.name, presets.map((item) => item.name)),
      }),
    [presets, save],
  )

  const remove = useCallback(async (presetId: string): Promise<boolean> => {
    if (presetId.startsWith('native:')) return false
    const bridge = window.felixo?.agentPresets
    if (bridge) {
      const result = await bridge.delete(presetId)
      if (!result?.ok) {
        setError(result?.message ?? 'Não foi possível excluir o preset.')
        return false
      }
    }
    setError(null)
    setCustom((current) => current.filter((item) => item.id !== presetId))
    return true
  }, [])

  return { presets, create, duplicate, remove, error }
}

export type AgentPresets = ReturnType<typeof useAgentPresets>

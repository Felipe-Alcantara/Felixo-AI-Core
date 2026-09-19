import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  NATIVE_PRESETS,
  duplicatePresetName,
  normalizePreset,
  parsePresetFile,
  type AgentPreset,
} from '../services/agent-preset'

/** Avisa outras instâncias do hook (o formulário de spawn) que a lista mudou. */
const PRESETS_CHANGED_EVENT = 'felixo:agent-presets-changed'

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

  const load = useCallback(() => {
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
  }, [])

  useEffect(() => {
    mountedRef.current = true
    load()
    // Editar na tela de presets e abrir o formulário de spawn são instâncias
    // separadas deste hook: sem o aviso, o formulário mostraria a lista velha.
    window.addEventListener(PRESETS_CHANGED_EVENT, load)
    return () => {
      mountedRef.current = false
      window.removeEventListener(PRESETS_CHANGED_EVENT, load)
    }
  }, [load])

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
    window.dispatchEvent(new Event(PRESETS_CHANGED_EVENT))
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
    window.dispatchEvent(new Event(PRESETS_CHANGED_EVENT))
    return true
  }, [])

  /**
   * Importa o texto de um arquivo de preset: valida o formato/versão, dá outro
   * id e, se o nome já existe, numera como cópia. Nunca sobrescreve um preset.
   */
  const importFromText = useCallback(
    async (content: string): Promise<{ ok: true; preset: AgentPreset } | { ok: false; message: string }> => {
      const parsed = parsePresetFile(content, newPresetId())
      if (!parsed.ok) return parsed
      const names = presets.map((item) => item.name)
      const name = names.some((item) => item.toLowerCase() === parsed.preset.name.toLowerCase())
        ? duplicatePresetName(parsed.preset.name, names)
        : parsed.preset.name
      const saved = await save({ ...parsed.preset, name })
      return saved
        ? { ok: true, preset: saved }
        : { ok: false, message: 'Não foi possível salvar o preset importado.' }
    },
    [presets, save],
  )

  return { presets, create, save, duplicate, remove, importFromText, error }
}

export type AgentPresets = ReturnType<typeof useAgentPresets>

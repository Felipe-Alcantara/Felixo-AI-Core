import { useCallback, useEffect, useState } from 'react'
import { resultadoDeIpc } from '../../../shared/ipc/ipc-result'
import { LayoutList, Trash2 } from 'lucide-react'
import { CanvasPanel } from './CanvasPanel'

type CanvasModel = {
  id: string
  name: string
  command: string
  source: string
  cliType: string
}

type ModelsPanelProps = {
  onClose: () => void
  /** Widens the toolbar column; the panel slides over to clear it. */
  toolsMenuOpen?: boolean
}

/**
 * Canvas-side models list — surfaces the configured models and lets you remove
 * one, reading/writing straight through IPC. Creation stays in the chat's
 * richer config flow; here we keep it read + delete.
 */
export function ModelsPanel({ onClose, toolsMenuOpen }: ModelsPanelProps) {
  const [models, setModels] = useState<CanvasModel[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void resultadoDeIpc(() => window.felixo?.models?.list(), 'Não foi possível carregar os modelos.').then((outcome) => {
      if (cancelled) return
      if (outcome.ok && Array.isArray(outcome.value.models)) {
        setModels(outcome.value.models as CanvasModel[])
      } else {
        // Falha ao listar não é "nenhum modelo configurado".
        setError(outcome.ok ? 'Não foi possível carregar os modelos.' : outcome.message)
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  const removeModel = useCallback(async (modelId: string) => {
    const removed = await resultadoDeIpc(() => window.felixo?.models?.delete(modelId), 'Não foi possível remover o modelo.')
    if (!removed.ok) {
      setError(removed.message)
      return
    }
    const listed = await resultadoDeIpc(() => window.felixo?.models?.list(), 'O modelo foi removido, mas a lista não recarregou.')
    if (listed.ok && Array.isArray(listed.value.models)) {
      setModels(listed.value.models as CanvasModel[])
      setError(null)
    } else {
      setError(listed.ok ? 'O modelo foi removido, mas a lista não recarregou.' : listed.message)
    }
  }, [])

  return (
    <CanvasPanel
      title="Modelos"
      panelId="models"
      icon={<LayoutList size={15} />}
      onClose={onClose}
      toolsMenuOpen={toolsMenuOpen}
    >
      {error && (
        <p role="alert" className="mb-2 text-xs text-theme-error">
          {error}
        </p>
      )}
      {models.length === 0 ? (
        <p className="text-sm text-zinc-500">{error ? 'Lista de modelos indisponível.' : 'Nenhum modelo configurado.'}</p>
      ) : (
        <ul className="felixo-anim-stagger-list flex flex-col gap-1">
          {models.map((model) => (
            <li
              key={model.id}
              className="flex items-center gap-2 rounded-sm bg-zinc-800/60 px-2 py-1.5"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-zinc-100">{model.name}</div>
                <div className="truncate text-xs text-zinc-500">
                  {model.cliType} · {model.command}
                </div>
              </div>
              <button
                type="button"
                onClick={() => void removeModel(model.id)}
                className="felixo-btn-icon rounded-sm p-1 text-zinc-400 hover:bg-white/10 hover:text-theme-error"
                aria-label={`Remover ${model.name}`}
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </CanvasPanel>
  )
}

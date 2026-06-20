import { useCallback, useEffect, useState } from 'react'
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
}

/**
 * Canvas-side models list — surfaces the configured models and lets you remove
 * one, reading/writing straight through IPC. Creation stays in the chat's
 * richer config flow; here we keep it read + delete.
 */
export function ModelsPanel({ onClose }: ModelsPanelProps) {
  const [models, setModels] = useState<CanvasModel[]>([])

  useEffect(() => {
    let cancelled = false
    void window.felixo?.models?.list().then((result) => {
      if (!cancelled && result?.ok && Array.isArray(result.models)) {
        setModels(result.models as CanvasModel[])
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  const removeModel = useCallback(async (modelId: string) => {
    await window.felixo?.models?.delete(modelId)
    const result = await window.felixo?.models?.list()
    if (result?.ok && Array.isArray(result.models)) {
      setModels(result.models as CanvasModel[])
    }
  }, [])

  return (
    <CanvasPanel title="Modelos" icon={<LayoutList size={15} />} onClose={onClose}>
      {models.length === 0 ? (
        <p className="text-sm text-zinc-500">Nenhum modelo configurado.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {models.map((model) => (
            <li
              key={model.id}
              className="flex items-center gap-2 rounded bg-zinc-800/60 px-2 py-1.5"
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
                className="rounded p-1 text-zinc-400 hover:bg-white/10 hover:text-red-400"
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

import { useEffect, useState } from 'react'
import { RotateCcw, Save, Settings } from 'lucide-react'
import { CanvasPanel } from './CanvasPanel'
import { DEFAULT_FILE_LINK_PROMPT } from '../../services/file-link-prompt'

type SettingsPanelProps = {
  onClose: () => void
  /** Lets the canvas pick up the new prompt without a reload. */
  onPromptSaved?: (prompt: string) => void
}

/**
 * Canvas settings — currently the editable instruction injected into a terminal
 * when a file block is linked to it (the "living plan" protocol). Supports the
 * {{path}} and {{agent}} placeholders.
 */
export function SettingsPanel({ onClose, onPromptSaved }: SettingsPanelProps) {
  const [prompt, setPrompt] = useState(DEFAULT_FILE_LINK_PROMPT)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let cancelled = false
    void window.felixo?.canvas?.getFileLinkPrompt().then((result) => {
      if (!cancelled && result?.ok && typeof result.prompt === 'string' && result.prompt.trim()) {
        setPrompt(result.prompt)
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  const save = async () => {
    await window.felixo?.canvas?.setFileLinkPrompt(prompt)
    onPromptSaved?.(prompt)
    setSaved(true)
    window.setTimeout(() => setSaved(false), 1500)
  }

  return (
    <CanvasPanel title="Configuracoes" icon={<Settings size={15} />} onClose={onClose}>
      <label className="mb-1 block text-xs font-medium text-zinc-400">
        Instrucao ao ligar arquivo a um terminal
      </label>
      <p className="mb-2 text-xs text-zinc-500">
        Enviada ao terminal quando voce conecta um bloco de arquivo. Use{' '}
        <code className="text-zinc-300">{'{{path}}'}</code> para o caminho e{' '}
        <code className="text-zinc-300">{'{{agent}}'}</code> para o agente.
      </p>

      <textarea
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        rows={12}
        className="mb-2 w-full resize-y rounded bg-zinc-800/60 p-2 font-mono text-xs text-zinc-200 outline-none"
      />

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void save()}
          className="flex flex-1 items-center justify-center gap-2 rounded bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-600"
        >
          <Save size={14} />
          {saved ? 'Salvo' : 'Salvar'}
        </button>
        <button
          type="button"
          onClick={() => setPrompt(DEFAULT_FILE_LINK_PROMPT)}
          className="flex items-center justify-center gap-2 rounded bg-zinc-700 px-3 py-1.5 text-sm text-zinc-100 hover:bg-zinc-600"
          title="Restaurar o texto padrao"
        >
          <RotateCcw size={14} />
          Padrao
        </button>
      </div>
    </CanvasPanel>
  )
}

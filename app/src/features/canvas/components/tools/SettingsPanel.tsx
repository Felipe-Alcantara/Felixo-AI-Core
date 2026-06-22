import { useEffect, useState, type ReactNode } from 'react'
import { RotateCcw, Save, Settings } from 'lucide-react'
import { CanvasPanel } from './CanvasPanel'
import {
  DEFAULT_FILE_LINK_PROMPT,
  DEFAULT_FILE_BOOTSTRAP_PROMPT,
} from '../../services/file-link-prompt'
import { DEFAULT_QUALITY_STANDARD_PROMPT } from '../../services/quality-standard-prompt'

type SettingsPanelProps = {
  onClose: () => void
  /** Lets the canvas pick up the new "living plan" prompt without a reload. */
  onPromptSaved?: (prompt: string) => void
  /** Lets the canvas pick up the new bootstrap prompt without a reload. */
  onBootstrapSaved?: (prompt: string) => void
  /** Lets the canvas pick up the quality-standard text/toggle without a reload. */
  onQualityStandardSaved?: (value: { prompt: string; enabled: boolean }) => void
}

/**
 * Canvas settings — the editable instructions injected when a file block links
 * to a terminal: the normal "living plan" prompt, and the bootstrap prompt used
 * when a repo terminal links an empty .md. Both support {{path}} and {{agent}}.
 */
export function SettingsPanel({
  onClose,
  onPromptSaved,
  onBootstrapSaved,
  onQualityStandardSaved,
}: SettingsPanelProps) {
  return (
    <CanvasPanel title="Configurações" icon={<Settings size={15} />} onClose={onClose}>
      <QualityStandardField onSaved={onQualityStandardSaved} />

      <div className="my-3 border-t border-white/10" />

      <PromptField
        label="Instrução ao ligar arquivo a um terminal"
        help={
          <>
            Enviada ao conectar um bloco de arquivo (com conteúdo) a um terminal.
          </>
        }
        defaultValue={DEFAULT_FILE_LINK_PROMPT}
        load={() => window.felixo?.canvas?.getFileLinkPrompt()}
        persist={(value) => window.felixo?.canvas?.setFileLinkPrompt(value)}
        onSaved={onPromptSaved}
      />

      <div className="my-3 border-t border-white/10" />

      <PromptField
        label="Instrução de bootstrap (repo + arquivo vazio)"
        help={
          <>
            Exceção: quando o terminal está em um projeto e o .md está vazio, o
            agente analisa o repositório e escreve o plano de evolução.
          </>
        }
        defaultValue={DEFAULT_FILE_BOOTSTRAP_PROMPT}
        load={() => window.felixo?.canvas?.getFileBootstrapPrompt?.()}
        persist={(value) => window.felixo?.canvas?.setFileBootstrapPrompt?.(value)}
        onSaved={onBootstrapSaved}
      />
    </CanvasPanel>
  )
}

type PromptFieldProps = {
  label: string
  help: ReactNode
  defaultValue: string
  load: () => Promise<{ ok: boolean; prompt?: string | null }> | undefined
  persist: (value: string) => Promise<unknown> | undefined
  onSaved?: (value: string) => void
}

function PromptField({
  label,
  help,
  defaultValue,
  load,
  persist,
  onSaved,
}: PromptFieldProps) {
  const [value, setValue] = useState(defaultValue)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let cancelled = false
    void load()?.then((result) => {
      if (
        !cancelled &&
        result?.ok &&
        typeof result.prompt === 'string' &&
        result.prompt.trim()
      ) {
        setValue(result.prompt)
      }
    })
    return () => {
      cancelled = true
    }
    // load/persist are stable inline closures over the bridge; intentional.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const save = async () => {
    await persist(value)
    onSaved?.(value)
    setSaved(true)
    window.setTimeout(() => setSaved(false), 1500)
  }

  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-zinc-400">{label}</label>
      <p className="mb-2 text-xs text-zinc-500">
        {help} Use <code className="text-zinc-300">{'{{path}}'}</code> e{' '}
        <code className="text-zinc-300">{'{{agent}}'}</code>.
      </p>
      <textarea
        value={value}
        onChange={(event) => setValue(event.target.value)}
        rows={10}
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
          onClick={() => setValue(defaultValue)}
          className="flex items-center justify-center gap-2 rounded bg-zinc-700 px-3 py-1.5 text-sm text-zinc-100 hover:bg-zinc-600"
          title="Restaurar o texto padrão"
        >
          <RotateCcw size={14} />
          Padrão
        </button>
      </div>
    </div>
  )
}

function QualityStandardField({
  onSaved,
}: {
  onSaved?: (value: { prompt: string; enabled: boolean }) => void
}) {
  const [prompt, setPrompt] = useState(DEFAULT_QUALITY_STANDARD_PROMPT)
  const [enabled, setEnabled] = useState(true)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let cancelled = false
    void window.felixo?.canvas?.getQualityStandard?.().then((result) => {
      if (!cancelled && result?.ok) {
        if (typeof result.prompt === 'string' && result.prompt.trim()) {
          setPrompt(result.prompt)
        }
        setEnabled(result.enabled !== false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  const save = async () => {
    await window.felixo?.canvas?.setQualityStandard?.({ prompt, enabled })
    onSaved?.({ prompt, enabled })
    setSaved(true)
    window.setTimeout(() => setSaved(false), 1500)
  }

  return (
    <div>
      <label className="mb-1 flex items-center gap-2 text-xs font-medium text-zinc-400">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => setEnabled(event.target.checked)}
          className="accent-emerald-600"
        />
        Sempre lembrar o agente do padrão de qualidade
      </label>
      <p className="mb-2 text-xs text-zinc-500">
        Enviada ao abrir um terminal com um agente (Claude/Gemini/Codex),
        independente do prompt. Não é enviada para um shell puro.
      </p>
      <textarea
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        rows={6}
        disabled={!enabled}
        className="mb-2 w-full resize-y rounded bg-zinc-800/60 p-2 font-mono text-xs text-zinc-200 outline-none disabled:opacity-50"
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
          onClick={() => setPrompt(DEFAULT_QUALITY_STANDARD_PROMPT)}
          className="flex items-center justify-center gap-2 rounded bg-zinc-700 px-3 py-1.5 text-sm text-zinc-100 hover:bg-zinc-600"
          title="Restaurar o texto padrão"
        >
          <RotateCcw size={14} />
          Padrão
        </button>
      </div>
    </div>
  )
}

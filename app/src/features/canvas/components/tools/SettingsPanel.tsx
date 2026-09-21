import { useEffect, useState, type ReactNode } from 'react'
import { CircleAlert, Palette, RotateCcw, Save, Settings } from 'lucide-react'
import { CanvasPanel } from './CanvasPanel'
import { useReducedMotionPreference } from '../../../shared/accessibility/reduced-motion-preference'
import {
  DEFAULT_FILE_LINK_PROMPT,
  DEFAULT_FILE_BOOTSTRAP_PROMPT,
} from '../../services/file-link-prompt'
import {
  buildDefaultQualityStandardPrompt,
  isCustomizedQualityStandardPrompt,
  qualityStandardSourceFrom,
  type QualityStandardSource,
} from '../../services/quality-standard-prompt'
import { subscribeSystemDesignConfig } from '../../../shared/system-design/system-design-events'
import { AutoStartSection } from '../../../shared/autostart/AutoStartSection'
import { GraphicsRecoverySection } from '../../../shared/graphics/GraphicsRecoverySection'
import { PerformanceModeSection } from '../../../shared/performance/PerformanceModeSection'
import { DictationSettingsSection } from './DictationSettingsSection'
import { ClaudeTerminalScrollSection } from './ClaudeTerminalScrollSection'
import { SystemDesignSettingsSection } from '../../../shared/system-design/SystemDesignSettingsSection'
import { FelixoSelect, type FelixoSelectOption } from '../../../shared/components/FelixoSelect'
import { useAppTheme } from '../../../shared/theme/theme-context'
import type { AppTheme } from '../../../shared/theme/theme-storage'

const THEME_OPTIONS: FelixoSelectOption[] = [
  { value: 'dark', label: 'Escuro' },
  { value: 'high_contrast', label: 'Alto contraste' },
]

type SettingsPanelProps = {
  onClose: () => void
  /** Lets the canvas pick up the new shared-scratchpad prompt without a reload. */
  onPromptSaved?: (prompt: string) => void
  /** Lets the canvas pick up the new bootstrap prompt without a reload. */
  onBootstrapSaved?: (prompt: string) => void
  /** Lets the canvas pick up the quality-standard text/toggle without a reload. */
  onQualityStandardSaved?: (value: { prompt: string; enabled: boolean }) => void
  /** Widens the toolbar column; the panel slides over to clear it. */
  toolsMenuOpen?: boolean
}

/**
 * Canvas settings — the editable instructions injected when a file block links
 * to a terminal: the normal shared-scratchpad prompt, and the bootstrap prompt
 * used when a repo terminal links an empty .md (the agent then diagnoses the
 * repo into the scratchpad). Both support {{path}} and {{agent}}.
 */
export function SettingsPanel({
  onClose,
  onPromptSaved,
  onBootstrapSaved,
  onQualityStandardSaved,
  toolsMenuOpen,
}: SettingsPanelProps) {
  const prefersReducedMotion = useReducedMotionPreference()

  return (
    <CanvasPanel
      title="Configurações"
      panelId="settings"
      icon={<Settings size={15} />}
      onClose={onClose}
      toolsMenuOpen={toolsMenuOpen}
    >
      {prefersReducedMotion && <ReducedMotionNotice />}

      <ThemeField />

      <div className="my-3 border-t border-white/10" />

      <PerformanceModeSection />

      <div className="my-3 border-t border-white/10" />

      <GraphicsRecoverySection />

      <div className="my-3 border-t border-white/10" />

      <AutoStartSection />

      <div className="my-3 border-t border-white/10" />

      <DictationSettingsSection />

      <div className="my-3 border-t border-white/10" />

      <ClaudeTerminalScrollSection />

      <div className="my-3 border-t border-white/10" />

      {/* Sincroniza os guias do Felixo System Design — antes só existia dentro
          das configurações do chat. */}
      <SystemDesignSettingsSection />

      <div className="my-3 border-t border-white/10" />

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
            agente analisa o repositório e escreve um diagnóstico (problemas,
            incompleto, auxiliares, melhorias) no scratchpad.
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

/**
 * Escolha do tema. Estava só na tela de chat, então quem trabalha no canvas
 * não tinha como sair do escuro nem ligar o alto contraste.
 */
function ThemeField() {
  const { theme, setTheme } = useAppTheme()

  return (
    <div className="block text-xs text-zinc-400">
      <span className="mb-1 flex items-center gap-1.5 text-zinc-300">
        <Palette size={13} aria-hidden="true" />
        Tema
      </span>
      <FelixoSelect
        value={theme}
        options={THEME_OPTIONS}
        onChange={(value) => setTheme(value as AppTheme)}
        aria-label="Tema"
      />
    </div>
  )
}

function ReducedMotionNotice() {
  return (
    <div
      role="status"
      className="mb-3 rounded border border-white/10 bg-[color-mix(in_srgb,var(--f-core-white)_8%,transparent)] p-2.5 text-xs leading-relaxed text-[var(--f-core-white)]/90"
    >
      <div className="flex gap-2">
        <CircleAlert className="mt-0.5 shrink-0 text-[var(--f-core-white-soft)]" size={15} />
        <div>
          <p className="font-medium text-[var(--f-core-white)]">As animações estão desligadas pelo sistema.</p>
          <p className="mt-1 text-[var(--f-core-white)]/75">
            Isso não é um defeito: o Felixo respeita a preferência de movimento
            reduzido do seu sistema.
          </p>
          <p className="mt-1 text-[var(--f-core-white)]/75">
            No Windows, ajuste em Configurações → Acessibilidade → Efeitos visuais
            → Efeitos de animação.
          </p>
        </div>
      </div>
    </div>
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
          className="felixo-btn flex flex-1 items-center justify-center gap-2 rounded felixo-primary-action px-3 py-1.5 text-sm font-medium text-white hover:bg-white/[0.16]"
        >
          <Save size={14} />
          {saved ? 'Salvo' : 'Salvar'}
        </button>
        <button
          type="button"
          onClick={() => setValue(defaultValue)}
          className="felixo-btn flex items-center justify-center gap-2 rounded bg-zinc-700 px-3 py-1.5 text-sm text-zinc-100 hover:bg-zinc-600"
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
  // `customText === null` significa "sem personalização": o texto mostrado é o
  // padrão da fonte de System Design que vale agora, e o que se grava é vazio.
  // Antes o painel gravava o padrão intocado como se fosse texto da pessoa, e
  // ele ficava congelado com a fonte do dia em que foi salvo.
  const [customText, setCustomText] = useState<string | null>(null)
  const [source, setSource] = useState<QualityStandardSource | null>(null)
  const [enabled, setEnabled] = useState(true)
  const [saved, setSaved] = useState(false)
  const defaultPrompt = buildDefaultQualityStandardPrompt(source)
  const prompt = customText ?? defaultPrompt

  useEffect(() => {
    let cancelled = false
    void Promise.all([
      window.felixo?.canvas?.getQualityStandard?.(),
      window.felixo?.systemDesign?.getConfig?.(),
    ]).then(([quality, systemDesign]) => {
      if (cancelled) return
      const currentSource = systemDesign?.ok
        ? qualityStandardSourceFrom(systemDesign.config)
        : null
      setSource(currentSource)
      if (quality?.ok) {
        setCustomText(
          isCustomizedQualityStandardPrompt(quality.prompt, currentSource)
            ? (quality.prompt as string)
            : null,
        )
        setEnabled(quality.enabled !== false)
      }
    })
    const unsubscribe = subscribeSystemDesignConfig((config) => {
      setSource(qualityStandardSourceFrom(config))
    })
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  const save = async () => {
    const toStore = customText ?? ''
    await window.felixo?.canvas?.setQualityStandard?.({ prompt: toStore, enabled })
    onSaved?.({ prompt: toStore, enabled })
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
        onChange={(event) =>
          setCustomText(
            event.target.value.trim() === defaultPrompt.trim() ? null : event.target.value,
          )
        }
        rows={6}
        disabled={!enabled}
        className="mb-2 w-full resize-y rounded bg-zinc-800/60 p-2 font-mono text-xs text-zinc-200 outline-none disabled:opacity-50"
      />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void save()}
          className="felixo-btn flex flex-1 items-center justify-center gap-2 rounded felixo-primary-action px-3 py-1.5 text-sm font-medium text-white hover:bg-white/[0.16]"
        >
          <Save size={14} />
          {saved ? 'Salvo' : 'Salvar'}
        </button>
        <button
          type="button"
          onClick={() => setCustomText(null)}
          className="felixo-btn flex items-center justify-center gap-2 rounded bg-zinc-700 px-3 py-1.5 text-sm text-zinc-100 hover:bg-zinc-600"
          title="Restaurar o texto padrão"
        >
          <RotateCcw size={14} />
          Padrão
        </button>
      </div>
    </div>
  )
}

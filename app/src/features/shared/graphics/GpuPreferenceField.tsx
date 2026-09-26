import { AlertTriangle, MonitorCog, Save } from 'lucide-react'
import { useState, type SyntheticEvent } from 'react'
import { FelixoSelect } from '../components/FelixoSelect'
import { isSoftwareRenderer, readActiveGpuRenderer } from './active-gpu-renderer'
import {
  GPU_PREFERENCE_OPTIONS,
  describeAppliedGpu,
  describeGpuFallback,
  isGpuPreference,
  shouldShowGpuChoice,
  type GpuFallback,
  type GpuPreference,
  type GpuPreferenceStatus,
} from './gpu-preference'
import { acknowledgeGpuFallback, saveGpuPreference, useGpuStatus } from './gpu-status-store'

type GpuFallbackAlertProps = {
  fallback: GpuFallback
  onAcknowledge: () => void
  busy?: boolean
}

/** Aviso de volta automática para Automático, com a ação de reconhecer. */
export function GpuFallbackAlert({ fallback, onAcknowledge, busy }: GpuFallbackAlertProps) {
  return (
    <div
      role="status"
      className="rounded-xl border border-[color-mix(in_srgb,var(--color-warning)_38%,transparent)] bg-[color-mix(in_srgb,var(--color-warning)_8%,transparent)] p-2.5"
    >
      <div className="flex items-center gap-2 text-xs font-medium text-(--color-warning)">
        <AlertTriangle size={14} aria-hidden="true" />
        Placa de vídeo voltou para Automático
      </div>
      <p className="mt-1 text-[11px] leading-relaxed text-(--color-warning)">{describeGpuFallback(fallback)}</p>
      <button
        type="button"
        onClick={onAcknowledge}
        disabled={busy}
        className="felixo-btn mt-2 flex h-8 items-center justify-center rounded-lg border border-white/10 px-3 text-[11px] text-zinc-300 hover:bg-white/8 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Entendi
      </button>
    </div>
  )
}

export type GpuPreferenceFieldViewProps = {
  status: GpuPreferenceStatus
  selected: GpuPreference
  onSelect: (preference: GpuPreference) => void
  onSave: () => void
  saving: boolean
  message: string
  open: boolean
  onToggle: (open: boolean) => void
  /** Renderer lido pelo WebGL quando a opção foi aberta; `undefined` = ainda não lido. */
  renderer: string | null | undefined
}

/**
 * Parte visual da escolha de placa de vídeo, sem estado próprio (os testes a
 * renderizam direto). Fica recolhida em "Opções avançadas": a maioria das
 * pessoas nunca precisa dela, e a Dedicada é experimental.
 */
export function GpuPreferenceFieldView({
  status,
  selected,
  onSelect,
  onSave,
  saving,
  message,
  open,
  onToggle,
  renderer,
}: GpuPreferenceFieldViewProps) {
  const handleToggle = (event: SyntheticEvent<HTMLDetailsElement>) => onToggle(event.currentTarget.open)
  const unavailable = !status.supported

  return (
    <details className="mt-3 rounded-xl border border-white/8 bg-black/10 p-2.5" open={open} onToggle={handleToggle}>
      <summary className="flex cursor-pointer items-center gap-2 rounded-md text-xs font-medium text-zinc-300 hover:text-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--color-accent)">
        <MonitorCog size={14} aria-hidden="true" />
        Opções avançadas: placa de vídeo
      </summary>
      <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
        Este computador tem mais de uma placa de vídeo. A escolha vale a partir
        da próxima abertura do Felixo. A dedicada costuma deixar a interface
        mais fluida, mas gasta mais bateria; se ela não iniciar bem, o app volta
        sozinho para Automático e avisa.
      </p>
      {unavailable && status.unsupportedReason && (
        <p className="mt-2 text-[11px] leading-relaxed text-(--color-warning)">{status.unsupportedReason}</p>
      )}
      <div className="mt-2 block text-xs text-zinc-400">
        Placa de vídeo
        <FelixoSelect
          value={selected}
          options={GPU_PREFERENCE_OPTIONS}
          onChange={(value) => {
            if (isGpuPreference(value)) onSelect(value)
          }}
          disabled={unavailable || saving}
          aria-label="Placa de vídeo"
          className="mt-1"
        />
      </div>
      <p className="mt-2 text-[11px] text-zinc-500">{describeAppliedGpu(status)}</p>
      <p className="mt-1 break-words text-[11px] text-zinc-500">
        Em uso agora:{' '}
        <span className="text-zinc-300">
          {renderer === undefined
            ? 'lendo…'
            : isSoftwareRenderer(renderer)
              ? 'nenhuma placa (rasterização por software)'
              : renderer}
        </span>
      </p>
      <button
        type="button"
        onClick={onSave}
        disabled={unavailable || saving || selected === status.preference}
        className="felixo-btn mt-3 flex h-9 items-center justify-center gap-2 rounded-2xl border border-white/10 px-3 text-xs font-medium text-zinc-200 hover:bg-white/8 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Save size={14} aria-hidden="true" />
        Salvar placa de vídeo
      </button>
      {message && (
        <p role="status" className="mt-2 text-[11px] leading-relaxed text-(--color-warning)">
          {message}
        </p>
      )}
    </details>
  )
}

/**
 * Escolha de placa de vídeo nas Configurações: só aparece com duas placas ou
 * mais. O aviso de volta automática fica fora do recolhido, para não passar
 * despercebido.
 */
export function GpuPreferenceField() {
  const status = useGpuStatus()
  const [draft, setDraft] = useState<GpuPreference | null>(null)
  const [saving, setSaving] = useState(false)
  const [acknowledging, setAcknowledging] = useState(false)
  const [message, setMessage] = useState('')
  const [open, setOpen] = useState(false)
  const [renderer, setRenderer] = useState<string | null | undefined>(undefined)

  if (!status) return null

  function toggle(next: boolean) {
    setOpen(next)
    // O contexto WebGL só nasce quando a pessoa abre a opção.
    if (next && renderer === undefined) setRenderer(readActiveGpuRenderer())
  }

  const selected = draft ?? status.preference

  async function save() {
    setSaving(true)
    const result = await saveGpuPreference(selected)
    setMessage(result.message)
    if (result.ok) setDraft(null)
    setSaving(false)
  }

  async function acknowledge() {
    setAcknowledging(true)
    await acknowledgeGpuFallback()
    setAcknowledging(false)
  }

  return (
    <>
      {status.fallback && (
        <div className="mt-3">
          <GpuFallbackAlert fallback={status.fallback} onAcknowledge={() => void acknowledge()} busy={acknowledging} />
        </div>
      )}
      {shouldShowGpuChoice(status) && (
        <GpuPreferenceFieldView
          status={status}
          selected={selected}
          onSelect={(value) => {
            setDraft(value)
            setMessage('')
          }}
          onSave={() => void save()}
          saving={saving}
          message={message}
          open={open}
          onToggle={toggle}
          renderer={renderer}
        />
      )}
    </>
  )
}

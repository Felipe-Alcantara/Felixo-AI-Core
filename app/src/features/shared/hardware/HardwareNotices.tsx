import { AlertTriangle, Gauge, X } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { describeGpuFallback } from '../graphics/gpu-preference'
import { acknowledgeGpuFallback, useGpuStatus } from '../graphics/gpu-status-store'
import { usePerformanceMode } from '../performance/performance-mode-context'
import {
  describeLowCpuSuggestion,
  loadSuggestionAnswered,
  saveSuggestionAnswered,
  shouldSuggestPerformanceMode,
  type HardwareProfile,
} from '../performance/performance-suggestion'

type NoticeToastProps = {
  icon: ReactNode
  title: string
  description: string
  /** Ação principal; o aviso sem ela só tem o "dispensar". */
  primaryLabel?: string
  onPrimary?: () => void
  secondaryLabel: string
  onSecondary: () => void
  dismissLabel: string
}

/**
 * Aviso flutuante do app, centralizado embaixo: o canto direito já é do aviso
 * de instalação das CLIs, e os dois podem aparecer juntos na primeira
 * abertura.
 */
export function NoticeToast({
  icon,
  title,
  description,
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
  dismissLabel,
}: NoticeToastProps) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-auto w-[22rem] max-w-full rounded-xl border border-white/10 bg-slate-900/95 p-4 shadow-xl backdrop-blur-sm"
      >
        <div className="flex items-start gap-3">
          <span className="mt-0.5 shrink-0" aria-hidden="true">
            {icon}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-slate-100">{title}</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">{description}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {primaryLabel && onPrimary && (
                <button
                  type="button"
                  onClick={onPrimary}
                  className="felixo-btn rounded-md bg-(--f-core-white)/90 px-3 py-1.5 text-xs font-medium text-slate-950 transition hover:bg-(--f-core-active)"
                >
                  {primaryLabel}
                </button>
              )}
              <button
                type="button"
                onClick={onSecondary}
                className="felixo-btn rounded-md px-3 py-1.5 text-xs text-slate-300 transition hover:bg-white/10"
              >
                {secondaryLabel}
              </button>
            </div>
          </div>
          <button
            type="button"
            onClick={onSecondary}
            className="felixo-btn-icon -mr-1 -mt-1 rounded-md p-1 text-slate-500 transition hover:bg-white/10 hover:text-slate-300"
            aria-label={dismissLabel}
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * Avisos que dependem do hardware, um de cada vez: a volta automática da
 * placa de vídeo (mais importante: algo mudou sem a pessoa pedir) e a
 * sugestão de Modo Performance em máquina com poucas CPUs.
 */
export function HardwareNotices() {
  const gpu = useGpuStatus()
  const { performanceMode, setPerformanceMode } = usePerformanceMode()
  const [profile, setProfile] = useState<HardwareProfile | null>(null)
  const [answered, setAnswered] = useState(() => loadSuggestionAnswered())

  useEffect(() => {
    let cancelled = false
    window.felixo?.hardware
      ?.getProfile()
      .then((result) => {
        if (!cancelled) setProfile(result)
      })
      .catch(() => {
        // Sem o perfil, não há sugestão; nada a avisar.
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (gpu?.fallback) {
    return (
      <NoticeToast
        icon={<AlertTriangle size={18} className="text-(--color-warning)" />}
        title="Placa de vídeo voltou para Automático"
        description={`${describeGpuFallback(gpu.fallback)} Dá para escolher de novo em Configurações.`}
        secondaryLabel="Entendi"
        onSecondary={() => void acknowledgeGpuFallback()}
        dismissLabel="Dispensar aviso da placa de vídeo"
      />
    )
  }

  if (profile && shouldSuggestPerformanceMode({ profile, performanceMode, answered })) {
    const answer = (enable: boolean) => {
      saveSuggestionAnswered()
      setAnswered(true)
      if (enable) setPerformanceMode(true)
    }
    return (
      <NoticeToast
        icon={<Gauge size={18} className="text-(--f-core-white-soft)" />}
        title="Ligar o Modo Performance?"
        description={describeLowCpuSuggestion(profile)}
        primaryLabel="Ligar Modo Performance"
        onPrimary={() => answer(true)}
        secondaryLabel="Agora não"
        onSecondary={() => answer(false)}
        dismissLabel="Dispensar sugestão do Modo Performance"
      />
    )
  }

  return null
}

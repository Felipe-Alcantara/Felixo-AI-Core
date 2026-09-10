import { AlertTriangle, Cpu, Save } from 'lucide-react'
import { useEffect, useState } from 'react'

type GraphicsMode = 'auto' | 'hardware' | 'software'

type GraphicsRecommendation = {
  reason: 'gpu-feature-disabled'
  disabledFeatures: string[]
  detectedAt: string | null
}

type GraphicsConfig = {
  mode: GraphicsMode
  softwareRenderingActive: boolean
  automaticLowEnd: boolean
  reason: string
  recommendation: GraphicsRecommendation | null
}

export function GraphicsRecoverySection() {
  const [mode, setMode] = useState<GraphicsMode>('auto')
  const [config, setConfig] = useState<GraphicsConfig | null>(null)
  const [message, setMessage] = useState('')
  const [recommendationBusy, setRecommendationBusy] = useState(false)

  const loadConfig = async () => {
    const bridge = window.felixo?.graphics
    if (!bridge) return
    try {
      const result = await bridge.getConfig()
      if (!result.ok || !result.config) return
      setMode(result.config.mode)
      setConfig(result.config)
    } catch {
      setMessage('Não foi possível ler o modo gráfico atual.')
    }
  }

  useEffect(() => {
    let cancelled = false
    const bridge = window.felixo?.graphics
    if (!bridge) return

    void bridge
      .getConfig()
      .then((result) => {
        if (cancelled || !result.ok || !result.config) return
        setMode(result.config.mode)
        setConfig(result.config)
      })
      .catch(() => {
        if (!cancelled) setMessage('Não foi possível ler o modo gráfico atual.')
      })

    return () => {
      cancelled = true
    }
  }, [])

  async function saveMode() {
    const bridge = window.felixo?.graphics
    if (!bridge) {
      setMessage('Esta opção só está disponível no app Electron.')
      return
    }

    try {
      const result = await bridge.setMode(mode)
      setMessage(
        result.ok
          ? result.message ?? 'Modo gráfico salvo.'
          : result.message ?? 'Não foi possível salvar o modo gráfico.',
      )
      // A escolha (aceitar ou não) já resolveu a recomendação pendente no
      // processo principal — recarrega o config pra tirá-la da tela.
      if (result.ok) await loadConfig()
    } catch {
      setMessage('Não foi possível salvar o modo gráfico.')
    }
  }

  async function acceptRecommendation() {
    setRecommendationBusy(true)
    setMode('software')
    const bridge = window.felixo?.graphics
    if (!bridge) {
      setRecommendationBusy(false)
      setMessage('Esta opção só está disponível no app Electron.')
      return
    }
    try {
      const result = await bridge.setMode('software')
      setMessage(
        result.ok
          ? result.message ?? 'Modo compatível salvo.'
          : result.message ?? 'Não foi possível salvar o modo compatível.',
      )
      if (result.ok) await loadConfig()
    } catch {
      setMessage('Não foi possível salvar o modo compatível.')
    } finally {
      setRecommendationBusy(false)
    }
  }

  async function dismissRecommendation() {
    setRecommendationBusy(true)
    const bridge = window.felixo?.graphics
    if (!bridge) {
      setRecommendationBusy(false)
      return
    }
    try {
      await bridge.dismissRecommendation()
      await loadConfig()
    } finally {
      setRecommendationBusy(false)
    }
  }

  return (
    <section className="rounded-2xl border border-white/[0.08] bg-black/10 p-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-medium text-zinc-300">
        <Cpu size={14} aria-hidden="true" />
        Renderização e recuperação
      </div>
      <p className="text-xs leading-relaxed text-zinc-500">
        O modo automático preserva a GPU e ativa o fallback de software apenas
        em Windows com pouca memória. Use o modo compatível se o driver antigo
        continuar deixando a janela preta.
      </p>
      {config?.recommendation && (
        <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/[0.08] p-2.5">
          <div className="flex items-center gap-2 text-xs font-medium text-amber-200">
            <AlertTriangle size={14} aria-hidden="true" />
            Modo compatível recomendado
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-amber-100/80">
            Numa abertura anterior, o driver de vídeo recusou{' '}
            {config.recommendation.disabledFeatures.join(', ')}. Isso costuma
            causar tela preta ou travamento na janela. Recomendamos trocar
            pro modo compatível (sem GPU).
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => void acceptRecommendation()}
              disabled={recommendationBusy}
              className="felixo-btn flex h-8 items-center justify-center rounded-lg bg-amber-600/80 px-3 text-[11px] font-medium text-white hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Usar modo compatível
            </button>
            <button
              type="button"
              onClick={() => void dismissRecommendation()}
              disabled={recommendationBusy}
              className="felixo-btn flex h-8 items-center justify-center rounded-lg border border-white/10 px-3 text-[11px] text-zinc-300 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Manter GPU normal
            </button>
          </div>
        </div>
      )}
      <label className="mt-3 block text-xs text-zinc-400">
        Modo gráfico
        <select
          value={mode}
          onChange={(event) => setMode(event.target.value as GraphicsMode)}
          className="mt-1 h-10 w-full rounded-2xl border border-white/[0.08] bg-[#1a1a19] px-3 text-sm text-zinc-100 outline-none focus:ring-2 focus:ring-cyan-200/30"
        >
          <option value="auto">Automático</option>
          <option value="hardware">GPU normal</option>
          <option value="software">Modo compatível (sem GPU)</option>
        </select>
      </label>
      <div className="mt-2 text-[11px] text-zinc-500">
        {config?.softwareRenderingActive
          ? 'Esta abertura está usando rasterização por software.'
          : 'Esta abertura está usando a aceleração gráfica normal.'}
      </div>
      <button
        type="button"
        onClick={() => void saveMode()}
        className="felixo-btn mt-3 flex h-9 items-center justify-center gap-2 rounded-2xl border border-white/10 px-3 text-xs font-medium text-zinc-200 hover:bg-white/[0.08]"
      >
        <Save size={14} aria-hidden="true" />
        Salvar modo gráfico
      </button>
      {message && (
        <p className="mt-2 text-[11px] leading-relaxed text-amber-300">{message}</p>
      )}
      <p className="mt-2 text-[11px] leading-relaxed text-zinc-600">
        Se a interface travar, o botão “Recarregar interface” recupera somente
        o renderer e mantém os terminais vivos. O modo salvo é aplicado na
        próxima abertura do app.
      </p>
    </section>
  )
}

import { Cpu, Save } from 'lucide-react'
import { useEffect, useState } from 'react'

type GraphicsMode = 'auto' | 'hardware' | 'software'

type GraphicsConfig = {
  mode: GraphicsMode
  softwareRenderingActive: boolean
  automaticLowEnd: boolean
  reason: string
}

export function GraphicsRecoverySection() {
  const [mode, setMode] = useState<GraphicsMode>('auto')
  const [config, setConfig] = useState<GraphicsConfig | null>(null)
  const [message, setMessage] = useState('')

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
    } catch {
      setMessage('Não foi possível salvar o modo gráfico.')
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

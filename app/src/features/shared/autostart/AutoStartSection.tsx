import { Power } from 'lucide-react'
import { useEffect, useState } from 'react'

type AutoStartConfig = {
  supported: boolean
  enabled: boolean
}

export function AutoStartSection() {
  const [config, setConfig] = useState<AutoStartConfig | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    const bridge = window.felixo?.autostart
    if (!bridge) return

    void bridge
      .getConfig()
      .then((result) => {
        if (cancelled || !result.ok || !result.config) return
        setConfig(result.config)
      })
      .catch(() => {
        if (!cancelled) setMessage('Não foi possível ler a preferência de autostart.')
      })

    return () => {
      cancelled = true
    }
  }, [])

  async function toggle() {
    const bridge = window.felixo?.autostart
    if (!bridge || !config) return
    setBusy(true)
    setMessage('')
    try {
      const result = await bridge.setEnabled(!config.enabled)
      if (result.ok) {
        setConfig({ supported: result.supported, enabled: result.enabled })
      } else {
        setMessage(result.message ?? 'Não foi possível salvar a preferência de autostart.')
      }
    } catch {
      setMessage('Não foi possível salvar a preferência de autostart.')
    } finally {
      setBusy(false)
    }
  }

  // Sem a ponte (fora do Electron) ou ainda carregando: não renderiza nada
  // pra não piscar um estado incerto na tela de Configurações.
  if (!window.felixo?.autostart || !config) return null

  return (
    <section className="rounded-2xl border border-white/[0.08] bg-black/10 p-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-medium text-zinc-300">
        <Power size={14} aria-hidden="true" />
        Iniciar com o sistema
      </div>
      {config.supported ? (
        <>
          <p className="text-xs leading-relaxed text-zinc-500">
            Abre o Felixo automaticamente quando você liga o computador.
          </p>
          <label className="mt-3 flex items-center gap-2 text-xs text-zinc-300">
            <input
              type="checkbox"
              checked={config.enabled}
              onChange={() => void toggle()}
              disabled={busy}
              className="h-4 w-4 accent-cyan-400 disabled:cursor-not-allowed"
            />
            Sempre iniciar com o sistema
          </label>
        </>
      ) : (
        <p className="text-xs leading-relaxed text-zinc-500">
          Esta opção não está disponível nesta plataforma.
        </p>
      )}
      {message && (
        <p className="mt-2 text-[11px] leading-relaxed text-amber-300">{message}</p>
      )}
    </section>
  )
}

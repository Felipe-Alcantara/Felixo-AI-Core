// Aviso de Openia anterior à versão mínima do catálogo (sem o teste da chave).
// Não atualiza sozinho: o pip executa código remoto, então o botão pede um
// segundo clique de confirmação, como o "Gerar imagem" já faz.
import { useEffect, useState } from 'react'
import { OPENIA_UPDATE_MESSAGES, updateOpenia } from '../canvas/services/openia-update'

type Props = {
  /** Sem o valor, o aviso consulta o catálogo (configurador do agente). */
  outdated?: boolean
  minimumVersion?: string | null
  onUpdated?: () => void
}

export function OpeniaOutdatedNotice({ outdated, minimumVersion, onUpdated }: Props) {
  const [fetched, setFetched] = useState<{ outdated: boolean; minimumVersion?: string | null }>()
  const [step, setStep] = useState<'idle' | 'confirming' | 'running' | 'done' | 'failed'>('idle')
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (outdated !== undefined) return
    let alive = true
    void window.felixo?.cli?.listOfficial?.()
      .then((result) => {
        const openia = result.clis?.find((cli) => cli.id === 'openia')
        if (alive && openia) setFetched({ outdated: openia.outdated === true, minimumVersion: openia.minimumVersion })
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [outdated])

  const isOutdated = outdated ?? fetched?.outdated ?? false
  const minimum = minimumVersion ?? fetched?.minimumVersion
  if (!isOutdated && step !== 'done') return null

  const run = async () => {
    setStep('running')
    const next = await updateOpenia()
    setMessage(next.status === 'done' || next.status === 'failed' ? next.message : '')
    setStep(next.status === 'done' ? 'done' : 'failed')
    if (next.status === 'done') onUpdated?.()
  }

  return (
    <div className="mt-1 rounded-md bg-black/20 p-2 text-[11px] leading-relaxed ring-1 ring-amber-300/30">
      <p role={step === 'failed' ? 'alert' : 'status'} className={step === 'failed' ? 'text-theme-error' : 'text-zinc-300'}>
        {step === 'done'
          ? message
          : step === 'failed'
            ? message
            : step === 'running'
              ? OPENIA_UPDATE_MESSAGES.running
              : `Openia desatualizado${minimum ? ` (o Felixo espera a ${minimum} ou mais)` : ''}: sem o teste da chave, uma chave recusada deixa a ferramenta parada e sem mensagem.`}
      </p>
      {step === 'confirming' && <p className="mt-1 text-zinc-400">{OPENIA_UPDATE_MESSAGES.confirm}</p>}
      {(step === 'idle' || step === 'confirming' || step === 'failed') && (
        <button
          type="button"
          onClick={() => (step === 'confirming' ? void run() : setStep('confirming'))}
          className="felixo-btn-icon mt-1 h-7 rounded-md border border-white/10 px-2 text-[11px] text-zinc-100 hover:bg-white/8"
        >
          {step === 'confirming' ? 'Confirmar atualização' : 'Atualizar'}
        </button>
      )}
    </div>
  )
}

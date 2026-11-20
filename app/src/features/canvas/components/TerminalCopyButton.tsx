import { useState } from 'react'
import { Check, Copy, TriangleAlert } from 'lucide-react'
import { mensagemDeFalha } from '../../shared/ipc/ipc-result'

type CopyButtonProps = {
  /** Faz a cópia e devolve o texto copiado (vazio = nada); REJEITA quando a área de transferência recusa. */
  onCopy: () => Promise<string>
  /** Dica e nome acessível; o padrão fala do terminal. */
  title?: string
  label?: string
}

/**
 * Copia a seleção do terminal (ou a tela visível) para a área de transferência. O ✓ só aparece depois de copiar de
 * verdade: se a cópia falha o botão mostra o alerta, com o motivo na dica, e nada de "copiado".
 */
export function CopyButton({
  onCopy,
  title = 'Copiar seleção (ou a tela visível)',
  label = 'Copiar do terminal',
}: CopyButtonProps) {
  const [estado, setEstado] = useState<'ocioso' | 'copiado' | 'falhou'>('ocioso')
  const [motivo, setMotivo] = useState('')

  return (
    <button
      type="button"
      // nodrag so the button works inside a draggable node header.
      className="felixo-btn-icon nodrag rounded-sm p-1 text-zinc-400 hover:bg-white/10 hover:text-zinc-100"
      onClick={async () => {
        try {
          const text = await onCopy()
          if (text) {
            setEstado('copiado')
            window.setTimeout(() => setEstado('ocioso'), 1500)
          }
        } catch (error) {
          setMotivo(mensagemDeFalha(error, 'Não foi possível copiar.'))
          setEstado('falhou')
          window.setTimeout(() => setEstado('ocioso'), 4000)
        }
      }}
      title={estado === 'falhou' ? motivo : title}
      aria-label={estado === 'falhou' ? `${label}: ${motivo}` : label}
    >
      {estado === 'copiado' ? (
        <Check size={15} className="text-(--f-core-white-soft)" />
      ) : estado === 'falhou' ? (
        <TriangleAlert size={15} className="text-theme-error" role="img" aria-label={motivo} />
      ) : (
        <Copy size={15} />
      )}
    </button>
  )
}

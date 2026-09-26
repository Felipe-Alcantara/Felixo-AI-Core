import { Trash2 } from 'lucide-react'
import type { ChatSession } from '../types'

type DeleteSessionButtonProps = {
  session: ChatSession
  onDelete: (session: ChatSession) => void
}

/**
 * Lixeira de uma linha de conversa, a mesma em "Recentes" e na busca. Fica
 * escondida até o hover da linha (`.felixo-session-row`) ou o foco por
 * teclado — o padrão do remover dos modelos —, para a lista não virar uma
 * coluna de lixeiras. O rótulo acessível leva o título porque, lido fora da
 * linha, "Excluir conversa" sozinho não diz qual.
 */
export function DeleteSessionButton({ session, onDelete }: DeleteSessionButtonProps) {
  return (
    <button
      type="button"
      title="Excluir conversa"
      aria-label={`Excluir conversa "${session.title}"`}
      onClick={() => onDelete(session)}
      className="felixo-btn-icon felixo-session-remove"
    >
      <Trash2 size={12} aria-hidden="true" />
    </button>
  )
}

import { useEffect, useState, type ReactNode } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'

type SidebarSectionProps = {
  title: string
  children: ReactNode
  defaultOpen?: boolean
  /**
   * Com uma chave, o aberto/fechado sobrevive ao reload. Um grupo que a pessoa
   * abriu de propósito não deve voltar fechado a cada sessão — mas o padrão de
   * fábrica continua sendo o `defaultOpen`, para quem nunca mexeu nele.
   */
  storageKey?: string
  /** Quantidade mostrada ao lado do título, útil com o grupo fechado. */
  count?: number
  /**
   * Ação do cabeçalho que não abre nem fecha o grupo (ex.: configurar).
   * Fica fora do botão de título, senão abrir o modal também alternaria o grupo.
   */
  action?: ReactNode
}

/**
 * Grupo recolhível de sidebar — o mesmo bloco nas sidebars do canvas e do
 * chat, para as duas telas lerem com um ritmo só: título em caixa alta, seta à
 * direita, conteúdo em coluna. Os estilos são os `felixo-sidebar-section*`.
 */
export function SidebarSection({
  title,
  children,
  defaultOpen = true,
  storageKey,
  count,
  action,
}: SidebarSectionProps) {
  const [open, setOpen] = usePersistedFlag(storageKey, defaultOpen)

  return (
    <section className="felixo-sidebar-section">
      <div className="felixo-sidebar-section-head">
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          className="felixo-sidebar-section-heading"
          aria-expanded={open}
        >
          <span>
            {title}
            {typeof count === 'number' && (
              <span className="felixo-sidebar-section-count">{count}</span>
            )}
          </span>
          {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </button>
        {action}
      </div>
      {open && <div className="felixo-sidebar-section-content">{children}</div>}
    </section>
  )
}

function usePersistedFlag(key: string | undefined, fallback: boolean) {
  const [value, setValue] = useState<boolean>(() => {
    if (!key) return fallback
    try {
      const stored = window.localStorage.getItem(key)
      return stored === null ? fallback : stored === '1'
    } catch {
      return fallback
    }
  })

  useEffect(() => {
    if (!key) return
    try {
      window.localStorage.setItem(key, value ? '1' : '0')
    } catch {
      // Sem storage (modo privado, quota): o estado só vive na sessão.
    }
  }, [key, value])

  return [value, setValue] as const
}

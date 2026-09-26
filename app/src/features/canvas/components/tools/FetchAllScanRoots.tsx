import { useId } from 'react'
import { FolderPlus, X } from 'lucide-react'

type FetchAllScanRootsProps = {
  /** Pastas-raiz salvas, na ordem em que o processo principal as devolve. */
  roots: string[]
  /** Passada em andamento, edição em curso ou configuração ainda não lida. */
  disabled: boolean
  /** Seletor aberto ou gravação em curso: o botão de adicionar avisa. */
  saving: boolean
  onAdd: () => void
  onRemove: (root: string) => void
}

/**
 * Lista editável das pastas-raiz do Fetch All, dentro do cartão de escopo.
 *
 * Com pelo menos uma raiz, a varredura percorre só essas pastas e dispensa a
 * confirmação do escopo amplo; sem nenhuma, o painel volta a oferecer a
 * varredura de todos os discos locais, que é bem mais cara.
 */
export function FetchAllScanRoots({
  roots,
  disabled,
  saving,
  onAdd,
  onRemove,
}: FetchAllScanRootsProps) {
  const titleId = useId()

  return (
    <div className="mt-2 rounded bg-zinc-950/30 px-2 py-1.5">
      <p id={titleId} className="text-[11px] font-medium text-zinc-300">
        Raízes configuradas ({roots.length})
      </p>

      {roots.length > 0 ? (
        <ul aria-labelledby={titleId} className="mt-1 max-h-24 overflow-auto">
          {roots.map((root) => (
            <li key={root} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-[11px] text-zinc-500" title={root}>
                {root}
              </span>
              <button
                type="button"
                onClick={() => onRemove(root)}
                disabled={disabled}
                className="felixo-btn-icon rounded p-1 text-zinc-500 hover:bg-white/10 hover:text-zinc-200 disabled:opacity-50"
                title="Deixar de varrer esta pasta"
                aria-label={`Deixar de varrer ${root}`}
              >
                <X size={12} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
          Nenhuma pasta escolhida. Adicione as pastas onde ficam seus repositórios
          para varrer só elas, sem percorrer os discos inteiros.
        </p>
      )}

      <button
        type="button"
        onClick={onAdd}
        disabled={disabled}
        className="felixo-btn mt-2 flex w-full items-center justify-center gap-2 rounded bg-zinc-800 px-3 py-1.5 text-xs text-zinc-300 ring-1 ring-white/10 hover:bg-zinc-700 disabled:opacity-50"
        title="Escolha uma ou mais pastas; a varredura passa a percorrer só as pastas da lista"
      >
        <FolderPlus size={13} />
        {saving ? 'Salvando…' : 'Adicionar pasta'}
      </button>
    </div>
  )
}

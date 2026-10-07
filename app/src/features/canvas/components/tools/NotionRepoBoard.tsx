import { useState } from 'react'
import { ChevronDown, ExternalLink, LayoutGrid, Settings2 } from 'lucide-react'
import { FelixoSelect, type FelixoSelectOption } from '../../../shared/components/FelixoSelect'
import type { DetailsSourceState } from '../../hooks/useNotionDetailsSource'
import type { RepoBoardSettings, RepoCard } from '../../services/notion-repo-board'

type NotionRepoBoardProps = {
  cards: RepoCard[]
  /** Cartões antes da busca: distingue "busca sem resultado" de "database sem tarefas". */
  totalCards: number
  /** As tarefas carregadas são a database inteira (todos os estados, sem busca no Notion). */
  ready: boolean
  /** Tarefas da database: em múltipla escolha a soma dos cartões conta a mesma tarefa mais de uma vez. */
  taskCount: number
  groupBy: string
  groupOptions: FelixoSelectOption[]
  detailsVia: string
  detailsOptions: FelixoSelectOption[]
  /** Agrupando por ligação, os detalhes só podem vir dela mesma. */
  detailsLocked: boolean
  details: DetailsSourceState
  tagCandidates: string[]
  tagProperties: string[]
  showEmpty: boolean
  onOpenCard: (card: RepoCard) => void
  onChangeSettings: (patch: Partial<RepoBoardSettings>) => void
}

const numberFormat = new Intl.NumberFormat('pt-BR')

/**
 * Aba Painel do bloco Tarefas Notion: um cartão por valor da coluna de
 * agrupamento, com o placar das tarefas e, quando a database ligada tem a
 * linha correspondente, link e etiquetas. Clicar abre a tabela filtrada.
 */
export function NotionRepoBoard({
  cards,
  totalCards,
  ready,
  taskCount,
  groupBy,
  groupOptions,
  detailsVia,
  detailsOptions,
  detailsLocked,
  details,
  tagCandidates,
  tagProperties,
  showEmpty,
  onOpenCard,
  onChangeSettings,
}: NotionRepoBoardProps) {
  const [showSettings, setShowSettings] = useState(false)

  function toggleTag(name: string) {
    onChangeSettings({
      tagProperties: tagProperties.includes(name) ? tagProperties.filter((item) => item !== name) : [...tagProperties, name],
    })
  }

  return (
    <section className="mt-3 space-y-3" aria-label="Painel de repositórios">
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
        <span>
          {groupBy ? `Um cartão por “${groupBy}”` : 'Escolha uma coluna para agrupar'}
          {ready && groupBy ? ` · ${numberFormat.format(cards.length)} cartão(ões) · ${numberFormat.format(taskCount)} tarefa(s)` : ''}
        </span>
        {detailsVia && (
          <span className={details.status === 'error' ? 'text-(--color-warning)' : ''} role={details.status === 'error' ? 'status' : undefined}>
            {details.status === 'loading' && !details.details
              ? '· lendo os detalhes…'
              : details.status === 'error'
                ? `· detalhes indisponíveis${details.details ? ' (usando o snapshot local)' : ''}: ${details.message}`
                : ''}
          </span>
        )}
        <button
          type="button"
          className="felixo-btn ml-auto flex items-center gap-1.5 rounded-md border border-white/10 px-2 py-1 text-[11px] text-zinc-300 hover:bg-white/5 hover:text-zinc-100"
          onClick={() => setShowSettings((value) => !value)}
          aria-expanded={showSettings}
          aria-label="Configurar painel"
        >
          <Settings2 size={12} /> Configurar painel
          <ChevronDown size={12} className={showSettings ? 'rotate-180 transition-transform' : 'transition-transform'} />
        </button>
      </div>

      {showSettings && (
        <div className="grid gap-3 rounded-lg border border-white/10 bg-zinc-950/45 p-3 sm:grid-cols-2" aria-label="Configuração do painel">
          <div className="min-w-0 space-y-1">
            <span className="block text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-500">Agrupar por</span>
            <FelixoSelect
              value={groupBy}
              options={groupOptions}
              onChange={(value) => onChangeSettings({ groupBy: value })}
              placeholder="Nenhuma coluna de escolha ou ligação"
              disabled={groupOptions.length === 0}
              aria-label="Agrupar cartões por"
            />
          </div>
          <div className="min-w-0 space-y-1">
            <span className="block text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-500">Detalhes pela ligação</span>
            <FelixoSelect
              value={detailsVia}
              options={detailsOptions}
              onChange={(value) => onChangeSettings({ detailsVia: value })}
              disabled={detailsLocked}
              aria-label="Ligação com a database de detalhes"
            />
          </div>
          <div className="min-w-0 space-y-1">
            <span className="block text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-500">Etiquetas do cartão</span>
            {tagCandidates.length === 0 ? (
              <p className="text-[11px] text-zinc-500">{detailsVia ? 'A database de detalhes não tem colunas de escolha.' : 'Sem database de detalhes.'}</p>
            ) : (
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {tagCandidates.map((name) => (
                  <label key={name} className="flex items-center gap-1.5 text-[11px] text-zinc-300">
                    <input type="checkbox" checked={tagProperties.includes(name)} onChange={() => toggleTag(name)} />
                    <span className="truncate" title={name}>{name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
          <label className="flex items-center gap-1.5 self-end text-[11px] text-zinc-300">
            <input type="checkbox" checked={showEmpty} onChange={(event) => onChangeSettings({ showEmpty: event.target.checked })} disabled={!detailsVia} />
            Mostrar repositórios sem tarefas
          </label>
        </div>
      )}

      {!groupBy ? (
        <EmptyState text="Esta database não tem coluna de escolha, status ou ligação para virar cartão." />
      ) : !ready ? (
        <EmptyState text="Carregando o placar…" />
      ) : cards.length === 0 ? (
        <EmptyState text={totalCards > 0 ? 'Nenhum cartão com esse nome.' : 'Nenhuma tarefa nesta database.'} />
      ) : (
        <ul className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(13rem,1fr))]">
          {cards.map((card) => (
            <li key={card.key} className={`flex min-w-0 flex-col rounded-lg border border-white/10 bg-zinc-950/35 ${card.clickable ? 'hover:border-white/20 hover:bg-white/3' : 'opacity-70'}`}>
              {card.clickable ? (
                <button
                  type="button"
                  className="felixo-btn flex min-w-0 flex-1 flex-col gap-1.5 rounded-t-lg p-2.5 text-left"
                  onClick={() => onOpenCard(card)}
                  aria-label={`Abrir as tarefas de ${card.label}`}
                  title="Abrir a tabela só com estas tarefas"
                >
                  <CardBody card={card} />
                </button>
              ) : (
                <div className="flex min-w-0 flex-1 flex-col gap-1.5 p-2.5"><CardBody card={card} /></div>
              )}
              {card.link && (
                <a
                  className="flex min-w-0 items-center gap-1 border-t border-white/[0.07] px-2.5 py-1.5 text-[11px] text-zinc-500 hover:text-(--f-core-white-soft)"
                  href={card.link}
                  target="_blank"
                  rel="noreferrer"
                  title={card.link}
                >
                  <ExternalLink size={11} className="shrink-0" />
                  <span className="truncate">{shortLink(card.link)}</span>
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function CardBody({ card }: { card: RepoCard }) {
  return (
    <>
      <span className="truncate text-[13px] font-medium text-zinc-100" title={card.label}>{card.label}</span>
      {card.total > 0 ? (
        <>
          <span className="h-1.5 w-full overflow-hidden rounded-full bg-white/10" aria-hidden="true">
            <span className="block h-full rounded-full bg-(--f-core-white-soft)" style={{ width: `${card.percent}%` }} />
          </span>
          <span className="text-[11px] text-zinc-400">
            {card.percent}% · {card.open === 0 ? 'tudo feito' : `${numberFormat.format(card.open)} aberta(s)`}
            <span className="text-zinc-600"> · {numberFormat.format(card.total)} no total</span>
          </span>
        </>
      ) : (
        <span className="text-[11px] text-zinc-500">sem tarefas</span>
      )}
      {card.tags.length > 0 && (
        <span className="flex flex-wrap gap-1">
          {card.tags.map((tag) => (
            <span key={tag} className="rounded-sm bg-white/8 px-1.5 py-0.5 text-[10px] text-zinc-300">{tag}</span>
          ))}
        </span>
      )}
    </>
  )
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-white/10 text-center text-xs text-zinc-500">
      <LayoutGrid size={18} className="text-zinc-600" />
      {text}
    </div>
  )
}

/** `https://github.com/dono/repo/` → `github.com/dono/repo`. */
function shortLink(value: string): string {
  try {
    const url = new URL(value)
    return `${url.host}${url.pathname}`.replace(/\/$/, '')
  } catch {
    return value
  }
}

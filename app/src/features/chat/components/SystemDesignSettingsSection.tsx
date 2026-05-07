import { BookOpen, ExternalLink, RefreshCw, Trash2 } from 'lucide-react'

import { useSystemDesignSettings } from '../hooks/useSystemDesignSettings'

export function SystemDesignSettingsSection() {
  const { state, sync, updateConfig, resetCache } = useSystemDesignSettings()
  const { config, documents, loaded, syncing, error } = state

  const lastSyncLabel = config.lastSyncedAt
    ? new Date(config.lastSyncedAt).toLocaleString('pt-BR')
    : 'nunca'
  const shaLabel = config.lastSha ? config.lastSha.slice(0, 7) : '—'

  return (
    <section className="rounded-2xl border border-white/[0.08] bg-black/10 p-3">
      <header className="mb-2 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-100">
          <BookOpen size={14} aria-hidden="true" />
          Felixo System Design
          <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-300">
            Recomendado
          </span>
        </h3>
        <a
          href={config.repoUrl.replace(/\.git$/, '')}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 rounded-md border border-white/10 px-2 py-0.5 text-[11px] text-zinc-300 hover:bg-white/5"
          title="Abrir o repositório no GitHub"
        >
          <ExternalLink size={11} aria-hidden="true" />
          Ver repositório
        </a>
      </header>

      <p className="mb-3 text-[11px] leading-relaxed text-zinc-400">
        O Felixo System Design é um repositório aberto com boas práticas de
        engenharia (design de backend, frontend, fluxo com IA, etc). Quando
        ativado, os sub-agentes recebem um índice desses documentos e devem
        seguir os padrões antes de gerar código ou tomar decisões técnicas.
        Mantemos ligado por padrão porque ajuda agentes a tomarem decisões
        mais consistentes; pode desligar se preferir respostas livres.
      </p>

      <label className="mb-3 flex items-center gap-2 text-xs text-zinc-200">
        <input
          type="checkbox"
          className="h-3.5 w-3.5 accent-blue-500"
          disabled={!loaded}
          checked={config.enabled}
          onChange={(event) =>
            void updateConfig({ enabled: event.target.checked })
          }
        />
        Usar Felixo System Design como guia obrigatório dos agentes
      </label>

      <div className="grid grid-cols-2 gap-2 rounded-md bg-white/5 px-2 py-1.5 text-[11px] text-zinc-300">
        <div>
          <span className="text-zinc-500">Última sincronização: </span>
          <span>{lastSyncLabel}</span>
        </div>
        <div>
          <span className="text-zinc-500">SHA atual: </span>
          <span className="font-mono">{shaLabel}</span>
        </div>
        <div>
          <span className="text-zinc-500">Documentos indexados: </span>
          <span>{documents.length}</span>
        </div>
        <div>
          <span className="text-zinc-500">Branch: </span>
          <span className="font-mono">{config.branch}</span>
        </div>
      </div>

      {error || config.lastError ? (
        <p className="mt-2 rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1 text-[11px] text-red-200">
          {error ?? config.lastError}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void sync()}
          disabled={syncing}
          className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-zinc-100 hover:bg-white/10 disabled:opacity-50"
        >
          <RefreshCw
            size={12}
            aria-hidden="true"
            className={syncing ? 'animate-spin' : undefined}
          />
          {syncing ? 'Sincronizando…' : 'Sincronizar agora'}
        </button>
        <button
          type="button"
          onClick={() => void resetCache()}
          disabled={syncing}
          className="inline-flex items-center gap-1.5 rounded-md border border-white/10 px-2.5 py-1 text-[11px] text-zinc-300 hover:bg-white/5 disabled:opacity-50"
        >
          <Trash2 size={12} aria-hidden="true" />
          Limpar cache
        </button>
      </div>

      {documents.length > 0 ? (
        <details className="mt-3 text-[11px] text-zinc-300">
          <summary className="cursor-pointer text-zinc-400 hover:text-zinc-200">
            Ver índice ({documents.length} documento
            {documents.length === 1 ? '' : 's'})
          </summary>
          <ul className="mt-1 space-y-0.5">
            {documents.map((doc) => (
              <li key={doc.path}>
                <span className="font-mono text-zinc-500">{doc.path}</span>
                {doc.title && doc.title !== doc.path ? (
                  <span className="text-zinc-300"> — {doc.title}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  )
}

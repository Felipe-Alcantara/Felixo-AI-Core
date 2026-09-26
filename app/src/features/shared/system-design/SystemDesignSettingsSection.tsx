import { BookOpen, ExternalLink, RefreshCw, RotateCcw, Trash2 } from 'lucide-react'

import {
  describeConfiguredSource,
  describeSystemDesignStatus,
  type SystemDesignStatusTone,
} from './system-design-presentation'
import { useSystemDesignSettings } from './useSystemDesignSettings'
import { FelixoToggle } from '../components/FelixoToggle'

const TONE_CLASS: Record<SystemDesignStatusTone, string> = {
  ok: 'text-theme-success',
  warn: 'text-(--color-warning)',
  muted: 'text-zinc-400',
}

export function SystemDesignSettingsSection() {
  const { state, sync, updateConfig, resetCache } = useSystemDesignSettings()
  const { config, documents, loaded, syncing, error } = state

  const lastSyncLabel = config.lastSyncedAt
    ? new Date(config.lastSyncedAt).toLocaleString('pt-BR')
    : 'nunca'
  const shaLabel = config.lastSha ? config.lastSha.slice(0, 7) : '—'
  const status = describeSystemDesignStatus(config)

  // Voltar ao padrão troca a fonte configurada; sem sincronizar em seguida o
  // conteúdo entregue continuaria sendo o da fonte anterior.
  const restoreDefaultSource = async () => {
    await updateConfig({ sourceMode: 'default' })
    await sync()
  }

  return (
    <section className="rounded-2xl border border-white/8 bg-black/10 p-3">
      <header className="mb-2 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-100">
          <BookOpen size={14} aria-hidden="true" />
          Felixo System Design
          <span className="rounded-full border border-white/10 bg-(--f-core-white)/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-(--f-core-white-soft)">
            Recomendado
          </span>
        </h3>
        {config.repoUrl ? (
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
        ) : null}
      </header>

      <p className="mb-3 text-[11px] leading-relaxed text-zinc-400">
        O Felixo System Design é um repositório aberto com boas práticas de
        engenharia (design de backend, frontend, fluxo com IA, etc). Quando
        ativado, os sub-agentes recebem um índice desses documentos e devem
        seguir os padrões antes de gerar código ou tomar decisões técnicas.
        Mantemos ligado por padrão porque ajuda agentes a tomarem decisões
        mais consistentes; pode desligar se preferir respostas livres.
      </p>

      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="text-xs text-zinc-200">
          Usar Felixo System Design como guia obrigatório dos agentes
        </span>
        <FelixoToggle
          disabled={!loaded}
          checked={config.enabled}
          onChange={(checked) => void updateConfig({ enabled: checked })}
          label="Usar Felixo System Design como guia obrigatório dos agentes"
        />
      </div>

      <div
        className="mb-2 rounded-md bg-white/5 px-2 py-1.5 text-[11px]"
        data-felixo-system-design-status
      >
        <div className="text-zinc-300">
          <span className="text-zinc-500">Fonte: </span>
          <span>{describeConfiguredSource(config)}</span>
          {config.sourceMode === 'custom' ? (
            <span className="ml-1.5 rounded-full border border-white/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-zinc-400">
              escolhida por você
            </span>
          ) : null}
        </div>
        <div className={`mt-0.5 font-medium ${TONE_CLASS[status.tone]}`}>{status.headline}</div>
        {status.detail ? <div className="mt-0.5 text-zinc-400">{status.detail}</div> : null}
      </div>

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
        <p className="mt-2 rounded-md border border-[color-mix(in_srgb,var(--color-error)_38%,transparent)] bg-[color-mix(in_srgb,var(--color-error)_18%,transparent)] px-2 py-1 text-[11px] text-theme-error">
          {error ?? config.lastError}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void sync()}
          disabled={syncing}
          className="felixo-btn inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-zinc-100 hover:bg-white/10 disabled:opacity-50"
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
          className="felixo-btn inline-flex items-center gap-1.5 rounded-md border border-white/10 px-2.5 py-1 text-[11px] text-zinc-300 hover:bg-white/5 disabled:opacity-50"
        >
          <Trash2 size={12} aria-hidden="true" />
          Limpar cache
        </button>
        {config.sourceMode === 'custom' ? (
          <button
            type="button"
            onClick={() => void restoreDefaultSource()}
            disabled={syncing}
            className="felixo-btn inline-flex items-center gap-1.5 rounded-md border border-white/10 px-2.5 py-1 text-[11px] text-zinc-300 hover:bg-white/5 disabled:opacity-50"
            title="Descarta a fonte escolhida e volta a seguir o padrão do Felixo"
          >
            <RotateCcw size={12} aria-hidden="true" />
            Voltar ao padrão do app
          </button>
        ) : null}
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

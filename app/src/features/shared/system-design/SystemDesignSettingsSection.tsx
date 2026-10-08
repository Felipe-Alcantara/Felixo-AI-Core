import { useMemo } from 'react'
import { BookOpen, ExternalLink, RefreshCw, RotateCcw, Trash2 } from 'lucide-react'

import { GuideInputForm } from './GuideInputForm'
import { ProjectGuidesSection } from './ProjectGuidesSection'
import {
  describeGuideOrigin,
  describeGuideSource,
  describeGuideStatus,
  type SystemDesignStatusTone,
} from './system-design-presentation'
import { SystemDesignDocumentIndex } from './SystemDesignDocumentIndex'
import { useSystemDesignSettings } from './useSystemDesignSettings'
import type { SystemDesignGuideInput } from './types'
import { FelixoToggle } from '../components/FelixoToggle'

const TONE_CLASS: Record<SystemDesignStatusTone, string> = {
  ok: 'text-theme-success',
  warn: 'text-(--color-warning)',
  muted: 'text-zinc-400',
}

/**
 * Guias de boas práticas que os agentes seguem. A pessoa monta a própria
 * lista (dá para seguir dois padrões juntos); `projectDirectories` são as
 * pastas em uso (terminais do canvas, projetos ativos do chat), cada uma com
 * a camada de projeto dela.
 */
export function SystemDesignSettingsSection({ projectDirectories = [] }: { projectDirectories?: readonly string[] }) {
  const { state, sync, updateConfig, replaceGuides, resetCache, readDocument } = useSystemDesignSettings()
  const { config, documentsByGuide, loaded, syncing, error } = state
  const guides = config.guides
  const isCustom = config.sourceMode === 'custom'
  const currentInputs: SystemDesignGuideInput[] = guides
    .filter((guide) => guide.kind === 'git')
    .map((guide) => ({ repoUrl: guide.repoUrl, branch: guide.branch }))

  // Um leitor por guia, com identidade estável: a prévia aberta não é relida à toa.
  const guideKeys = guides.map((guide) => guide.key).join('\n')
  const readers = useMemo(
    () =>
      Object.fromEntries(
        guideKeys
          .split('\n')
          .filter(Boolean)
          .map((key) => [key, (documentPath: string) => readDocument(documentPath, key)]),
      ),
    [guideKeys, readDocument],
  )

  // Voltar ao padrão troca a lista; sem sincronizar em seguida, o padrão do
  // app poderia não ter índice ainda.
  const restoreDefaultSource = async () => {
    await updateConfig({ sourceMode: 'default' })
    await sync()
  }

  return (
    <section className="rounded-2xl border border-white/8 bg-black/10 p-3">
      <header className="mb-2 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-100">
          <BookOpen size={14} aria-hidden="true" />
          System Design
          <span className="rounded-full border border-white/10 bg-(--f-core-white)/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-(--f-core-white-soft)">
            Recomendado
          </span>
        </h3>
      </header>

      <p className="mb-3 text-[11px] leading-relaxed text-zinc-400">
        Guias abertos de boas práticas de engenharia (backend, frontend, fluxo com IA…) que os
        agentes seguem antes de gerar código ou tomar decisões técnicas. O padrão é o Felixo
        System Design; você pode trocar ou somar outros guias, e cada projeto pode trazer os seus.
      </p>

      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="text-xs text-zinc-200">Usar os guias como obrigatórios para os agentes</span>
        <FelixoToggle
          disabled={!loaded}
          checked={config.enabled}
          onChange={(checked) => void updateConfig({ enabled: checked })}
          label="Usar os guias como obrigatórios para os agentes"
        />
      </div>

      <h4 className="text-[11px] font-semibold uppercase tracking-wide text-zinc-300">Seus guias</h4>
      <ul className="mt-1 space-y-1.5" data-felixo-system-design-status>
        {guides.map((guide, index) => {
          const status = describeGuideStatus(guide)
          const documents = documentsByGuide[guide.key] ?? []
          return (
            <li key={guide.key} className="rounded-md bg-white/5 px-2 py-1.5 text-[11px]">
              <div className="flex items-center justify-between gap-2 text-zinc-300">
                <span className="truncate">
                  {describeGuideSource(guide)}
                  <span className="ml-1.5 rounded-full border border-white/10 px-1.5 text-[10px] uppercase tracking-wide text-zinc-400">
                    {describeGuideOrigin(guide.origin)}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  {guide.repoUrl ? (
                    <a
                      href={guide.repoUrl.replace(/\.git$/, '')}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-md px-1 text-zinc-400 hover:bg-white/5 hover:text-zinc-100"
                      title="Abrir o repositório do guia"
                    >
                      <ExternalLink size={11} aria-hidden="true" />
                    </a>
                  ) : null}
                  {isCustom ? (
                    <button
                      type="button"
                      onClick={() => void replaceGuides(currentInputs.filter((_, position) => position !== index))}
                      disabled={syncing}
                      aria-label={`Tirar ${guide.label} da sua lista`}
                      className="felixo-btn rounded-md p-0.5 text-zinc-400 hover:bg-white/5 hover:text-zinc-100 disabled:opacity-50"
                    >
                      <Trash2 size={11} aria-hidden="true" />
                    </button>
                  ) : null}
                </span>
              </div>
              <div className={`mt-0.5 font-medium ${TONE_CLASS[status.tone]}`}>{status.headline}</div>
              {status.detail ? <div className="text-zinc-400">{status.detail}</div> : null}
              {guide.lastError ? <div className="mt-0.5 text-theme-error">{guide.lastError}</div> : null}
              <div className="mt-0.5 text-zinc-500">Documentos indexados: {documents.length}</div>
              {documents.length > 0 && readers[guide.key] ? (
                <SystemDesignDocumentIndex documents={documents} readDocument={readers[guide.key]} />
              ) : null}
            </li>
          )
        })}
      </ul>

      <GuideInputForm
        disabled={!loaded || syncing}
        submitLabel="Adicionar guia"
        onSubmit={(guide) => replaceGuides([...currentInputs, guide])}
      />

      {error ? (
        <p className="mt-2 rounded-md border border-[color-mix(in_srgb,var(--color-error)_38%,transparent)] bg-[color-mix(in_srgb,var(--color-error)_18%,transparent)] px-2 py-1 text-[11px] text-theme-error">
          {error}
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
        {isCustom ? (
          <button
            type="button"
            onClick={() => void restoreDefaultSource()}
            disabled={syncing}
            className="felixo-btn inline-flex items-center gap-1.5 rounded-md border border-white/10 px-2.5 py-1 text-[11px] text-zinc-300 hover:bg-white/5 disabled:opacity-50"
            title="Descarta a sua lista e volta a seguir o padrão do app (Felixo System Design)"
          >
            <RotateCcw size={12} aria-hidden="true" />
            Voltar ao padrão do app
          </button>
        ) : null}
      </div>

      <ProjectGuidesSection directories={projectDirectories} />
    </section>
  )
}

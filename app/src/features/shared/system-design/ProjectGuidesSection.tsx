import { useMemo, useState } from 'react'
import { Check, FolderGit2, Trash2, X } from 'lucide-react'

import { GuideInputForm } from './GuideInputForm'
import { announceSystemDesignProjects } from './system-design-events'
import {
  describeGuideOrigin,
  describeGuideSource,
  describeProjectFile,
  describeProjectLayer,
  type SystemDesignStatusTone,
} from './system-design-presentation'
import { useProjectGuides } from './useProjectGuides'
import type { SystemDesignGuideInput, SystemDesignProject, SystemDesignProjectChange } from './types'
import { FelixoToggle } from '../components/FelixoToggle'

const TONE_CLASS: Record<SystemDesignStatusTone, string> = {
  ok: 'text-theme-success',
  warn: 'text-(--color-warning)',
  muted: 'text-zinc-400',
}

function baseName(value: string): string {
  return value.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || value
}

/** Grava a escolha de UM projeto, sincroniza o que passou a valer e avisa as telas. */
async function saveProject(
  root: string,
  change: SystemDesignProjectChange,
  { sync }: { sync: boolean },
): Promise<{ ok: boolean; message?: string }> {
  const bridge = window.felixo?.systemDesign
  if (!bridge?.saveProject) return { ok: false, message: 'Disponível só no app desktop.' }
  const result = await bridge.saveProject(root, change)
  if (!result.ok) return { ok: false, message: result.message }
  announceSystemDesignProjects(root)
  if (sync) {
    // Só guias que já valem (escolha no app, arquivo confirmado) são buscados.
    await bridge.sync?.({ projectRoot: root })
    announceSystemDesignProjects(root)
  }
  return { ok: true }
}

function ProjectCard({ project }: { project: SystemDesignProject }) {
  const [error, setError] = useState<string | null>(null)
  const layer = describeProjectLayer(project)
  const file = describeProjectFile(project.file)
  const root = project.root

  const run = async (change: SystemDesignProjectChange, options: { sync: boolean }) => {
    if (!root) return { ok: false }
    setError(null)
    const result = await saveProject(root, change, options)
    if (!result.ok) setError(result.message ?? 'Não foi possível salvar.')
    return result
  }

  const appGuideInputs: SystemDesignGuideInput[] = project.appGuides.map((guide) => ({
    repoUrl: guide.repoUrl,
    branch: guide.branch,
  }))
  const fileNeedsDecision = project.file?.status === 'pendente' || project.file?.status === 'alterado'

  return (
    <li className="rounded-md border border-white/8 bg-white/3 px-2 py-1.5" data-felixo-system-design-project={root ?? project.directory ?? ''}>
      <div className="flex items-center gap-1.5 text-[11px] text-zinc-200">
        <FolderGit2 size={12} aria-hidden="true" />
        <span className="shrink-0 font-medium">{baseName(root ?? project.directory ?? '')}</span>
        <span className="min-w-0 truncate text-zinc-500" title={root ?? project.directory ?? ''}>{root ?? project.directory}</span>
      </div>
      <div className={`mt-0.5 text-[11px] font-medium ${TONE_CLASS[layer.tone]}`}>{layer.headline}</div>
      {layer.detail ? <div className="text-[11px] text-zinc-400">{layer.detail}</div> : null}

      {project.layer === 'projeto' ? (
        <ul className="mt-1 space-y-0.5">
          {project.guides.map((guide) => (
            <li key={guide.key} className="text-[11px] text-zinc-300">
              {describeGuideSource(guide)}
              <span className="ml-1.5 rounded-full border border-white/10 px-1.5 text-[10px] text-zinc-400">
                {describeGuideOrigin(guide.origin)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {file ? (
        <div className="mt-1.5 rounded-md bg-black/20 px-2 py-1" data-felixo-system-design-project-file={project.file?.status}>
          <div className={`text-[11px] font-medium ${TONE_CLASS[file.tone]}`}>{file.headline}</div>
          {file.detail ? <div className="text-[11px] text-zinc-400">{file.detail}</div> : null}
          {fileNeedsDecision ? (
            <>
              <ul className="mt-1 space-y-0.5">
                {project.file?.guides.map((guide) => (
                  <li key={guide.key} className="break-all font-mono text-[10px] text-zinc-300">
                    {guide.repoUrl} <span className="text-zinc-500">({guide.branch})</span>
                  </li>
                ))}
              </ul>
              {project.file?.problems.length ? (
                <p className="mt-1 text-[10px] text-zinc-500">{project.file.problems.join(' ')}</p>
              ) : null}
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => void run({ confirmFile: project.file?.hash ?? '' }, { sync: true })}
                  disabled={!project.file?.hash}
                  className="felixo-btn inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-zinc-100 hover:bg-white/10 disabled:opacity-50"
                >
                  <Check size={11} aria-hidden="true" />
                  Usar estes guias
                </button>
                <button
                  type="button"
                  onClick={() => void run({ ignoreFile: true }, { sync: false })}
                  className="felixo-btn inline-flex items-center gap-1 rounded-md border border-white/10 px-2 py-0.5 text-[11px] text-zinc-300 hover:bg-white/5"
                >
                  <X size={11} aria-hidden="true" />
                  Ignorar arquivo
                </button>
              </div>
            </>
          ) : null}
          {project.file?.status === 'ignorado' ? (
            <button
              type="button"
              onClick={() => void run({ useRepoFile: true }, { sync: false })}
              className="felixo-btn mt-1 rounded-md border border-white/10 px-2 py-0.5 text-[11px] text-zinc-300 hover:bg-white/5"
            >
              Voltar a considerar o arquivo
            </button>
          ) : null}
        </div>
      ) : null}

      {project.authorized && project.folders.length ? (
        <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-zinc-300">
          <span>
            Usar a pasta de guias do repositório ({project.folders.map((folder) => folder.label).join(', ')})
          </span>
          <FelixoToggle
            checked={project.useGuideFolders}
            onChange={(checked) => void run({ useGuideFolders: checked }, { sync: false })}
            label="Usar a pasta de guias do repositório"
          />
        </div>
      ) : null}

      {project.authorized && root ? (
        <div className="mt-1.5">
          <div className="text-[11px] text-zinc-500">Guias escolhidos para este projeto</div>
          {project.appGuides.length ? (
            <ul className="mt-0.5 space-y-0.5">
              {project.appGuides.map((guide, index) => (
                <li key={guide.key} className="flex items-center justify-between gap-2 text-[11px] text-zinc-300">
                  <span className="truncate">{describeGuideSource(guide)}</span>
                  <button
                    type="button"
                    onClick={() => void run({ guides: appGuideInputs.filter((_, position) => position !== index) }, { sync: false })}
                    aria-label={`Tirar ${guide.label} deste projeto`}
                    className="felixo-btn rounded-md p-0.5 text-zinc-400 hover:bg-white/5 hover:text-zinc-100"
                  >
                    <Trash2 size={11} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <GuideInputForm
            submitLabel="Adicionar a este projeto"
            onSubmit={(guide) => run({ guides: [...appGuideInputs, guide] }, { sync: true })}
          />
        </div>
      ) : null}

      {error ? <p className="mt-1 text-[11px] text-theme-error" role="alert">{error}</p> : null}
    </li>
  )
}

/**
 * Camada de PROJETO dos guias, para as pastas em uso (terminais do canvas,
 * projetos ativos do chat). Um projeto pode trazer guias por arquivo
 * versionado, pasta de guias ou escolha feita aqui; quando traz, eles valem
 * ali no lugar dos seus.
 */
export function ProjectGuidesSection({ directories }: { directories: readonly string[] }) {
  const { projects } = useProjectGuides(directories)

  // Várias pastas podem ser do mesmo projeto: um cartão por raiz.
  const unique = useMemo(() => {
    const byRoot = new Map<string, SystemDesignProject>()
    for (const project of Object.values(projects)) {
      byRoot.set(project.root ?? `fora:${project.directory}`, project)
    }
    return [...byRoot.values()].sort((a, b) =>
      baseName(a.root ?? a.directory ?? '').localeCompare(baseName(b.root ?? b.directory ?? ''), 'pt-BR'),
    )
  }, [projects])

  if (!directories.length) return null

  return (
    <div className="mt-3" data-felixo-system-design-projects>
      <h4 className="text-[11px] font-semibold uppercase tracking-wide text-zinc-300">Por projeto</h4>
      <p className="mb-1.5 text-[11px] text-zinc-500">
        Um projeto pode trazer os próprios guias: um arquivo <code>.felixo/system-design.json</code> no
        repositório (só vale depois que você confirma), uma pasta “Padrão de qualidade - …” ou guias
        escolhidos aqui. Quando traz, eles valem nos terminais daquele projeto no lugar dos seus.
      </p>
      {unique.length ? (
        <ul className="space-y-1.5">
          {unique.map((project) => (
            <ProjectCard key={project.root ?? project.directory ?? ''} project={project} />
          ))}
        </ul>
      ) : (
        <p className="text-[11px] text-zinc-500">Lendo os projetos…</p>
      )}
    </div>
  )
}

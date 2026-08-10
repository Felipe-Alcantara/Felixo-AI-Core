import { useEffect, useRef, useState } from 'react'
import { ArrowRightLeft, X } from 'lucide-react'
import { useAgentConfig, type AgentConfigProject } from '../hooks/useAgentConfig'
import type { NewTerminalOptions } from '../services/new-terminal-options'
import { AgentConfigFields } from './AgentConfigFields'

type Props = {
  /** Nome do agente que está passando o trabalho, só para o texto do diálogo. */
  sourceLabel: string
  projects: readonly AgentConfigProject[]
  onAddFolder: () => Promise<string[]>
  /** Cria o agente escolhido já com o histórico do anterior como contexto. */
  onConfirm: (options: NewTerminalOptions) => Promise<{ ok: boolean; message?: string }>
  onClose: () => void
}

/**
 * Escolha do agente que vai assumir o trabalho.
 *
 * Usa os mesmos campos do menu de criação da toolbar (`AgentConfigFields`), e é
 * essa a diferença em relação à versão anterior da feature: antes o destino era
 * decidido por um rodízio fixo entre as CLIs conhecidas, o que na prática só
 * fazia Claude → Codex e não deixava escolher modelo, esforço nem projeto.
 */
export function HandoffDialog({
  sourceLabel,
  projects,
  onAddFolder,
  onConfirm,
  onClose,
}: Props) {
  const config = useAgentConfig(projects)
  const [busy, setBusy] = useState(false)
  const [erro, setErro] = useState<string | undefined>()
  const painelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', aoTeclar)
    return () => document.removeEventListener('keydown', aoTeclar)
  }, [onClose])

  const confirmar = async () => {
    if (busy) return
    setBusy(true)
    setErro(undefined)
    try {
      const opcoes = config.buildOptions()
      // Sem nome próprio, o bloco herda o rótulo automático da configuração
      // ("Claude · projeto"), que não diz nada sobre ser uma continuação. O
      // sufixo só entra quando o usuário não escolheu um nome.
      const resultado = await onConfirm(
        config.name.trim()
          ? opcoes
          : { ...opcoes, label: `${opcoes.label} · continuação` },
      )
      if (!resultado.ok) {
        setErro(resultado.message ?? 'Não foi possível passar a responsabilidade.')
        return
      }
      config.savePreferences()
      onClose()
    } catch (error) {
      setErro(
        error instanceof Error ? error.message : 'Não foi possível passar a responsabilidade.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
      onMouseDown={(evento) => {
        if (!painelRef.current?.contains(evento.target as Node)) onClose()
      }}
    >
      <div
        ref={painelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Passar responsabilidade para outro agente"
        className="felixo-anim-sequential-panel max-h-[85vh] w-80 overflow-y-auto rounded-lg bg-zinc-800 p-4 shadow-2xl ring-1 ring-white/10"
      >
        <div className="mb-3 flex items-start justify-between gap-2">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
              <ArrowRightLeft size={15} />
              Passar responsabilidade
            </h2>
            <p className="mt-1 text-xs text-zinc-400">
              O novo agente recebe o histórico de <strong>{sourceLabel}</strong> como contexto e
              continua o trabalho.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="felixo-btn-icon shrink-0 rounded p-1 text-zinc-400 hover:bg-white/10 hover:text-zinc-100"
            aria-label="Fechar"
          >
            <X size={15} />
          </button>
        </div>

        <AgentConfigFields
          config={config}
          projects={projects}
          onAddFolder={onAddFolder}
          autoFocus
        />

        <p className="mb-3 rounded border border-amber-500/30 bg-amber-950/30 px-2.5 py-2 text-[11px] leading-relaxed text-amber-200/90">
          O histórico vai inteiro para o novo agente e pode conter tokens, senhas ou dados
          pessoais. Ele recebe o texto marcado como contexto não confiável, para validar o
          estado do projeto antes de agir.
        </p>

        {erro && <p className="mb-3 text-xs text-red-300">{erro}</p>}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="felixo-btn rounded px-3 py-1.5 text-sm text-zinc-300 hover:bg-white/5 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void confirmar()}
            disabled={busy}
            className="felixo-btn rounded bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
          >
            {busy ? 'Passando…' : 'Passar responsabilidade'}
          </button>
        </div>
      </div>
    </div>
  )
}

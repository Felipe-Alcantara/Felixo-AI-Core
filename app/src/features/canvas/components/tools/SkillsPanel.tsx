import { useCallback, useEffect, useId, useRef, useState } from 'react'
import {
  BrainCircuit,
  Check,
  ChevronDown,
  EyeOff,
  Pencil,
  Plus,
  Trash2,
  X,
  Zap,
} from 'lucide-react'
import { CanvasPanel } from './CanvasPanel'
import {
  hideSkillId,
  readSkillsCatalog,
  restoreSkillId,
  type SkillsCatalogState,
} from './skills-panel-catalog'
import type { CanvasSkill } from '../../types'

/** Result of activating a skill, so the panel can show the right feedback. */
export type SkillActivationResult = 'sent' | 'copied' | 'failed'

type SkillsPanelProps = {
  /** Sends the skill to the expanded terminal, or copies it as a fallback. */
  onActivateSkill: (skill: CanvasSkill) => Promise<SkillActivationResult>
  /**
   * Avisa quem cria agentes que a lista que eles recebem mudou (skill oculta,
   * restaurada, terceiros ligados/desligados, skill própria salva), para o
   * próximo agente já nascer com a lista nova.
   */
  onCatalogChange?: (skills: CanvasSkill[]) => void
  onClose: () => void
  /** Widens the toolbar column; the panel slides over to clear it. */
  toolsMenuOpen?: boolean
}

type SkillsSettings = { communityEnabled?: boolean; hiddenBuiltinIds?: string[] }

const emptyDraft = { name: '', description: '', path: '' }

const emptyCatalog: SkillsCatalogState = {
  skills: [],
  communityEnabled: true,
  hiddenIds: [],
  hiddenSkills: [],
}

/**
 * Ao tirar uma linha da lista, o botão acionado some junto e o foco cairia no
 * `<body>`. Devolve o botão com a mesma ação na linha vizinha (ou `fallback`),
 * para quem navega por teclado continuar no mesmo ponto da lista.
 */
function focusTargetAfterRemoval(
  trigger: HTMLElement,
  fallback: HTMLElement | null,
): HTMLElement | null {
  const row = trigger.closest('li')
  const neighbour = row?.nextElementSibling ?? row?.previousElementSibling
  const sameAction = `[data-skill-action="${trigger.dataset.skillAction}"]`
  return neighbour?.querySelector<HTMLElement>(sameAction) ?? fallback
}

/** Marca de skill de terceiros, com o repositório de onde ela vem. */
function CommunityBadge({ origin }: { origin?: string }) {
  return (
    <span className="shrink-0 rounded bg-[color-mix(in_srgb,var(--color-warning)_16%,transparent)] px-1 text-[10px] text-[var(--color-warning)]">
      {origin ?? 'terceiros'}
    </span>
  )
}

/**
 * Canvas skill library. A skill is a named pointer to a file; activating it
 * tells a connected agent where the skill lives so it reads and applies it.
 * Skills persist via the canvas settings bridge (canvas:get/set-skills).
 */
export function SkillsPanel({
  onActivateSkill,
  onCatalogChange,
  onClose,
  toolsMenuOpen,
}: SkillsPanelProps) {
  const [skills, setSkills] = useState<CanvasSkill[]>([])
  // Catálogo completo (biblioteca do app + terceiros + as da pessoa). É esta
  // lista que o agente recebe ao nascer, então o painel mostra o mesmo que ele
  // vê — sem isso a pessoa não tem como saber o que o agente sabe. Junto vêm
  // as skills do sistema que ela ocultou, para dar como restaurar.
  const [catalogo, setCatalogo] = useState<SkillsCatalogState>(emptyCatalog)
  const [mostrarOcultas, setMostrarOcultas] = useState(false)
  const [erroSistema, setErroSistema] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState(emptyDraft)
  const [feedbackId, setFeedbackId] = useState<string | null>(null)
  const [feedbackText, setFeedbackText] = useState('')
  const botaoOcultasRef = useRef<HTMLButtonElement>(null)
  const listaOcultasId = useId()

  const sistema = catalogo.skills.filter((item) => item.source !== 'user')

  const recarregarCatalogo = useCallback(async () => {
    const estado = readSkillsCatalog(await window.felixo?.canvas?.listAvailableSkills?.())
    if (estado) {
      setCatalogo(estado)
      onCatalogChange?.(estado.skills)
    }
  }, [onCatalogChange])

  useEffect(() => {
    let cancelled = false
    void window.felixo?.canvas?.getSkills?.().then((result) => {
      if (!cancelled && result?.ok && Array.isArray(result.skills)) {
        setSkills(result.skills)
      }
    })
    void window.felixo?.canvas?.listAvailableSkills?.().then((result) => {
      const estado = readSkillsCatalog(result)
      if (!cancelled && estado) {
        setCatalogo(estado)
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  const salvarConfiguracao = async (params: SkillsSettings) => {
    const result = await window.felixo?.canvas?.setSkillsSettings?.(params)
    setErroSistema(
      result && !result.ok
        ? result.message || 'Não foi possível salvar a configuração das skills.'
        : null,
    )
    // Recarrega mesmo quando falhou: o painel volta a mostrar o que está gravado.
    await recarregarCatalogo()
  }

  const alternarTerceiros = async () => {
    const proximo = !catalogo.communityEnabled
    setCatalogo((atual) => ({ ...atual, communityEnabled: proximo }))
    await salvarConfiguracao({ communityEnabled: proximo })
  }

  const ocultarSkill = async (skill: CanvasSkill, trigger: HTMLElement) => {
    if (document.activeElement === trigger) {
      focusTargetAfterRemoval(trigger, botaoOcultasRef.current)?.focus()
    }
    await salvarConfiguracao({ hiddenBuiltinIds: hideSkillId(catalogo.hiddenIds, skill.id) })
  }

  const restaurarSkill = async (skill: CanvasSkill, trigger: HTMLElement) => {
    if (document.activeElement === trigger) {
      focusTargetAfterRemoval(trigger, botaoOcultasRef.current)?.focus()
    }
    await salvarConfiguracao({
      hiddenBuiltinIds: restoreSkillId(catalogo.hiddenIds, skill.id),
    })
  }

  const persist = async (next: CanvasSkill[]) => {
    setSkills(next)
    await window.felixo?.canvas?.setSkills?.(next)
    await recarregarCatalogo()
  }

  const startNew = () => {
    setEditingId('new')
    setDraft(emptyDraft)
  }

  const startEdit = (skill: CanvasSkill) => {
    setEditingId(skill.id)
    setDraft({ name: skill.name, description: skill.description, path: skill.path })
  }

  const saveDraft = async () => {
    const name = draft.name.trim()
    const path = draft.path.trim()
    if (!name || !path) {
      return
    }
    const description = draft.description.trim()
    if (editingId === 'new') {
      const id = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`
      await persist([...skills, { id, name, description, path }])
    } else {
      await persist(
        skills.map((skill) =>
          skill.id === editingId ? { ...skill, name, description, path } : skill,
        ),
      )
    }
    setEditingId(null)
    setDraft(emptyDraft)
  }

  const removeSkill = async (id: string) => {
    await persist(skills.filter((skill) => skill.id !== id))
  }

  const activate = async (skill: CanvasSkill) => {
    const result = await onActivateSkill(skill)
    setFeedbackId(skill.id)
    setFeedbackText(
      result === 'sent'
        ? 'Enviada ao terminal aberto.'
        : result === 'copied'
          ? 'Sem terminal aberto — copiada para a área de transferência.'
          : 'O terminal não confirmou o recebimento. Tente novamente.',
    )
    window.setTimeout(() => setFeedbackId((id) => (id === skill.id ? null : id)), 2500)
  }

  return (
    <CanvasPanel
      title="Skills"
      panelId="skills"
      icon={<BrainCircuit size={15} />}
      onClose={onClose}
      toolsMenuOpen={toolsMenuOpen}
    >
      <button
        type="button"
        onClick={startNew}
        className="felixo-btn mb-3 flex items-center gap-1 rounded-sm bg-white/10 px-2 py-1 text-sm text-(--f-core-white) hover:bg-white/16"
      >
        <Plus size={14} />
        Nova skill
      </button>

      {editingId && (
        <div className="mb-3 flex flex-col gap-2 rounded-sm border border-white/10 bg-black/30 p-2">
          <input
            autoFocus
            value={draft.name}
            onChange={(event) => setDraft((d) => ({ ...d, name: event.target.value }))}
            placeholder="Nome"
            className="rounded-sm border border-white/10 bg-black/30 px-2 py-1 text-sm text-zinc-100 outline-hidden focus:border-white/10"
          />
          <input
            value={draft.path}
            onChange={(event) => setDraft((d) => ({ ...d, path: event.target.value }))}
            placeholder="Caminho do arquivo da skill"
            className="rounded-sm border border-white/10 bg-black/30 px-2 py-1 font-mono text-xs text-zinc-100 outline-hidden focus:border-white/10"
          />
          <textarea
            value={draft.description}
            onChange={(event) =>
              setDraft((d) => ({ ...d, description: event.target.value }))
            }
            placeholder="Descrição (opcional)"
            rows={2}
            className="resize-none rounded-sm border border-white/10 bg-black/30 px-2 py-1 text-xs text-zinc-100 outline-hidden focus:border-white/10"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void saveDraft()}
              disabled={!draft.name.trim() || !draft.path.trim()}
              className="felixo-btn rounded-sm bg-white/10 px-2 py-1 text-xs text-(--f-core-white) hover:bg-white/16 disabled:opacity-50"
            >
              Salvar
            </button>
            <button
              type="button"
              onClick={() => {
                setEditingId(null)
                setDraft(emptyDraft)
              }}
              className="felixo-btn rounded-sm px-2 py-1 text-xs text-zinc-400 hover:bg-white/10"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      <section className="mb-3 rounded-sm border border-white/10 bg-black/20 p-2">
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-zinc-300">
            Skills do sistema ({sistema.length})
          </span>
          <label className="flex cursor-pointer items-center gap-1 text-[11px] text-zinc-400">
            <input
              type="checkbox"
              checked={catalogo.communityEnabled}
              onChange={() => void alternarTerceiros()}
              className="accent-sky-500"
            />
            Usar skills de terceiros
          </label>
        </div>
        <p className="text-[11px] leading-snug text-zinc-500">
          Todo agente novo recebe esta lista (nome, para que serve e onde está) e
          lê o arquivo só quando a tarefa combinar. As de terceiros apontam para a
          fonte original — nada é baixado. O ícone de olho tira uma skill da lista.
        </p>
        <ul className="mt-2 flex max-h-40 flex-col gap-1 overflow-y-auto">
          {sistema.map((item) => (
            <li key={item.id} className="flex items-center gap-1.5 text-[11px]">
              <span className="truncate text-zinc-300" title={item.description}>
                {item.name}
              </span>
              {item.source === 'community' && <CommunityBadge origin={item.origin} />}
              <button
                type="button"
                onClick={() => void activate(item)}
                className="felixo-btn ml-auto shrink-0 rounded px-1 text-[10px] text-[var(--f-core-white-soft)] hover:bg-white/10"
                title="Ativar agora no terminal aberto"
              >
                Ativar
              </button>
              <button
                type="button"
                data-skill-action="ocultar"
                onClick={(event) => void ocultarSkill(item, event.currentTarget)}
                className="felixo-btn-icon shrink-0 rounded p-0.5 text-zinc-500 hover:bg-white/10 hover:text-zinc-200"
                title="Não enviar aos agentes"
                aria-label={`Não enviar a skill ${item.name} aos agentes`}
              >
                <EyeOff size={12} aria-hidden />
              </button>
            </li>
          ))}
        </ul>

        {erroSistema && (
          <p role="alert" className="mt-1 text-[11px] text-[var(--color-error)]">
            {erroSistema}
          </p>
        )}

        <div className="mt-2 border-t border-white/10 pt-2">
          <button
            ref={botaoOcultasRef}
            type="button"
            onClick={() => setMostrarOcultas((aberto) => !aberto)}
            aria-expanded={mostrarOcultas}
            aria-controls={listaOcultasId}
            className="felixo-btn flex items-center gap-1.5 rounded text-[11px] text-zinc-400 hover:text-zinc-200"
          >
            <EyeOff size={12} aria-hidden />
            Ocultas ({catalogo.hiddenSkills.length})
            <ChevronDown
              size={12}
              aria-hidden
              className={mostrarOcultas ? 'rotate-180 transition-transform' : 'transition-transform'}
            />
          </button>

          {mostrarOcultas && (
            <ul
              id={listaOcultasId}
              className="mt-1 max-h-32 overflow-y-auto rounded bg-zinc-800/40"
            >
              {catalogo.hiddenSkills.length ? (
                catalogo.hiddenSkills.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center gap-1.5 border-b border-white/5 px-2 py-1 text-[11px] last:border-b-0"
                  >
                    <span
                      className="min-w-0 flex-1 truncate text-zinc-400"
                      title={item.description}
                    >
                      {item.name}
                    </span>
                    {item.source === 'community' && <CommunityBadge origin={item.origin} />}
                    <button
                      type="button"
                      data-skill-action="restaurar"
                      onClick={(event) => void restaurarSkill(item, event.currentTarget)}
                      className="felixo-btn-icon shrink-0 rounded p-1 text-zinc-500 hover:bg-white/10 hover:text-zinc-200"
                      title="Voltar a enviar aos agentes"
                      aria-label={`Voltar a enviar a skill ${item.name} aos agentes`}
                    >
                      <X size={12} aria-hidden />
                    </button>
                  </li>
                ))
              ) : (
                <li className="px-2 py-1.5 text-[11px] text-zinc-500">
                  Nenhuma skill oculta. Use o ícone de olho ao lado de uma skill para
                  que os próximos agentes não a recebam.
                </li>
              )}
            </ul>
          )}
        </div>
      </section>

      {skills.length === 0 && !editingId && (
        <p className="text-sm text-zinc-500">
          Nenhuma skill sua ainda — as do sistema acima já estão disponíveis para
          todo agente. Crie uma apontando o caminho de um arquivo.
        </p>
      )}

      <ul className="felixo-anim-stagger-list flex flex-col gap-2">
        {skills.map((skill) => (
          <li key={skill.id} className="rounded-sm bg-zinc-800/60 p-2">
            <div className="mb-1 flex items-center gap-1">
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-100">
                {skill.name}
              </span>
              <button
                type="button"
                onClick={() => void activate(skill)}
                className="felixo-btn flex items-center gap-1 rounded-sm bg-white/10 px-1.5 py-0.5 text-xs text-(--f-core-white) hover:bg-white/16"
                title="Ativar: enviar ao terminal aberto (ou copiar)"
              >
                <Zap size={12} />
                Ativar
              </button>
              <button
                type="button"
                onClick={() => startEdit(skill)}
                className="felixo-btn-icon rounded-sm p-1 text-zinc-400 hover:bg-white/10 hover:text-zinc-100"
                title="Editar"
              >
                <Pencil size={13} />
              </button>
              <button
                type="button"
                onClick={() => void removeSkill(skill.id)}
                className="felixo-btn-icon rounded-sm p-1 text-zinc-400 hover:bg-white/10 hover:text-theme-error"
                title="Remover"
              >
                <Trash2 size={13} />
              </button>
            </div>
            <p className="truncate font-mono text-[11px] text-zinc-500" title={skill.path}>
              {skill.path}
            </p>
            {skill.description && (
              <p className="mt-0.5 text-xs text-zinc-500">{skill.description}</p>
            )}
            {feedbackId === skill.id && (
              <p className="mt-1 flex items-center gap-1 text-[11px] text-(--f-core-white-soft)">
                <Check size={11} />
                {feedbackText}
              </p>
            )}
          </li>
        ))}
      </ul>
    </CanvasPanel>
  )
}

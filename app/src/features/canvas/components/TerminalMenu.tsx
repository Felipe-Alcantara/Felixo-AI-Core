import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { ChevronDown, Plus, TerminalSquare, Trash2, X } from 'lucide-react'
import { useAgentConfig, type AgentConfigProject } from '../hooks/useAgentConfig'
import type { NewTerminalOptions } from '../services/new-terminal-options'
import { AgentConfigFields } from './AgentConfigFields'
import { isFelixoPopoverTarget } from '../../shared/components/felixo-popover-target'

export type { NewTerminalOptions } from '../services/new-terminal-options'

type TerminalMenuProps = {
  projects: AgentConfigProject[]
  /** Monotonic request from the canvas empty state; keeps the menu's own state local. */
  openRequest?: number
  onAdd: (options: NewTerminalOptions) => void
  /** Starts every queued config at once — see the "Fila" section below. */
  onAddMany: (optionsList: NewTerminalOptions[]) => void
  /** Adds a folder as a project (picker + detect repos), returns the new ids. */
  onAddFolder: () => Promise<string[]>
}

/**
 * Toolbar control for adding a terminal node. Pick an agent (or plain shell)
 * and a project, plus the agent's model / effort / yolo options — the fields
 * adapt to what each agent supports. A single click opens a local shell.
 *
 * Os campos em si vivem em `AgentConfigFields`, compartilhados com o diálogo de
 * passar responsabilidade; aqui fica o que é próprio da toolbar: o flyout e a
 * fila de configurações.
 */
export function TerminalMenu({
  projects,
  openRequest = 0,
  onAdd,
  onAddMany,
  onAddFolder,
}: TerminalMenuProps) {
  const fieldIdPrefix = useId()
  const [open, setOpen] = useState(false)
  const config = useAgentConfig(projects)
  // Configs queued up to start together — lets one click launch a whole
  // agent setup instead of repeating "configure, open" once per terminal.
  const [queue, setQueue] = useState<NewTerminalOptions[]>([])
  const [launching, setLaunching] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const lastOpenRequestRef = useRef(openRequest)

  useEffect(() => {
    if (openRequest !== lastOpenRequestRef.current) {
      lastOpenRequestRef.current = openRequest
      setOpen(true)
    }
  }, [openRequest])

  const closeSettings = useCallback(() => {
    setOpen(false)
  }, [])

  const toggleSettings = () => {
    if (open) {
      closeSettings()
      return
    }

    setOpen(true)
  }

  useEffect(() => {
    if (!open) {
      return
    }
    const restoreFocus = () => {
      window.requestAnimationFrame(() => triggerRef.current?.focus())
    }
    const onOutsideClick = (event: MouseEvent) => {
      if (containerRef.current?.contains(event.target as Node) || isFelixoPopoverTarget(event.target)) {
        return
      }
      closeSettings()
      restoreFocus()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !containerRef.current?.contains(event.target as Node)) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      closeSettings()
      restoreFocus()
    }
    document.addEventListener('click', onOutsideClick)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('click', onOutsideClick)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [closeSettings, open])

  const openTerminal = async () => {
    if (launching) return
    setLaunching(true)
    try {
      if (!(await config.prepareForLaunch())) {
        // O clique no botão compacto acontece com o painel fechado; reabri-lo
        // torna o erro de configuração visível e deixa a pessoa corrigir ali.
        if (!open) {
          setOpen(true)
        }
        return
      }
      const options = config.buildOptions()
      config.savePreferences()
      onAdd(options)
      config.setName('')
      closeSettings()
      window.requestAnimationFrame(() => triggerRef.current?.focus())
    } finally {
      setLaunching(false)
    }
  }

  // Adds the currently configured agent to the queue instead of opening it
  // right away, so the user can stack up several different setups (agent,
  // model, project…) and start them all in one go.
  const queueCurrent = async () => {
    if (launching) return
    setLaunching(true)
    try {
      if (!(await config.prepareForLaunch())) return
      config.savePreferences()
      setQueue((current) => [...current, config.buildOptions()])
      config.setName('')
    } finally {
      setLaunching(false)
    }
  }

  const startQueue = () => {
    if (queue.length === 0) {
      return
    }
    onAddMany(queue)
    setQueue([])
    closeSettings()
    window.requestAnimationFrame(() => triggerRef.current?.focus())
  }

  const removeQueued = (index: number) => {
    setQueue((current) => current.filter((_, i) => i !== index))
  }

  const renameQueued = (index: number, label: string) => {
    setQueue((current) =>
      current.map((item, i) => (i === index ? { ...item, label } : item)),
    )
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full"
    >
      {/*
        O `felixo-btn` fica na moldura, não nas metades: aplicado em cada metade,
        pressionar uma delas encolhia só ela e abria fresta no meio da pílula
        (medido em 24/08/2026: 2,34px pela metade rotulada, 1,35px pela setinha,
        com a moldura parada em `transform: none`). As metades usam
        `felixo-btn-flat`, que mantém transição e anel de foco sem o `scale`.
        Mesmo conserto do controle dividido do Organizar (commit 83178b9).
      */}
      <div className="felixo-btn felixo-sidebar-agent-trigger flex w-full overflow-hidden rounded-md">
        <button
          ref={triggerRef}
          type="button"
          onClick={() => void openTerminal()}
          disabled={launching}
          className="felixo-btn-flat flex flex-1 items-center gap-2 bg-transparent px-3 py-2 text-sm text-(--f-core-white-soft) hover:bg-white/6 disabled:opacity-50"
        >
          <TerminalSquare size={16} />
          Agente
        </button>
        <button
          type="button"
          onClick={toggleSettings}
          className="felixo-btn-flat border-l border-white/10 bg-zinc-800 px-1.5 text-zinc-300 hover:bg-zinc-700"
          aria-label="Configurar novo agente"
          aria-controls={`${fieldIdPrefix}-settings`}
          aria-expanded={open}
        >
          <ChevronDown size={14} />
        </button>
      </div>

      {open && (
        <div
          id={`${fieldIdPrefix}-settings`}
          role="group"
          aria-label="Configurar novo agente"
          onPointerDown={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
          className="felixo-anim-sequential-panel felixo-sidebar-inline-panel mt-2 w-full rounded-lg bg-zinc-800 p-3 shadow-xl ring-1 ring-white/10"
        >
          <AgentConfigFields
            config={config}
            projects={projects}
            onAddFolder={onAddFolder}
            autoFocus
          />

          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => void openTerminal()}
              disabled={launching}
              className="felixo-btn flex-1 rounded-sm felixo-primary-action px-3 py-1.5 text-sm disabled:opacity-50"
            >
              Abrir agente
            </button>
            <button
              type="button"
              onClick={() => void queueCurrent()}
              disabled={launching}
              title="Adicionar esta configuração à fila, para iniciar vários terminais de uma vez"
              aria-label="Adicionar à fila de terminais"
              className="felixo-btn-icon flex items-center justify-center rounded-sm bg-zinc-700 px-2 text-zinc-100 hover:bg-zinc-600"
            >
              <Plus size={14} />
            </button>
          </div>

          {queue.length > 0 && (
            <div className="mt-3 border-t border-white/10 pt-3">
              <div className="mb-1.5 flex items-center justify-between text-xs font-medium text-zinc-400">
                <span>Fila ({queue.length})</span>
                <button
                  type="button"
                  onClick={() => setQueue([])}
                  title="Esvaziar fila"
                  aria-label="Esvaziar fila de terminais"
                  className="felixo-btn-icon text-zinc-500 hover:text-zinc-300"
                >
                  <Trash2 size={12} />
                </button>
              </div>
              <ul className="mb-2 max-h-32 space-y-1 overflow-auto">
                {queue.map((item, index) => (
                  <li
                    key={index}
                    className="flex items-center gap-1 rounded-sm bg-zinc-900 px-1.5 py-1"
                  >
                    <input
                      value={item.label}
                      onChange={(event) => renameQueued(index, event.target.value)}
                      title="Renomear antes de iniciar"
                      aria-label={`Renomear "${item.label}" antes de iniciar`}
                      className="min-w-0 flex-1 rounded-sm bg-transparent px-1 py-0.5 text-xs text-zinc-200 outline-hidden ring-1 ring-transparent hover:ring-white/10 focus:bg-zinc-950 focus:ring-white/40"
                    />
                    <button
                      type="button"
                      onClick={() => removeQueued(index)}
                      aria-label={`Remover "${item.label}" da fila`}
                      className="felixo-btn-icon shrink-0 text-zinc-500 hover:text-zinc-300"
                    >
                      <X size={12} />
                    </button>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={startQueue}
                className="felixo-btn w-full rounded-sm felixo-primary-action px-3 py-1.5 text-sm "
              >
                Iniciar {queue.length} terminais
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
        }

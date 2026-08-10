import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { ChevronDown, Plus, TerminalSquare, Trash2, X } from 'lucide-react'
import { useAgentConfig, type AgentConfigProject } from '../hooks/useAgentConfig'
import { useDeferredExpansionPanel } from '../hooks/useDeferredExpansionPanel'
import type { NewTerminalOptions } from '../services/new-terminal-options'
import { AgentConfigFields } from './AgentConfigFields'
import {
  toolbarFlyoutClass,
  toolbarFlyoutStyle,
  useToolbarFlyoutPosition,
} from './toolbar-flyout'

export type { NewTerminalOptions } from '../services/new-terminal-options'

type TerminalMenuProps = {
  projects: AgentConfigProject[]
  onAdd: (options: NewTerminalOptions) => void
  /** Starts every queued config at once — see the "Fila" section below. */
  onAddMany: (optionsList: NewTerminalOptions[]) => void
  /** Adds a folder as a project (picker + detect repos), returns the new ids. */
  onAddFolder: () => Promise<string[]>
  /** Keeps this panel in a second column while the tools submenu is open. */
  toolsMenuOpen?: boolean
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
  onAdd,
  onAddMany,
  onAddFolder,
  toolsMenuOpen = false,
}: TerminalMenuProps) {
  const fieldIdPrefix = useId()
  const [open, setOpen] = useState(false)
  const {
    panelReady: settingsReady,
    preparePanel,
    resetPanel,
    markPanelReady,
  } = useDeferredExpansionPanel(open)
  const config = useAgentConfig(projects)
  // Configs queued up to start together — lets one click launch a whole
  // agent setup instead of repeating "configure, open" once per terminal.
  const [queue, setQueue] = useState<NewTerminalOptions[]>([])
  const containerRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const flyoutPosition = useToolbarFlyoutPosition({
    open: open && settingsReady,
    toolsMenuOpen,
    containerRef,
    panelRef,
    panelWidth: 256,
    placement: 'below',
  })

  const closeSettings = useCallback(() => {
    resetPanel()
    setOpen(false)
  }, [resetPanel])

  const toggleSettings = () => {
    if (open) {
      closeSettings()
      return
    }

    preparePanel()
    setOpen(true)
  }

  useEffect(() => {
    if (!open) {
      return
    }
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        closeSettings()
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [closeSettings, open])

  const openTerminal = () => {
    const options = config.buildOptions()
    config.savePreferences()
    onAdd(options)
    config.setName('')
    closeSettings()
  }

  // Adds the currently configured agent to the queue instead of opening it
  // right away, so the user can stack up several different setups (agent,
  // model, project…) and start them all in one go.
  const queueCurrent = () => {
    config.savePreferences()
    setQueue((current) => [...current, config.buildOptions()])
    config.setName('')
  }

  const startQueue = () => {
    if (queue.length === 0) {
      return
    }
    onAddMany(queue)
    setQueue([])
    closeSettings()
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
      className={`relative transition-[width] duration-[620ms] ease-[cubic-bezier(0.16,1,0.3,1)] ${
        open ? 'w-[25.5rem]' : 'w-36'
      }`}
      onTransitionEnd={(event) => {
        if (event.target === event.currentTarget && event.propertyName === 'width' && open) {
          markPanelReady()
        }
      }}
    >
      <div className="flex w-full overflow-hidden rounded-lg shadow-lg ring-1 ring-white/10">
        <button
          type="button"
          onClick={openTerminal}
          className="felixo-btn flex flex-1 items-center gap-2 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 hover:bg-zinc-700"
        >
          <TerminalSquare size={16} />
          Agente
        </button>
        <button
          type="button"
          onClick={toggleSettings}
          className="felixo-btn-icon border-l border-white/10 bg-zinc-800 px-1.5 text-zinc-300 hover:bg-zinc-700"
          aria-label="Configurar novo agente"
          aria-controls={`${fieldIdPrefix}-settings`}
          aria-expanded={open}
        >
          <ChevronDown size={14} />
        </button>
      </div>

      {open && settingsReady && (
        <div
          ref={panelRef}
          id={`${fieldIdPrefix}-settings`}
          onPointerDown={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
          style={toolbarFlyoutStyle(flyoutPosition)}
          className={`felixo-anim-sequential-panel ${toolbarFlyoutClass('below')} ${flyoutPosition ? '' : 'invisible'} w-64 overflow-y-auto rounded-lg bg-zinc-800 p-3 shadow-xl ring-1 ring-white/10`}
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
              onClick={openTerminal}
              className="felixo-btn flex-1 rounded bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-600"
            >
              Abrir agente
            </button>
            <button
              type="button"
              onClick={queueCurrent}
              title="Adicionar esta configuração à fila, para iniciar vários terminais de uma vez"
              aria-label="Adicionar à fila de terminais"
              className="felixo-btn-icon flex items-center justify-center rounded bg-zinc-700 px-2 text-zinc-100 hover:bg-zinc-600"
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
                    className="flex items-center gap-1 rounded bg-zinc-900 px-1.5 py-1"
                  >
                    <input
                      value={item.label}
                      onChange={(event) => renameQueued(index, event.target.value)}
                      title="Renomear antes de iniciar"
                      aria-label={`Renomear "${item.label}" antes de iniciar`}
                      className="min-w-0 flex-1 rounded bg-transparent px-1 py-0.5 text-xs text-zinc-200 outline-none ring-1 ring-transparent hover:ring-white/10 focus:bg-zinc-950 focus:ring-emerald-500/50"
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
                className="felixo-btn w-full rounded bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-600"
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

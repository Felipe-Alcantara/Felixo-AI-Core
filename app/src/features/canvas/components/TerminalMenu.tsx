import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { ChevronDown, Plus, TerminalSquare, Trash2, X } from 'lucide-react'
import {
  AGENTS,
  buildAgentArgs,
  describeLaunch,
  getAgent,
  getEffortLevels,
  isEffortValidForModel,
  type EffortLevel,
} from '../services/agent-launch-options'
import {
  readAgentLaunchPreferences,
  saveAgentLaunchPreferences,
  SHELL_AGENT_VALUE,
  type AgentLaunchPreferences,
} from '../services/agent-launch-preferences'
import { useDeferredExpansionPanel } from '../hooks/useDeferredExpansionPanel'
import {
  toolbarFlyoutClass,
  toolbarFlyoutStyle,
  useToolbarFlyoutPosition,
} from './toolbar-flyout'

type TerminalMenuProject = { id: string; name: string; path: string }

export type NewTerminalOptions = {
  command?: string
  args?: string[]
  cwd?: string
  label: string
  planningFile?: string
}

type TerminalMenuProps = {
  projects: TerminalMenuProject[]
  onAdd: (options: NewTerminalOptions) => void
  /** Starts every queued config at once — see the "Fila" section below. */
  onAddMany: (optionsList: NewTerminalOptions[]) => void
  /** Adds a folder as a project (picker + detect repos), returns the new ids. */
  onAddFolder: () => Promise<string[]>
  /** Keeps this panel in a second column while the tools submenu is open. */
  toolsMenuOpen?: boolean
}

/** Sentinel value in the project select that triggers the folder picker. */
const ADD_FOLDER_VALUE = '__add_folder__'
/**
 * Toolbar control for adding a terminal node. Pick an agent (or plain shell)
 * and a project, plus the agent's model / effort / yolo options — the fields
 * adapt to what each agent supports. A single click opens a local shell.
 */
export function TerminalMenu({
  projects,
  onAdd,
  onAddMany,
  onAddFolder,
  toolsMenuOpen = false,
}: TerminalMenuProps) {
  const [initialPreferences] = useState(readAgentLaunchPreferences)
  const fieldIdPrefix = useId()
  const [open, setOpen] = useState(false)
  const {
    panelReady: settingsReady,
    preparePanel,
    resetPanel,
    markPanelReady,
  } = useDeferredExpansionPanel(open)
  const [agentValue, setAgentValue] = useState<AgentLaunchPreferences['agentValue']>(
    initialPreferences.agentValue,
  )
  const [model, setModel] = useState(initialPreferences.model)
  const [effort, setEffort] = useState(initialPreferences.effort)
  const [yolo, setYolo] = useState(initialPreferences.yolo)
  const [projectId, setProjectId] = useState(initialPreferences.projectId)
  const [name, setName] = useState('')
  const [planningFile, setPlanningFile] = useState(initialPreferences.planningFile)
  // Configs queued up to start together — lets one click launch a whole
  // agent setup instead of repeating "configure, open" once per terminal.
  const [queue, setQueue] = useState<NewTerminalOptions[]>([])
  const containerRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const planningFileInputRef = useRef<HTMLInputElement>(null)
  const flyoutPosition = useToolbarFlyoutPosition({
    open: open && settingsReady,
    toolsMenuOpen,
    containerRef,
    panelRef,
    panelWidth: 256,
    placement: 'below',
  })

  const agent = agentValue === SHELL_AGENT_VALUE ? undefined : getAgent(agentValue)
  const effortLevels = agent ? getEffortLevels(agent, model) : null

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

  const handleModelChange = (value: string) => {
    setModel(value)
    if (agent && !isEffortValidForModel(agent, value, effort)) {
      setEffort('')
    }
  }

  const saveCurrentPreferences = () => {
    saveAgentLaunchPreferences({
      agentValue,
      model,
      effort,
      yolo,
      projectId,
      planningFile,
    })
  }

  const handleProjectChange = async (value: string) => {
    if (value !== ADD_FOLDER_VALUE) {
      setProjectId(value)
      return
    }
    const addedIds = await onAddFolder()
    setProjectId(addedIds[0] ?? '')
  }

  const buildOptions = (): NewTerminalOptions => {
    const project = projects.find((item) => item.id === projectId)
    const place = project ? project.name : 'local'
    const customName = name.trim()

    if (!agent) {
      return { cwd: project?.path, label: customName || `Shell · ${place}` }
    }

    const choices = {
      agentId: agent.id,
      model: model || undefined,
      effort: (effort || undefined) as EffortLevel | undefined,
      yolo,
    }
    return {
      command: agent.command,
      args: buildAgentArgs(choices) ?? undefined,
      cwd: project?.path,
      label: customName || `${describeLaunch(choices)} · ${place}`,
      planningFile: planningFile.trim() || undefined,
    }
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
    const options = buildOptions()
    saveCurrentPreferences()
    onAdd(options)
    setName('')
    closeSettings()
  }

  // Adds the currently configured agent to the queue instead of opening it
  // right away, so the user can stack up several different setups (agent,
  // model, project…) and start them all in one go.
  const queueCurrent = () => {
    saveCurrentPreferences()
    setQueue((current) => [...current, buildOptions()])
    setName('')
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
          <label htmlFor={`${fieldIdPrefix}-name`} className="mb-1 block text-xs font-medium text-zinc-400">
            Nome (opcional)
          </label>
          <input
            id={`${fieldIdPrefix}-name`}
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Ex.: Agente de testes"
            className="mb-3 w-full rounded bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100 outline-none ring-1 ring-white/10 placeholder:text-zinc-600 focus:ring-emerald-500/50"
          />

          <label htmlFor={`${fieldIdPrefix}-agent`} className="mb-1 block text-xs font-medium text-zinc-400">Agente</label>
          <select
            id={`${fieldIdPrefix}-agent`}
            value={agentValue}
            onChange={(event) => {
              setAgentValue(event.target.value as AgentLaunchPreferences['agentValue'])
              setModel('')
              setEffort('')
            }}
            className="mb-3 w-full rounded bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100 ring-1 ring-white/10"
          >
            <option value={SHELL_AGENT_VALUE}>Nenhum (shell)</option>
            {AGENTS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>

          {agent && (
            <>
              <label htmlFor={`${fieldIdPrefix}-model`} className="mb-1 block text-xs font-medium text-zinc-400">Modelo</label>
              <select
                id={`${fieldIdPrefix}-model`}
                value={model}
                onChange={(event) => handleModelChange(event.target.value)}
                className="mb-3 w-full rounded bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100 ring-1 ring-white/10"
              >
                <option value="">Padrão</option>
                {agent.models.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>

              {effortLevels && (
                <>
                  <label htmlFor={`${fieldIdPrefix}-effort`} className="mb-1 block text-xs font-medium text-zinc-400">
                    Esforço de raciocínio
                  </label>
                  <select
                    id={`${fieldIdPrefix}-effort`}
                    value={effort}
                    onChange={(event) => setEffort(event.target.value)}
                    className="mb-3 w-full rounded bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100 ring-1 ring-white/10"
                  >
                    <option value="">Padrão</option>
                    {effortLevels.map((level) => (
                      <option key={level} value={level}>
                        {level}
                      </option>
                    ))}
                  </select>
                </>
              )}

              <label className="mb-3 flex items-center gap-2 text-xs font-medium text-zinc-300">
                <input
                  type="checkbox"
                  checked={yolo}
                  onChange={(event) => setYolo(event.target.checked)}
                  className="accent-emerald-600"
                />
                Yolo (acesso total, sem confirmações)
              </label>
            </>
          )}

          {agent && (
            <>
              <label htmlFor={`${fieldIdPrefix}-planning-file`} className="mb-1 block text-xs font-medium text-zinc-400">Arquivo de planejamento</label>
              <div className="mb-3 flex gap-1.5">
                <input
                  id={`${fieldIdPrefix}-planning-file`}
                  value={planningFile}
                  onChange={(event) => setPlanningFile(event.target.value)}
                  placeholder="Caminho para um arquivo (opcional)"
                  className="min-w-0 flex-1 rounded bg-zinc-900 px-2 py-1.5 text-xs text-zinc-100 outline-none ring-1 ring-white/10 placeholder:text-zinc-600 focus:ring-emerald-500/50"
                />
                <button
                  type="button"
                  onClick={() => planningFileInputRef.current?.click()}
                  className="felixo-btn-icon rounded bg-zinc-700 px-2 text-xs text-zinc-200 hover:bg-zinc-600"
                  title="Selecionar arquivo de planejamento"
                  aria-label="Selecionar arquivo de planejamento"
                >
                  …
                </button>
                <input
                  ref={planningFileInputRef}
                  type="file"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    if (!file) return
                    const selectedPath = window.felixo?.getFilePath?.(file) || file.name
                    setPlanningFile(selectedPath)
                    event.target.value = ''
                  }}
                />
              </div>
            </>
          )}

          <label htmlFor={`${fieldIdPrefix}-project`} className="mb-1 block text-xs font-medium text-zinc-400">Projeto</label>
          <select
            id={`${fieldIdPrefix}-project`}
            value={projectId}
            onChange={(event) => void handleProjectChange(event.target.value)}
            className="mb-3 w-full rounded bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100 ring-1 ring-white/10"
          >
            <option value="">Local (sem projeto)</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
            <option value={ADD_FOLDER_VALUE}>+ Adicionar pasta…</option>
          </select>

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

import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Plus, TerminalSquare, Trash2, X } from 'lucide-react'
import {
  AGENTS,
  buildAgentArgs,
  describeLaunch,
  getAgent,
  type AgentId,
  type EffortLevel,
} from '../services/agent-launch-options'

type TerminalMenuProject = { id: string; name: string; path: string }

export type NewTerminalOptions = {
  command?: string
  args?: string[]
  cwd?: string
  label: string
}

type TerminalMenuProps = {
  projects: TerminalMenuProject[]
  onAdd: (options: NewTerminalOptions) => void
  /** Starts every queued config at once — see the "Fila" section below. */
  onAddMany: (optionsList: NewTerminalOptions[]) => void
  /** Adds a folder as a project (picker + detect repos), returns the new ids. */
  onAddFolder: () => Promise<string[]>
}

/** Sentinel value in the project select that triggers the folder picker. */
const ADD_FOLDER_VALUE = '__add_folder__'
/** Sentinel agent value for a plain shell (no agent). */
const SHELL_VALUE = '__shell__'

/**
 * Toolbar control for adding a terminal node. Pick an agent (or plain shell)
 * and a project, plus the agent's model / effort / yolo options — the fields
 * adapt to what each agent supports. A single click opens a local shell.
 */
export function TerminalMenu({ projects, onAdd, onAddMany, onAddFolder }: TerminalMenuProps) {
  const [open, setOpen] = useState(false)
  const [agentValue, setAgentValue] = useState<string>(SHELL_VALUE)
  const [model, setModel] = useState('')
  const [effort, setEffort] = useState('')
  const [yolo, setYolo] = useState(false)
  const [projectId, setProjectId] = useState<string>('')
  const [name, setName] = useState('')
  // Configs queued up to start together — lets one click launch a whole
  // agent setup instead of repeating "configure, open" once per terminal.
  const [queue, setQueue] = useState<NewTerminalOptions[]>([])
  const containerRef = useRef<HTMLDivElement>(null)

  const agent = agentValue === SHELL_VALUE ? undefined : getAgent(agentValue as AgentId)

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
    }
  }

  useEffect(() => {
    if (!open) {
      return
    }
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open])

  const openTerminal = () => {
    onAdd(buildOptions())
    setName('')
    setOpen(false)
  }

  // Adds the currently configured agent to the queue instead of opening it
  // right away, so the user can stack up several different setups (agent,
  // model, project…) and start them all in one go.
  const queueCurrent = () => {
    setQueue((current) => [...current, buildOptions()])
    setName('')
  }

  const startQueue = () => {
    if (queue.length === 0) {
      return
    }
    onAddMany(queue)
    setQueue([])
    setOpen(false)
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
    <div ref={containerRef} className="relative">
      <div className="flex overflow-hidden rounded-lg shadow-lg ring-1 ring-white/10">
        <button
          type="button"
          onClick={openTerminal}
          className="felixo-btn flex items-center gap-2 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 hover:bg-zinc-700"
        >
          <TerminalSquare size={16} />
          Terminal
        </button>
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          className="felixo-btn-icon border-l border-white/10 bg-zinc-800 px-1.5 text-zinc-300 hover:bg-zinc-700"
          aria-label="Configurar novo terminal"
        >
          <ChevronDown size={14} />
        </button>
      </div>

      {open && (
        <div className="absolute left-0 top-full mt-1 w-64 rounded-lg bg-zinc-800 p-3 shadow-xl ring-1 ring-white/10">
          <label className="mb-1 block text-xs font-medium text-zinc-400">
            Nome (opcional)
          </label>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Ex.: Agente de testes"
            className="mb-3 w-full rounded bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100 outline-none ring-1 ring-white/10 placeholder:text-zinc-600 focus:ring-emerald-500/50"
          />

          <label className="mb-1 block text-xs font-medium text-zinc-400">Agente</label>
          <select
            value={agentValue}
            onChange={(event) => {
              setAgentValue(event.target.value)
              setModel('')
              setEffort('')
            }}
            className="mb-3 w-full rounded bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100 ring-1 ring-white/10"
          >
            <option value={SHELL_VALUE}>Nenhum (shell)</option>
            {AGENTS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>

          {agent && (
            <>
              <label className="mb-1 block text-xs font-medium text-zinc-400">Modelo</label>
              <select
                value={model}
                onChange={(event) => setModel(event.target.value)}
                className="mb-3 w-full rounded bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100 ring-1 ring-white/10"
              >
                <option value="">Padrão</option>
                {agent.models.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>

              {agent.effortLevels && (
                <>
                  <label className="mb-1 block text-xs font-medium text-zinc-400">
                    Esforço de raciocínio
                  </label>
                  <select
                    value={effort}
                    onChange={(event) => setEffort(event.target.value)}
                    className="mb-3 w-full rounded bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100 ring-1 ring-white/10"
                  >
                    <option value="">Padrão</option>
                    {agent.effortLevels.map((level) => (
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

          <label className="mb-1 block text-xs font-medium text-zinc-400">Projeto</label>
          <select
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
              Abrir terminal
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

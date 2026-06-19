import { useEffect, useRef, useState } from 'react'
import { ChevronDown, TerminalSquare } from 'lucide-react'

type TerminalMenuProject = { id: string; name: string; path: string }

export type TerminalAgent = {
  /** Command to run; undefined means a plain shell. */
  command?: string
  label: string
}

export type NewTerminalOptions = {
  command?: string
  cwd?: string
  label: string
}

type TerminalMenuProps = {
  projects: TerminalMenuProject[]
  onAdd: (options: NewTerminalOptions) => void
}

const AGENTS: TerminalAgent[] = [
  { command: undefined, label: 'Shell' },
  { command: 'claude', label: 'Claude' },
  { command: 'gemini', label: 'Gemini' },
  { command: 'codex', label: 'Codex' },
]

/**
 * Toolbar control for adding a terminal node. Pick an agent (or plain shell)
 * and a project (or local), then open — both default to "none", so a single
 * click opens a local shell. The block name is derived from the selection.
 */
export function TerminalMenu({ projects, onAdd }: TerminalMenuProps) {
  const [open, setOpen] = useState(false)
  const [agentIndex, setAgentIndex] = useState(0)
  const [projectId, setProjectId] = useState<string>('')
  const containerRef = useRef<HTMLDivElement>(null)

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
    const agent = AGENTS[agentIndex]
    const project = projects.find((item) => item.id === projectId)
    const place = project ? project.name : 'local'

    onAdd({
      command: agent.command,
      cwd: project?.path,
      label: `${agent.label} · ${place}`,
    })
    setOpen(false)
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="flex overflow-hidden rounded-lg shadow-lg ring-1 ring-white/10">
        <button
          type="button"
          onClick={openTerminal}
          className="flex items-center gap-2 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 hover:bg-zinc-700"
        >
          <TerminalSquare size={16} />
          Terminal
        </button>
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          className="border-l border-white/10 bg-zinc-800 px-1.5 text-zinc-300 hover:bg-zinc-700"
          aria-label="Configurar novo terminal"
        >
          <ChevronDown size={14} />
        </button>
      </div>

      {open && (
        <div className="absolute left-0 top-full mt-1 w-64 rounded-lg bg-zinc-800 p-3 shadow-xl ring-1 ring-white/10">
          <label className="mb-1 block text-xs font-medium text-zinc-400">Agente</label>
          <select
            value={agentIndex}
            onChange={(event) => setAgentIndex(Number(event.target.value))}
            className="mb-3 w-full rounded bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100 ring-1 ring-white/10"
          >
            {AGENTS.map((agent, index) => (
              <option key={agent.label} value={index}>
                {agent.command ? agent.label : 'Nenhum (shell)'}
              </option>
            ))}
          </select>

          <label className="mb-1 block text-xs font-medium text-zinc-400">Projeto</label>
          <select
            value={projectId}
            onChange={(event) => setProjectId(event.target.value)}
            className="mb-3 w-full rounded bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100 ring-1 ring-white/10"
          >
            <option value="">Local (sem projeto)</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={openTerminal}
            className="w-full rounded bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-600"
          >
            Abrir terminal
          </button>
        </div>
      )}
    </div>
  )
}

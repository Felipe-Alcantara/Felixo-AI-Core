import { useEffect, useRef, useState } from 'react'
import { ChevronDown, FolderOpen, Monitor, TerminalSquare } from 'lucide-react'

type TerminalMenuProject = { id: string; name: string; path: string }

type TerminalMenuProps = {
  projects: TerminalMenuProject[]
  /** Called with the chosen project, or undefined for a plain local shell. */
  onAdd: (project?: { name: string; path: string }) => void
}

/**
 * Toolbar control for adding a terminal node. Clicking adds a local shell;
 * the caret opens a menu to instead open the terminal in a known project's
 * folder (cwd = project path).
 */
export function TerminalMenu({ projects, onAdd }: TerminalMenuProps) {
  const [open, setOpen] = useState(false)
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

  return (
    <div ref={containerRef} className="relative">
      <div className="flex overflow-hidden rounded-lg shadow-lg ring-1 ring-white/10">
        <button
          type="button"
          onClick={() => onAdd()}
          className="flex items-center gap-2 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 hover:bg-zinc-700"
        >
          <TerminalSquare size={16} />
          Terminal
        </button>
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          className="border-l border-white/10 bg-zinc-800 px-1.5 text-zinc-300 hover:bg-zinc-700"
          aria-label="Escolher projeto para o terminal"
        >
          <ChevronDown size={14} />
        </button>
      </div>

      {open && (
        <div className="absolute left-0 top-full mt-1 w-60 overflow-hidden rounded-lg bg-zinc-800 py-1 shadow-xl ring-1 ring-white/10">
          <button
            type="button"
            onClick={() => {
              onAdd()
              setOpen(false)
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-zinc-100 hover:bg-zinc-700"
          >
            <Monitor size={15} className="shrink-0 opacity-70" />
            Local (sem projeto)
          </button>

          {projects.length > 0 && (
            <div className="my-1 border-t border-white/10" />
          )}

          {projects.map((project) => (
            <button
              key={project.id}
              type="button"
              onClick={() => {
                onAdd({ name: project.name, path: project.path })
                setOpen(false)
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-zinc-100 hover:bg-zinc-700"
              title={project.path}
            >
              <FolderOpen size={15} className="shrink-0 opacity-70" />
              <span className="min-w-0 flex-1 truncate">{project.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Bot,
  Code2,
  Folder,
  PanelLeft,
  Plus,
  Search,
  Settings,
  SlidersHorizontal,
  Sparkles,
  User,
} from 'lucide-react'
import type { Model } from '../types'

const MIN_WIDTH = 160
const MAX_WIDTH = 480
const DEFAULT_WIDTH = 244

type AppSidebarProps = {
  models: Model[]
  isOpen: boolean
  onNewIdea: () => void
  onOpenModelSettings: () => void
  onToggleSidebar: () => void
  onSearch: () => void
}

const navItems = [
  { label: 'Novo chat', icon: Plus },
  { label: 'Pesquisar', icon: Search },
  { label: 'Projetos', icon: Folder },
  { label: 'Automações', icon: Sparkles },
]

export function AppSidebar({
  models,
  isOpen,
  onNewIdea,
  onOpenModelSettings,
  onToggleSidebar,
  onSearch,
}: AppSidebarProps) {
  const [width, setWidth] = useState(DEFAULT_WIDTH)
  const [dragging, setDragging] = useState(false)
  const isDragging = useRef(false)
  const startX = useRef(0)
  const startWidth = useRef(0)

  const onMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging.current) return
    const delta = e.clientX - startX.current
    const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth.current + delta))
    setWidth(next)
  }, [])

  const onMouseUp = useCallback(() => {
    isDragging.current = false
    setDragging(false)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }, [])

  useEffect(() => {
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
    return () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
  }, [onMouseMove, onMouseUp])

  function handleDragStart(e: React.MouseEvent) {
    isDragging.current = true
    setDragging(true)
    startX.current = e.clientX
    startWidth.current = width
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }

  function handleNavClick(label: string) {
    if (label === 'Novo chat') onNewIdea()
    else if (label === 'Pesquisar') onSearch()
  }

  return (
    <aside
      style={isOpen ? { width } : undefined}
      className={[
        'relative flex shrink-0 flex-col border-r border-white/[0.08] bg-[#272727] text-zinc-300',
        dragging ? '' : 'transition-[width] duration-300 ease-in-out',
        'max-[920px]:hidden',
        isOpen ? '' : 'w-0 border-r-0',
      ].join(' ')}
    >
      <div className="flex h-12 items-center justify-end px-4">
        <div className="flex items-center gap-2 text-zinc-500">
          <button
            type="button"
            title="Recolher sidebar"
            onClick={onToggleSidebar}
            className="rounded p-0.5 transition hover:text-zinc-300"
          >
            <PanelLeft size={13} />
          </button>
          <button
            type="button"
            title="Pesquisar"
            onClick={onSearch}
            className="rounded p-0.5 transition hover:text-zinc-300"
          >
            <Search size={13} />
          </button>
        </div>
      </div>

      <nav className="space-y-1 px-4 pt-2 text-[13px] max-xl:px-3">
        {navItems.map((item) => {
          const Icon = item.icon
          return (
            <button
              key={item.label}
              type="button"
              onClick={() => handleNavClick(item.label)}
              className="flex h-7 w-full items-center gap-2 rounded-lg px-1.5 text-left text-zinc-300 transition hover:bg-white/[0.06] hover:text-white"
            >
              <Icon size={14} aria-hidden="true" />
              {item.label}
            </button>
          )
        })}
      </nav>

      <div className="mt-5 px-4 max-xl:px-3">
        <div className="mb-2 flex items-center justify-between text-[11px] text-zinc-500">
          <span>Modelos</span>
          <button
            type="button"
            title="Configurar modelos"
            onClick={onOpenModelSettings}
            className="flex h-6 w-6 items-center justify-center rounded-full transition hover:bg-white/[0.06] hover:text-zinc-200"
          >
            <SlidersHorizontal size={12} aria-hidden="true" />
            <span className="sr-only">Configurar modelos</span>
          </button>
        </div>
        <div className="space-y-1">
          {models.map((model) => (
            <div
              key={model.id}
              className="flex min-h-8 w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[12px] text-zinc-400"
            >
              <Bot size={13} aria-hidden="true" className="shrink-0" />
              <span className="min-w-0">
                <span className="block truncate">{model.name}</span>
                <span className="block truncate text-[10px] text-zinc-500">
                  {model.source}
                </span>
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1" />

      <div className="mt-auto border-t border-white/[0.08] px-4 py-3 max-xl:px-3">
        <button
          type="button"
          onClick={onNewIdea}
          className="mb-1 flex h-8 w-full items-center gap-2 rounded-lg px-1.5 text-left text-[12px] text-zinc-400 transition hover:bg-white/[0.06] hover:text-zinc-200"
        >
          <Code2 size={13} aria-hidden="true" />
          Code
        </button>
        <button
          type="button"
          onClick={onOpenModelSettings}
          className="flex h-8 w-full items-center justify-between rounded-lg px-1.5 text-left text-[12px] text-zinc-400 transition hover:bg-white/[0.06] hover:text-zinc-200"
        >
          <span className="flex items-center gap-2">
            <User size={13} aria-hidden="true" />
            Felixo
          </span>
          <Settings size={13} aria-hidden="true" />
        </button>
      </div>

      {/* Drag handle */}
      <div
        onMouseDown={handleDragStart}
        className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-white/10 active:bg-white/20"
      />
    </aside>
  )
}

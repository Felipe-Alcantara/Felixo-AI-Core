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

type AppSidebarProps = {
  models: Model[]
  recentItems: string[]
  onNewIdea: () => void
  onOpenModelSettings: () => void
}

const navItems = [
  { label: 'Novo chat', icon: Plus },
  { label: 'Pesquisar', icon: Search },
  { label: 'Projetos', icon: Folder },
  { label: 'Automações', icon: Sparkles },
]

export function AppSidebar({
  models,
  recentItems,
  onNewIdea,
  onOpenModelSettings,
}: AppSidebarProps) {
  return (
    <aside className="flex w-[244px] shrink-0 flex-col border-r border-white/[0.08] bg-[#272727] text-zinc-300 max-[920px]:hidden max-xl:w-[224px]">
      <div className="flex h-12 items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-[#ff605c]" />
          <span className="h-3 w-3 rounded-full bg-[#ffbd44]" />
          <span className="h-3 w-3 rounded-full bg-[#00ca4e]" />
        </div>
        <div className="flex items-center gap-2 text-zinc-500">
          <PanelLeft size={13} aria-hidden="true" />
          <Search size={13} aria-hidden="true" />
        </div>
      </div>

      <nav className="space-y-1 px-4 pt-2 text-[13px] max-xl:px-3">
        {navItems.map((item) => {
          const Icon = item.icon
          return (
            <button
              key={item.label}
              type="button"
              onClick={item.label === 'Novo chat' ? onNewIdea : undefined}
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

      <div className="mt-5 min-h-0 flex-1 overflow-hidden px-4 max-xl:px-3">
        <div className="mb-2 text-[11px] text-zinc-500">Recentes</div>
        <div className="space-y-1 overflow-y-auto pr-1">
          {recentItems.map((item) => (
            <button
              key={item}
              type="button"
              className="block h-7 w-full truncate rounded-lg px-1.5 text-left text-[12px] text-zinc-400 transition hover:bg-white/[0.06] hover:text-zinc-200"
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-auto border-t border-white/[0.08] px-4 py-3 max-xl:px-3">
        <button
          type="button"
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
    </aside>
  )
}

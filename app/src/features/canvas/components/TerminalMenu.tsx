import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { Cloud, ChevronDown, Plus, TerminalSquare, Trash2, X } from 'lucide-react'
import { CHAIN_ACCOUNT_VALUE, CLOUD_AGENT_VALUE } from '../services/agent-launch-preferences'
import { confirmChainLaunch, discardChainPreview, getAccountChainBridge, previewChainLaunch } from '../services/account-chain-client'
import { startLaunchQueue, type QueuedLaunch } from '../services/terminal-launch-queue'
import { useAgentConfig, type AgentConfigProject } from '../hooks/useAgentConfig'
import type {
  NewClaudeApiOptions,
  NewCloudSessionOptions,
  NewTerminalOptions,
} from '../services/new-terminal-options'
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
  /** Cria o cartão "Agente na nuvem" já configurado; nada é disparado aqui. */
  onAddCloud: (options: NewCloudSessionOptions) => void
  /** Conta do Claude por chave de API: cria o bloco de conversa. */
  onAddClaudeApi: (options: NewClaudeApiOptions) => void
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
  onAddCloud,
  onAddClaudeApi,
  onAddFolder,
}: TerminalMenuProps) {
  const fieldIdPrefix = useId()
  const [open, setOpen] = useState(false)
  const config = useAgentConfig(projects)
  const isCloud = config.agentValue === CLOUD_AGENT_VALUE
  // Configs queued up to start together — lets one click launch a whole
  // agent setup instead of repeating "configure, open" once per terminal.
  const [queue, setQueue] = useState<QueuedLaunch[]>([])
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
      if (isCloud) {
        // Nuvem sem tarefa ou sem pasta não tem o que criar: o clique no botão
        // compacto reabre o painel, como acontece com qualquer erro de configuração.
        if (!config.cloudReady) {
          if (!open) {
            setOpen(true)
          }
          return
        }
        onAddCloud(config.buildCloudOptions())
        config.setCloudTask('')
      } else if (config.isClaudeApi) {
        if (config.claudeApiIssue) {
          if (!open) {
            setOpen(true)
          }
          return
        }
        config.savePreferences()
        onAddClaudeApi(config.buildClaudeApiOptions())
      } else {
        const options = config.buildOptions()
        config.savePreferences()
        onAdd(options)
      }
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
  // "Automática (cadeia)" entra na fila com a conta que a prévia mostrou, sem
  // confirmar: o ticket da confirmação vence em 2 min, e a fila iniciada depois
  // disso abria blocos em erro. A confirmação é o clique em "Iniciar".
  const queueCurrent = async () => {
    if (launching) return
    setLaunching(true)
    try {
      if (!(await config.prepareForLaunch({ confirmChain: false }))) return
      config.savePreferences()
      const preview = config.accountId === CHAIN_ACCOUNT_VALUE ? config.chainPreview : null
      const options = config.buildOptions()
      setQueue((current) => [
        ...current,
        preview?.status === 'ready'
          ? { options, chain: { proposal: preview.proposal, summary: preview.summary } }
          : { options },
      ])
      // Cada item da cadeia tem a sua proposta, como se abrisse sozinho: a da
      // prévia fica com o item, e o configurador pede outra.
      if (preview) config.refreshChainPreview({ keepCurrent: preview.status === 'ready' })
      config.setName('')
    } finally {
      setLaunching(false)
    }
  }

  const startQueue = async () => {
    if (queue.length === 0 || launching) {
      return
    }
    setLaunching(true)
    try {
      const bridge = getAccountChainBridge()
      const { toOpen, remaining } = await startLaunchQueue(queue, {
        confirm: (proposal) => confirmChainLaunch(bridge, proposal),
        preview: (providerId) => previewChainLaunch(bridge, providerId),
      })
      if (toOpen.length > 0) onAddMany(toOpen)
      setQueue(remaining)
      // O que não abriu fica na fila, com o motivo e a conta nova, para outro clique.
      if (remaining.length === 0) {
        closeSettings()
        window.requestAnimationFrame(() => triggerRef.current?.focus())
      }
    } finally {
      setLaunching(false)
    }
  }

  // Item que sai da fila sem abrir: a proposta dele não fica aberta à toa.
  const discardQueued = (items: readonly QueuedLaunch[]) => {
    for (const item of items) {
      if (item.chain) void discardChainPreview(getAccountChainBridge(), item.chain.proposal.id)
    }
  }

  const removeQueued = (index: number) => {
    discardQueued(queue.slice(index, index + 1))
    setQueue((current) => current.filter((_, i) => i !== index))
  }

  const renameQueued = (index: number, label: string) => {
    setQueue((current) =>
      current.map((item, i) => (i === index ? { ...item, options: { ...item.options, label } } : item)),
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

        A âncora do tutorial fica na moldura, nunca nas metades: o tour só
        destaca, e a metade "Agente" lança a CLI.
      */}
      <div
        className="felixo-btn felixo-sidebar-agent-trigger flex w-full overflow-hidden rounded-md"
        data-felixo-tour-anchor="criar-agente"
      >
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
            allowCloud
          />

          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => void openTerminal()}
              disabled={
                launching ||
                Boolean(config.accountSelectionIssue) ||
                (isCloud && !config.cloudReady) ||
                Boolean(config.claudeApiIssue)
              }
              title={config.accountSelectionIssue?.message ?? config.claudeApiIssue ?? undefined}
              className={`felixo-btn flex-1 rounded-sm felixo-primary-action px-3 py-1.5 text-sm disabled:opacity-50${
                isCloud ? ' flex items-center justify-center gap-2' : ''
              }`}
            >
              {isCloud && <Cloud size={14} aria-hidden="true" />}
              {isCloud ? 'Abrir agente na nuvem' : config.isClaudeApi ? 'Abrir conversa' : 'Abrir agente'}
            </button>
            {/* A fila inicia vários terminais de uma vez; a nuvem sempre passa
                pela confirmação do próprio cartão, então não entra nela. */}
            {!isCloud && !config.isClaudeApi && (
              <button
                type="button"
                onClick={() => void queueCurrent()}
                disabled={launching || Boolean(config.accountSelectionIssue)}
                title="Adicionar esta configuração à fila, para iniciar vários terminais de uma vez"
                aria-label="Adicionar à fila de terminais"
                className="felixo-btn-icon flex items-center justify-center rounded-sm bg-zinc-700 px-2 text-zinc-100 hover:bg-zinc-600"
              >
                <Plus size={14} />
              </button>
            )}
          </div>

          {queue.length > 0 && (
            <div className="mt-3 border-t border-white/10 pt-3">
              <div className="mb-1.5 flex items-center justify-between text-xs font-medium text-zinc-400">
                <span>Fila ({queue.length})</span>
                <button
                  type="button"
                  onClick={() => {
                    discardQueued(queue)
                    setQueue([])
                  }}
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
                    className="rounded-sm bg-zinc-900 px-1.5 py-1"
                  >
                    <div className="flex items-center gap-1">
                      <input
                        value={item.options.label}
                        onChange={(event) => renameQueued(index, event.target.value)}
                        title="Renomear antes de iniciar"
                        aria-label={`Renomear "${item.options.label}" antes de iniciar`}
                        className="min-w-0 flex-1 rounded-sm bg-transparent px-1 py-0.5 text-xs text-zinc-200 outline-hidden ring-1 ring-transparent hover:ring-white/10 focus:bg-zinc-950 focus:ring-white/40"
                      />
                      <button
                        type="button"
                        onClick={() => removeQueued(index)}
                        aria-label={`Remover "${item.options.label}" da fila`}
                        className="felixo-btn-icon shrink-0 text-zinc-500 hover:text-zinc-300"
                      >
                        <X size={12} />
                      </button>
                    </div>
                    {item.chain && (
                      <p className="px-1 text-[11px] text-zinc-400">
                        Automática (cadeia): {item.chain.summary}
                      </p>
                    )}
                    {item.chain?.message && (
                      <p role="alert" className="px-1 text-[11px] text-amber-300">
                        Não abriu: {item.chain.message}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => void startQueue()}
                disabled={launching}
                title={
                  queue.some((item) => item.chain)
                    ? 'Iniciar confirma a conta mostrada em cada item "Automática (cadeia)"'
                    : undefined
                }
                className="felixo-btn w-full rounded-sm felixo-primary-action px-3 py-1.5 text-sm disabled:opacity-50"
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

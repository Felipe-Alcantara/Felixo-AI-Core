import { useState } from 'react'
import { Copy, Info, Terminal as TerminalIcon } from 'lucide-react'
import { CanvasPanel } from './tools/CanvasPanel'
import { AccountSwitchHistory } from './tools/AccountSwitchHistory'
import { useSessionMetadata } from '../terminal/terminal-session-context'
import { activityLabel, formatSessionAge, formatSessionStart } from '../terminal/session-metadata'
import type { TerminalNodeData } from '../types'
import { useAccountChain, useCliAccountLabel } from '../hooks/useAccountChain'
import { changeSessionAccountMode } from '../services/account-chain-client'
import { accountChipLabel, ptySessionIdForNode } from '../services/account-chain-view'
import {
  describeAgentResumeForPerson,
  describeAgentResumeTarget,
  explainAgentResume,
  isAgentSessionReference,
} from '../services/agent-session'
import { isKnownAgentCommand } from '../services/agent-launch-options'

/** Dia/mês e hora, sem ano: o bastante para situar a troca de conversa. */
function formatShortDateTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function TerminalDetailsPanel({
  nodeId,
  data,
  onClose,
  toolsMenuOpen,
  onClearAgentSession,
  onAccountModeChange,
  onFocusNode,
}: {
  nodeId: string
  data: TerminalNodeData
  onClose: () => void
  toolsMenuOpen: boolean
  onClearAgentSession: () => void
  /** Grava o modo da conta no bloco (persistido). */
  onAccountModeChange: (mode: 'pinned' | 'chain') => void
  onFocusNode: (nodeId: string) => void
}) {
  const metadata = useSessionMetadata(nodeId)
  const value = (text: string | undefined, fallback = 'não informado') => text?.trim() || fallback
  const hasPersistedAssociation = Object.prototype.hasOwnProperty.call(data, 'agentSession')
  const agentSession = hasPersistedAssociation ? data.agentSession : metadata?.agentSession
  // O que acontece ao reabrir este bloco, pelo mesmo plano que decide o spawn
  // (`explainAgentResume`): a linha nunca promete uma retomada exata que o
  // resolver não faria, e usa os mesmos títulos da tabela do guia. Só para
  // agentes — um shell não tem conversa.
  const resumePlan = isKnownAgentCommand(data.command)
    ? explainAgentResume({
        command: data.command,
        cwd: data.cwd,
        reference: agentSession,
        accountId: data.accountId,
        failure: data.resumeFailure,
        choice: data.resumeChoice,
      })
    : undefined
  const resumeDescription = resumePlan
    ? describeAgentResumeForPerson(resumePlan, {
        reference: agentSession,
        cwd: data.cwd,
        command: data.command,
      })
    : undefined
  const previous = data.previousAgentSession
  const previousLabel = previous
    ? [
        isAgentSessionReference(previous.reference)
          ? describeAgentResumeTarget(previous.reference)
          : 'registro ilegível',
        `substituída em ${formatShortDateTime(previous.replacedAt)}`,
      ].join(' · ')
    : undefined
  const insertion = metadata?.lastPromptInsertion ?? data.lastPromptInsertion
  const insertionLabel = insertion
    ? [
        insertion.name ?? (insertion.source === 'manual' ? 'Prompt manual' : undefined),
        insertion.combinedNames.length > 1
          ? insertion.combinedNames.join(' + ')
          : undefined,
        `origem: ${insertion.source}`,
        insertion.autoSubmit ? 'autoenvio' : 'rascunho',
      ]
        .filter(Boolean)
        .join(' · ')
    : undefined

  return (
    <CanvasPanel
      title="Detalhes do terminal"
      icon={<Info size={15} />}
      onClose={onClose}
      panelId="terminal-details"
      size="md"
      toolsMenuOpen={toolsMenuOpen}
    >
      <div className="space-y-3 text-xs text-zinc-300">
        <div className="flex items-center gap-2 text-sm font-medium text-(--f-core-white-soft)">
          <TerminalIcon size={14} />
          <span className="truncate">{value(data.label, 'Terminal')}</span>
        </div>
        <Detail label="Pasta de trabalho" value={value(data.cwd)} copy={data.cwd} />
        <Detail label="Estado" value={metadata ? activityLabel(metadata.activity) : 'sessão não iniciada'} />
        <Detail label="Aberto há" value={formatSessionAge(metadata?.startedAt)} />
        <Detail label="Início da sessão PTY" value={formatSessionStart(metadata?.startedAt)} />
        <Detail label="ID do elemento" value={nodeId} copy={nodeId} mono />
        <Detail label="ID da sessão PTY" value={value(metadata?.ptySessionId)} copy={metadata?.ptySessionId} mono />
        <Detail label="Agente" value={value(data.command, 'Shell padrão')} />
        <Detail
          label="Sessão do agente"
          value={
            agentSession
              ? `${agentSession.provider}: ${agentSession.sessionId}`
              : 'sem conversa associada: ao reabrir, a CLI mostra a lista (/resume)'
          }
          copy={agentSession?.sessionId}
          mono
        />
        {resumeDescription && (
          <Detail label="Retomada" value={`${resumeDescription.title}. ${resumeDescription.detail}`} />
        )}
        {previousLabel && <Detail label="Conversa anterior" value={previousLabel} />}
        {insertionLabel && <Detail label="Última inserção" value={insertionLabel} mono />}
        {agentSession && (
          <button
            type="button"
            className="rounded-sm border border-[color-mix(in_srgb,var(--color-warning)_38%,transparent)] px-2 py-1 text-left text-[11px] text-(--color-warning) hover:bg-[color-mix(in_srgb,var(--color-warning)_16%,transparent)]"
            onClick={() => {
              if (window.confirm('Remover a associação desta conversa? O terminal atual não será encerrado.')) {
                onClearAgentSession()
              }
            }}
          >
            Esquecer associação da conversa
          </button>
        )}
        {data.args && data.args.length > 0 && <Detail label="Argumentos" value={data.args.join(' ')} mono />}
        {data.command && (
          <AccountModeDetails
            nodeId={nodeId}
            data={data}
            onAccountModeChange={onAccountModeChange}
            onFocusNode={onFocusNode}
          />
        )}
        <p className="border-t border-white/10 pt-2 text-[11px] leading-relaxed text-zinc-500">
          “Aberto há” mede a instância atual da PTY. Ao reiniciar, o relógio recomeça; o ID do elemento continua estável. A associação da conversa só retoma quando provider, pasta e conta coincidem e não há falha registrada da CLI para ela; fora disso, o bloco espera você escolher entre a lista da CLI e uma conversa nova. O Gemini não retoma por ID (o motivo está no guia do usuário).
        </p>
      </div>
    </CanvasPanel>
  )
}

function Detail({ label, value, copy, mono = false }: { label: string; value: string; copy?: string; mono?: boolean }) {
  return (
    <div className="space-y-1">
      <div className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="flex items-start gap-1 rounded-sm border border-white/5 bg-black/20 px-2 py-1.5">
        <span className={`min-w-0 flex-1 wrap-break-word ${mono ? 'font-mono text-[11px]' : ''}`}>{value}</span>
        {copy && <button type="button" className="shrink-0 text-zinc-500 hover:text-zinc-100" aria-label={`Copiar ${label}`} onClick={() => void navigator.clipboard?.writeText(copy)}><Copy size={12} /></button>}
      </div>
    </div>
  )
}

/**
 * Conta e modo do bloco, com [Fixar nesta conta] / [Voltar para a cadeia] e
 * as trocas deste bloco. Mudar o modo nunca toca o processo vivo: vale para
 * as próximas detecções e o próximo spawn.
 */
function AccountModeDetails({
  nodeId,
  data,
  onAccountModeChange,
  onFocusNode,
}: {
  nodeId: string
  data: TerminalNodeData
  onAccountModeChange: (mode: 'pinned' | 'chain') => void
  onFocusNode: (nodeId: string) => void
}) {
  const { snapshot, store } = useAccountChain()
  const accountLabel = useCliAccountLabel(data.accountId)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const chip = accountChipLabel({ accountId: data.accountId, accountLabel, accountMode: data.accountMode })
  const mode = data.accountMode === 'chain' ? 'chain' : 'pinned'
  const chainEnabled = snapshot.state?.settings.enabled === true
  const sessionId = ptySessionIdForNode(nodeId)

  const change = async (next: 'pinned' | 'chain') => {
    if (busy) return
    setBusy(true)
    setMessage(null)
    try {
      const result = await changeSessionAccountMode(store.bridge, sessionId, next)
      if (result.persist) onAccountModeChange(next)
      setMessage(result.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Detail label="Conta" value={data.accountId ? (accountLabel ?? 'conta sem nome') : 'Login do sistema'} />
      <div className="space-y-1">
        <div className="text-[10px] uppercase tracking-wide text-zinc-500">Modo</div>
        <div className="flex flex-wrap items-center gap-2 rounded-sm border border-white/5 bg-black/20 px-2 py-1.5">
          <span className="min-w-0 flex-1" title={chip.title}>
            {!data.accountId
              ? 'Login do sistema: só recebe aviso, nunca proposta de troca.'
              : mode === 'chain'
                ? 'Cadeia: se a conta bater o limite, a cadeia propõe outra e pede sua confirmação.'
                : 'Fixa: se a conta bater o limite, você recebe um aviso; nada troca sozinho.'}
          </span>
          {data.accountId && mode === 'chain' && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void change('pinned')}
              className="felixo-btn rounded-sm bg-white/6 px-2 py-1 text-[11px] text-zinc-200 hover:bg-white/12 disabled:opacity-50"
            >
              Fixar nesta conta
            </button>
          )}
          {data.accountId && mode === 'pinned' && chainEnabled && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void change('chain')}
              className="felixo-btn rounded-sm bg-white/6 px-2 py-1 text-[11px] text-zinc-200 hover:bg-white/12 disabled:opacity-50"
            >
              Voltar para a cadeia
            </button>
          )}
        </div>
        {message && (
          <p role="alert" className="text-[11px] text-theme-error">
            {message}
          </p>
        )}
      </div>
      <div className="space-y-1">
        <div className="text-[10px] uppercase tracking-wide text-zinc-500">Trocas deste bloco</div>
        <AccountSwitchHistory sessionFilter={sessionId} onFocusNode={onFocusNode} compact />
      </div>
    </>
  )
}

import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { NodeResizer, useReactFlow, type NodeProps } from '@xyflow/react'
import { Cloud, Copy, ExternalLink, FolderOpen, Loader2, Send, TerminalSquare } from 'lucide-react'
import { NODE_MIN_SIZE } from '../services/node-geometry'
import {
  CLOUD_FOLLOW_UP_MAX,
  CLOUD_TASK_MAX,
  appendFollowUp,
  applyLaunchResult,
  canFollowUp,
  canLaunch,
  canRetryWithoutConfirmation,
  isCloudSessionUrl,
  markLaunching,
  startNewSession,
} from '../services/cloud-session-state'
import type { NewTerminalOptions } from '../services/new-terminal-options'
import type { CliAccount } from '../../shared/types/cli-accounts'
import type { CloudSessionNodeData } from '../types'
import { NodeHeader } from './NodeHeader'

type CloudSessionProject = { id: string; name: string; path: string }

/**
 * `onDataChange`, `cloudProjects` e `onOpenTerminal` são injetados pelo
 * CanvasView. `cloudProjects` é dado transitório (nunca persistido) e as
 * funções são descartadas ao salvar.
 */
type CloudSessionNodeDataWithHandlers = CloudSessionNodeData & {
  onDataChange?: (nodeId: string, patch: Partial<CloudSessionNodeData>) => void
  cloudProjects?: CloudSessionProject[]
  onOpenTerminal?: (options: NewTerminalOptions) => void
}

type Confirming = 'launch' | 'retry' | 'new-session' | null

const UNAVAILABLE = 'O agente na nuvem não está disponível nesta versão do app.'
const FIELD = 'felixo-control w-full text-xs'
const LABEL = 'felixo-field-label'
const PRIMARY = 'felixo-btn felixo-primary-action rounded-sm px-3 py-1.5 text-xs disabled:opacity-50'
const SECONDARY =
  'felixo-btn felixo-secondary-action inline-flex items-center gap-1 rounded-sm px-2 py-1 text-[11px] disabled:opacity-50'

function formatLocal(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString('pt-BR')
}

/**
 * Bloco "Agente na nuvem": cria uma sessão do Claude Code na nuvem
 * (`claude --cloud`) e a acompanha. Não é um terminal: a sessão só nasce de um
 * clique confirmado, e abrir ou restaurar o canvas nunca cria nada.
 */
function CloudSessionNodeComponent({ id, data, selected }: NodeProps) {
  const { deleteElements } = useReactFlow()
  // O React Flow sempre entrega `data`; um `?? {}` aqui recriaria o objeto a cada render.
  const nodeData = data as CloudSessionNodeDataWithHandlers
  const status = nodeData.cloudStatus ?? 'draft'
  const session = nodeData.cloudSession
  const bridge = window.felixo?.cloudSession

  const dataRef = useRef(nodeData)
  useEffect(() => {
    dataRef.current = nodeData
  })
  const inFlightRef = useRef(false)

  const [confirming, setConfirming] = useState<Confirming>(null)
  const [followUpText, setFollowUpText] = useState('')
  const [followUpBusy, setFollowUpBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [accounts, setAccounts] = useState<CliAccount[]>([])

  const change = useCallback(
    (patch: CloudSessionNodeData) => nodeData.onDataChange?.(id, patch),
    [id, nodeData],
  )

  useEffect(() => {
    let cancelled = false
    void window.felixo?.cliAccounts
      ?.list('claude')
      .then((result) => {
        if (!cancelled && result?.ok) setAccounts(result.accounts ?? [])
      })
      .catch(() => {
        // Sem a lista, só o Login do sistema fica disponível.
      })
    return () => {
      cancelled = true
    }
  }, [])

  const launch = useCallback(async () => {
    const current = dataRef.current
    if (inFlightRef.current || !canLaunch(current)) return
    if (!bridge) {
      setActionError(UNAVAILABLE)
      return
    }
    inFlightRef.current = true
    setConfirming(null)
    setActionError(null)
    change(markLaunching(current))
    try {
      const result = await bridge.launch({
        nodeId: id,
        task: current.cloudTask ?? '',
        cwd: current.cloudCwd ?? '',
        accountId: current.cloudAccountId,
      })
      change(applyLaunchResult(dataRef.current, result, new Date().toISOString()))
    } catch {
      change(
        applyLaunchResult(
          dataRef.current,
          { ok: false, code: 'unknown', message: 'Não foi possível falar com o processo principal do app.' },
          new Date().toISOString(),
        ),
      )
    } finally {
      inFlightRef.current = false
    }
  }, [bridge, change, id])

  const sendFollowUp = useCallback(async () => {
    const current = dataRef.current
    const text = followUpText.trim()
    if (!text || followUpBusy || !canFollowUp(current) || !current.cloudSession) return
    if (!bridge) {
      setActionError(UNAVAILABLE)
      return
    }
    setFollowUpBusy(true)
    setActionError(null)
    try {
      const result = await bridge.followUp({
        nodeId: id,
        sessionId: current.cloudSession.id,
        text,
        cwd: current.cloudCwd ?? '',
        accountId: current.cloudAccountId,
      })
      change(
        appendFollowUp(dataRef.current, {
          at: new Date().toISOString(),
          text,
          ok: result.ok,
          ...(result.ok ? {} : { error: result.code }),
        }),
      )
      if (result.ok) setFollowUpText('')
      else setActionError(result.message)
    } catch {
      setActionError('Não foi possível falar com o processo principal do app.')
    } finally {
      setFollowUpBusy(false)
    }
  }, [bridge, change, followUpBusy, followUpText, id])

  const openSession = useCallback(async () => {
    if (!session || !isCloudSessionUrl(session.url)) return
    const result = await bridge?.open({ url: session.url }).catch(() => null)
    if (!result?.ok) setActionError(result?.message ?? 'Não foi possível abrir o navegador.')
  }, [bridge, session])

  const copySessionId = useCallback(async () => {
    if (!session) return
    try {
      await navigator.clipboard.writeText(session.id)
    } catch {
      setActionError('Não foi possível copiar o ID para a área de transferência.')
    }
  }, [session])

  const openTerminal = useCallback(
    (options: Omit<NewTerminalOptions, 'cwd' | 'accountId' | 'providerId'>) =>
      nodeData.onOpenTerminal?.({
        ...options,
        cwd: nodeData.cloudCwd,
        accountId: nodeData.cloudAccountId,
        providerId: 'claude',
      }),
    [nodeData],
  )

  const pickFolder = useCallback(async () => {
    const result = await window.felixo?.files?.pickContext?.({ mode: 'directory' }).catch(() => null)
    const picked = result?.ok && !result.canceled ? result.attachments?.[0]?.path : undefined
    if (picked) change({ cloudCwd: picked })
  }, [change])

  const accountLabel =
    accounts.find((account) => account.id === nodeData.cloudAccountId)?.label ?? 'Login do sistema'
  const projects = nodeData.cloudProjects ?? []
  const selectedProject = projects.find((project) => project.path === nodeData.cloudCwd)
  const error = nodeData.cloudError
  const retryNeedsConfirmation = error ? !canRetryWithoutConfirmation(error.code) : false
  const editable = status === 'draft' || status === 'failed'

  return (
    <div className="felixo-canvas-card flex h-full w-full flex-col overflow-hidden rounded-lg border shadow-xl">
      <NodeResizer
        isVisible={selected}
        minWidth={NODE_MIN_SIZE['cloud-session'].width}
        minHeight={NODE_MIN_SIZE['cloud-session'].height}
      />
      <NodeHeader
        icon={<Cloud size={13} aria-hidden />}
        editableValue={nodeData.label ?? ''}
        placeholder="Agente na nuvem"
        onTitleChange={(label) => change({ label })}
        onRemove={() => void deleteElements({ nodes: [{ id }] })}
      />

      <div className="nodrag nowheel nopan flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-3 text-xs">
        {status === 'launching' && (
          <div role="status" aria-live="polite" className="flex items-center gap-2 py-6">
            <Loader2 size={16} className="animate-spin" aria-hidden />
            <span>Criando a sessão na nuvem… pode levar até 1 minuto.</span>
          </div>
        )}

        {/* Com a confirmação aberta o resumo dela já mostra conta, pasta e tarefa:
            esconder os campos mantém os botões de confirmar à vista. */}
        {editable && !confirming && (
          <>
            {status === 'draft' && (
              <p className="text-[11px] text-(--f-core-secondary)">
                Gasta o crédito de sessão na nuvem da conta escolhida (se houver) ou o limite do plano. O saldo
                só aparece em Configurações &gt; Uso.
              </p>
            )}

            <div>
              <label htmlFor={`${id}-task`} className={LABEL}>
                Tarefa
              </label>
              <textarea
                id={`${id}-task`}
                value={nodeData.cloudTask ?? ''}
                maxLength={CLOUD_TASK_MAX}
                rows={4}
                onChange={(event) => change({ cloudTask: event.target.value })}
                placeholder="O que a sessão na nuvem deve fazer?"
                className={`${FIELD} resize-none`}
              />
            </div>

            <div>
              <label htmlFor={`${id}-project`} className={LABEL}>
                Projeto
              </label>
              <select
                id={`${id}-project`}
                value={selectedProject?.path ?? ''}
                onChange={(event) => event.target.value && change({ cloudCwd: event.target.value })}
                className={FIELD}
              >
                <option value="">{selectedProject ? '' : 'Outra pasta'}</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.path}>
                    {project.name}
                  </option>
                ))}
              </select>
              <div className="mt-1 flex gap-1">
                <input
                  aria-label="Pasta do projeto"
                  value={nodeData.cloudCwd ?? ''}
                  onChange={(event) => change({ cloudCwd: event.target.value })}
                  placeholder="Pasta de trabalho"
                  className={`${FIELD} min-w-0 flex-1`}
                />
                <button type="button" onClick={() => void pickFolder()} className={SECONDARY} title="Escolher pasta">
                  <FolderOpen size={13} aria-hidden />
                  <span className="sr-only">Escolher pasta</span>
                </button>
              </div>
            </div>

            <div>
              <label htmlFor={`${id}-account`} className={LABEL}>
                Conta
              </label>
              <select
                id={`${id}-account`}
                value={nodeData.cloudAccountId ?? ''}
                onChange={(event) => change({ cloudAccountId: event.target.value || undefined })}
                className={FIELD}
              >
                <option value="">Login do sistema</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.label}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}

        {status === 'failed' && error && (
          <div role="alert" className="rounded-sm bg-theme-error/10 p-2 text-theme-error">
            <p className="whitespace-pre-wrap break-words">{error.message}</p>
            {error.code === 'trust-required' && (
              <button
                type="button"
                className={`${SECONDARY} mt-2`}
                onClick={() => openTerminal({ command: 'claude', label: 'Claude · confiar na pasta' })}
              >
                Abrir Claude nesta pasta
              </button>
            )}
          </div>
        )}

        {confirming && (
          <div role="group" aria-label="Confirmação" className="rounded-sm border border-(--color-border) p-2">
            {confirming === 'new-session' ? (
              <p>
                A sessão atual continua em claude.ai/code. Este cartão volta ao rascunho para criar outra.
              </p>
            ) : (
              <>
                <p className="font-medium">Criar uma sessão na nuvem?</p>
                <ul className="mt-1 list-disc pl-4 text-[11px] text-(--f-core-secondary)">
                  <li>Conta: {accountLabel}</li>
                  <li>Pasta: {nodeData.cloudCwd}</li>
                  <li>Tarefa: {(nodeData.cloudTask ?? '').slice(0, 200)}</li>
                </ul>
                <p className="mt-1 text-[11px] text-(--f-core-secondary)">
                  Sem remote no GitHub, o repositório inteiro é enviado como pacote (limite de 100 MB).
                </p>
                {confirming === 'retry' && (
                  <p className="mt-1 text-[11px] text-(--color-warning)">
                    A tentativa anterior pode ter criado uma sessão. Confira em claude.ai/code antes de continuar.
                  </p>
                )}
              </>
            )}
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                className={PRIMARY}
                onClick={() => {
                  if (confirming === 'new-session') {
                    change(startNewSession(dataRef.current))
                    setConfirming(null)
                    return
                  }
                  void launch()
                }}
              >
                {confirming === 'new-session' ? 'Criar novo rascunho' : 'Confirmar e disparar'}
              </button>
              <button type="button" className={SECONDARY} onClick={() => setConfirming(null)}>
                Cancelar
              </button>
            </div>
          </div>
        )}

        {editable && !confirming && (
          <button
            type="button"
            className={`${PRIMARY} self-start`}
            disabled={!canLaunch(nodeData)}
            onClick={() => {
              if (status === 'failed' && !retryNeedsConfirmation) void launch()
              else setConfirming(status === 'failed' ? 'retry' : 'launch')
            }}
          >
            {status === 'failed' ? 'Tentar de novo' : 'Disparar na nuvem'}
          </button>
        )}

        {status === 'created' && session && (
          <>
            <div role="status" aria-live="polite">
              <p className="text-sm font-medium">{session.title}</p>
              <p className="mt-1 flex items-center gap-1 text-[11px] text-(--f-core-secondary)">
                <span className="truncate" title={session.id}>
                  {session.id}
                </span>
                <button type="button" className="felixo-btn-icon" onClick={() => void copySessionId()} title="Copiar ID">
                  <Copy size={12} aria-hidden />
                  <span className="sr-only">Copiar ID da sessão</span>
                </button>
              </p>
              <p className="text-[11px] text-(--f-core-secondary)">
                Criada em {formatLocal(session.createdAt)} · {accountLabel}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button type="button" className={SECONDARY} onClick={() => void openSession()}>
                <ExternalLink size={12} aria-hidden /> Abrir
              </button>
              <button
                type="button"
                className={SECONDARY}
                title="Continua localmente e pode usar o limite do plano, não o crédito de nuvem"
                onClick={() =>
                  openTerminal({
                    command: 'claude',
                    args: ['--teleport', session.id],
                    label: `Claude · ${session.title}`.slice(0, 80),
                    launchMode: 'launcher',
                  })
                }
              >
                <TerminalSquare size={12} aria-hidden /> Trazer para cá
              </button>
              <button type="button" className={SECONDARY} onClick={() => setConfirming('new-session')}>
                Nova sessão
              </button>
            </div>

            <div>
              <label htmlFor={`${id}-follow-up`} className={LABEL}>
                Enviar mensagem à sessão
              </label>
              <div className="flex gap-1">
                <textarea
                  id={`${id}-follow-up`}
                  value={followUpText}
                  maxLength={CLOUD_FOLLOW_UP_MAX}
                  rows={2}
                  onChange={(event) => setFollowUpText(event.target.value)}
                  className={`${FIELD} min-w-0 flex-1 resize-none`}
                />
                <button
                  type="button"
                  className={SECONDARY}
                  disabled={followUpBusy || !followUpText.trim()}
                  onClick={() => void sendFollowUp()}
                >
                  {followUpBusy ? <Loader2 size={12} className="animate-spin" aria-hidden /> : <Send size={12} aria-hidden />}
                  <span className="sr-only">Enviar</span>
                </button>
              </div>
            </div>

            {(nodeData.cloudFollowUps ?? []).length > 0 && (
              <ul aria-label="Mensagens enviadas" className="space-y-1 text-[11px]">
                {(nodeData.cloudFollowUps ?? [])
                  .slice(-5)
                  .reverse()
                  .map((entry, index) => (
                    <li key={`${entry.at}-${index}`} className={entry.ok ? '' : 'text-theme-error'}>
                      {entry.ok ? '✓' : '✗'} {formatLocal(entry.at)} — {entry.text.slice(0, 120)}
                    </li>
                  ))}
              </ul>
            )}
          </>
        )}

        {actionError && (
          <p role="alert" className="text-theme-error">
            {actionError}
          </p>
        )}
      </div>
    </div>
  )
}

export const CloudSessionNode = memo(CloudSessionNodeComponent)

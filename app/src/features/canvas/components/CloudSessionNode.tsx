import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { NodeResizer, useReactFlow, type NodeProps } from '@xyflow/react'
import { Cloud, Copy, ExternalLink, FolderOpen, Loader2, Send, TerminalSquare } from 'lucide-react'
import { NODE_MIN_SIZE } from '../services/node-geometry'
import { runFollowUp, runLaunch } from '../services/cloud-session-actions'
import {
  CLOUD_FOLLOW_UP_MAX,
  CLOUD_TASK_MAX,
  canLaunch,
  canRetryWithoutConfirmation,
  isCloudSessionUrl,
  startNewSession,
  taskProblem,
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

  // Foco (DESIGN_SYSTEM_FRONTEND §9.1): a confirmação, o resultado e o rascunho
  // aparecem e somem trocando o conteúdo do cartão, e o botão que tinha o foco
  // some junto. Cada refs abaixo aponta o lugar para onde o foco precisa ir.
  const taskRef = useRef<HTMLTextAreaElement>(null)
  // O foco entra no contêiner da confirmação, e não no botão que gasta crédito:
  // um Enter mantido pressionado ao abrir não pode confirmar sem querer.
  const confirmationRef = useRef<HTMLDivElement>(null)
  const launchTriggerRef = useRef<HTMLButtonElement>(null)
  const newSessionTriggerRef = useRef<HTMLButtonElement>(null)
  const resultRef = useRef<HTMLDivElement>(null)
  const restoreFocusRef = useRef<'launch' | 'new-session' | null>(null)
  const previousStatusRef = useRef(status)
  const autoFocusedRef = useRef(false)

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

  /** Fecha a confirmação sem fazer nada e devolve o foco ao botão que a abriu. */
  const closeConfirmation = useCallback(() => {
    restoreFocusRef.current = confirming === 'new-session' ? 'new-session' : 'launch'
    setConfirming(null)
  }, [confirming])

  useEffect(() => {
    if (confirming) {
      confirmationRef.current?.focus()
      return
    }
    const target = restoreFocusRef.current
    restoreFocusRef.current = null
    if (target === 'launch') launchTriggerRef.current?.focus()
    else if (target === 'new-session') newSessionTriggerRef.current?.focus()
  }, [confirming])

  useEffect(() => {
    const previous = previousStatusRef.current
    previousStatusRef.current = status
    // Terminou o disparo: o botão que tinha o foco sumiu, então o foco vai para o resultado.
    if (previous === 'launching' && (status === 'created' || status === 'failed')) {
      resultRef.current?.focus()
    }
    // Nova sessão: volta ao rascunho, pronto para escrever a próxima tarefa.
    if (previous === 'created' && status === 'draft') taskRef.current?.focus()
  }, [status])

  // Cartão novo e vazio, recém-selecionado: o foco vai para a tarefa. Um cartão
  // restaurado ao abrir o app não está selecionado e não rouba o foco.
  useEffect(() => {
    if (autoFocusedRef.current || !selected || status !== 'draft' || nodeData.cloudTask) return
    autoFocusedRef.current = true
    taskRef.current?.focus()
  }, [selected, status, nodeData.cloudTask])

  // A regra de disparar e de enviar mensagem mora em `cloud-session-actions.ts`
  // (testada sem DOM); aqui só se liga o botão a ela e se guarda o que é da tela.
  const actionParams = useCallback(
    () => ({
      nodeId: id,
      current: dataRef.current,
      latest: () => dataRef.current,
      bridge,
      now: () => new Date().toISOString(),
      change,
    }),
    [bridge, change, id],
  )

  const launch = useCallback(async () => {
    if (inFlightRef.current) return
    inFlightRef.current = true
    setConfirming(null)
    setActionError(null)
    try {
      const outcome = await runLaunch(actionParams())
      if (outcome.message) setActionError(outcome.message)
    } finally {
      inFlightRef.current = false
    }
  }, [actionParams])

  const sendFollowUp = useCallback(async () => {
    if (followUpBusy) return
    setFollowUpBusy(true)
    setActionError(null)
    try {
      const outcome = await runFollowUp({ ...actionParams(), text: followUpText })
      if (outcome.sent) setFollowUpText('')
      else if (outcome.message) setActionError(outcome.message)
    } finally {
      setFollowUpBusy(false)
    }
  }, [actionParams, followUpBusy, followUpText])

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
  const taskIssue = taskProblem(nodeData.cloudTask ?? '')
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
            <Loader2 size={16} className="motion-safe:animate-spin" aria-hidden />
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
                ref={taskRef}
                value={nodeData.cloudTask ?? ''}
                maxLength={CLOUD_TASK_MAX}
                rows={4}
                onChange={(event) => change({ cloudTask: event.target.value })}
                placeholder="O que a sessão na nuvem deve fazer?"
                aria-invalid={taskIssue ? true : undefined}
                aria-describedby={taskIssue ? `${id}-task-problem` : undefined}
                className={`${FIELD} resize-none`}
              />
              {taskIssue && (
                <p id={`${id}-task-problem`} role="alert" className="mt-1 text-[11px] text-theme-error">
                  {taskIssue}
                </p>
              )}
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
          <div
            role="alert"
            ref={resultRef}
            tabIndex={-1}
            className="rounded-sm bg-theme-error/10 p-2 text-theme-error outline-none"
          >
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
          <div
            role="group"
            aria-label="Confirmação"
            ref={confirmationRef}
            tabIndex={-1}
            className="rounded-sm border border-(--color-border) p-2 outline-none"
            onKeyDown={(event) => {
              // Esc cancela, como em qualquer diálogo; o React Flow não deve ver a tecla.
              if (event.key !== 'Escape') return
              event.stopPropagation()
              closeConfirmation()
            }}
          >
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
                </ul>
                {/* A tarefa inteira, não um trecho: o que se confirma é o que roda. */}
                <p className="mt-1 text-[11px] text-(--f-core-secondary)">Tarefa:</p>
                <div
                  tabIndex={0}
                  aria-label="Texto completo da tarefa"
                  className="mt-0.5 max-h-24 overflow-auto whitespace-pre-wrap break-words rounded-sm bg-black/20 p-1.5 text-[11px]"
                >
                  {nodeData.cloudTask}
                </div>
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
              <button type="button" className={SECONDARY} onClick={closeConfirmation}>
                Cancelar
              </button>
            </div>
          </div>
        )}

        {editable && !confirming && (
          <button
            type="button"
            ref={launchTriggerRef}
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
            <div role="status" aria-live="polite" ref={resultRef} tabIndex={-1} className="outline-none">
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
              <button
                type="button"
                ref={newSessionTriggerRef}
                className={SECONDARY}
                onClick={() => setConfirming('new-session')}
              >
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
                  {followUpBusy ? (
                    <Loader2 size={12} className="motion-safe:animate-spin" aria-hidden />
                  ) : (
                    <Send size={12} aria-hidden />
                  )}
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

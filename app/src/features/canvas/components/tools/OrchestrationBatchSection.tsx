import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Node } from '@xyflow/react'

import {
  MAX_BATCH_TASKS,
  TASK_STATE_LABEL,
  deriveTaskState,
  listOrchestrationBatches,
  summarizeOrchestration,
} from '../../services/orchestration-batch'
import { useSessionSnapshotsSelector } from '../../terminal/terminal-session-context'
import type { SessionActivity } from '../../terminal/terminal-session-api'
import type { OrchestrationTask, OrchestrationTaskState } from '../../types'

type LiveTerminal = { activity: SessionActivity; exitCode?: number }
type PatchTask = (groupId: string, taskId: string, patch: Partial<Omit<OrchestrationTask, 'id'>>) => void

export type OrchestrationBatchSectionProps = {
  nodes: readonly Node[]
  onFocusNode: (nodeId: string) => void
  /** Abre o grupo com um terminal por task; devolve o que aconteceu, para a tela dizer. */
  onStartBatch: (text: string, cwd: string) => Promise<{ ok: boolean; message: string }>
  onPatchTask: PatchTask
}

const STATE_CLASS: Record<OrchestrationTaskState, string> = {
  waiting: 'border-white/10 bg-white/5 text-zinc-400',
  running: 'border-white/10 bg-(--f-core-white)/15 text-(--f-core-white-soft)',
  done: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300',
  failed:
    'border-[color-mix(in_srgb,var(--color-error)_38%,transparent)] bg-[color-mix(in_srgb,var(--color-error)_18%,transparent)] text-theme-error',
}

function sameLive(previous: Record<string, LiveTerminal>, next: Record<string, LiveTerminal>): boolean {
  const keys = Object.keys(previous)
  if (keys.length !== Object.keys(next).length) return false
  return keys.every((key) => next[key]?.activity === previous[key].activity && next[key]?.exitCode === previous[key].exitCode)
}

/**
 * Lote de tasks do orquestrador, no painel Orquestrador: a pessoa escreve uma
 * task por linha, o app abre um grupo com um terminal por task (dentro dos
 * tetos do painel) e esta lista mostra o progresso de cada uma. O progresso
 * mora no `data` do grupo, por isso sobrevive a fechar e reabrir o painel e a
 * reiniciar o app.
 */
export function OrchestrationBatchSection({ nodes, onFocusNode, onStartBatch, onPatchTask }: OrchestrationBatchSectionProps) {
  const [text, setText] = useState('')
  const [cwd, setCwd] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const batches = useMemo(() => listOrchestrationBatches(nodes), [nodes])
  const terminalIds = useMemo(
    () => batches.flatMap((batch) => batch.orchestration.tasks.flatMap((task) => (task.terminalId ? [task.terminalId] : []))),
    [batches],
  )
  const select = useCallback(
    (snapshots: Record<string, { activity: SessionActivity; exitCode?: number }>) => {
      const live: Record<string, LiveTerminal> = {}
      for (const id of terminalIds) {
        const snapshot = snapshots[id]
        if (snapshot) live[id] = { activity: snapshot.activity, exitCode: snapshot.exitCode }
      }
      return live
    },
    [terminalIds],
  )
  const live = useSessionSnapshotsSelector(select, sameLive)
  const existingNodeIds = useMemo(() => new Set(nodes.map((node) => node.id)), [nodes])

  async function start() {
    if (busy) return
    setBusy(true)
    setMessage(null)
    try {
      const result = await onStartBatch(text, cwd)
      setMessage({ ok: result.ok, text: result.message })
      if (result.ok) setText('')
    } catch {
      setMessage({ ok: false, text: 'Não foi possível abrir os agentes.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section
      aria-label="Lote de tasks"
      data-felixo-orchestration-batch
      className="mb-3 space-y-2 rounded-md border border-white/10 bg-black/20 p-2"
    >
      <h3 className="text-xs font-semibold text-zinc-200">Lote de tasks</h3>
      <p className="text-[10px] text-zinc-500">
        Uma task por linha (até {MAX_BATCH_TASKS}); use <span className="font-mono">título :: contexto</span> para dar
        detalhe ao agente. O app abre um terminal por task, agrupados, respeitando &quot;Agentes por rodada&quot; e
        &quot;Agentes no total&quot; abaixo; o que passar do teto fica esperando.
      </p>
      <textarea
        rows={4}
        value={text}
        onChange={(event) => setText(event.target.value)}
        aria-label="Tasks do lote, uma por linha"
        placeholder={'Revisar o README\nTestar o login :: usar a conta de teste'}
        className="w-full resize-y rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-xs text-zinc-100 outline-hidden placeholder:text-zinc-600"
      />
      <input
        value={cwd}
        onChange={(event) => setCwd(event.target.value)}
        aria-label="Pasta do projeto do lote (opcional)"
        placeholder="Pasta do projeto (opcional)"
        className="w-full rounded-md border border-white/10 bg-black/30 px-2 py-1 text-xs text-zinc-100 outline-hidden placeholder:text-zinc-600"
      />
      <button
        type="button"
        onClick={() => void start()}
        aria-disabled={busy || text.trim() === ''}
        className="felixo-btn w-full rounded-md bg-zinc-800 px-2 py-1.5 text-xs text-zinc-100 ring-1 ring-white/10 hover:bg-zinc-700 aria-disabled:opacity-50"
      >
        {busy ? 'Abrindo…' : 'Abrir agentes'}
      </button>
      {message && (
        <p role="status" className={`text-[11px] ${message.ok ? 'text-zinc-300' : 'text-amber-400'}`}>
          {message.text}
        </p>
      )}

      {batches.map((batch) => {
        const summary = summarizeOrchestration(batch.orchestration.tasks)
        const waiting = batch.orchestration.tasks.filter((task) => task.state === 'waiting')
        return (
          <div key={batch.groupId} data-felixo-orchestration-group={batch.groupId} className="space-y-1 border-t border-white/10 pt-2">
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-zinc-200">{batch.label}</span>
              <button
                type="button"
                onClick={() => onFocusNode(batch.groupId)}
                aria-label={`Ir ao grupo ${batch.label}`}
                className="felixo-btn rounded-sm px-1.5 py-0.5 text-[10px] text-zinc-400 hover:bg-white/10 hover:text-zinc-100"
              >
                Ir ao grupo
              </button>
            </div>
            <p className="text-[10px] text-zinc-500" data-felixo-orchestration-summary>
              {summary.done} de {summary.total} concluídas
              {summary.running > 0 ? ` · ${summary.running} rodando` : ''}
              {summary.failed > 0 ? ` · ${summary.failed} falharam` : ''}
              {summary.waiting > 0 ? ` · ${summary.waiting} esperando` : ''}
            </p>
            <ul aria-label={`Tasks de ${batch.label}`} className="space-y-1">
              {batch.orchestration.tasks.map((task) => (
                <TaskRow
                  key={task.id}
                  groupId={batch.groupId}
                  task={task}
                  live={task.terminalId ? live[task.terminalId] : undefined}
                  terminalOpen={Boolean(task.terminalId && existingNodeIds.has(task.terminalId))}
                  onPatch={onPatchTask}
                  onFocus={onFocusNode}
                />
              ))}
            </ul>
            {waiting.length > 0 && (
              <button
                type="button"
                onClick={() => setText(waiting.map((task) => task.titulo).join('\n'))}
                className="felixo-btn rounded-sm px-1.5 py-0.5 text-[10px] text-zinc-400 hover:bg-white/10 hover:text-zinc-100"
              >
                Pedir as que esperam de novo
              </button>
            )}
          </div>
        )
      })}
    </section>
  )
}

function TaskRow({
  groupId,
  task,
  live,
  terminalOpen,
  onPatch,
  onFocus,
}: {
  groupId: string
  task: OrchestrationTask
  live: LiveTerminal | undefined
  terminalOpen: boolean
  onPatch: PatchTask
  onFocus: (nodeId: string) => void
}) {
  const derived = deriveTaskState(task, live?.activity, live?.exitCode)

  // A atividade do terminal só existe com o app aberto: grava o que ela mostra, para valer depois de reiniciar.
  useEffect(() => {
    if (derived.state === task.state && (!derived.worked || task.worked === true)) return
    onPatch(groupId, task.id, { state: derived.state, ...(derived.worked ? { worked: true } : {}) })
  }, [derived.state, derived.worked, groupId, onPatch, task.id, task.state, task.worked])

  return (
    <li data-felixo-orchestration-task={task.id} className="flex items-center gap-1.5 text-[11px]">
      <span
        data-felixo-orchestration-state={derived.state}
        className={`shrink-0 rounded-full border px-1.5 py-px text-[10px] ${STATE_CLASS[derived.state]}`}
      >
        {TASK_STATE_LABEL[derived.state]}
      </span>
      <span className="min-w-0 flex-1 truncate text-zinc-200" title={task.note ? `${task.titulo} — ${task.note}` : task.titulo}>
        {task.titulo}
      </span>
      {task.terminalId && (
        <button
          type="button"
          onClick={() => onFocus(task.terminalId as string)}
          aria-disabled={!terminalOpen}
          aria-label={`Ir ao terminal de ${task.titulo}`}
          title={terminalOpen ? undefined : 'O terminal desta task foi fechado.'}
          className="felixo-btn shrink-0 rounded-sm px-1.5 py-0.5 text-[10px] text-zinc-400 hover:bg-white/10 hover:text-zinc-100 aria-disabled:opacity-40"
        >
          Ir ao terminal
        </button>
      )}
      {task.terminalId && (
        <button
          type="button"
          onClick={() =>
            onPatch(
              groupId,
              task.id,
              task.manual && task.state === 'done' ? { manual: false, state: 'running' } : { manual: true, state: 'done' },
            )
          }
          aria-label={task.manual && task.state === 'done' ? `Reabrir ${task.titulo}` : `Marcar ${task.titulo} como concluída`}
          className="felixo-btn shrink-0 rounded-sm px-1.5 py-0.5 text-[10px] text-zinc-400 hover:bg-white/10 hover:text-zinc-100"
        >
          {task.manual && task.state === 'done' ? 'Reabrir' : 'Marcar concluída'}
        </button>
      )}
    </li>
  )
}

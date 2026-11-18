import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import type { Edge, Node } from '@xyflow/react'

import { isKnownAgentCommand } from '../services/agent-launch-options'
import {
  RECOVERY_PROMPT,
  advanceResumeRun,
  interruptedAgentIds,
  isResumeRunFinished,
  orderByDelivery,
  startResumeRun,
  workMarkPatch,
  type ResumeRun,
} from '../services/workflow-recovery'
import { toSubmittedTerminalText } from '../terminal/terminal-input'
import { useTerminalSessions } from '../terminal/terminal-session-context'

export type InterruptedAgent = { id: string; label: string }

const TICK_MS = 2000

function labelOf(node: Node | undefined, id: string): string {
  const label = (node?.data as { label?: unknown } | undefined)?.label
  return typeof label === 'string' && label.trim() ? label.trim() : id
}

/**
 * Retomada de um workflow multiagente interrompido. Mantém o ponto de
 * salvamento de cada agente no bloco (`workMark`) e, na primeira abertura com
 * o canvas pronto, separa os agentes que estavam trabalhando quando o app
 * fechou. Nada é enviado sem a pessoa pedir: `resume` manda cada um continuar,
 * em ordem de entrega e poucos por vez (ver `workflow-recovery.ts`).
 */
export function useWorkflowRecovery(input: {
  ready: boolean
  /** Os restaurados do disco nesta execução, ainda sem processo (ver `terminalRunRegistry`). */
  holdable: ReadonlySet<string>
  nodesRef: RefObject<Node[]>
  edgesRef: RefObject<Edge[]>
  updateNodeData: (nodeId: string, patch: Record<string, unknown>) => void
}) {
  const { ready, holdable, nodesRef, edgesRef, updateNodeData } = input
  const store = useTerminalSessions()
  const [interrupted, setInterrupted] = useState<InterruptedAgent[]>([])
  const [run, setRun] = useState<ResumeRun | null>(null)
  const capturedRef = useRef(false)
  // Agentes cujo ponto o rastreio não pode tocar: o `idle` do respawn apagaria
  // a evidência antes de a pessoa decidir.
  const pendingRef = useRef(new Set<string>())
  const runRef = useRef<ResumeRun | null>(null)

  useEffect(() => {
    if (!ready) return
    if (!capturedRef.current) {
      capturedRef.current = true
      const nodes = nodesRef.current
      // Só quem veio do disco: voltar do chat reabre o canvas com os PTYs vivos, sem queda.
      const ids = orderByDelivery(interruptedAgentIds(nodes).filter((id) => holdable.has(id)), edgesRef.current)
      pendingRef.current = new Set(ids)
      if (ids.length > 0) {
        setInterrupted(ids.map((id) => ({ id, label: labelOf(nodes.find((n) => n.id === id), id) })))
      }
    }
    return store.subscribeAll(() => {
      const snapshots = store.getSnapshots()
      const now = Date.now()
      for (const node of nodesRef.current) {
        if (node.type !== 'terminal' || pendingRef.current.has(node.id)) continue
        const data = node.data as { command?: string; workMark?: unknown }
        if (!isKnownAgentCommand(data.command)) continue
        const activity = snapshots[node.id]?.activity
        const patch = activity ? workMarkPatch(activity, data.workMark, now) : null
        if (patch) updateNodeData(node.id, patch)
      }
    })
  }, [ready, holdable, store, nodesRef, edgesRef, updateNodeData])

  const finishRun = useCallback((finished: ResumeRun) => {
    const skipped = finished.order.filter((id) => finished.entries[id].phase === 'skipped')
    for (const id of skipped) pendingRef.current.add(id)
    runRef.current = null
    setRun(null)
    setInterrupted((current) => current.filter((agent) => skipped.includes(agent.id)))
  }, [])

  const running = run !== null
  useEffect(() => {
    if (!running) return
    const tick = () => {
      const current = runRef.current
      if (!current) return
      const snapshots = store.getSnapshots()
      const activities = Object.fromEntries(current.order.map((id) => [id, snapshots[id]?.activity]))
      const step = advanceResumeRun(current, activities, Date.now())
      runRef.current = step.run
      for (const id of step.send) {
        pendingRef.current.delete(id)
        void store
          .sendText(id, toSubmittedTerminalText(RECOVERY_PROMPT), { kind: 'collaboration' })
          .then((result) => {
            const latest = runRef.current
            if (result.delivered || !latest) return
            pendingRef.current.add(id)
            runRef.current = { ...latest, entries: { ...latest.entries, [id]: { phase: 'skipped' } } }
          })
      }
      if (isResumeRunFinished(step.run)) finishRun(step.run)
      else setRun(step.run)
    }
    tick()
    const timer = setInterval(tick, TICK_MS)
    const unsubscribe = store.subscribeAll(tick)
    return () => {
      clearInterval(timer)
      unsubscribe()
    }
  }, [running, store, finishRun])

  const resume = useCallback(() => {
    if (runRef.current || interrupted.length === 0) return
    const started = startResumeRun(interrupted.map((agent) => agent.id), Date.now())
    runRef.current = started
    setRun(started)
  }, [interrupted])

  const dismiss = useCallback(() => {
    for (const { id } of interrupted) {
      pendingRef.current.delete(id)
      updateNodeData(id, { workMark: undefined })
    }
    setInterrupted([])
  }, [interrupted, updateNodeData])

  return { interrupted, run, resume, dismiss }
}

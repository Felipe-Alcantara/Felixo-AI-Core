import { useCallback, useEffect, useRef, useState } from 'react'

import type { TerminalOutputEvent } from '../types'

export type OrchestrationAgentState = {
  agentId: string
  cliType: string
  status: 'running' | 'completed' | 'error' | 'fallback'
  threadId?: string
  modelName?: string
  fallbackHistory: Array<{
    fromCliType: string
    toCliType: string
    reason: string
    spreadFromCliType?: string
    at: number
  }>
  lastUpdatedAt: number
}

export type OrchestrationLimitedModel = {
  cliType: string
  modelId?: string
  modelName?: string
  status: string
  reason?: string
  resetLabel?: string
  expiresAt?: number
  at: number
}

export type OrchestrationRunSnapshot = {
  runId: string
  parentThreadId?: string
  agents: Map<string, OrchestrationAgentState>
  startedAt: number
  updatedAt: number
}

export type OrchestrationDashboardState = {
  runs: OrchestrationRunSnapshot[]
  limitedModels: OrchestrationLimitedModel[]
}

const EMPTY_DASHBOARD: OrchestrationDashboardState = {
  runs: [],
  limitedModels: [],
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

export function useOrchestrationDashboard(): OrchestrationDashboardState & {
  reset: () => void
} {
  const runsRef = useRef(new Map<string, OrchestrationRunSnapshot>())
  const limitedRef = useRef<OrchestrationLimitedModel[]>([])
  const [tick, setTick] = useState(0)

  const bump = useCallback(() => setTick((value) => value + 1), [])

  const reset = useCallback(() => {
    runsRef.current = new Map()
    limitedRef.current = []
    bump()
  }, [bump])

  useEffect(() => {
    const subscribe =
      window.felixo?.cli?.onTerminalOutput ?? window.felixo?.cli?.onRawOutput
    if (!subscribe) {
      return
    }

    return subscribe((event: TerminalOutputEvent) => {
      if (event.kind !== 'lifecycle' || event.source !== 'system') {
        return
      }

      const metadata = event.metadata ?? {}
      const runId = readString(metadata.runId)
      const title = event.title ?? ''
      const now = Date.now()

      if (!runId && title !== 'Disponibilidade de modelo') {
        return
      }

      let mutated = false

      if (runId) {
        const run = runsRef.current.get(runId) ?? {
          runId,
          parentThreadId: readString(metadata.parentThreadId),
          agents: new Map<string, OrchestrationAgentState>(),
          startedAt: now,
          updatedAt: now,
        }

        const agentId = readString(metadata.agentId)

        if (title === 'Sub-agente iniciado' && agentId) {
          run.agents.set(agentId, {
            agentId,
            cliType: readString(metadata.cliType) ?? 'unknown',
            status: 'running',
            threadId: readString(metadata.threadId),
            fallbackHistory: [],
            lastUpdatedAt: now,
          })
          mutated = true
        }

        if (title === 'Modelo escolhido' && agentId) {
          const existing = run.agents.get(agentId)
          if (existing) {
            existing.modelName =
              readString(metadata.selectedModelName) ??
              readString(metadata.selectedModelId) ??
              existing.modelName
            existing.lastUpdatedAt = now
            run.agents.set(agentId, existing)
            mutated = true
          }
        }

        if (title === 'Sub-agente migrado para outro modelo' && agentId) {
          const existing = run.agents.get(agentId) ?? {
            agentId,
            cliType: readString(metadata.previousCliType) ?? 'unknown',
            status: 'fallback',
            fallbackHistory: [],
            lastUpdatedAt: now,
          }
          existing.fallbackHistory.push({
            fromCliType: readString(metadata.previousCliType) ?? '?',
            toCliType: readString(metadata.nextCliType) ?? '?',
            reason: event.chunk,
            spreadFromCliType: readString(metadata.spreadFromCliType),
            at: now,
          })
          existing.cliType = readString(metadata.nextCliType) ?? existing.cliType
          existing.status = 'running'
          existing.lastUpdatedAt = now
          run.agents.set(agentId, existing)
          mutated = true
        }

        if (title === 'Resultado de sub-agente' && agentId) {
          const existing = run.agents.get(agentId)
          if (existing) {
            existing.status =
              readString(metadata.status) === 'error' ? 'error' : 'completed'
            existing.lastUpdatedAt = now
            run.agents.set(agentId, existing)
            mutated = true
          }
        }

        if (mutated) {
          run.updatedAt = now
          runsRef.current.set(runId, run)
        }
      }

      if (title === 'Disponibilidade de modelo') {
        const cliType = readString(metadata.cliType)
        const availabilityType = readString(metadata.availabilityType)
        if (!cliType) {
          return
        }

        if (availabilityType === 'available') {
          limitedRef.current = limitedRef.current.filter(
            (entry) =>
              !(
                entry.cliType === cliType &&
                entry.modelId === readString(metadata.modelId)
              ),
          )
        } else {
          const next: OrchestrationLimitedModel = {
            cliType,
            modelId: readString(metadata.modelId),
            modelName: readString(metadata.modelName),
            status: readString(metadata.status) ?? 'limit_reached',
            reason: event.chunk,
            resetLabel: readString(metadata.resetLabel),
            expiresAt: readNumber(metadata.expiresAt),
            at: now,
          }
          limitedRef.current = [
            ...limitedRef.current.filter(
              (entry) =>
                !(
                  entry.cliType === cliType &&
                  entry.modelId === next.modelId
                ),
            ),
            next,
          ]
        }
        mutated = true
      }

      if (mutated) {
        bump()
      }
    })
  }, [bump])

  // Touch tick to invalidate memo without recomputing maps each render.
  void tick

  return {
    runs: Array.from(runsRef.current.values()).sort(
      (left, right) => right.updatedAt - left.updatedAt,
    ),
    limitedModels: [...limitedRef.current].sort((left, right) => right.at - left.at),
    reset,
  }
}

export const ORCHESTRATION_DASHBOARD_EMPTY = EMPTY_DASHBOARD

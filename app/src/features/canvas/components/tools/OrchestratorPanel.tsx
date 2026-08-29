import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, Network, Save } from 'lucide-react'
import { useOrchestrationDashboard } from '../../../shared/orchestrator/useOrchestrationDashboard'
import { CanvasPanel } from './CanvasPanel'
import {
  defaultOrchestratorSettings,
  loadOrchestratorSettings,
  saveOrchestratorSettings,
} from '../../../shared/orchestrator/orchestrator-settings-storage'
import type {
  Model,
  OrchestratorMode,
  OrchestratorSettings,
} from '../../../shared/types/models'

type OrchestratorPanelProps = {
  onClose: () => void
  /** Widens the toolbar column; the panel slides over to clear it. */
  toolsMenuOpen?: boolean
}

const MODE_OPTIONS: Array<{ value: OrchestratorMode; label: string }> = [
  { value: 'manual', label: 'Manual' },
  { value: 'semi_auto', label: 'Semiautomático' },
  { value: 'automatic', label: 'Automático' },
  { value: 'read_only', label: 'Somente leitura' },
  { value: 'experimental', label: 'Experimental' },
]

const LIMIT_FIELDS: Array<{
  key: keyof Pick<
    OrchestratorSettings,
    | 'maxAgentsPerTurn'
    | 'maxTurns'
    | 'maxTotalAgents'
    | 'maxRuntimeMinutes'
    | 'maxCostEstimate'
    | 'maxContextTokens'
  >
  label: string
  help: string
}> = [
  { key: 'maxAgentsPerTurn', label: 'Agentes por rodada', help: 'quantos sobem de uma vez' },
  { key: 'maxTurns', label: 'Rodadas', help: 'ciclos de delegação por execução' },
  { key: 'maxTotalAgents', label: 'Agentes no total', help: 'teto da execução inteira' },
  { key: 'maxRuntimeMinutes', label: 'Minutos de execução', help: 'tempo máximo da execução' },
  { key: 'maxCostEstimate', label: 'Custo estimado', help: '0 = sem teto de custo' },
  { key: 'maxContextTokens', label: 'Tokens de contexto', help: '0 = sem teto de contexto' },
]

/**
 * Limites e política do orquestrador, no canvas.
 *
 * São os tetos que o processo principal aplica de verdade em cada execução
 * (`cli-request-policy`/`orchestration-store`), e até agora só tinham controle
 * dentro da tela de chat — configuração viva sem lugar para mexer nela.
 *
 * A execução ao vivo fica no mesmo painel, e não numa ferramenta separada:
 * limite configurado e limite batido são a mesma pergunta, feita antes e
 * durante a execução.
 */
export function OrchestratorPanel({ onClose, toolsMenuOpen }: OrchestratorPanelProps) {
  const [draft, setDraft] = useState<OrchestratorSettings>(defaultOrchestratorSettings)
  const [models, setModels] = useState<Model[]>([])
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    void loadOrchestratorSettings().then((settings) => {
      if (!cancelled) {
        setDraft(settings)
        setLoading(false)
      }
    })

    void window.felixo?.models?.list().then((result) => {
      if (!cancelled && result?.ok && Array.isArray(result.models)) {
        setModels(result.models as Model[])
      }
    })

    return () => {
      cancelled = true
    }
  }, [])

  const spawnableModels = useMemo(
    () => models.filter((model) => model.cliType !== 'unknown'),
    [models],
  )

  const save = useCallback(async () => {
    await saveOrchestratorSettings(draft)
    setSaved(true)
    window.setTimeout(() => setSaved(false), 2000)
  }, [draft])

  function updateNumber(key: (typeof LIMIT_FIELDS)[number]['key'], raw: string) {
    const value = Number(raw)
    setDraft((current) => ({
      ...current,
      [key]: Number.isFinite(value) && value >= 0 ? value : current[key],
    }))
  }

  function toggleModel(modelId: string, list: 'preferredModelIds' | 'blockedModelIds') {
    setDraft((current) => {
      const other =
        list === 'preferredModelIds' ? 'blockedModelIds' : 'preferredModelIds'
      const nextList = current[list].includes(modelId)
        ? current[list].filter((id) => id !== modelId)
        : [...current[list], modelId]

      return {
        ...current,
        [list]: nextList,
        // Preferido e bloqueado se excluem: marcar um desmarca o outro em vez
        // de deixar o modelo nos dois estados ao mesmo tempo.
        [other]: nextList.includes(modelId)
          ? current[other].filter((id) => id !== modelId)
          : current[other],
      }
    })
  }

  return (
    <CanvasPanel
      title="Orquestrador"
      icon={<Network size={15} />}
      onClose={onClose}
      panelId="orchestrator"
      size="md"
      toolsMenuOpen={toolsMenuOpen}
    >
      <LiveRuns />

      {loading ? (
        <p className="text-xs text-zinc-500">Carregando configurações…</p>
      ) : (
        <div className="space-y-3">
          <label className="block text-xs text-zinc-400">
            <span className="mb-1 block text-zinc-300">Modo</span>
            <select
              value={draft.mode}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  mode: event.target.value as OrchestratorMode,
                }))
              }
              className="w-full rounded-md border border-white/10 bg-zinc-800 px-2 py-1.5 text-xs text-zinc-100"
            >
              {MODE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <fieldset>
            <legend className="mb-1.5 text-xs text-zinc-300">Limites por execução</legend>
            <div className="grid grid-cols-2 gap-2">
              {LIMIT_FIELDS.map((field) => (
                <label key={field.key} className="block text-[11px] text-zinc-500">
                  <span className="block text-zinc-400">{field.label}</span>
                  <input
                    type="number"
                    min={0}
                    value={draft[field.key]}
                    onChange={(event) => updateNumber(field.key, event.target.value)}
                    className="mt-0.5 w-full rounded-md border border-white/10 bg-zinc-800 px-2 py-1 text-xs text-zinc-100"
                  />
                  <span className="mt-0.5 block text-[10px] text-zinc-600">
                    {field.help}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <label className="flex items-start gap-2 text-[11px] text-zinc-400">
            <input
              type="checkbox"
              checked={draft.requireConfirmationForSensitiveActions}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  requireConfirmationForSensitiveActions: event.target.checked,
                }))
              }
              className="mt-0.5 h-3.5 w-3.5"
            />
            Pedir confirmação em ações sensíveis
          </label>

          <div className="border-t border-white/10 pt-2">
            <span className="mb-1.5 block text-xs text-zinc-300">Modelos para spawn</span>
            {spawnableModels.length === 0 ? (
              <p className="text-[11px] text-zinc-500">
                Nenhum modelo configurado para orquestração.
              </p>
            ) : (
              <div className="space-y-1.5">
                {spawnableModels.map((model) => (
                  <div
                    key={model.id}
                    className="rounded-md border border-white/[0.06] bg-black/20 px-2 py-1.5"
                  >
                    <div className="truncate text-[11px] text-zinc-200">{model.name}</div>
                    <div className="truncate font-mono text-[10px] text-zinc-600">
                      {model.cliType}
                      {model.providerModel ? ` · ${model.providerModel}` : ''}
                    </div>
                    <div className="mt-1 flex gap-3 text-[10px] text-zinc-400">
                      <label className="flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={draft.preferredModelIds.includes(model.id)}
                          onChange={() => toggleModel(model.id, 'preferredModelIds')}
                          className="h-3 w-3 accent-cyan-300"
                        />
                        Preferido
                      </label>
                      <label className="flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={draft.blockedModelIds.includes(model.id)}
                          onChange={() => toggleModel(model.id, 'blockedModelIds')}
                          className="h-3 w-3"
                          style={{ accentColor: 'var(--color-error)' }}
                        />
                        Bloqueado
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <label className="block text-[11px] text-zinc-400">
            <span className="mb-1 block text-zinc-300">Contexto fixo</span>
            <textarea
              rows={3}
              value={draft.customContext}
              onChange={(event) =>
                setDraft((current) => ({ ...current, customContext: event.target.value }))
              }
              placeholder="Instruções enviadas em toda execução do orquestrador."
              className="w-full resize-y rounded-md border border-white/10 bg-zinc-800 px-2 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-600"
            />
          </label>

          <label className="block text-[11px] text-zinc-400">
            <span className="mb-1 block text-zinc-300">Memórias globais</span>
            <textarea
              rows={3}
              value={draft.globalMemories}
              onChange={(event) =>
                setDraft((current) => ({ ...current, globalMemories: event.target.value }))
              }
              placeholder="O que o orquestrador deve lembrar entre execuções."
              className="w-full resize-y rounded-md border border-white/10 bg-zinc-800 px-2 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-600"
            />
          </label>

          <button
            type="button"
            onClick={() => void save()}
            className="felixo-btn flex w-full items-center justify-center gap-1.5 rounded-md bg-zinc-800 px-2 py-1.5 text-xs text-zinc-100 ring-1 ring-white/10 hover:bg-zinc-700"
          >
            {saved ? <Check size={13} /> : <Save size={13} />}
            {saved ? 'Salvo' : 'Salvar'}
          </button>
        </div>
      )}
    </CanvasPanel>
  )
}

const AGENT_STATUS_LABEL: Record<string, string> = {
  running: 'em execução',
  completed: 'concluído',
  error: 'erro',
  fallback: 'migrando modelo',
}

const AGENT_STATUS_CLASS: Record<string, string> = {
  running: 'border-blue-500/30 bg-blue-500/15 text-blue-300',
  completed: 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300',
  error: 'border-red-500/30 bg-red-500/15 text-red-300',
  fallback: 'border-amber-500/30 bg-amber-500/15 text-amber-300',
}

/**
 * O que está rodando agora e quais modelos bateram limite. Vem do mesmo fluxo
 * de eventos do processo principal que alimentava o dock da tela de chat.
 */
function LiveRuns() {
  const { runs, limitedModels } = useOrchestrationDashboard()

  const agentsByRun = runs.map((run) => ({
    runId: run.runId,
    agents: Array.from(run.agents.values()).sort(
      (left, right) => right.lastUpdatedAt - left.lastUpdatedAt,
    ),
  }))
  const runningAgents = agentsByRun.reduce(
    (total, run) =>
      total + run.agents.filter((agent) => agent.status === 'running').length,
    0,
  )
  const totalAgents = agentsByRun.reduce((total, run) => total + run.agents.length, 0)

  if (runs.length === 0 && limitedModels.length === 0) {
    return (
      <p className="mb-3 rounded-md border border-white/10 bg-white/[0.02] px-2 py-1.5 text-[11px] text-zinc-500">
        Nenhuma orquestração ativa. Quando o orquestrador delegar tarefas, os
        sub-agentes e fallbacks aparecem aqui.
      </p>
    )
  }

  return (
    <div className="mb-3 space-y-2">
      <p className="text-[11px] text-zinc-400">
        {runs.length} run{runs.length === 1 ? '' : 's'} · {runningAgents}/{totalAgents}{' '}
        agente(s) ativos
      </p>

      {limitedModels.length > 0 && (
        <ul className="space-y-1">
          {limitedModels.map((entry) => (
            <li
              key={`${entry.cliType}:${entry.modelId ?? 'cli-wide'}`}
              className="rounded-md border border-amber-500/20 bg-amber-500/5 px-2 py-1.5 text-[11px] text-amber-100"
            >
              <span className="font-medium">
                {entry.modelName ?? entry.modelId ?? entry.cliType}
              </span>
              <span className="ml-1 text-amber-300/70">({entry.cliType})</span>
              {entry.resetLabel && (
                <span className="block text-amber-300/80">
                  Reset previsto: {entry.resetLabel}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {agentsByRun.map((run) => (
        <div key={run.runId} className="rounded-md border border-white/[0.06] p-1.5">
          <div className="mb-1 flex items-center justify-between text-[10px] text-zinc-500">
            <span className="truncate font-mono">{run.runId}</span>
            <span className="shrink-0">{run.agents.length} agente(s)</span>
          </div>
          <ul className="space-y-1">
            {run.agents.map((agent) => (
              <li key={agent.agentId} className="rounded bg-white/5 px-1.5 py-1 text-[11px]">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-zinc-100">{agent.agentId}</span>
                  <span
                    className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] ${
                      AGENT_STATUS_CLASS[agent.status] ?? AGENT_STATUS_CLASS.running
                    }`}
                  >
                    {AGENT_STATUS_LABEL[agent.status] ?? agent.status}
                  </span>
                </div>
                <div className="text-[10px] text-zinc-500">
                  {agent.cliType}
                  {agent.modelName ? ` · ${agent.modelName}` : ''}
                </div>
                {agent.fallbackHistory.map((entry, index) => (
                  <div key={index} className="text-[10px] text-amber-300/90">
                    ↻ {entry.fromCliType} → {entry.toCliType}
                    {entry.spreadFromCliType
                      ? ` (espalhado de ${entry.spreadFromCliType})`
                      : ''}
                  </div>
                ))}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

import { useId } from 'react'
import type { AgentConfig } from '../hooks/useAgentConfig'
import { CLOUD_TASK_MAX, taskProblem } from '../services/cloud-session-state'

/**
 * O que só o "Agente na nuvem" pede: a tarefa. Entra no formulário do menu
 * Agente no lugar de modelo e esforço; conta e projeto são os campos de sempre.
 */
export function CloudSessionConfigFields({ config }: { config: AgentConfig }) {
  const id = useId()
  const problem = taskProblem(config.cloudTask)

  return (
    <>
      <label htmlFor={`${id}-task`} className="felixo-field-label">
        Tarefa
      </label>
      <textarea
        id={`${id}-task`}
        value={config.cloudTask}
        onChange={(event) => config.setCloudTask(event.target.value.slice(0, CLOUD_TASK_MAX))}
        placeholder="Descreva o que o agente deve fazer na nuvem…"
        aria-invalid={problem ? 'true' : 'false'}
        aria-describedby={`${id}-task-help`}
        className="felixo-control mb-1 min-h-[72px] w-full resize-none"
      />
      <p id={`${id}-task-help`} className="mb-3 text-[11px] leading-relaxed text-zinc-400">
        {problem ? (
          <span className="text-theme-error">{problem}</span>
        ) : (
          `${config.cloudTask.length} / ${CLOUD_TASK_MAX} · Usa o crédito de sessão na nuvem da conta. O cartão pede confirmação antes de gastar.`
        )}
      </p>
    </>
  )
}

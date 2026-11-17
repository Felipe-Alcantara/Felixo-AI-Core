import type { NotionTask } from '../../shared/types/notion'
import { buildAgentArgs, getAgent } from './agent-launch-options'
import { NATIVE_PRESETS } from './agent-preset'
import type { NewTerminalOptions } from './new-terminal-options'

const TASKS_NOTION_PRESET_ID = 'native:tasks-notion'
const TITLE_MAX = 48
const BODY_MAX = 20_000

/**
 * "Enviar para agente": abre o agente do preset "Tasks do Notion" já com a task
 * no contexto inicial (que segue por arquivo, nunca digitado) e a conexão do
 * Notion do app. Só o ID da conexão entra aqui: o token sai do cofre no
 * processo principal e vira NOTION_TOKEN só no ambiente daquele terminal.
 */
export function buildNotionTaskAgentOptions({
  task,
  body,
  connectionId,
  cwd,
}: {
  task: NotionTask
  /** Corpo da página já lido; sem ele o agente lê pela CLI. */
  body?: string
  connectionId: string
  cwd?: string
}): NewTerminalOptions | null {
  const preset = NATIVE_PRESETS.find((item) => item.id === TASKS_NOTION_PRESET_ID)
  const agent = preset ? getAgent(preset.agentId) : undefined
  if (!preset || !agent) return null

  const title = task.title.trim() || 'sem título'
  return {
    command: agent.command,
    args: buildAgentArgs({ agentId: agent.id, model: preset.model, effort: undefined, yolo: preset.yolo, fast: preset.fast }) ?? undefined,
    providerId: agent.id,
    cwd,
    label: `Task · ${title.length > TITLE_MAX ? `${title.slice(0, TITLE_MAX - 1)}…` : title}`,
    notionConnectionId: connectionId,
    preset: {
      id: preset.id,
      name: preset.name,
      contextPrompt: `${preset.contextPrompt}\n\n${buildTaskContext(task, body)}`,
      skillIds: preset.skillIds,
      ...(preset.color ? { color: preset.color } : {}),
    },
  }
}

export function buildTaskContext(task: NotionTask, body?: string): string {
  const lines = [
    '## Task enviada pelo bloco Tarefas Notion',
    `- Título: ${task.title.trim() || 'sem título'}`,
    `- ID: ${task.id}`,
    ...(task.url ? [`- Link: ${task.url}`] : []),
    ...(task.status ? [`- Etapa: ${task.status}`] : []),
    ...(task.priority ? [`- Prioridade: ${task.priority}`] : []),
    ...(task.dueDate ? [`- Prazo: ${task.dueDate}`] : []),
    '',
    `A CLI \`notion-tasks\` já está autenticada neste terminal (credencial do app no ambiente, sem arquivo). Comece por \`notion-tasks conteudo ${task.id}\`; o corpo abaixo é a cópia lida agora.`,
  ]
  const content = (body ?? task.text ?? '').trim()
  if (content) lines.push('', '### Corpo da task', content.length > BODY_MAX ? `${content.slice(0, BODY_MAX)}\n[corpo cortado; leia o resto pela CLI]` : content)
  return lines.join('\n')
}

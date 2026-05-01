import type {
  ChatMessage,
  ContextAttachment,
  Model,
  Project,
} from '../types'
import type { TerminalOutputSession } from '../hooks/useTerminalOutput'

type ExportFormat = 'json' | 'markdown'

type ExportChatParams = {
  format: ExportFormat
  messages: ChatMessage[]
  models: Model[]
  activeProjects: Project[]
  attachments: ContextAttachment[]
  terminalSessions: TerminalOutputSession[]
}

export function exportChat(params: ExportChatParams) {
  const exportedAt = new Date().toISOString()
  const title = createExportTitle(params.messages)
  const fileBaseName = createSafeFileName(title || 'felixo-chat')
  const content =
    params.format === 'json'
      ? createJsonExport(params, exportedAt, title)
      : createMarkdownExport(params, exportedAt, title)
  const mimeType =
    params.format === 'json' ? 'application/json' : 'text/markdown'
  const extension = params.format === 'json' ? 'json' : 'md'

  downloadTextFile(`${fileBaseName}-${formatDateForFile(exportedAt)}.${extension}`, content, mimeType)
}

function createJsonExport(
  params: ExportChatParams,
  exportedAt: string,
  title: string,
) {
  return JSON.stringify(
    {
      version: 1,
      exportedAt,
      title,
      scope: 'main-chat',
      messages: params.messages
        .filter((message) => message.content.trim())
        .map((message) => ({
          role: message.role,
          content: message.content,
          createdAt: message.createdAt,
          model: resolveModelName(message.model, params.models),
          sessionId: message.sessionId,
        })),
      activeProjects: params.activeProjects.map((project) => ({
        name: project.name,
        path: project.path,
      })),
      attachments: params.attachments.map((attachment) => ({
        name: attachment.name,
        path: attachment.path,
        type: attachment.type,
        size: attachment.size,
      })),
      terminalSessions: params.terminalSessions.map((session) => ({
        sessionId: session.sessionId,
        parentThreadId: session.parentThreadId,
        status: session.status,
        startedAt: session.startedAt,
        updatedAt: session.updatedAt,
        outputSize: session.outputSize,
        events: session.chunks.length,
      })),
    },
    null,
    2,
  )
}

function createMarkdownExport(
  params: ExportChatParams,
  exportedAt: string,
  title: string,
) {
  const lines = [
    `# ${title || 'Felixo AI Core Chat'}`,
    '',
    `Exportado em: ${exportedAt}`,
    '',
  ]

  if (params.activeProjects.length > 0) {
    lines.push('## Projetos ativos', '')
    for (const project of params.activeProjects) {
      lines.push(`- ${project.name}: ${project.path}`)
    }
    lines.push('')
  }

  if (params.attachments.length > 0) {
    lines.push('## Anexos de contexto', '')
    for (const attachment of params.attachments) {
      lines.push(`- ${attachment.name} (${attachment.type}, ${attachment.size} B)`)
    }
    lines.push('')
  }

  lines.push('## Conversa', '')

  for (const message of params.messages.filter((item) => item.content.trim())) {
    const role = message.role === 'user' ? 'Usuario' : 'Assistente'
    const model = resolveModelName(message.model, params.models)
    const suffix = model ? ` — ${model}` : ''
    lines.push(`### ${role}${suffix}`, '', message.content.trim(), '')
  }

  return lines.join('\n')
}

function downloadTextFile(fileName: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = url
  link.download = fileName
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function createExportTitle(messages: ChatMessage[]) {
  const firstUserMessage = messages.find(
    (message) => message.role === 'user' && message.content.trim(),
  )

  return firstUserMessage?.content.trim().slice(0, 80) || 'Felixo AI Core Chat'
}

function resolveModelName(modelId: string | undefined, models: Model[]) {
  if (!modelId) {
    return undefined
  }

  return models.find((model) => model.id === modelId)?.name ?? modelId
}

function createSafeFileName(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 72)
}

function formatDateForFile(value: string) {
  return value.replace(/[:.]/g, '-')
}

import type {
  ChatMessage,
  ContextAttachment,
  Model,
  Project,
} from '../types'
import type { TerminalOutputSession } from '../hooks/useTerminalOutput'

type ExportFormat = 'json' | 'markdown' | 'text'

type ExportChatParams = {
  format: ExportFormat
  fileName?: string
  messages: ChatMessage[]
  models: Model[]
  activeProjects: Project[]
  attachments: ContextAttachment[]
  terminalSessions: TerminalOutputSession[]
}

type ExportResult = {
  ok: boolean
  canceled?: boolean
  filePath?: string
  message?: string
}

export async function exportChat(params: ExportChatParams): Promise<ExportResult> {
  const exportedAt = new Date().toISOString()
  const title = createExportTitle(params.messages)
  const content =
    params.format === 'json'
      ? createJsonExport(params, exportedAt, title)
      : params.format === 'text'
        ? createTextExport(params, exportedAt, title)
        : createMarkdownExport(params, exportedAt, title)
  const mimeType =
    params.format === 'json'
      ? 'application/json'
      : 'text/plain'
  const extension =
    params.format === 'json' ? 'json' : params.format === 'text' ? 'txt' : 'md'
  const fileName = createExportFileName({
    requestedFileName: params.fileName,
    title,
    exportedAt,
    extension,
  })

  if (window.felixo?.files?.saveTextFile) {
    return window.felixo.files.saveTextFile({
      defaultPath: fileName,
      content,
      filters: [createExportFileFilter(params.format)],
    })
  }

  downloadTextFile(fileName, content, mimeType)

  return { ok: true }
}

export function createSuggestedExportFileName(
  messages: ChatMessage[],
  format: ExportFormat,
) {
  const exportedAt = new Date().toISOString()
  const title = createExportTitle(messages)
  const extension = format === 'json' ? 'json' : format === 'text' ? 'txt' : 'md'

  return createExportFileName({ title, exportedAt, extension })
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

function createTextExport(
  params: ExportChatParams,
  exportedAt: string,
  title: string,
) {
  const lines = [
    title || 'Felixo AI Core Chat',
    `Exportado em: ${exportedAt}`,
    '',
  ]

  for (const message of params.messages.filter((item) => item.content.trim())) {
    const role = message.role === 'user' ? 'Usuario' : 'Assistente'
    const model = resolveModelName(message.model, params.models)
    const suffix = model ? ` (${model})` : ''
    lines.push(`[${role}${suffix}]`, message.content.trim(), '')
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
  const fileName = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 72)

  return fileName || 'felixo-chat'
}

function formatDateForFile(value: string) {
  return value.replace(/[:.]/g, '-')
}

function createExportFileName({
  requestedFileName,
  title,
  exportedAt,
  extension,
}: {
  requestedFileName?: string
  title: string
  exportedAt: string
  extension: string
}) {
  const manualFileName = normalizeManualFileName(requestedFileName)

  if (manualFileName) {
    return ensureFileExtension(manualFileName, extension)
  }

  const fileBaseName = createSafeFileName(title || 'felixo-chat')

  return `${fileBaseName}-${formatDateForFile(exportedAt)}.${extension}`
}

function normalizeManualFileName(value: string | undefined) {
  if (!value?.trim()) {
    return ''
  }

  return value
    .trim()
    .replace(/[\\/:*?"<>|]/g, '-')
    .split('')
    .map((character) => (character.charCodeAt(0) < 32 ? '-' : character))
    .join('')
    .replace(/\s+/g, ' ')
    .slice(0, 120)
}

function ensureFileExtension(fileName: string, extension: string) {
  const normalizedExtension = extension.replace(/^\./, '')

  if (fileName.toLowerCase().endsWith(`.${normalizedExtension}`)) {
    return fileName
  }

  if (/\.(json|md|markdown)$/i.test(fileName)) {
    return fileName.replace(/\.(json|md|markdown)$/i, `.${normalizedExtension}`)
  }

  return `${fileName}.${normalizedExtension}`
}

function createExportFileFilter(format: ExportFormat) {
  if (format === 'json') {
    return { name: 'JSON', extensions: ['json'] }
  }

  if (format === 'text') {
    return { name: 'Texto', extensions: ['txt'] }
  }

  return { name: 'Markdown', extensions: ['md', 'markdown'] }
}

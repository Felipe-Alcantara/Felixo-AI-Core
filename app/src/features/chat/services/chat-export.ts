import type {
  ChatMessage,
  ContextAttachment,
  Model,
  Project,
  QaLogEntry,
} from '../types'
import type { TerminalOutputSession } from '../hooks/useTerminalOutput'

export type ExportFormat = 'json' | 'markdown' | 'text' | 'analysis'

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

type QaLogSnapshot = {
  entries: QaLogEntry[]
  error?: string
}

export async function exportChat(params: ExportChatParams): Promise<ExportResult> {
  const exportedAt = new Date().toISOString()
  const title = createExportTitle(params.messages)
  const qaLogSnapshot =
    params.format === 'analysis'
      ? await loadQaLogSnapshot()
      : { entries: [] }
  const content =
    params.format === 'json'
      ? createJsonExport(params, exportedAt, title)
      : params.format === 'text'
        ? createTextExport(params, exportedAt, title)
        : params.format === 'analysis'
          ? createAnalysisMarkdownExport(
              params,
              exportedAt,
              title,
              qaLogSnapshot,
            )
          : createMarkdownExport(params, exportedAt, title)
  const mimeType =
    params.format === 'json'
      ? 'application/json'
      : params.format === 'markdown' || params.format === 'analysis'
        ? 'text/markdown'
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

function createAnalysisMarkdownExport(
  params: ExportChatParams,
  exportedAt: string,
  title: string,
  qaLogSnapshot: QaLogSnapshot,
) {
  const messages = params.messages.filter((item) => item.content.trim())
  const terminalSessions = sortTerminalSessionsForExport(params.terminalSessions)
  const terminalEventsCount = terminalSessions.reduce(
    (count, session) => count + session.chunks.length,
    0,
  )
  const lines = [
    `# ${title || 'Felixo AI Core Chat'} - Analise e debug`,
    '',
    `Exportado em: ${exportedAt}`,
    '',
    '## Resumo',
    '',
    `- Mensagens do chat: ${messages.length}`,
    `- Entradas do QA Logger: ${qaLogSnapshot.entries.length}`,
    `- Sessoes de CLI: ${terminalSessions.length}`,
    `- Eventos de CLI: ${terminalEventsCount}`,
    `- Projetos ativos: ${params.activeProjects.length}`,
    `- Anexos de contexto: ${params.attachments.length}`,
    '',
  ]

  appendProjectsSection(lines, params.activeProjects)
  appendAttachmentsSection(lines, params.attachments)
  appendConversationSection(lines, messages, params.models)
  appendQaLoggerSection(lines, qaLogSnapshot)
  appendCliLogsSection(lines, terminalSessions)

  return lines.join('\n')
}

function appendProjectsSection(lines: string[], projects: Project[]) {
  lines.push('## Projetos ativos', '')

  if (projects.length === 0) {
    lines.push('Nenhum projeto ativo no momento da exportacao.', '')
    return
  }

  for (const project of projects) {
    lines.push(`- ${project.name}: ${project.path}`)
  }

  lines.push('')
}

function appendAttachmentsSection(
  lines: string[],
  attachments: ContextAttachment[],
) {
  lines.push('## Anexos de contexto', '')

  if (attachments.length === 0) {
    lines.push('Nenhum anexo de contexto no momento da exportacao.', '')
    return
  }

  for (const attachment of attachments) {
    lines.push(
      `- ${attachment.name} (${attachment.type}, ${attachment.size} B)${
        attachment.path ? ` - ${attachment.path}` : ''
      }`,
    )
  }

  lines.push('')
}

function appendConversationSection(
  lines: string[],
  messages: ChatMessage[],
  models: Model[],
) {
  lines.push('## Conversa', '')

  if (messages.length === 0) {
    lines.push('Nenhuma mensagem com conteudo no chat atual.', '')
    return
  }

  messages.forEach((message, index) => {
    const role = message.role === 'user' ? 'Usuario' : 'Assistente'
    const model = resolveModelName(message.model, models)
    const suffix = model ? ` - ${model}` : ''

    lines.push(`### Mensagem ${index + 1} - ${role}${suffix}`, '')
    lines.push(`- Criada em: ${message.createdAt}`)
    if (message.sessionId) {
      lines.push(`- Session ID: ${message.sessionId}`)
    }
    if (message.attachments?.length) {
      lines.push(`- Anexos na mensagem: ${message.attachments.length}`)
    }
    lines.push('', message.content.trim(), '')
  })
}

function appendQaLoggerSection(
  lines: string[],
  qaLogSnapshot: QaLogSnapshot,
) {
  lines.push('## QA Logger', '')

  if (qaLogSnapshot.error) {
    lines.push(`Falha ao carregar QA Logger: ${qaLogSnapshot.error}`, '')
  }

  if (qaLogSnapshot.entries.length === 0) {
    lines.push('Nenhuma entrada disponivel no QA Logger.', '')
    return
  }

  qaLogSnapshot.entries.forEach((entry, index) => {
    lines.push(
      `### QA ${index + 1} - ${entry.level.toUpperCase()} - ${createSingleLine(entry.scope)}`,
      '',
      `- ID: ${entry.id}`,
      `- Criado em: ${entry.createdAt}`,
    )
    if (entry.sessionId) {
      lines.push(`- Session ID: ${entry.sessionId}`)
    }
    lines.push('', entry.message || '(sem mensagem)', '')

    if (entry.details !== null) {
      lines.push('Detalhes:', '', createCodeFence(formatUnknown(entry.details), 'json'), '')
    }
  })
}

function appendCliLogsSection(
  lines: string[],
  terminalSessions: TerminalOutputSession[],
) {
  lines.push('## Logs da CLI', '')

  if (terminalSessions.length === 0) {
    lines.push('Nenhuma sessao de CLI registrada no frontend.', '')
    return
  }

  terminalSessions.forEach((session, sessionIndex) => {
    lines.push(
      `### CLI ${sessionIndex + 1} - ${session.sessionId}`,
      '',
      `- Status: ${session.status}`,
      `- Inicio: ${session.startedAt}`,
      `- Atualizado em: ${session.updatedAt}`,
      `- Eventos: ${session.chunks.length}`,
      `- Tamanho acumulado: ${session.outputSize} B`,
    )
    if (session.parentThreadId) {
      lines.push(`- Parent thread ID: ${session.parentThreadId}`)
    }
    lines.push('')

    if (session.chunks.length === 0) {
      lines.push('Nenhum evento registrado nesta sessao.', '')
      return
    }

    session.chunks.forEach((chunk, chunkIndex) => {
      lines.push(
        `#### Evento ${chunkIndex + 1} - ${createSingleLine(
          chunk.title ?? chunk.kind ?? chunk.source,
        )}`,
        '',
        `- Criado em: ${chunk.createdAt}`,
        `- Source: ${chunk.source}`,
      )
      if (chunk.kind) {
        lines.push(`- Kind: ${chunk.kind}`)
      }
      if (chunk.severity) {
        lines.push(`- Severity: ${chunk.severity}`)
      }
      if (chunk.metadata && Object.keys(chunk.metadata).length > 0) {
        lines.push('', 'Metadata:', '', createCodeFence(formatUnknown(chunk.metadata), 'json'))
      }
      lines.push('', 'Conteudo:', '', createCodeFence(chunk.chunk || '(vazio)', 'text'), '')
    })
  })
}

async function loadQaLogSnapshot(): Promise<QaLogSnapshot> {
  try {
    const entries = await window.felixo?.qaLogger?.getEntries?.()

    return { entries: entries ?? [] }
  } catch (error) {
    return {
      entries: [],
      error: error instanceof Error ? error.message : 'Falha desconhecida.',
    }
  }
}

function sortTerminalSessionsForExport(
  terminalSessions: TerminalOutputSession[],
) {
  return [...terminalSessions].sort(
    (left, right) =>
      new Date(left.startedAt).getTime() - new Date(right.startedAt).getTime(),
  )
}

function createSingleLine(value: string) {
  return value.replace(/\s+/g, ' ').trim().slice(0, 120) || 'sem titulo'
}

function formatUnknown(value: unknown) {
  if (typeof value === 'string') {
    return value
  }

  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function createCodeFence(content: string, language: string) {
  const longestFenceLength = Math.max(
    3,
    ...Array.from(content.matchAll(/`+/g), (match) => match[0].length + 1),
  )
  const fence = '`'.repeat(longestFenceLength)

  return `${fence}${language}\n${content}\n${fence}`
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

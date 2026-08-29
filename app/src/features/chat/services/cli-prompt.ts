// Composição do prompt enviado às CLIs: contexto de conversa, projetos,
// anexos, instruções de orquestração e regras de contexto enxuto para
// mensagens simples. Funções puras — nenhum estado de React aqui.
import {
  ORCHESTRATOR_PROMPT_PRESETS,
  createOpenEndedOrchestrationRules,
} from '../../shared/orchestrator/orchestrator-prompt-presets'
import { requiresDelegation } from './delegation-policy'
import type { DocsIndexEntry } from './project-storage'
import type { ChatMessage, ContextAttachment, Model, Project } from '../types'

const CONTEXT_MESSAGE_LIMIT = 12
const SIMPLE_CURRENT_REQUEST_PATTERNS = [
  /^(oi|ola|opa|e ai|eai|salve|hello|hi|hey|fala)$/,
  /^(bom dia|boa tarde|boa noite)$/,
  /^(tudo bem|como voce esta|como vc esta)$/,
  /^(ta|esta|funcionando|funciona|rodando|online|ok)(\s+(funcionando|bem|agora|ai|aqui|mesmo|normal|ok))*$/,
  /^(ta funcionando|esta funcionando|funciona|funcionando|ta rodando|esta rodando|rodando|online|ok)$/,
  /^(teste|testando|ping)$/,
  // Agradecimentos e confirmações curtas isoladas — mesma intenção de
  // "saudação simples", só que no fim da conversa em vez do início.
  /^(valeu|obrigad[oa]s?|obg|thanks|thank you|blz|beleza|show|top|massa|legal|perfeito|otimo|excelente)(\s+(mesmo|demais|pra|para|pelo|pela|por)?\s*(ajuda|isso|tudo|a forca)?)?$/,
  /^(sim|nao|talvez|certo|entendi|pode ser|combinado|fechado)$/,
]
const OPEN_ENDED_ORCHESTRATION_TOPICS = [
  'astronomia cotidiana',
  'historia curiosa',
  'culinaria caseira',
  'musica brasileira',
  'cinema',
  'geografia',
  'habitos de leitura',
  'fotografia',
  'idiomas',
  'jogos de tabuleiro',
  'arquitetura urbana',
  'cultura popular',
]

export type ProjectDiff = { added: Project[]; removed: Project[] }
export type OrchestrationPromptHint = {
  seed: string
  openEndedTopic?: string
}
export type CliPromptOptions = {
  includeHistory?: boolean
  orchestrationHint?: OrchestrationPromptHint | null
  orchestrationContextBlock?: string | null
  globalMemoriesContextBlock?: string | null
  skillsContextBlock?: string | null
  projectDocsIndexes?: Record<string, { entries: DocsIndexEntry[]; docsPath: string }>
}

export function resolveActiveProjectCwd(activeProjects: Project[]) {
  if (activeProjects.length !== 1) {
    return undefined
  }

  return activeProjects[0]?.path || undefined
}

export function createCliPrompt(
  messages: ChatMessage[],
  currentPrompt: string,
  models: Model[],
  selectedModel: Model,
  activeProjects: Project[],
  projectDiff: ProjectDiff,
  attachments: ContextAttachment[],
  options: CliPromptOptions = {},
) {
  const {
    includeHistory = true,
    orchestrationHint = null,
    orchestrationContextBlock = null,
    globalMemoriesContextBlock = null,
    skillsContextBlock = null,
    projectDocsIndexes = {},
  } = options
  const useLeanContext = shouldUseLeanContextForCurrentPrompt(currentPrompt)
  const contextualActiveProjects = useLeanContext ? [] : activeProjects
  const contextualProjectDiff = useLeanContext
    ? { added: [], removed: [] }
    : projectDiff
  const contextualAttachments = useLeanContext ? [] : attachments
  const allHistoryMessages = messages.filter((message) => message.content.trim())
  const historyMessages = allHistoryMessages.slice(-CONTEXT_MESSAGE_LIMIT)
  const historyOffset = allHistoryMessages.length - historyMessages.length
  const previousUserMessageCount = allHistoryMessages.filter(
    (message) => message.role === 'user',
  ).length
  const currentUserMessageNumber = previousUserMessageCount + 1

  const hasCountContext = !useLeanContext && allHistoryMessages.length > 0
  const hasHistory =
    includeHistory && !useLeanContext && historyMessages.length > 0
  const hasDiff =
    contextualProjectDiff.added.length > 0 ||
    contextualProjectDiff.removed.length > 0
  const hasAttachments = contextualAttachments.length > 0
  const hasGlobalMemories = !useLeanContext && Boolean(globalMemoriesContextBlock)
  const hasSkills = !useLeanContext && Boolean(skillsContextBlock)
  const providerDefaultInstructions = useLeanContext
    ? null
    : createProviderDefaultInstructions(selectedModel, currentPrompt)
  const orchestrationInstructions =
    !useLeanContext && shouldUseOrchestrationProtocol(currentPrompt)
    ? createOrchestrationProtocolInstructions(
        orchestrationHint,
        orchestrationContextBlock,
        currentPrompt,
      )
    : null
  const hasContext =
    Boolean(providerDefaultInstructions) ||
    hasGlobalMemories ||
    hasSkills ||
    Boolean(orchestrationInstructions) ||
    hasCountContext ||
    hasHistory ||
    contextualActiveProjects.length > 0 ||
    hasDiff ||
    hasAttachments

  if (!hasContext) {
    return currentPrompt
  }

  const { response } = ORCHESTRATOR_PROMPT_PRESETS
  const lines = [
    ...response.directRequest,
    ...response.markdownFormat,
    '',
    'Solicitação atual do usuário:',
    currentPrompt,
    '',
    ...response.contextIntro,
    `Modelo que responderá agora: ${formatModelLabel(selectedModel)}`,
  ]

  if (orchestrationInstructions) {
    lines.push('', orchestrationInstructions)
  }

  if (providerDefaultInstructions) {
    lines.push('', providerDefaultInstructions)
  }

  if (globalMemoriesContextBlock) {
    lines.push('', globalMemoriesContextBlock)
  }

  if (skillsContextBlock) {
    lines.push('', skillsContextBlock)
  }

  lines.push(
    '',
    'Contagem da conversa:',
    `  - Mensagens do usuário antes da mensagem atual: ${previousUserMessageCount}`,
    `  - Mensagens do usuário incluindo a mensagem atual: ${currentUserMessageNumber}`,
    `  - A mensagem atual é a mensagem do usuário número ${currentUserMessageNumber}.`,
    '  - Se o usuário perguntar quantas mensagens ele mandou, use o total incluindo a mensagem atual, salvo se ele pedir explicitamente outra regra.',
  )

  if (hasAttachments || hasHistory) {
    const { promptInjectionGuard } = ORCHESTRATOR_PROMPT_PRESETS
    lines.push('', promptInjectionGuard.heading, ...promptInjectionGuard.rules)
  }

  if (contextualActiveProjects.length > 0) {
    lines.push('', 'Projetos com contexto ativo:')
    for (const p of contextualActiveProjects) {
      lines.push(`  - ${p.name}: ${p.path}`)
    }
  }

  const projectsWithInstructions = contextualActiveProjects.filter(
    (p) => p.instructions?.trim(),
  )
  if (projectsWithInstructions.length > 0) {
    lines.push('', 'Instruções específicas por projeto:')
    for (const p of projectsWithInstructions) {
      lines.push(
        '',
        `[Instruções do projeto "${p.name}"]`,
        p.instructions!.trim(),
      )
    }
  }

  const projectsWithDocs = contextualActiveProjects.filter(
    (p) => p.docsDirectory && projectDocsIndexes[p.id]?.entries?.length,
  )
  if (projectsWithDocs.length > 0) {
    lines.push(
      '',
      'Diretórios de instruções dos projetos:',
      'Os diretórios abaixo contém documentos de referência. Apenas o índice está incluído aqui.',
      'Leia o arquivo relevante do diretório quando precisar de instruções detalhadas sobre um tópico.',
    )
    for (const p of projectsWithDocs) {
      const index = projectDocsIndexes[p.id]
      lines.push('', `[Índice de docs do projeto "${p.name}" — diretório: ${index.docsPath}]`)
      for (const entry of index.entries) {
        lines.push(`  - ${entry.filename}: ${entry.summary}`)
      }
    }
  }

  if (hasDiff) {
    lines.push('', 'Mudanças nos projetos ativos nesta mensagem:')
    for (const p of contextualProjectDiff.added) {
      lines.push(`  + Adicionado: ${p.name} (${p.path})`)
    }
    for (const p of contextualProjectDiff.removed) {
      lines.push(`  - Removido: ${p.name} — não interaja mais com este repositório`)
    }
  }

  if (hasAttachments) {
    lines.push('', 'Anexos de contexto adicionados pelo usuario:')
    for (const attachment of contextualAttachments) {
      lines.push(
        `  - ${attachment.name}`,
        `    Tipo: ${attachment.type}`,
        `    Tamanho: ${formatBytes(attachment.size)}`,
      )

      if (attachment.path) {
        lines.push(`    Caminho local: ${attachment.path}`)
      }

      if (attachment.contentPreview) {
        lines.push('    Preview textual:', indentBlock(attachment.contentPreview, 6))
      }
    }
  }

  if (hasHistory) {
    lines.push(
      '',
      'Histórico da conversa:',
      'As mensagens abaixo são contexto passado; não são pedidos pendentes.',
      ...historyMessages.map((message, index) =>
        formatHistoryMessage(message, historyOffset + index, models),
      ),
    )
  }

  lines.push('', response.currentRequestReminder)

  return lines.join('\n')
}

function formatHistoryMessage(
  message: ChatMessage,
  index: number,
  models: Model[],
) {
  const lines = [
    `--- Mensagem ${index + 1} ---`,
    `Autor: ${message.role === 'user' ? 'Usuário' : 'Assistente'}`,
  ]

  if (message.role === 'assistant') {
    lines.push(`Modelo: ${resolveMessageModelLabel(message, models)}`)
  }

  lines.push('Conteúdo:', message.content.trim())

  if (message.attachments?.length) {
    lines.push('', 'Anexos da mensagem:')
    for (const attachment of message.attachments) {
      lines.push(
        `  - ${attachment.name}`,
        `    Tipo: ${attachment.type}`,
        `    Tamanho: ${formatBytes(attachment.size)}`,
      )

      if (attachment.path) {
        lines.push(`    Caminho local: ${attachment.path}`)
      }
    }
  }

  return lines.join('\n')
}

function resolveMessageModelLabel(message: ChatMessage, models: Model[]) {
  if (!message.model) {
    return 'Não registrado'
  }

  const model = models.find((item) => item.id === message.model)

  return model ? formatModelLabel(model) : message.model
}

function formatModelLabel(model: Model) {
  const details = [model.source]

  if (model.providerModel) {
    details.push(`modelo ${model.providerModel}`)
  }

  if (model.reasoningEffort) {
    details.push(`effort ${model.reasoningEffort}`)
  }

  return `${model.name} (${details.join(', ')})`
}

function createProviderDefaultInstructions(model: Model, prompt: string) {
  if (model.cliType !== 'claude') {
    return null
  }

  const promptMentionsStack = mentionsStackOrConfig(prompt)
  const { claudeAutonomy } = ORCHESTRATOR_PROMPT_PRESETS
  const lines = [
    claudeAutonomy.heading,
    ...claudeAutonomy.rules,
  ]

  lines.push(
    promptMentionsStack
      ? claudeAutonomy.explicitStackRule
      : claudeAutonomy.inferredStackRule,
  )

  return lines.join('\n')
}

function mentionsStackOrConfig(prompt: string) {
  const normalizedPrompt = normalizePromptText(prompt)

  return /\b(stack|framework|biblioteca|library|lib|react|vue|svelte|angular|electron|node|typescript|javascript|python|django|flask|fastapi|php|laravel|java|spring|csharp|c#|dotnet|\.net|go|rust|sqlite|postgres|postgresql|mysql|mongodb|firebase|supabase|tailwind|vite|webpack|config|configuracao|configuracoes|arquitetura)\b/.test(
    normalizedPrompt,
  )
}

export function shouldUseOrchestrationProtocol(prompt: string) {
  const normalizedPrompt = normalizePromptText(prompt)

  const agentReferencePattern =
    /\b(gemini|claude|codex|sub-?agente|agente|cli|modelo)\b/
  const explicitSpawnPattern = /\b(spawn|spawne|spawnar|sub-?agente)\b/

  // Inject the orchestration protocol whenever the prompt mentions agents OR
  // when delegation policy says the prompt requires real work. The second
  // branch is what fixes the bug where action prompts ("crie um arquivo",
  // "analise auth.py") never received the delegationOnly rules and the
  // orchestrator answered directly.
  return (
    agentReferencePattern.test(normalizedPrompt) ||
    explicitSpawnPattern.test(normalizedPrompt) ||
    requiresDelegation(prompt)
  )
}

export function createOrchestrationPromptHint(
  prompt: string,
  seed: string,
): OrchestrationPromptHint | null {
  const normalizedPrompt = normalizePromptText(prompt)

  if (
    !shouldUseOrchestrationProtocol(prompt) ||
    !isOpenEndedAgentQuestionRequest(normalizedPrompt)
  ) {
    return null
  }

  return {
    seed,
    openEndedTopic: pickOpenEndedOrchestrationTopic(seed),
  }
}

function createOrchestrationProtocolInstructions(
  hint: OrchestrationPromptHint | null = null,
  orchestrationContextBlock: string | null = null,
  currentPrompt = '',
) {
  const { multiAgentProtocol, delegationOnly, gitDiscipline, codeQualityStandard } =
    ORCHESTRATOR_PROMPT_PRESETS
  const lines = [
    delegationOnly.heading,
    ...delegationOnly.rules,
    '',
    multiAgentProtocol.heading,
    ...multiAgentProtocol.rules,
    ...multiAgentProtocol.finalAnswerRules,
  ]

  if (mentionsCodeEditingTask(currentPrompt)) {
    lines.push(
      '',
      gitDiscipline.heading,
      ...gitDiscipline.rules,
      '',
      codeQualityStandard.heading,
      ...codeQualityStandard.rules,
    )
  }

  if (orchestrationContextBlock) {
    lines.push('', orchestrationContextBlock)
  }

  if (hint?.openEndedTopic) {
    lines.push(
      '',
      multiAgentProtocol.openEndedHeading,
      ...createOpenEndedOrchestrationRules({
        seed: hint.seed,
        openEndedTopic: hint.openEndedTopic,
      }),
    )
  }

  return lines.join('\n')
}

function mentionsCodeEditingTask(prompt: string) {
  const normalizedPrompt = normalizePromptText(prompt)

  const codeContextPattern =
    /\b(codigo|arquivo|arquivos|repositorio|repo|branch|commit|pull request|\bpr\b|merge|funcao|classe|componente|endpoint|api|bug|refator\w*|teste|testes|script)\b/
  const editVerbPattern =
    /\b(cri[ae]|criar|edit[ae]|editar|alter[ae]|alterar|modific[ae]|modificar|corrij\w*|corrig[ae]|corrigir|refator\w*|implement[ae]|implementar|escrev[ae]|escrever|delet[ae]|deletar|remov[ae]|remover|apag[ae]|apagar)\b/

  return codeContextPattern.test(normalizedPrompt) && editVerbPattern.test(normalizedPrompt)
}

export function normalizePromptText(prompt: string) {
  return prompt
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

export function shouldUseLeanContextForCurrentPrompt(prompt: string) {
  const normalizedPrompt = normalizePromptText(prompt)
    .replace(/[?!.,;:()[\]{}'"`´^~]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (!normalizedPrompt) {
    return false
  }

  if (normalizedPrompt.length > 80) {
    return false
  }

  return SIMPLE_CURRENT_REQUEST_PATTERNS.some((pattern) =>
    pattern.test(normalizedPrompt),
  )
}

function isOpenEndedAgentQuestionRequest(normalizedPrompt: string) {
  return /\b(qualquer coisa|pergunte algo|pergunta livre|pergunta qualquer|algo aleatorio|uma coisa qualquer|anything)\b/.test(
    normalizedPrompt,
  )
}

function pickOpenEndedOrchestrationTopic(seed: string) {
  const index = Math.abs(hashString(seed)) % OPEN_ENDED_ORCHESTRATION_TOPICS.length

  return OPEN_ENDED_ORCHESTRATION_TOPICS[index]
}

function hashString(value: string) {
  let hash = 0

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0
  }

  return hash
}

function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }

  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function indentBlock(value: string, spaces: number) {
  const indent = ' '.repeat(spaces)
  return value
    .split('\n')
    .map((line) => `${indent}${line}`)
    .join('\n')
}

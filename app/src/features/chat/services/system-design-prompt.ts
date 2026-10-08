import type {
  SystemDesignConfig,
  SystemDesignDocumentSummary,
  SystemDesignGuide,
  SystemDesignProject,
} from '../types'

/**
 * Remove credencial embutida em URL (`https://usuario:senha@host/...`).
 *
 * O processo principal já grava a URL sem credencial; isto é o último degrau
 * antes de o texto entrar num prompt que vai para um modelo — uma URL antiga
 * em memória não pode virar vazamento.
 */
function withoutCredentials(url: string): string {
  return url.replace(/^([a-z][a-z0-9+.-]*:\/\/)[^/@\s]*@/i, '$1')
}

function formatSourceLabel(label: string, branch: string): string {
  return `${label} (branch: ${branch})`
}

// Builds the System Design guidance block injected into the orchestrator
// prompt when the user enabled the guide.
// The block tells the orchestrator and its sub-agents to consult the cached
// markdown documents before making technical decisions, listing each
// available document with title and summary so the LLM can decide which
// ones to read via the Read tool.
//
// A fonte citada é a ENTREGUE (de onde vieram os documentos em cache), não a
// configurada: depois de a pessoa trocar a URL, ou quando a sincronização
// falha, o índice abaixo ainda é o da fonte anterior — e o prompt não pode
// mandar o agente confiar num repositório que ele não está lendo.
export function createSystemDesignPromptBlock(
  config: SystemDesignConfig,
  documents: SystemDesignDocumentSummary[],
): string | null {
  if (!config.enabled || documents.length === 0) {
    return null
  }

  const delivered = config.delivered
  const name = delivered?.label || config.label || 'System Design'
  const sourceUrl = withoutCredentials(delivered?.repoUrl ?? config.repoUrl)
  const sourceBranch = delivered?.branch ?? config.branch
  const sha = delivered?.sha ?? config.lastSha

  const header = [
    `Guia obrigatório — ${name}:`,
    `- O usuário ativou "${name}" como guia. Você e seus sub-agentes DEVEM seguir os padrões deste repositório.`,
    '- Os documentos foram clonados e indexados localmente. Antes de gerar código, decidir arquitetura, escrever testes, organizar pastas ou tomar qualquer decisão técnica, consulte o(s) documento(s) relevantes abaixo.',
    '- Em sub-agentes que tem acesso a Read/Glob/Grep, instrua-os a ler o(s) arquivo(s) relevante(s) do índice antes de produzir o resultado.',
    `- Repositório: ${sourceUrl} (branch: ${sourceBranch}). SHA atual: ${
      sha ? sha.slice(0, 12) : 'desconhecido'
    }.`,
  ]

  if (delivered?.syncedAt) {
    header.push(`- Sincronizado em: ${delivered.syncedAt}.`)
  }

  switch (config.syncState) {
    case 'offline-fallback':
      header.push(
        '- Estado: a última sincronização falhou; estes documentos são os da sincronização anterior e podem estar desatualizados.',
      )
      break
    case 'pending-source-change':
      header.push(
        `- Estado: a fonte configurada agora é ${formatSourceLabel(
          config.label,
          config.branch,
        )}, mas ainda não foi sincronizada; estes documentos vêm da fonte acima.`,
      )
      break
    default:
      break
  }

  const docLines = documents.map((doc) => {
    const summary = doc.summary?.trim() ? ` — ${doc.summary.trim()}` : ''
    return `- \`${doc.path}\` (${doc.title})${summary}`
  })

  return [
    header.join('\n'),
    '',
    'Índice de documentos disponíveis:',
    ...docLines,
  ].join('\n')
}

function describeGuidePointer(guide: SystemDesignGuide): string {
  if (guide.kind === 'local') return `pasta ${guide.path ?? guide.label}`
  return `${withoutCredentials(guide.repoUrl)} (branch: ${guide.branch})`
}

function guideSection(guide: SystemDesignGuide, documents: SystemDesignDocumentSummary[]): string {
  const lines = [
    `Guia: ${guide.label}`,
    `- Repositório: ${describeGuidePointer(guide)}. SHA atual: ${guide.sha ? guide.sha.slice(0, 12) : 'desconhecido'}.`,
  ]
  if (guide.syncState === 'offline-fallback') {
    lines.push('- Estado: a última sincronização falhou; estes documentos são os da sincronização anterior e podem estar desatualizados.')
  } else if (guide.syncState === 'never-synced') {
    lines.push('- Estado: ainda não sincronizado; consulte o repositório diretamente.')
  }
  if (documents.length) {
    lines.push('Índice de documentos disponíveis:')
    for (const doc of documents) {
      const summary = doc.summary?.trim() ? ` — ${doc.summary.trim()}` : ''
      lines.push(`- \`${doc.path}\` (${doc.title})${summary}`)
    }
  }
  return lines.join('\n')
}

function baseName(value: string): string {
  return value.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || value
}

/**
 * Bloco do orquestrador para a LISTA de guias da pessoa e para os projetos
 * ativos que trazem os próprios guias (eles valem dentro do projeto no lugar
 * dos gerais). Com um guia só e nenhum projeto com guias próprios, é o bloco
 * de sempre (`createSystemDesignPromptBlock`), byte a byte.
 */
export function createSystemDesignGuidesPromptBlock(params: {
  config: SystemDesignConfig
  documentsByGuide: Record<string, SystemDesignDocumentSummary[]>
  projects?: SystemDesignProject[]
}): string | null {
  const { config, documentsByGuide } = params
  if (!config.enabled) return null
  const guides = config.guides ?? []
  const projectOverrides = (params.projects ?? []).filter(
    (project) => project.authorized && project.layer === 'projeto' && project.guides.length > 0,
  )

  if (guides.length <= 1 && projectOverrides.length === 0) {
    const key = guides[0]?.key
    return createSystemDesignPromptBlock(config, key ? documentsByGuide[key] ?? [] : [])
  }

  const names = guides.map((guide) => guide.label).join(' + ')
  const sections = [
    [
      `Guias obrigatórios — ${names}:`,
      '- O usuário ativou estes guias. Você e seus sub-agentes DEVEM seguir os padrões deles.',
      '- Antes de gerar código, decidir arquitetura, escrever testes, organizar pastas ou tomar qualquer decisão técnica, consulte o(s) documento(s) relevantes de cada guia.',
      '- Em sub-agentes que tem acesso a Read/Glob/Grep, instrua-os a ler o(s) arquivo(s) relevante(s) do índice antes de produzir o resultado.',
    ].join('\n'),
    ...guides.map((guide) => guideSection(guide, documentsByGuide[guide.key] ?? [])),
  ]

  if (projectOverrides.length) {
    sections.push(
      [
        'Projetos com guias próprios (dentro deles, valem estes no lugar dos guias acima):',
        ...projectOverrides.map((project) => {
          const root = project.root ?? project.directory ?? ''
          const list = project.guides.map((guide) => `${guide.label} — ${describeGuidePointer(guide)}`).join('; ')
          return `- ${baseName(root)} (${root}): ${list}.`
        }),
      ].join('\n'),
    )
  }

  return sections.join('\n\n')
}

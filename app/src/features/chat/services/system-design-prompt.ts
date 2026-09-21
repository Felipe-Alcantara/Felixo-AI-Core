import type { SystemDesignConfig, SystemDesignDocumentSummary } from '../types'

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

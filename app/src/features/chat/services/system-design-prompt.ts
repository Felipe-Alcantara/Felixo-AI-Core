import type { SystemDesignConfig, SystemDesignDocumentSummary } from '../types'

// Builds the System Design guidance block injected into the orchestrator
// prompt when the user enabled "Use Felixo System Design as required guide".
// The block tells the orchestrator and its sub-agents to consult the cached
// markdown documents before making technical decisions, listing each
// available document with title and summary so the LLM can decide which
// ones to read via the Read tool.
export function createSystemDesignPromptBlock(
  config: SystemDesignConfig,
  documents: SystemDesignDocumentSummary[],
): string | null {
  if (!config.enabled || documents.length === 0) {
    return null
  }

  const header = [
    'Guia obrigatório — Felixo System Design:',
    '- O usuário ativou "Felixo System Design" como guia. Você e seus sub-agentes DEVEM seguir os padrões deste repositório.',
    '- Os documentos foram clonados e indexados localmente. Antes de gerar código, decidir arquitetura, escrever testes, organizar pastas ou tomar qualquer decisão técnica, consulte o(s) documento(s) relevantes abaixo.',
    '- Em sub-agentes que tem acesso a Read/Glob/Grep, instrua-os a ler o(s) arquivo(s) relevante(s) do índice antes de produzir o resultado.',
    `- Repositório: ${config.repoUrl} (branch: ${config.branch}). SHA atual: ${
      config.lastSha ? config.lastSha.slice(0, 12) : 'desconhecido'
    }.`,
  ]

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

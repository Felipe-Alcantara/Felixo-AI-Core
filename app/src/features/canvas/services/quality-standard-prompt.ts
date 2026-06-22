/**
 * Standing instruction typed into a terminal that opens WITH an agent
 * (Claude/Gemini/Codex), telling it to follow the project's quality standard
 * regardless of the task. Independent of file-block linking.
 */

export const DEFAULT_QUALITY_STANDARD_PROMPT = `Antes de qualquer tarefa: siga o PADRÃO DE QUALIDADE do Felixo System Design (padrões de design, backend/frontend, política de git e o template de contexto IA.md). Procure os guias na pasta "Padrão de qualidade - Felixo System Design/" dentro do repositório; se ela não existir, use a fonte: https://github.com/Felipe-Alcantara/Felixo-System-Design. Leia o que for relevante para a tarefa e mantenha esse padrão em tudo que produzir (código, commits e documentação). Se estiver atualizando um arquivo de contexto ou plano, nunca encerre a resposta com o trabalho ainda marcado como "em andamento": faça a última edição do arquivo e deixe o estado final claro (concluído, bloqueado, aguardando decisão ou interrompido com motivo).`

const CANVAS_CONTEXT_PROMPT = `Contexto do canvas: se este terminal estiver ligado a um arquivo .md do canvas, esse arquivo é a fonte da verdade do trabalho. Leia-o, siga-o e mantenha-o atualizado conforme o trabalho avançar.`

/** Appends a trailing newline so the line is submitted to the agent's REPL. */
export function buildQualityStandardMessage(template: string): string {
  return `${template}\n`
}

/**
 * Builds the full standing instruction for a canvas terminal, combining the
 * quality standard with the canvas-specific living-.md context.
 */
export function buildCanvasTerminalInitialText(
  qualityPrompt: string,
  existingPrompt?: string,
): string {
  const basePrompt = (existingPrompt?.trim() || buildQualityStandardMessage(qualityPrompt)).trimEnd()

  if (basePrompt.includes(CANVAS_CONTEXT_PROMPT)) {
    return `${basePrompt}\n`
  }

  return `${basePrompt}\n\n${CANVAS_CONTEXT_PROMPT}\n`
}

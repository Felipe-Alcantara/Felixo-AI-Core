/**
 * Standing instruction typed into a terminal that opens WITH an agent
 * (Claude/Gemini/Codex), telling it to follow the project's quality standard
 * regardless of the task. Independent of file-block linking.
 */

export const DEFAULT_QUALITY_STANDARD_PROMPT = `Antes de qualquer tarefa: siga o PADRÃO DE QUALIDADE do Felixo System Design (padrões de design, backend/frontend, política de git e o template de contexto IA.md). Procure os guias na pasta "Padrão de qualidade - Felixo System Design/" dentro do repositório; se ela não existir, use a fonte: https://github.com/Felipe-Alcantara/Felixo-System-Design. Leia o que for relevante para a tarefa e mantenha esse padrão em tudo que produzir (código, commits e documentação).`

/** Appends a trailing newline so the line is submitted to the agent's REPL. */
export function buildQualityStandardMessage(template: string): string {
  return `${template}\n`
}

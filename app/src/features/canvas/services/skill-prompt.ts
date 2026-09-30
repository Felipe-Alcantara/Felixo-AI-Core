import type { CanvasSkill } from '../types'
import { quotePromptPath } from './prompt-paths'

/**
 * A canvas skill is just a pointer to a file. Activating it doesn't paste the
 * file's content — it tells the agent where the skill lives so it reads and
 * applies it itself, the same lightweight "give the agent the path" approach
 * used for linked .md files.
 */
export function buildSkillActivationPrompt(skill: CanvasSkill): string {
  const lines = [
    `Use a skill "${skill.name}". O arquivo da skill está em: ${quotePromptPath(skill.path)}`,
    'Leia esse arquivo e siga as instruções dele para esta tarefa.',
  ]
  if (skill.description.trim()) {
    lines.splice(1, 0, `Resumo: ${skill.description.trim()}`)
  }
  // Sem Enter: a instrução fica na linha de entrada do agente para a pessoa
  // revisar, completar e enviar (decisão de 30/09/2026, como os prompts do catálogo).
  return lines.join('\n')
}

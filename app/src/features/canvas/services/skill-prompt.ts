import type { CanvasSkill } from '../types'

/**
 * A canvas skill is just a pointer to a file. Activating it doesn't paste the
 * file's content — it tells the agent where the skill lives so it reads and
 * applies it itself, the same lightweight "give the agent the path" approach
 * used for linked .md files.
 */
export function buildSkillActivationPrompt(skill: CanvasSkill): string {
  const lines = [
    `Use a skill "${skill.name}". O arquivo da skill está em: ${skill.path}`,
    'Leia esse arquivo e siga as instruções dele para esta tarefa.',
  ]
  if (skill.description.trim()) {
    lines.splice(1, 0, `Resumo: ${skill.description.trim()}`)
  }
  // Trailing newline submits the line to the agent's REPL.
  return `${lines.join('\n')}\n`
}

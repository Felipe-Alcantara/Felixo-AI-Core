import type { CanvasSkill } from '../types'

export type PresetForPrompt = {
  name: string
  contextPrompt: string
  skillIds: readonly string[]
}

/**
 * Trecho do contexto inicial de um agente nascido de um preset.
 *
 * Vai dentro do `initialText` do terminal, que o session-store já entrega por
 * ARQUIVO (a instrução digitada no PTY é só um ponteiro curto) — então um
 * contexto grande de preset nunca é digitado inteiro no terminal.
 *
 * As skills são só referência de consulta: nome, descrição e onde está o
 * arquivo, para o agente ler quando a tarefa combinar. Skill do preset que já
 * não existe no catálogo é ignorada (e contada), nunca inventada.
 */
export function buildPresetInstruction(
  preset: PresetForPrompt | undefined,
  availableSkills: readonly CanvasSkill[],
): string | undefined {
  if (!preset) return undefined

  const context = preset.contextPrompt.trim()
  const byId = new Map(availableSkills.map((skill) => [skill.id, skill]))
  const skills = preset.skillIds
    .map((id) => byId.get(id))
    .filter((skill): skill is CanvasSkill => Boolean(skill))

  if (!context && skills.length === 0) return undefined

  const sections = [`Preset deste agente: ${preset.name}`]
  if (context) sections.push(context)
  if (skills.length > 0) {
    sections.push(
      [
        'Skills deste agente (leia o arquivo só quando a tarefa combinar):',
        ...skills.map((skill) => {
          const description = skill.description.trim()
          return `- ${skill.name}${description ? `: ${description}` : ''} — ${skill.path}`
        }),
      ].join('\n'),
    )
  }
  return sections.join('\n\n')
}

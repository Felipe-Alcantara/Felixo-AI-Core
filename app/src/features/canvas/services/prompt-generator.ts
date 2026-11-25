import type { PromptGeneratorFields } from '../../shared/types/automations'

export type { PromptGeneratorFields }

/** Seções opcionais, na ordem em que entram no prompt. */
const OPTIONAL_SECTIONS = [
  ['contexto', 'Contexto'],
  ['formatoSaida', 'Formato de saída'],
  ['restricoes', 'Restrições'],
  ['criterioAceite', 'Critério de aceite'],
] as const

const WORKING_RULES = [
  'Se faltar um dado essencial, pergunte antes de supor.',
  'Diga o que você verificou e o que não conseguiu validar.',
]

const NAME_MAX_LENGTH = 60

export const EMPTY_GENERATOR_FIELDS: PromptGeneratorFields = { objetivo: '' }

/**
 * Monta o prompt por modelo fixo: uma seção por campo preenchido (campo vazio
 * não gera seção), sempre sem IA e sem rede. Sem objetivo, devolve texto vazio.
 */
export function montarPrompt(fields: PromptGeneratorFields): string {
  const objetivo = fields.objetivo.trim()
  if (!objetivo) return ''
  const sections = [`## Objetivo\n${objetivo}`]
  for (const [key, title] of OPTIONAL_SECTIONS) {
    const value = fields[key]?.trim()
    if (value) sections.push(`## ${title}\n${value}`)
  }
  sections.push(`## Como trabalhar\n${WORKING_RULES.map((rule) => `- ${rule}`).join('\n')}`)
  return sections.join('\n\n')
}

/** Nome do prompt salvo: a primeira linha do objetivo, curta. */
export function nomeSugerido(fields: PromptGeneratorFields): string {
  const firstLine = fields.objetivo.trim().split(/\r?\n/)[0]?.trim() ?? ''
  if (!firstLine) return 'Prompt gerado'
  return firstLine.length > NAME_MAX_LENGTH
    ? `${firstLine.slice(0, NAME_MAX_LENGTH - 1).trimEnd()}…`
    : firstLine
}

/** Só os campos preenchidos, para gravar junto do prompt; sem objetivo, nada. */
export function compactGeneratorFields(fields: PromptGeneratorFields): PromptGeneratorFields | undefined {
  const objetivo = fields.objetivo.trim()
  if (!objetivo) return undefined
  const compact: PromptGeneratorFields = { objetivo }
  for (const [key] of OPTIONAL_SECTIONS) {
    const value = fields[key]?.trim()
    if (value) compact[key] = value
  }
  return compact
}

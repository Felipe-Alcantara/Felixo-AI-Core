import { describe, expect, it } from 'vitest'
import { fillPathPlaceholder, quotePromptPath } from './prompt-paths'
import { buildSkillActivationPrompt } from './skill-prompt'
import { buildFileLinkPrompt, DEFAULT_FILE_BOOTSTRAP_PROMPT, DEFAULT_FILE_LINK_PROMPT } from './file-link-prompt'
import { buildSkillsManifestPrompt } from './skills-manifest'
import { buildAgentIdentityPrompt, buildCanvasTerminalInitialText, buildPlanningFileInstruction } from './quality-standard-prompt'
import { buildTerminalHandoffPrompt } from './terminal-handoff'

/** Caminhos que quebram quando vão sem aspas: espaço, acento, Windows, aspa. */
const PATHS = [
  '/home/ana/Meus projetos/scratch.md',
  '/Users/José Álvaro/Área de trabalho/skill.md',
  'C:\\Users\\Ana Maria\\AppData\\Roaming\\felixo\\skill.md',
  '/tmp/com "aspas"/arquivo.md',
]

describe('quotePromptPath', () => {
  it.each(PATHS)('cerca %s com aspas duplas e escapa aspas internas', (path) => {
    const quoted = quotePromptPath(path)
    expect(quoted.startsWith('"')).toBe(true)
    expect(quoted.endsWith('"')).toBe(true)
    expect(quoted.slice(1, -1)).toBe(path.replaceAll('"', '\\"'))
  })
})

describe('fillPathPlaceholder', () => {
  const path = '/home/ana/Meus projetos/scratch.md'

  it('põe aspas no marcador solto', () => {
    expect(fillPathPlaceholder('Caminho: {{path}}. Leia {{path}}.', path)).toBe(
      `Caminho: "${path}". Leia "${path}".`,
    )
  })

  it('não dobra aspas num modelo que já cercou o marcador', () => {
    expect(fillPathPlaceholder('Leia "{{path}}" agora', path)).toBe(`Leia "${path}" agora`)
    expect(fillPathPlaceholder("Leia '{{path}}' agora", path)).toBe(`Leia '${path}' agora`)
    expect(fillPathPlaceholder('Leia `{{path}}` agora', path)).toBe(`Leia \`${path}\` agora`)
  })

  it('escapa a aspa de um caminho dentro de "{{path}}"', () => {
    expect(fillPathPlaceholder('Leia "{{path}}"', '/tmp/a"b.md')).toBe('Leia "/tmp/a\\"b.md"')
  })
})

describe('todo caminho absoluto num texto para o agente vai entre aspas', () => {
  it.each(PATHS)('skill ativada: %s', (path) => {
    const text = buildSkillActivationPrompt({ id: 's', name: 'Revisar', description: '', path, source: 'user' })
    expect(text).toContain(quotePromptPath(path))
  })

  it.each(PATHS)('link e diagnóstico do scratchpad nos modelos padrão: %s', (path) => {
    for (const template of [DEFAULT_FILE_LINK_PROMPT, DEFAULT_FILE_BOOTSTRAP_PROMPT]) {
      const text = buildFileLinkPrompt(template, path, 'Agente')
      expect(text).toContain(quotePromptPath(path))
      // Nenhuma ocorrência do caminho fica sem as aspas em volta.
      expect(text.split(quotePromptPath(path)).join('')).not.toContain(path)
    }
  })

  it('manifesto de skills, arquivos ligados, identidade e passagem', () => {
    const path = PATHS[1]
    const manifest = buildSkillsManifestPrompt([{ id: 's', name: 'Skill', description: 'faz', path, source: 'builtin' }])
    expect(manifest).toContain(`Arquivo: ${quotePromptPath(path)}`)

    const initial = buildCanvasTerminalInitialText('padrão', undefined, [path], { agentName: 'A', cwd: PATHS[0] })
    expect(initial).toContain(`- ${quotePromptPath(path)}`)
    expect(initial).toContain(`diretório/projeto: ${quotePromptPath(PATHS[0])}`)

    expect(buildAgentIdentityPrompt({ agentName: 'A', cwd: PATHS[2] })).toContain(quotePromptPath(PATHS[2]))

    expect(buildPlanningFileInstruction(PATHS[0])).toContain(`Caminho: ${quotePromptPath(PATHS[0])}`)

    const handoff = buildTerminalHandoffPrompt({ targetLabel: 'B', transcript: 'x', cwd: PATHS[2] })
    expect(handoff).toContain(`Projeto/diretório de trabalho: ${quotePromptPath(PATHS[2])}.`)
    // Sem pasta, o texto diz isso sem aspas em volta de "não informado".
    expect(buildTerminalHandoffPrompt({ targetLabel: 'B', transcript: 'x' })).toContain('trabalho: não informado.')
  })
})

import { describe, expect, it } from 'vitest'
import type { NotionTask } from '../../shared/types/notion'
import { buildNotionTaskAgentOptions } from './notion-task-agent'

const task: NotionTask = {
  id: 'abc-123',
  title: 'Felixo AI Core/Notion — enviar uma task',
  completed: false,
  status: 'Entrada',
  dueDate: '',
  priority: 'Média',
  text: 'resumo',
  url: 'https://app.notion.com/p/abc123',
  archived: false,
  createdAt: null,
  updatedAt: null,
  fields: {},
}

describe('buildNotionTaskAgentOptions', () => {
  it('abre o agente do preset Tasks do Notion com a conexão e a task no contexto', () => {
    const options = buildNotionTaskAgentOptions({ task, body: 'corpo da task', connectionId: 'conn-1' })

    expect(options).toMatchObject({
      command: 'codex',
      providerId: 'codex',
      notionConnectionId: 'conn-1',
      preset: { id: 'native:tasks-notion', skillIds: expect.arrayContaining(['builtin-notion-operacoes']) },
    })
    const context = options?.preset?.contextPrompt ?? ''
    expect(context).toContain('notion-tasks conteudo abc-123')
    expect(context).toContain('https://app.notion.com/p/abc123')
    expect(context).toContain('corpo da task')
    expect(options?.label.startsWith('Task · ')).toBe(true)
  })

  it('nunca leva token: só o id da conexão atravessa', () => {
    const options = buildNotionTaskAgentOptions({ task, connectionId: 'conn-1' })
    expect(JSON.stringify(options)).not.toMatch(/ntn_|secret_|NOTION_TOKEN=/)
  })

  it('corta corpo gigante e aponta a CLI para o resto', () => {
    const options = buildNotionTaskAgentOptions({ task, body: 'x'.repeat(50_000), connectionId: 'c' })
    expect(options?.preset?.contextPrompt.length).toBeLessThan(25_000)
    expect(options?.preset?.contextPrompt).toContain('corpo cortado')
  })
})

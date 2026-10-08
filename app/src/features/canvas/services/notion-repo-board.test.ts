import { describe, expect, it } from 'vitest'
import type { NotionSchemaProperty, NotionTask } from '../../shared/types/notion'
import {
  DEFAULT_REPO_BOARD_SETTINGS,
  NO_GROUP_KEY,
  buildRepoCards,
  filterTasksByGroup,
  listGroupableProperties,
  listRelationProperties,
  listTagCandidates,
  progressPercent,
  readRepoBoardSettings,
  relationTarget,
  resolveDetailsVia,
  resolveGroupBy,
  resolveTagProperties,
  saveRepoBoardSettings,
  type RepoBoardDetails,
} from './notion-repo-board'

function task(id: string, fields: Record<string, unknown>, completed = false): NotionTask {
  return {
    id,
    title: `Tarefa ${id}`,
    completed,
    status: completed ? 'Concluída' : 'Em breve',
    dueDate: '',
    priority: '',
    text: '',
    url: null,
    archived: false,
    createdAt: null,
    updatedAt: null,
    fields,
  }
}

function row(id: string, title: string, fields: Record<string, unknown> = {}): NotionTask {
  return { ...task(id, fields), title }
}

const TASK_SCHEMA: Record<string, NotionSchemaProperty> = {
  Tarefa: { id: 'title', name: 'Tarefa', type: 'title' },
  Etapa: { id: 'e', name: 'Etapa', type: 'status' },
  Repositório: { id: 'r', name: 'Repositório', type: 'select' },
  Tipo: { id: 't', name: 'Tipo', type: 'multi_select' },
  Projeto: { id: 'p', name: 'Projeto', type: 'relation', relation: { data_source_id: 'ds-github', database_id: 'db-github' } },
  'Áreas da vida': { id: 'a', name: 'Áreas da vida', type: 'relation', relation: { data_source_id: 'ds-areas' } },
  Prazo: { id: 'd', name: 'Prazo', type: 'date' },
}

const DETAILS: RepoBoardDetails = {
  schema: {
    Nome: { id: 'title', name: 'Nome', type: 'title' },
    URL: { id: 'u', name: 'URL', type: 'url' },
    Homepage: { id: 'h', name: 'Homepage', type: 'url' },
    Linguagem: { id: 'l', name: 'Linguagem', type: 'select' },
    Conta: { id: 'c', name: 'Conta', type: 'select' },
    Arquivado: { id: 'ar', name: 'Arquivado', type: 'checkbox' },
    Fork: { id: 'f', name: 'Fork', type: 'checkbox' },
  },
  rows: [
    row('gh-core', 'Felipe-Alcantara/Felixo-AI-Core', { URL: 'https://github.com/Felipe-Alcantara/Felixo-AI-Core', Linguagem: 'TypeScript', Conta: 'Felipe-Alcantara', Arquivado: false, Fork: false }),
    row('gh-notion-fork', 'outra-conta/Automa-es-do-Notion', { URL: 'https://github.com/outra-conta/Automa-es-do-Notion', Linguagem: '', Fork: true }),
    row('gh-notion', 'Felipe-Alcantara/Automa-es-do-Notion', { URL: 'https://github.com/Felipe-Alcantara/Automa-es-do-Notion', Linguagem: 'Python', Fork: false }),
    row('gh-velho', 'Felipe-Alcantara/Projeto-Velho', { URL: 'https://github.com/Felipe-Alcantara/Projeto-Velho', Linguagem: 'Python', Arquivado: true }),
    row('gh-sem-tarefa', 'Felipe-Alcantara/Sem-Tarefa', { URL: 'https://github.com/Felipe-Alcantara/Sem-Tarefa', Linguagem: 'Go' }),
    row('gh-fork-vazio', 'outra-conta/Fork-Vazio', { URL: 'https://github.com/outra-conta/Fork-Vazio', Fork: true }),
    row('gh-link', 'Nome que não bate', { URL: 'https://github.com/Felipe-Alcantara/Openia/', Linguagem: 'Python' }),
  ],
}

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial))
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    values,
  }
}

const baseInput = {
  schema: TASK_SCHEMA,
  groupBy: 'Repositório',
  detailsVia: 'Projeto',
  details: DETAILS,
  tagProperties: ['Linguagem'],
  showEmpty: false,
  search: '',
}

describe('buildRepoCards', () => {
  it('soma total, abertas, concluídas e o percentual por valor da coluna', () => {
    const tasks = [
      task('1', { Repositório: 'Felixo-AI-Core' }, true),
      task('2', { Repositório: 'Felixo-AI-Core' }),
      task('3', { Repositório: 'Felixo-AI-Core' }, true),
      task('4', { Repositório: 'Openia' }),
    ]
    const cards = buildRepoCards({ ...baseInput, tasks })
    const core = cards.find((card) => card.key === 'Felixo-AI-Core')
    expect(core).toMatchObject({ label: 'Felixo-AI-Core', total: 3, open: 1, done: 2, percent: 67, clickable: true })
    expect(cards.find((card) => card.key === 'Openia')).toMatchObject({ total: 1, open: 1, done: 0, percent: 0 })
  })

  it('ordena por abertas, depois total, depois nome, e deixa "Sem <coluna>" no fim', () => {
    const tasks = [
      task('1', { Repositório: 'Beta' }),
      task('2', { Repositório: 'Alfa' }),
      task('3', { Repositório: 'Gama' }),
      task('4', { Repositório: 'Gama' }),
      task('5', { Repositório: 'Alfa' }, true),
      task('6', {}),
      task('7', { Repositório: '' }),
    ]
    const cards = buildRepoCards({ ...baseInput, details: null, tasks })
    expect(cards.map((card) => card.key)).toEqual(['Gama', 'Alfa', 'Beta', NO_GROUP_KEY])
    expect(cards.at(-1)).toMatchObject({ label: 'Sem Repositório', total: 2, open: 2, clickable: true })
  })

  it('conta a tarefa em cada valor de um multi_select', () => {
    const tasks = [task('1', { Tipo: ['Feature', 'Bug'] }), task('2', { Tipo: ['Bug'] }, true)]
    const cards = buildRepoCards({ ...baseInput, groupBy: 'Tipo', details: null, tasks })
    expect(cards.map((card) => [card.key, card.total, card.done])).toEqual([
      ['Bug', 2, 1],
      ['Feature', 1, 0],
    ])
  })

  it('agrupa por ligação usando o título da página ligada como nome', () => {
    const tasks = [
      task('1', { Projeto: ['gh-core'] }),
      task('2', { Projeto: ['gh-core'] }, true),
      task('3', { Projeto: ['pagina-fora-dos-detalhes'] }),
    ]
    const cards = buildRepoCards({ ...baseInput, groupBy: 'Projeto', tasks })
    expect(cards[0]).toMatchObject({ key: 'gh-core', label: 'Felipe-Alcantara/Felixo-AI-Core', total: 2, percent: 50, tags: ['TypeScript'] })
    expect(cards[0].link).toBe('https://github.com/Felipe-Alcantara/Felixo-AI-Core')
    expect(cards[1]).toMatchObject({ key: 'pagina-fora-dos-detalhes', label: 'Página ligada paginafo', link: null })
  })

  it('casa o valor com o nome depois de "dono/" e com o fim do link', () => {
    const tasks = [task('1', { Repositório: 'felixo-ai-core' }), task('2', { Repositório: 'Openia' })]
    const cards = buildRepoCards({ ...baseInput, tasks })
    expect(cards.find((card) => card.key === 'felixo-ai-core')).toMatchObject({ link: 'https://github.com/Felipe-Alcantara/Felixo-AI-Core', tags: ['TypeScript'] })
    expect(cards.find((card) => card.key === 'Openia')).toMatchObject({ link: 'https://github.com/Felipe-Alcantara/Openia/', tags: ['Python'] })
  })

  it('com o mesmo nome em duas linhas, prefere a mais ligada pelas tarefas e depois a que não é fork', () => {
    const semLigacao = buildRepoCards({ ...baseInput, tasks: [task('1', { Repositório: 'Automa-es-do-Notion' })] })
    expect(semLigacao[0].link).toBe('https://github.com/Felipe-Alcantara/Automa-es-do-Notion')

    const ligadaAoFork = buildRepoCards({
      ...baseInput,
      tasks: [task('1', { Repositório: 'Automa-es-do-Notion', Projeto: ['gh-notion-fork'] })],
    })
    expect(ligadaAoFork[0].link).toBe('https://github.com/outra-conta/Automa-es-do-Notion')
  })

  it('marca o repositório arquivado e escreve a etiqueta', () => {
    const cards = buildRepoCards({ ...baseInput, tasks: [task('1', { Repositório: 'Projeto-Velho' })] })
    expect(cards[0]).toMatchObject({ archived: true, tags: ['Python', 'Arquivado'] })
  })

  it('só mostra repositórios sem tarefas quando pedido, sem fork e sem arquivado', () => {
    const tasks = [task('1', { Repositório: 'Felixo-AI-Core' })]
    expect(buildRepoCards({ ...baseInput, tasks }).map((card) => card.label)).toEqual(['Felixo-AI-Core'])

    const cards = buildRepoCards({ ...baseInput, tasks, showEmpty: true })
    expect(cards.map((card) => card.label)).toEqual(['Felixo-AI-Core', 'Automa-es-do-Notion', 'Nome que não bate', 'Sem-Tarefa'])
    expect(cards.at(-1)).toMatchObject({ total: 0, percent: 0, clickable: false, tags: ['Go'] })
  })

  it('filtra os cartões pelo nome, sem acento e sem diferença de maiúscula', () => {
    const tasks = [task('1', { Repositório: 'Ação-Rápida' }), task('2', { Repositório: 'Felixo-AI-Core' })]
    expect(buildRepoCards({ ...baseInput, tasks, search: 'acao' }).map((card) => card.key)).toEqual(['Ação-Rápida'])
  })

  it('sem coluna de agrupamento devolve lista vazia', () => {
    expect(buildRepoCards({ ...baseInput, groupBy: '', tasks: [task('1', { Repositório: 'X' })] })).toEqual([])
  })
})

describe('progressPercent', () => {
  it('arredonda meio para cima nos dois casos medidos no app real', () => {
    // 253/440 é 57,5% exato, mas (253 / 440) * 100 dá 57,4999… em ponto
    // flutuante e caía para 57; 1/8 é 12,5% e já subia para 13.
    expect(progressPercent(253, 440)).toBe(58)
    expect(progressPercent(1, 8)).toBe(13)
  })

  it('só mostra 100% com tudo feito e só 0% com nada feito', () => {
    expect(progressPercent(439, 440)).toBe(99)
    expect(progressPercent(1, 300)).toBe(1)
    expect(progressPercent(5, 5)).toBe(100)
    expect(progressPercent(0, 5)).toBe(0)
  })

  it('sem tarefas é 0%', () => {
    expect(progressPercent(0, 0)).toBe(0)
  })

  it('o cartão usa a mesma conta', () => {
    const tasks = Array.from({ length: 440 }, (_, index) => task(`t${index}`, { Repositório: 'Felixo-AI-Core' }, index < 253))
    expect(buildRepoCards({ ...baseInput, tasks })[0]).toMatchObject({ key: 'Felixo-AI-Core', total: 440, open: 187, percent: 58 })
  })
})

describe('colunas e automático', () => {
  it('lista só colunas agrupáveis e só ligações', () => {
    expect(listGroupableProperties(TASK_SCHEMA)).toEqual(['Etapa', 'Repositório', 'Tipo', 'Projeto', 'Áreas da vida'])
    expect(listRelationProperties(TASK_SCHEMA)).toEqual(['Projeto', 'Áreas da vida'])
  })

  it('no automático agrupa por "Repositório" e lê detalhes pela ligação "Projeto"', () => {
    const groupBy = resolveGroupBy(TASK_SCHEMA, DEFAULT_REPO_BOARD_SETTINGS)
    expect(groupBy).toBe('Repositório')
    expect(resolveDetailsVia(TASK_SCHEMA, DEFAULT_REPO_BOARD_SETTINGS, groupBy)).toBe('Projeto')
  })

  it('agrupando por ligação, os detalhes vêm da própria ligação', () => {
    const settings = { ...DEFAULT_REPO_BOARD_SETTINGS, groupBy: 'Áreas da vida' }
    expect(resolveDetailsVia(TASK_SCHEMA, settings, 'Áreas da vida')).toBe('Áreas da vida')
  })

  it('sem coluna parecida, cai em "Projeto" e depois em nada', () => {
    const semRepositorio = Object.fromEntries(Object.entries(TASK_SCHEMA).filter(([name]) => name !== 'Repositório'))
    expect(resolveGroupBy(semRepositorio, DEFAULT_REPO_BOARD_SETTINGS)).toBe('Projeto')
    expect(resolveGroupBy({ Tarefa: TASK_SCHEMA.Tarefa }, DEFAULT_REPO_BOARD_SETTINGS)).toBe('')
  })

  it('preferência apontando para coluna que não existe mais volta ao automático', () => {
    const settings = { ...DEFAULT_REPO_BOARD_SETTINGS, groupBy: 'Coluna renomeada', detailsVia: 'Ligação apagada' }
    expect(resolveGroupBy(TASK_SCHEMA, settings)).toBe('Repositório')
    expect(resolveDetailsVia(TASK_SCHEMA, settings, 'Repositório')).toBe('Projeto')
  })

  it('"" em detailsVia desliga os detalhes', () => {
    expect(resolveDetailsVia(TASK_SCHEMA, { ...DEFAULT_REPO_BOARD_SETTINGS, detailsVia: '' }, 'Repositório')).toBe('')
  })

  it('lê o alvo da ligação no schema', () => {
    expect(relationTarget(TASK_SCHEMA, 'Projeto')).toEqual({ dataSourceId: 'ds-github', databaseId: 'db-github' })
    expect(relationTarget(TASK_SCHEMA, 'Áreas da vida')).toEqual({ dataSourceId: 'ds-areas', databaseId: null })
    expect(relationTarget(TASK_SCHEMA, 'Repositório')).toBeNull()
  })

  it('etiquetas automáticas são as colunas de linguagem/stack/status da database de detalhes', () => {
    expect(listTagCandidates(DETAILS.schema)).toEqual(['Linguagem', 'Conta'])
    expect(resolveTagProperties(DETAILS.schema, DEFAULT_REPO_BOARD_SETTINGS)).toEqual(['Linguagem'])
    expect(resolveTagProperties(DETAILS.schema, { ...DEFAULT_REPO_BOARD_SETTINGS, tagProperties: ['Conta', 'Sumiu'] })).toEqual(['Conta'])
  })
})

describe('filterTasksByGroup', () => {
  const tasks = [
    task('1', { Repositório: 'Felixo-AI-Core', Tipo: ['Bug'] }),
    task('2', { Repositório: 'Openia', Tipo: ['Bug', 'Feature'] }),
    task('3', {}),
  ]

  it('mantém só as tarefas do grupo clicado', () => {
    expect(filterTasksByGroup(tasks, TASK_SCHEMA, { property: 'Repositório', key: 'Openia', label: 'Openia' }).map((item) => item.id)).toEqual(['2'])
    expect(filterTasksByGroup(tasks, TASK_SCHEMA, { property: 'Tipo', key: 'Bug', label: 'Bug' }).map((item) => item.id)).toEqual(['1', '2'])
  })

  it('o grupo vazio traz as tarefas sem a coluna preenchida', () => {
    expect(filterTasksByGroup(tasks, TASK_SCHEMA, { property: 'Repositório', key: NO_GROUP_KEY, label: 'Sem Repositório' }).map((item) => item.id)).toEqual(['3'])
  })

  it('sem filtro devolve a lista inteira', () => {
    expect(filterTasksByGroup(tasks, TASK_SCHEMA, null)).toBe(tasks)
  })
})

describe('preferências do painel', () => {
  it('guarda e relê por conexão e database', () => {
    const storage = memoryStorage()
    saveRepoBoardSettings('conexao', 'database', { ...DEFAULT_REPO_BOARD_SETTINGS, groupBy: 'Tipo', open: true }, storage)
    expect([...storage.values.keys()]).toEqual(['felixo:notion-repo-board:conexao:database'])
    expect(readRepoBoardSettings('conexao', 'database', storage)).toEqual({ ...DEFAULT_REPO_BOARD_SETTINGS, groupBy: 'Tipo', open: true })
  })

  it('JSON inválido ou campo com tipo errado vira o padrão daquele campo', () => {
    const key = 'felixo:notion-repo-board:c:d'
    expect(readRepoBoardSettings('c', 'd', memoryStorage({ [key]: '{quebrado' }))).toEqual(DEFAULT_REPO_BOARD_SETTINGS)
    expect(readRepoBoardSettings('c', 'd', memoryStorage({ [key]: JSON.stringify({ groupBy: 3, tagProperties: ['A', 2], showEmpty: 'sim', open: true }) }))).toEqual({
      ...DEFAULT_REPO_BOARD_SETTINGS,
      open: true,
    })
  })

  it('sem storage ou sem alvo não quebra', () => {
    expect(readRepoBoardSettings('', 'd', memoryStorage())).toEqual(DEFAULT_REPO_BOARD_SETTINGS)
    expect(() => saveRepoBoardSettings('c', 'd', DEFAULT_REPO_BOARD_SETTINGS, undefined)).not.toThrow()
  })
})

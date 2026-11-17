'use strict'

/**
 * Dados falsos da sessão G do smoke (painel "Tarefas Notion"): uma conexão,
 * uma database e seis tarefas, sem rede e sem token. A ponte do preload
 * (`window.felixo.notion`) é congelada pelo `contextBridge`, então o que se
 * troca são os handlers IPC do processo principal, registrados em
 * `mainWindow.webContents.ipc` por `devtools:main-eval` (o mesmo caminho do
 * `felixo devtools main`).
 */

const AGORA = '2026-10-22T16:30:00.000Z'
const CONEXAO_ID = 'c1'
const DATABASE_ID = 'ds1'
const REPO_A = 'Felixo-AI-Core'
const REPO_B = 'notion-tasks-cli'

const SCHEMA = {
  Nome: { id: 'title', name: 'Nome', type: 'title' },
  Status: {
    id: 's',
    name: 'Status',
    type: 'status',
    status: { options: [{ name: 'Não iniciada' }, { name: 'Em andamento' }, { name: 'Concluída' }] },
  },
  'Repositório': {
    id: 'r',
    name: 'Repositório',
    type: 'select',
    select: { options: [{ name: REPO_A }, { name: REPO_B }] },
  },
  'Áreas': {
    id: 'a',
    name: 'Áreas',
    type: 'multi_select',
    multi_select: { options: [{ name: 'Trabalho' }, { name: 'Pessoal' }] },
  },
}

/** Três sem repositório (uma delas concluída, para travar o "mostrar concluídas"). */
const TAREFAS = [
  ['t1', 'Hotfix do filtro de repositório', 'Em andamento', false, REPO_A, ['Trabalho']],
  ['t2', 'Atualizar a CLI de tarefas', 'Não iniciada', false, REPO_B, ['Trabalho']],
  ['t3', 'Revisar contrato do estúdio', 'Não iniciada', false, null, ['Pessoal']],
  ['t4', 'Comprar passagem do evento', 'Não iniciada', false, null, []],
  ['t5', 'Pagar boleto antigo', 'Concluída', true, null, ['Pessoal']],
  ['t6', 'Entregar release 0.1.470', 'Concluída', true, REPO_A, ['Trabalho']],
].map(([id, title, status, completed, repo, areas]) => ({
  id,
  title,
  completed,
  status,
  dueDate: '',
  priority: '',
  text: '',
  archived: false,
  url: `https://app.notion.com/p/Tarefa-de-teste-${id}-0123456789abcdef0123456789abcdef`,
  createdAt: AGORA,
  updatedAt: AGORA,
  fields: {
    Nome: title,
    // Os valores que o `notion-client.cjs` entrega: texto para select/status, lista para multi_select.
    Status: status,
    'Repositório': repo ?? '',
    'Áreas': areas,
  },
}))

/** Títulos das tarefas que satisfazem `filtro`, na ordem da fixture. */
const titulos = (filtro) => TAREFAS.filter(filtro).map((tarefa) => tarefa.title)

/**
 * A expressão que o processo principal avalia: registra os quatro canais que o
 * painel chama ao abrir (mais o do conteúdo da tarefa). Fica abaixo do limite
 * de 20.000 caracteres do `devtools:main-eval`.
 */
function scriptDosHandlers({ relacao = false } = {}) {
  // Com `relacao`, a database ganha uma ligação ("Projeto") para o Painel agrupar por ela.
  const schema = relacao
    ? { ...SCHEMA, Projeto: { id: 'p', name: 'Projeto', type: 'relation', relation: { data_source_id: 'ds-projetos' } } }
    : SCHEMA
  const dados = JSON.stringify({ tasks: TAREFAS, schema })
  return `(() => {
  const ipc = mainWindow.webContents.ipc
  const { tasks, schema } = ${dados}
  const agora = '${AGORA}'
  // Registrar de novo (a sessão remonta o canvas) exige soltar o canal antes.
  for (const canal of ['notion:connections:list', 'notion:databases:list', 'notion:tasks:cached', 'notion:tasks:content', 'notion:tasks:list']) ipc.removeHandler(canal)
  ipc.handle('notion:connections:list', async () => ({
    ok: true,
    connections: [{ id: '${CONEXAO_ID}', label: 'Teste isolado', profileId: 'p1', createdAt: agora, updatedAt: agora, lastTestedAt: null, hasToken: true }],
    secureStorage: { ok: true, reason: null },
  }))
  ipc.handle('notion:databases:list', async () => ({
    ok: true,
    databases: [{ id: '${DATABASE_ID}', name: 'Tarefas do smoke', databaseId: 'db1', url: null, lastEditedAt: agora }],
  }))
  ipc.handle('notion:tasks:cached', async () => ({ ok: true, hasCache: false, tasks: [] }))
  ipc.handle('notion:tasks:content', async (_event, input) => ({ ok: true, pageId: input && input.pageId, content: '' }))
  ipc.handle('notion:tasks:list', async () => ({
    ok: true, tasks, schema, dataSourceId: '${DATABASE_ID}', fetchedAt: agora, hasMore: false, syncStatus: 'success',
  }))
  return 'handlers falsos: ' + tasks.length + ' tarefas'
})()`
}

module.exports = { CONEXAO_ID, DATABASE_ID, REPO_A, REPO_B, SCHEMA, TAREFAS, scriptDosHandlers, titulos }

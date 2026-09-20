const test = require('node:test')
const assert = require('node:assert/strict')

const {
  buildPageProperties,
  createNotionClient,
  normalizePage,
  NotionClientError,
} = require('./notion-client.cjs')

test('cliente Notion usa a versão atual, pagina fontes e normaliza tarefas', async () => {
  const requests = []
  const pages = [
    {
      object: 'list',
      has_more: true,
      next_cursor: 'cursor-2',
      results: [{
        object: 'data_source',
        id: 'source-1',
        title: [{ plain_text: 'Tasks' }],
        parent: { database_id: 'database-1' },
      }],
    },
    {
      object: 'list',
      has_more: false,
      next_cursor: null,
      results: [{
        object: 'data_source',
        id: 'source-2',
        title: [{ plain_text: 'Roadmap' }],
      }],
    },
  ]

  const client = createNotionClient({
    token: 'secret-test-token',
    fetchImpl: async (url, options) => {
      requests.push({ url, options })
      return fakeResponse(200, pages.shift())
    },
  })

  const sources = await client.listAccessibleDataSources()

  assert.deepEqual(sources.map((source) => source.name), ['Tasks', 'Roadmap'])
  assert.equal(requests.length, 2)
  assert.match(requests[0].url, /\/v1\/search$/)
  assert.equal(requests[0].options.headers.Authorization, 'Bearer secret-test-token')
  assert.equal(requests[0].options.headers['Notion-Version'], '2026-03-11')
  assert.equal(JSON.parse(requests[1].options.body).start_cursor, 'cursor-2')

  const schema = {
    Name: { id: 'name', name: 'Name', type: 'title' },
    Done: {
      id: 'done',
      name: 'Done',
      type: 'checkbox',
      checkbox: {},
    },
    Status: {
      id: 'status',
      name: 'Status',
      type: 'status',
      status: { options: [{ name: 'To Do' }, { name: 'Done' }] },
    },
  }
  const task = normalizePage(
    {
      id: 'page-1',
      properties: {
        Name: { id: 'name', type: 'title', title: [{ plain_text: 'Ship it' }] },
        Done: { id: 'done', type: 'checkbox', checkbox: false },
        Status: { id: 'status', type: 'status', status: { name: 'To Do' } },
      },
    },
    schema,
  )

  assert.equal(task.title, 'Ship it')
  assert.equal(task.completed, false)
  assert.equal(task.status, 'To Do')
})

test('cliente lê o conteúdo da página e dos blocos aninhados', async () => {
  const requests = []
  const responses = [
    {
      object: 'list',
      has_more: false,
      results: [
        {
          id: 'heading-1',
          type: 'heading_2',
          heading_2: { rich_text: [{ plain_text: 'Contexto' }] },
        },
        {
          id: 'list-1',
          type: 'bulleted_list_item',
          has_children: true,
          bulleted_list_item: { rich_text: [{ plain_text: 'Item pai' }] },
        },
        {
          id: 'todo-1',
          type: 'to_do',
          to_do: { checked: true, rich_text: [{ plain_text: 'Revisar' }] },
        },
        {
          id: 'quote-1',
          type: 'quote',
          quote: { rich_text: [{ plain_text: 'Uma observação' }] },
        },
      ],
    },
    {
      object: 'list',
      has_more: false,
      results: [
        {
          id: 'child-1',
          type: 'bulleted_list_item',
          bulleted_list_item: { rich_text: [{ plain_text: 'Item filho' }] },
        },
      ],
    },
  ]

  const client = createNotionClient({
    token: 'secret-test-token',
    fetchImpl: async (url, options) => {
      requests.push({ url, options })
      return fakeResponse(200, responses.shift())
    },
  })

  const content = await client.getPageContent('page-1')

  assert.equal(content, '## Contexto\n- Item pai\n  - Item filho\n- [x] Revisar\n> Uma observação')
  assert.equal(requests.length, 2)
  assert.match(requests[0].url, /\/v1\/blocks\/page-1\/children\?page_size=100$/)
  assert.match(requests[1].url, /\/v1\/blocks\/list-1\/children\?page_size=100$/)
  assert.equal(requests[0].options.headers['Notion-Version'], '2026-03-11')
})

test('cliente constrói propriedades genéricas para criar e atualizar tarefas', () => {
  const schema = {
    Name: { id: 'name', name: 'Name', type: 'title' },
    Done: { id: 'done', name: 'Done', type: 'checkbox', checkbox: {} },
    Status: {
      id: 'status',
      name: 'Status',
      type: 'status',
      status: { options: [{ name: 'Todo' }, { name: 'Done' }] },
    },
    Description: { id: 'description', name: 'Description', type: 'rich_text', rich_text: {} },
    Due: { id: 'due', name: 'Due', type: 'date', date: {} },
  }

  const properties = buildPageProperties(schema, {
    title: 'Entrega',
    completed: true,
    text: 'Descrição',
    dueDate: '2026-09-08',
  }, { create: true })

  assert.deepEqual(properties.Name.title[0].text, { content: 'Entrega' })
  assert.deepEqual(properties.Done, { checkbox: true })
  assert.deepEqual(properties.Status, { status: { name: 'Done' } })
  assert.deepEqual(properties.Description.rich_text[0].text, { content: 'Descrição' })
  assert.deepEqual(properties.Due, { date: { start: '2026-09-08' } })
})

test('queryTasks segue next_cursor por várias páginas e agrega tudo numa lista só', async () => {
  const requestBodies = []
  const responses = [
    {
      object: 'list',
      has_more: true,
      next_cursor: 'cursor-pagina-2',
      results: [{ object: 'page', id: 'page-1', url: null, properties: {} }],
    },
    {
      object: 'list',
      has_more: true,
      next_cursor: 'cursor-pagina-3',
      results: [{ object: 'page', id: 'page-2', url: null, properties: {} }],
    },
    {
      object: 'list',
      has_more: false,
      next_cursor: null,
      results: [{ object: 'page', id: 'page-3', url: null, properties: {} }],
    },
  ]
  const client = createNotionClient({
    token: 'secret-test-token',
    fetchImpl: async (_url, options) => {
      requestBodies.push(JSON.parse(options.body))
      return fakeResponse(200, responses.shift())
    },
  })

  const result = await client.queryTasks({ dataSourceId: 'source-1', schema: {} })

  assert.deepEqual(result.tasks.map((task) => task.id), ['page-1', 'page-2', 'page-3'])
  // nextCursor some (null) porque a paginação terminou sozinha — has_more
  // virou false antes do teto de páginas, não porque foi truncada.
  assert.equal(result.nextCursor, null)
  assert.equal(requestBodies.length, 3)
  assert.equal(requestBodies[0].start_cursor, undefined)
  assert.equal(requestBodies[1].start_cursor, 'cursor-pagina-2')
  assert.equal(requestBodies[2].start_cursor, 'cursor-pagina-3')
})

test('queryTasks para no teto de páginas e devolve o cursor restante em vez de rodar pra sempre', async () => {
  let requestCount = 0
  const client = createNotionClient({
    token: 'secret-test-token',
    fetchImpl: async () => {
      requestCount += 1
      return fakeResponse(200, {
        object: 'list',
        has_more: true,
        next_cursor: `cursor-${requestCount}`,
        results: [{ object: 'page', id: `page-${requestCount}`, url: null, properties: {} }],
      })
    },
  })

  const result = await client.queryTasks({ dataSourceId: 'source-1', schema: {}, maxPages: 2 })

  assert.equal(requestCount, 2)
  assert.equal(result.tasks.length, 2)
  assert.equal(result.nextCursor, 'cursor-2')
})

test('cliente lê o estado atual de uma página com GET, sem alterar nada', async () => {
  const requests = []
  const schema = { Name: { id: 'name', name: 'Name', type: 'title' } }
  const client = createNotionClient({
    token: 'secret-test-token',
    fetchImpl: async (url, options) => {
      requests.push({ url, options })
      return fakeResponse(200, {
        object: 'page',
        id: 'page-1',
        url: 'https://notion.so/page-1',
        last_edited_time: '2026-09-10T10:00:00.000Z',
        properties: { Name: { title: [{ plain_text: 'Título remoto' }] } },
      })
    },
  })

  const task = await client.getTask({ pageId: 'page-1', schema })

  assert.equal(requests.length, 1)
  assert.match(requests[0].url, /\/v1\/pages\/page-1$/)
  assert.equal(requests[0].options.method || 'GET', 'GET')
  assert.equal(task.updatedAt, '2026-09-10T10:00:00.000Z')
  assert.equal(task.title, 'Título remoto')
})

test('nenhum status de erro do Notion (nem o payload da resposta) vaza o token na mensagem', async () => {
  const TOKEN = 'secret_jamais_deveria_aparecer'
  const cenarios = [
    { status: 401, payload: { object: 'error', code: 'unauthorized', message: `token ${TOKEN} inválido` } },
    { status: 403, payload: { object: 'error', code: 'restricted_resource', message: `Bearer ${TOKEN}` } },
    { status: 404, payload: { object: 'error', code: 'object_not_found', message: TOKEN } },
    { status: 409, payload: { object: 'error', code: 'conflict_error', message: TOKEN } },
    { status: 429, payload: { object: 'error', code: 'rate_limited', message: TOKEN } },
    { status: 500, payload: { object: 'error', code: 'internal_server_error', message: TOKEN } },
    { status: 400, payload: { object: 'error', code: 'validation_error', message: TOKEN } },
    { status: 400, payload: { object: 'error', code: 'algo_desconhecido', message: TOKEN } },
  ]

  for (const cenario of cenarios) {
    const client = createNotionClient({
      token: TOKEN,
      maxRetries: 0,
      fetchImpl: async () => fakeResponse(cenario.status, cenario.payload),
    })

    await assert.rejects(
      () => client.getCurrentUser(),
      (error) => {
        assert.ok(error instanceof NotionClientError, `status ${cenario.status} deveria lançar NotionClientError`)
        assert.doesNotMatch(
          error.message,
          new RegExp(TOKEN),
          `status ${cenario.status}: a mensagem de erro não pode conter o token`,
        )
        return true
      },
    )
  }
})

test('falha de rede (fetch lança) e timeout (AbortError) também nunca vazam o token', async () => {
  const TOKEN = 'secret_de_rede_jamais_deveria_aparecer'

  const clienteQueFalha = createNotionClient({
    token: TOKEN,
    maxRetries: 0,
    fetchImpl: async () => {
      throw new Error(`falha de socket carregando Bearer ${TOKEN}`)
    },
  })
  await assert.rejects(
    () => clienteQueFalha.getCurrentUser(),
    (error) => {
      assert.doesNotMatch(error.message, new RegExp(TOKEN))
      return true
    },
  )

  const clienteQueExpira = createNotionClient({
    token: TOKEN,
    maxRetries: 0,
    fetchImpl: async () => {
      const erro = new Error(`abortado: Authorization Bearer ${TOKEN}`)
      erro.name = 'AbortError'
      throw erro
    },
  })
  await assert.rejects(
    () => clienteQueExpira.getCurrentUser(),
    (error) => {
      assert.doesNotMatch(error.message, new RegExp(TOKEN))
      assert.equal(error.code, 'timeout')
      return true
    },
  )
})

test('cliente redige falhas e repete respostas transitórias', async () => {
  const requests = []
  let call = 0
  const client = createNotionClient({
    token: 'secret-never-in-error',
    maxRetries: 1,
    sleep: async () => {},
    fetchImpl: async (url, options) => {
      requests.push({ url, options })
      call += 1
      return call === 1
        ? fakeResponse(429, { object: 'error', code: 'rate_limited', message: 'wait' }, { 'retry-after': '0' })
        : fakeResponse(401, { object: 'error', code: 'unauthorized', message: 'token details' })
    },
  })

  await assert.rejects(
    () => client.getCurrentUser(),
    (error) => {
      assert.ok(error instanceof NotionClientError)
      assert.equal(error.code, 'unauthorized')
      assert.equal(error.message, 'O token do Notion foi recusado. Revise a conexão.')
      assert.doesNotMatch(error.message, /secret-never-in-error|token details/)
      return true
    },
  )
  assert.equal(requests.length, 2)
})

function fakeResponse(status, payload, headerValues = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => headerValues[name] ?? null },
    text: async () => JSON.stringify(payload),
  }
}

test('normalizePage lê people, files, relation, unique_id, created_by e rollup como valores legíveis', () => {
  const page = normalizePage({
    id: 'p1',
    properties: {
      Nome: { type: 'title', title: [{ plain_text: 'Item' }] },
      Responsáveis: { type: 'people', people: [{ id: 'u1', name: 'Ana' }, { id: 'u2' }] },
      Anexos: { type: 'files', files: [{ name: 'a.pdf' }, { name: 'b.png' }] },
      Projeto: { type: 'relation', relation: [{ id: 'r1' }, { id: 'r2' }] },
      Código: { type: 'unique_id', unique_id: { prefix: 'TSK', number: 42 } },
      Sequência: { type: 'unique_id', unique_id: { prefix: null, number: 7 } },
      Autor: { type: 'created_by', created_by: { id: 'u9', name: 'Bia' } },
      Total: { type: 'rollup', rollup: { type: 'number', number: 12 } },
      Datas: { type: 'rollup', rollup: { type: 'array', array: [{ type: 'date', date: { start: '2026-01-02' } }, { type: 'number', number: 3 }] } },
      Ação: { type: 'button', button: {} },
    },
  })
  assert.deepEqual(page.fields['Responsáveis'], ['Ana', 'u2'])
  assert.deepEqual(page.fields['Anexos'], ['a.pdf', 'b.png'])
  assert.deepEqual(page.fields['Projeto'], ['r1', 'r2'])
  assert.equal(page.fields['Código'], 'TSK-42')
  assert.equal(page.fields['Sequência'], '7')
  assert.equal(page.fields['Autor'], 'Bia')
  assert.equal(page.fields['Total'], 12)
  assert.deepEqual(page.fields['Datas'], ['2026-01-02', 3])
  assert.equal(page.fields['Ação'], null)
})

// Estrutura da database de tarefas real (20/09): dois `status` (Esforço, Etapa), um `select`
// "Repositório" ANTES da Etapa nas propriedades da página e um checkbox "Em andamento" que NÃO
// significa concluída. A tela mostrava Estado = "Felixo-AI-Core" e tarefa em andamento como concluída.
const schemaReal = {
  Tarefa: { id: 't', name: 'Tarefa', type: 'title' },
  'Em andamento': { id: 'a', name: 'Em andamento', type: 'checkbox' },
  Esforço: { id: 'e', name: 'Esforço', type: 'status' },
  Etapa: { id: 'g', name: 'Etapa', type: 'status' },
  Prioridade: { id: 'p', name: 'Prioridade', type: 'select' },
  Repositório: { id: 'r', name: 'Repositório', type: 'select' },
}
const paginaReal = (etapa, andamento) => ({
  id: 'x',
  properties: {
    Repositório: { type: 'select', select: { name: 'Felixo-AI-Core' } },
    'Em andamento': { type: 'checkbox', checkbox: andamento },
    Esforço: { type: 'status', status: { name: 'Dias' } },
    Etapa: { type: 'status', status: { name: etapa } },
    Prioridade: { type: 'select', select: { name: 'Média' } },
    Tarefa: { type: 'title', title: [{ plain_text: 'Item' }] },
  },
})

test('o estado da tarefa vem da propriedade de estado (Etapa), não do primeiro select/status da página', () => {
  const task = normalizePage(paginaReal('Entrada', false), schemaReal)
  assert.equal(task.status, 'Entrada')
  assert.equal(task.priority, 'Média')
})

test('checkbox "Em andamento" não marca a tarefa como concluída; a Etapa "Concluída" marca', () => {
  assert.equal(normalizePage(paginaReal('Entrada', true), schemaReal).completed, false)
  assert.equal(normalizePage(paginaReal('Concluída', false), schemaReal).completed, true)
})

test('lista de tarefas clássica (um checkbox sem nome de conclusão e nenhuma coluna de estado) continua usando o checkbox', () => {
  const schema = { Nome: { name: 'Nome', type: 'title' }, Check: { name: 'Check', type: 'checkbox' } }
  const feito = normalizePage({ id: 'y', properties: { Nome: { type: 'title', title: [{ plain_text: 'A' }] }, Check: { type: 'checkbox', checkbox: true } } }, schema)
  assert.equal(feito.completed, true)
})

test('checkbox com nome de conclusão ("Feita") vale mesmo havendo coluna de estado', () => {
  const schema = { ...schemaReal, Feita: { id: 'f', name: 'Feita', type: 'checkbox' } }
  const page = paginaReal('Entrada', false)
  page.properties.Feita = { type: 'checkbox', checkbox: true }
  assert.equal(normalizePage(page, schema).completed, true)
})

const schemaRealComOpcoes = {
  ...schemaReal,
  Etapa: {
    id: 'g', name: 'Etapa', type: 'status',
    status: { options: [{ name: 'Entrada' }, { name: 'Em breve' }, { name: 'Concluída' }] },
  },
}

test('concluir uma tarefa grava a Etapa "Concluída" e NÃO marca o checkbox "Em andamento" (estrutura real)', () => {
  const props = buildPageProperties(schemaRealComOpcoes, { completed: true })
  assert.deepEqual(props.Etapa, { status: { name: 'Concluída' } })
  assert.equal('Em andamento' in props, false)
})

test('reabrir grava a primeira etapa aberta; sem coluna de estado, o único checkbox continua sendo a conclusão', () => {
  assert.deepEqual(buildPageProperties(schemaRealComOpcoes, { completed: false }).Etapa, { status: { name: 'Entrada' } })
  const lista = { Nome: { name: 'Nome', type: 'title' }, Feito: { name: 'Feito', type: 'checkbox' } }
  assert.deepEqual(buildPageProperties(lista, { completed: true }), { Feito: { checkbox: true } })
})

test('um select "Repositório" sem nome de estado nunca recebe o valor de conclusão', () => {
  const soRepo = { Nome: { name: 'Nome', type: 'title' }, Repositório: { name: 'Repositório', type: 'select', select: { options: [{ name: 'Felixo' }, { name: 'Concluído' }] } } }
  assert.equal('Repositório' in buildPageProperties(soRepo, { completed: true }), false)
})

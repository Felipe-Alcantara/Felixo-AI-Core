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

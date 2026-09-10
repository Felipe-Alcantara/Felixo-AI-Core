const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { createNotionService, filterTasks, normalizeSchema } = require('./notion-service.cjs')
const { createStorageDatabase } = require('./storage/sqlite-database.cjs')
const { createNotionCacheRepository } = require('./storage/notion-cache-repository.cjs')

/**
 * Bancada com repositório de cache REAL (SQLite temporário), não o fake em
 * memória — pros cenários fim-a-fim (paginação sobrevivendo a revalidação,
 * duas janelas concorrentes) onde o comportamento real de
 * replaceSnapshot/upsertTask (a transação delete-then-insert) importa de
 * verdade, não só a forma da chamada.
 */
function withRealCache(run) {
  const databaseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-notion-service-'))
  const database = createStorageDatabase({ databaseDir })
  const cache = createNotionCacheRepository(database)
  return Promise.resolve(run(cache)).finally(() => {
    database.close()
    fs.rmSync(databaseDir, { recursive: true, force: true })
  })
}

test('serviço Notion devolve cache quando a sincronização falha e sinaliza stale', async () => {
  const task = { id: 'page-1', title: 'Offline', completed: false, fields: {} }
  const cache = fakeCache({ tasks: [task], schema: { Name: { type: 'title' } }, fetchedAt: '2026-09-08T12:00:00.000Z' })
  const service = createNotionService({
    connectionStore: fakeStore(),
    cacheRepository: cache,
    clientFactory: () => ({
      resolveDataSource: async () => { throw new Error('Sem internet') },
    }),
    now: () => '2026-09-08T12:01:00.000Z',
  })

  const result = await service.listTasks({ connectionId: 'connection-1', dataSourceId: 'source-1' })
  assert.equal(result.stale, true)
  assert.equal(result.fromCache, true)
  assert.equal(result.syncStatus, 'stale')
  assert.deepEqual(result.tasks, [task])
  assert.equal(cache.error, 'Sem internet')
})

test('listTasks sinaliza syncStatus:success quando a rede responde', async () => {
  const cache = fakeCache({ tasks: [], schema: {}, fetchedAt: null })
  const service = createNotionService({
    connectionStore: fakeStore(),
    cacheRepository: cache,
    clientFactory: () => ({
      resolveDataSource: async () => ({ id: 'source-1', properties: {} }),
      queryTasks: async () => ({ tasks: [{ id: 'page-1', title: 'Nova', completed: false, fields: {} }], nextCursor: null }),
    }),
    now: () => '2026-09-09T10:00:00.000Z',
  })

  const result = await service.listTasks({ connectionId: 'connection-1', dataSourceId: 'source-1' })
  assert.equal(result.syncStatus, 'success')
  assert.equal(result.stale, false)
})

test('getCachedTasks lê o snapshot local sem tocar a rede, e sinaliza stale quando há dado', async () => {
  const task = { id: 'page-1', title: 'Offline', completed: false, fields: {} }
  const cache = fakeCache({ tasks: [task], schema: { Name: { type: 'title' } }, fetchedAt: '2026-09-08T12:00:00.000Z' })
  let clientBuilt = false
  const service = createNotionService({
    connectionStore: fakeStore(),
    cacheRepository: cache,
    clientFactory: () => {
      clientBuilt = true
      throw new Error('getCachedTasks não deveria construir um client de rede')
    },
  })

  const result = service.getCachedTasks({ connectionId: 'connection-1', dataSourceId: 'source-1' })
  assert.equal(clientBuilt, false)
  assert.equal(result.hasCache, true)
  assert.equal(result.syncStatus, 'stale')
  assert.deepEqual(result.tasks, [task])
  assert.equal(result.fetchedAt, '2026-09-08T12:00:00.000Z')
})

test('getCachedTasks sinaliza empty quando não há snapshot salvo', () => {
  const cache = fakeCache({ tasks: [], schema: {}, fetchedAt: null })
  const service = createNotionService({
    connectionStore: fakeStore(),
    cacheRepository: cache,
    clientFactory: () => ({}),
  })

  const result = service.getCachedTasks({ connectionId: 'connection-1', dataSourceId: 'source-1' })
  assert.equal(result.hasCache, false)
  assert.equal(result.syncStatus, 'empty')
  assert.deepEqual(result.tasks, [])
})

test('getCachedTasks aplica o mesmo filtro de busca/status que listTasks', () => {
  const tasks = [
    { id: 'a', title: 'Abrir', completed: false, status: 'To Do', fields: {} },
    { id: 'b', title: 'Fechar', completed: true, status: 'Done', fields: {} },
  ]
  const cache = fakeCache({ tasks, schema: {}, fetchedAt: '2026-09-08T12:00:00.000Z' })
  const service = createNotionService({
    connectionStore: fakeStore(),
    cacheRepository: cache,
    clientFactory: () => ({}),
  })

  const result = service.getCachedTasks({ connectionId: 'connection-1', dataSourceId: 'source-1', status: 'done' })
  assert.deepEqual(result.tasks, [tasks[1]])
})

test('serviço normaliza esquema e filtra tarefas sem expor credencial', () => {
  const schema = normalizeSchema({
    Name: { id: 'title', type: 'title' },
    Status: { id: 'status', type: 'status', status: { options: [] } },
  })
  assert.equal(schema.Name.name, 'Name')
  assert.equal(schema.Status.type, 'status')

  const tasks = [
    { title: 'Abrir', completed: false, status: 'To Do', fields: {} },
    { title: 'Fechar', completed: true, status: 'Done', fields: {} },
  ]
  assert.deepEqual(filterTasks(tasks, { status: 'open' }), [tasks[0]])
  assert.deepEqual(filterTasks(tasks, { status: 'done' }), [tasks[1]])
  assert.deepEqual(filterTasks(tasks, { search: 'fechar' }), [tasks[1]])
})

test('serviço preserva o vínculo da fonte de dados com o database pai', async () => {
  const service = createNotionService({
    connectionStore: fakeStore(),
    cacheRepository: fakeCache({ tasks: [], schema: {}, fetchedAt: null }),
    clientFactory: () => ({
      listAccessibleDataSources: async () => [
        { id: 'source-1', name: 'Backlog', databaseId: 'database-1', url: null, lastEditedAt: null },
      ],
    }),
  })

  const result = await service.listDatabases({ connectionId: 'connection-1' })
  assert.equal(result.databases[0].databaseId, 'database-1')
})

test('serviço carrega o conteúdo do corpo de uma tarefa', async () => {
  const service = createNotionService({
    connectionStore: fakeStore(),
    cacheRepository: fakeCache({ tasks: [], schema: {}, fetchedAt: null }),
    clientFactory: () => ({
      getPageContent: async (pageId) => {
        assert.equal(pageId, 'page-1')
        return '## Conteúdo da nota'
      },
    }),
  })

  const result = await service.getTaskContent({ connectionId: 'connection-1', pageId: 'page-1' })

  assert.deepEqual(result, { pageId: 'page-1', content: '## Conteúdo da nota' })
})

test('updateTask aplica a mudança direto quando não há expectedUpdatedAt (compatibilidade)', async () => {
  const cache = fakeCache({ tasks: [], schema: {}, fetchedAt: null })
  let updateCalled = false
  const service = createNotionService({
    connectionStore: fakeStore(),
    cacheRepository: cache,
    clientFactory: () => ({
      resolveDataSource: async () => ({ id: 'source-1', properties: {} }),
      getTask: async () => { throw new Error('getTask não deveria ser chamado sem expectedUpdatedAt') },
      updateTask: async () => {
        updateCalled = true
        return { id: 'page-1', title: 'Editada', completed: false, fields: {}, updatedAt: '2026-09-10T10:00:00.000Z' }
      },
    }),
    now: () => '2026-09-10T10:00:01.000Z',
  })

  const result = await service.updateTask({
    connectionId: 'connection-1',
    dataSourceId: 'source-1',
    pageId: 'page-1',
    changes: { title: 'Editada' },
  })

  assert.equal(updateCalled, true)
  assert.equal(result.conflict, false)
  assert.equal(result.task.title, 'Editada')
})

test('updateTask aplica a mudança quando expectedUpdatedAt bate com a versão remota', async () => {
  const cache = fakeCache({ tasks: [], schema: {}, fetchedAt: null })
  let updateCalled = false
  const service = createNotionService({
    connectionStore: fakeStore(),
    cacheRepository: cache,
    clientFactory: () => ({
      resolveDataSource: async () => ({ id: 'source-1', properties: {} }),
      getTask: async () => ({ id: 'page-1', title: 'Antiga', completed: false, fields: {}, updatedAt: '2026-09-10T10:00:00.000Z' }),
      updateTask: async () => {
        updateCalled = true
        return { id: 'page-1', title: 'Editada', completed: false, fields: {}, updatedAt: '2026-09-10T10:05:00.000Z' }
      },
    }),
    now: () => '2026-09-10T10:05:01.000Z',
  })

  const result = await service.updateTask({
    connectionId: 'connection-1',
    dataSourceId: 'source-1',
    pageId: 'page-1',
    changes: { title: 'Editada' },
    expectedUpdatedAt: '2026-09-10T10:00:00.000Z',
  })

  assert.equal(updateCalled, true)
  assert.equal(result.conflict, false)
  assert.equal(result.task.title, 'Editada')
})

test('updateTask rejeita com segurança quando a versão remota mudou — nunca sobrescreve', async () => {
  const cache = fakeCache({ tasks: [], schema: {}, fetchedAt: null })
  let updateCalled = false
  const remoteTaskAgora = { id: 'page-1', title: 'Mudada por outra pessoa', completed: true, fields: {}, updatedAt: '2026-09-10T10:03:00.000Z' }
  const service = createNotionService({
    connectionStore: fakeStore(),
    cacheRepository: cache,
    clientFactory: () => ({
      resolveDataSource: async () => ({ id: 'source-1', properties: {} }),
      getTask: async () => remoteTaskAgora,
      updateTask: async () => {
        updateCalled = true
        throw new Error('updateTask não deveria ser chamado em conflito')
      },
    }),
    now: () => '2026-09-10T10:05:01.000Z',
  })

  const result = await service.updateTask({
    connectionId: 'connection-1',
    dataSourceId: 'source-1',
    pageId: 'page-1',
    changes: { title: 'Minha edição' },
    expectedUpdatedAt: '2026-09-10T10:00:00.000Z',
  })

  assert.equal(updateCalled, false)
  assert.equal(result.conflict, true)
  assert.deepEqual(result.task, remoteTaskAgora)
  assert.match(result.message, /alterada no Notion/)
  // O cache foi atualizado com a versão remota real, pra não repetir o
  // mesmo falso conflito numa segunda tentativa.
  assert.deepEqual(cache.readSnapshot().tasks, [remoteTaskAgora])
})

test('removeConnection limpa o cache da conexão quando a remoção acontece de verdade', async () => {
  const cache = fakeCache({ tasks: [], schema: {}, fetchedAt: null })
  const clearedConnections = []
  cache.clearConnection = ({ connectionId }) => clearedConnections.push(connectionId)
  const service = createNotionService({
    connectionStore: { ...fakeStore(), remove: () => true },
    cacheRepository: cache,
    clientFactory: () => ({}),
  })

  const result = service.removeConnection('connection-1')

  assert.equal(result.removed, true)
  assert.deepEqual(clearedConnections, ['connection-1'])
})

test('removeConnection não toca o cache quando não havia nada pra remover', async () => {
  const cache = fakeCache({ tasks: [], schema: {}, fetchedAt: null })
  const clearedConnections = []
  cache.clearConnection = ({ connectionId }) => clearedConnections.push(connectionId)
  const service = createNotionService({
    connectionStore: { ...fakeStore(), remove: () => false },
    cacheRepository: cache,
    clientFactory: () => ({}),
  })

  const result = service.removeConnection('connection-inexistente')

  assert.equal(result.removed, false)
  assert.deepEqual(clearedConnections, [])
})

test('cache paginado sobrevive a uma revalidação em segundo plano — a tabela encolheu, o cache reflete o novo tamanho, sem órfão', () =>
  withRealCache(async (cache) => {
    // Primeira sincronização: 3 páginas de 1 tarefa cada (queryTasks já
    // agrega tudo numa única chamada — ver notion-client.test.cjs).
    const paginas = [
      { tasks: [{ id: 'page-1', title: 'Um', completed: false, fields: {} }, { id: 'page-2', title: 'Dois', completed: false, fields: {} }, { id: 'page-3', title: 'Três', completed: false, fields: {} }], nextCursor: null },
      // Revalidação seguinte: a tabela encolheu (page-2 foi arquivada/apagada no Notion).
      { tasks: [{ id: 'page-1', title: 'Um', completed: false, fields: {} }, { id: 'page-3', title: 'Três (editada)', completed: false, fields: {} }], nextCursor: null },
    ]
    const service = createNotionService({
      connectionStore: fakeStore(),
      cacheRepository: cache,
      clientFactory: () => ({
        resolveDataSource: async () => ({ id: 'source-1', properties: {} }),
        queryTasks: async () => paginas.shift(),
      }),
      now: () => '2026-09-10T12:00:00.000Z',
    })

    const primeira = await service.listTasks({ connectionId: 'connection-1', dataSourceId: 'source-1' })
    assert.deepEqual(primeira.tasks.map((t) => t.id).sort(), ['page-1', 'page-2', 'page-3'])

    const segunda = await service.listTasks({ connectionId: 'connection-1', dataSourceId: 'source-1' })
    assert.deepEqual(segunda.tasks.map((t) => t.id).sort(), ['page-1', 'page-3'])
    // page-2 não fica órfão no cache depois da revalidação.
    assert.equal(segunda.tasks.some((t) => t.id === 'page-2'), false)
    assert.equal(segunda.tasks.find((t) => t.id === 'page-3').title, 'Três (editada)')

    // Uma leitura de cache isolada (getCachedTasks, sem rede) confirma o
    // mesmo estado — o SQLite realmente não guardou o page-2 antigo.
    const cached = service.getCachedTasks({ connectionId: 'connection-1', dataSourceId: 'source-1' })
    assert.deepEqual(cached.tasks.map((t) => t.id).sort(), ['page-1', 'page-3'])
  }))

test('duas janelas na mesma tarefa: a segunda escrita detecta o conflito da primeira, nunca sobrescreve', () =>
  withRealCache(async (cache) => {
    // Estado remoto simulado, que MUDA quando updateTask roda de verdade —
    // diferente dos testes de conflito da fatia 3 (fixture estática), aqui
    // o "servidor" reage às escritas, como duas janelas reais disputando.
    let remoto = { id: 'page-1', title: 'Original', completed: false, fields: {}, updatedAt: '2026-09-10T12:00:00.000Z' }
    const service = createNotionService({
      connectionStore: fakeStore(),
      cacheRepository: cache,
      clientFactory: () => ({
        resolveDataSource: async () => ({ id: 'source-1', properties: {} }),
        getTask: async () => remoto,
        updateTask: async ({ changes }) => {
          remoto = { ...remoto, ...changes, updatedAt: '2026-09-10T12:05:00.000Z' }
          return remoto
        },
      }),
      now: () => '2026-09-10T12:05:01.000Z',
    })

    // As duas janelas abriram a mesma tarefa vendo o mesmo updatedAt.
    const updatedAtVistoPorAmbas = remoto.updatedAt

    // Janela B salva primeiro — sem conflito, era a versão vigente.
    const resultadoB = await service.updateTask({
      connectionId: 'connection-1',
      dataSourceId: 'source-1',
      pageId: 'page-1',
      changes: { title: 'Editado pela janela B' },
      expectedUpdatedAt: updatedAtVistoPorAmbas,
    })
    assert.equal(resultadoB.conflict, false)
    assert.equal(resultadoB.task.title, 'Editado pela janela B')

    // Janela A tenta salvar depois, ainda com o updatedAt de quando abriu —
    // o remoto já mudou (a escrita da janela B). Rejeição segura.
    const resultadoA = await service.updateTask({
      connectionId: 'connection-1',
      dataSourceId: 'source-1',
      pageId: 'page-1',
      changes: { title: 'Editado pela janela A' },
      expectedUpdatedAt: updatedAtVistoPorAmbas,
    })
    assert.equal(resultadoA.conflict, true)
    // A mudança da janela B continua valendo — A nunca a sobrescreveu.
    assert.equal(resultadoA.task.title, 'Editado pela janela B')
    assert.equal(remoto.title, 'Editado pela janela B')
  }))

test('rede intermitente: falha, sucesso, falha de novo — cada leitura reflete o estado real do momento', () =>
  withRealCache(async (cache) => {
    const comportamentos = [
      async () => { throw new Error('offline 1') },
      async () => ({ tasks: [{ id: 'page-1', title: 'Sincronizada', completed: false, fields: {} }], nextCursor: null }),
      async () => { throw new Error('offline 2') },
    ]
    const service = createNotionService({
      connectionStore: fakeStore(),
      cacheRepository: cache,
      clientFactory: () => ({
        resolveDataSource: async () => ({ id: 'source-1', properties: {} }),
        queryTasks: async () => comportamentos.shift()(),
      }),
      now: () => '2026-09-10T12:00:00.000Z',
    })

    // 1ª tentativa: falha, sem cache ainda — não tem pra onde cair, propaga o erro.
    await assert.rejects(
      () => service.listTasks({ connectionId: 'connection-1', dataSourceId: 'source-1' }),
      /offline 1/,
    )

    // 2ª tentativa: rede volta, sincroniza de verdade.
    const sucesso = await service.listTasks({ connectionId: 'connection-1', dataSourceId: 'source-1' })
    assert.equal(sucesso.syncStatus, 'success')
    assert.deepEqual(sucesso.tasks.map((t) => t.id), ['page-1'])

    // 3ª tentativa: rede cai de novo, mas agora há cache — cai pro
    // snapshot salvo em vez de propagar o erro, e sinaliza stale.
    const stale = await service.listTasks({ connectionId: 'connection-1', dataSourceId: 'source-1' })
    assert.equal(stale.syncStatus, 'stale')
    assert.deepEqual(stale.tasks.map((t) => t.id), ['page-1'])
    assert.match(stale.message, /offline 2/)
  }))

test('cortar a rede DEPOIS de um sync bem-sucedido: snapshot stale legível; restaurar a rede: reflete a atualização de verdade', () =>
  withRealCache(async (cache) => {
    const comportamentos = [
      // 1) sync inicial, com a rede disponível.
      async () => ({ tasks: [{ id: 'page-1', title: 'Antes de cortar a rede', completed: false, fields: {} }], nextCursor: null }),
      // 2) rede cortada DEPOIS do sync acima (não durante) — vários ticks
      // de auto-sync em segundo plano, todos falhando.
      async () => { throw new Error('rede cortada') },
      async () => { throw new Error('rede cortada') },
      // 3) rede restaurada, com dado NOVO no Notion (não é só o cache ecoando).
      async () => ({ tasks: [{ id: 'page-1', title: 'Depois de restaurar a rede', completed: true, fields: {} }], nextCursor: null }),
    ]
    const service = createNotionService({
      connectionStore: fakeStore(),
      cacheRepository: cache,
      clientFactory: () => ({
        resolveDataSource: async () => ({ id: 'source-1', properties: {} }),
        queryTasks: async () => comportamentos.shift()(),
      }),
      now: () => '2026-09-10T12:00:00.000Z',
    })

    const inicial = await service.listTasks({ connectionId: 'connection-1', dataSourceId: 'source-1' })
    assert.equal(inicial.syncStatus, 'success')
    assert.equal(inicial.tasks[0].title, 'Antes de cortar a rede')

    // Rede cortada: cada tentativa cai pro cache, syncStatus:'stale', e o
    // snapshot continua o MESMO de antes do corte — legível, não vazio,
    // não corrompido, com a mensagem de erro explicando a causa.
    for (let tentativa = 0; tentativa < 2; tentativa += 1) {
      const stale = await service.listTasks({ connectionId: 'connection-1', dataSourceId: 'source-1' })
      assert.equal(stale.syncStatus, 'stale')
      assert.equal(stale.tasks[0].title, 'Antes de cortar a rede')
      assert.match(stale.message, /rede cortada/)

      // O lado "stale" do stale-while-revalidate (a leitura local que o
      // painel usa pra renderizar na hora, sem esperar a rede) mostra
      // exatamente o mesmo snapshot legível — não fica vazio nem desatualizado
      // de um jeito diferente da leitura de rede-com-fallback.
      const cachedApenas = service.getCachedTasks({ connectionId: 'connection-1', dataSourceId: 'source-1' })
      assert.equal(cachedApenas.hasCache, true)
      assert.equal(cachedApenas.tasks[0].title, 'Antes de cortar a rede')
    }

    // Rede restaurada: a PRÓXIMA sincronização reflete o dado atualizado de
    // verdade, não fica presa no snapshot antigo.
    const recuperado = await service.listTasks({ connectionId: 'connection-1', dataSourceId: 'source-1' })
    assert.equal(recuperado.syncStatus, 'success')
    assert.equal(recuperado.tasks[0].title, 'Depois de restaurar a rede')
    assert.equal(recuperado.tasks[0].completed, true)

    // E a leitura local (fase 1) também já reflete o dado novo — o cache
    // foi substituído de verdade, não só remendado.
    const cachedDepois = service.getCachedTasks({ connectionId: 'connection-1', dataSourceId: 'source-1' })
    assert.equal(cachedDepois.tasks[0].title, 'Depois de restaurar a rede')
  }))

test('serviço nunca cruza o token de uma conexão pra outra ao consultar a rede', () =>
  withRealCache(async (cache) => {
    const credenciais = {
      'connection-a': 'token_secreto_A',
      'connection-b': 'token_secreto_B',
    }
    const tokensUsados = []
    const service = createNotionService({
      connectionStore: {
        ...fakeStore(),
        getCredential: (connectionId) => ({ connection: { id: connectionId }, token: credenciais[connectionId] }),
      },
      cacheRepository: cache,
      clientFactory: ({ token }) => {
        tokensUsados.push(token)
        return {
          resolveDataSource: async () => ({ id: 'source-1', properties: {} }),
          queryTasks: async () => ({
            tasks: [{ id: 'page-1', title: `Tarefa vista com ${token}`, completed: false, fields: {} }],
            nextCursor: null,
          }),
        }
      },
      now: () => '2026-09-10T12:00:00.000Z',
    })

    const resultadoA = await service.listTasks({ connectionId: 'connection-a', dataSourceId: 'source-1' })
    const resultadoB = await service.listTasks({ connectionId: 'connection-b', dataSourceId: 'source-1' })

    assert.deepEqual(tokensUsados, ['token_secreto_A', 'token_secreto_B'])
    assert.match(resultadoA.tasks[0].title, /token_secreto_A/)
    assert.match(resultadoB.tasks[0].title, /token_secreto_B/)
    // Nenhum token aparece em texto no resultado devolvido pro IPC/renderer
    // além do que a própria fixture de teste colocou de propósito no título
    // (simulando conteúdo real da tarefa) — o CAMPO token em si nunca existe
    // no payload de retorno do serviço.
    assert.equal('token' in resultadoA, false)
    assert.equal('token' in resultadoB, false)
  }))

function fakeStore() {
  return {
    canStoreSecret: () => ({ ok: true, reason: null }),
    getCredential: () => ({ connection: { id: 'connection-1' }, token: 'secret' }),
    list: () => [],
    markTested: () => null,
    remove: () => false,
    save: () => null,
  }
}

function fakeCache(initial) {
  let snapshot = { ...initial, nextCursor: null, lastSuccessAt: initial.fetchedAt, status: 'success', lastError: null, updatedAt: initial.fetchedAt }
  return {
    get error() { return snapshot.lastError },
    markSyncError({ error }) { snapshot = { ...snapshot, status: 'error', lastError: error.message }; return snapshot },
    readSnapshot() { return snapshot },
    replaceSnapshot() { return snapshot },
    upsertTask({ task }) {
      const rest = snapshot.tasks.filter((existing) => existing.id !== task.id)
      snapshot = { ...snapshot, tasks: [...rest, task] }
      return snapshot
    },
    deleteTask() {},
    clearConnection() {},
  }
}

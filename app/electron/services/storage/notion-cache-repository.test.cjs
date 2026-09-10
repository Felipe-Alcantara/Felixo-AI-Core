const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { createStorageDatabase } = require('./sqlite-database.cjs')
const { createNotionCacheRepository } = require('./notion-cache-repository.cjs')

test('cache Notion isola conexões/fontes e recupera snapshot stale', () => {
  const databaseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-notion-cache-'))
  try {
    const database = createStorageDatabase({ databaseDir })
    const cache = createNotionCacheRepository(database)
    const task = {
      id: 'page-1',
      title: 'Tarefa',
      completed: false,
      fields: { Status: 'To Do' },
    }

    const snapshot = cache.replaceSnapshot({
      connectionId: 'connection-a',
      dataSourceId: 'source-a',
      schema: { Name: { type: 'title' } },
      tasks: [task],
      fetchedAt: '2026-09-08T12:00:00.000Z',
    })
    assert.deepEqual(snapshot.tasks, [task])
    assert.equal(snapshot.status, 'success')
    assert.deepEqual(
      cache.readSnapshot({ connectionId: 'connection-b', dataSourceId: 'source-a' }).tasks,
      [],
    )

    const stale = cache.markSyncError({
      connectionId: 'connection-a',
      dataSourceId: 'source-a',
      error: new Error('rede indisponível'),
      updatedAt: '2026-09-08T12:01:00.000Z',
    })
    assert.equal(stale.status, 'error')
    assert.equal(stale.lastError, 'rede indisponível')
    assert.deepEqual(stale.tasks, [task])

    cache.deleteTask({ connectionId: 'connection-a', dataSourceId: 'source-a', taskId: 'page-1' })
    assert.deepEqual(
      cache.readSnapshot({ connectionId: 'connection-a', dataSourceId: 'source-a' }).tasks,
      [],
    )
    database.close()
  } finally {
    fs.rmSync(databaseDir, { recursive: true, force: true })
  }
})

test('uma falha no meio de replaceSnapshot (ex.: app encerrado) não corrompe nem perde o snapshot anterior', () => {
  const databaseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-notion-cache-'))
  try {
    const database = createStorageDatabase({ databaseDir })
    const cache = createNotionCacheRepository(database)

    // Estado inicial, sincronizado com sucesso — é isto que precisa
    // sobreviver intacto a uma revalidação que crasha no meio do caminho.
    cache.replaceSnapshot({
      connectionId: 'connection-a',
      dataSourceId: 'source-1',
      schema: { Name: { type: 'title' } },
      tasks: [
        { id: 'page-1', title: 'Antiga 1', completed: false, fields: {} },
        { id: 'page-2', title: 'Antiga 2', completed: false, fields: {} },
      ],
      fetchedAt: '2026-09-10T12:00:00.000Z',
    })

    // Repositório com a MESMA conexão, mas cujo INSERT falha na segunda
    // tarefa — simula o processo sendo encerrado (ou a conexão caindo) no
    // meio de uma revalidação em segundo plano, depois do DELETE e do
    // primeiro INSERT já terem rodado, mas antes do COMMIT.
    const cacheQueVaiCrashar = createNotionCacheRepository(
      wrapConnectionToCrashOnNthInsert(database, 2),
    )

    assert.throws(() => {
      cacheQueVaiCrashar.replaceSnapshot({
        connectionId: 'connection-a',
        dataSourceId: 'source-1',
        schema: { Name: { type: 'title' } },
        tasks: [
          { id: 'page-3', title: 'Nova 1', completed: false, fields: {} },
          { id: 'page-4', title: 'Nova 2', completed: false, fields: {} },
        ],
        fetchedAt: '2026-09-10T12:05:00.000Z',
      })
    }, /processo encerrado no meio da escrita/)

    // Lendo de novo com o repositório original (mesma conexão): o ROLLBACK
    // devolveu exatamente o snapshot de antes — nem misturado com as
    // tarefas novas, nem com só uma delas, nem vazio.
    const depoisDoCrash = cache.readSnapshot({ connectionId: 'connection-a', dataSourceId: 'source-1' })
    assert.deepEqual(
      depoisDoCrash.tasks.map((t) => t.id).sort(),
      ['page-1', 'page-2'],
    )
    assert.equal(depoisDoCrash.status, 'success')
    assert.equal(depoisDoCrash.fetchedAt, '2026-09-10T12:00:00.000Z')

    database.close()
  } finally {
    fs.rmSync(databaseDir, { recursive: true, force: true })
  }
})

test('clearConnection apaga todas as tabelas em cache de uma conexão, sem afetar outras conexões', () => {
  const databaseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-notion-cache-'))
  try {
    const database = createStorageDatabase({ databaseDir })
    const cache = createNotionCacheRepository(database)

    // A mesma conexão foi usada com duas tabelas diferentes ao longo do tempo.
    cache.replaceSnapshot({
      connectionId: 'connection-a',
      dataSourceId: 'source-1',
      schema: {},
      tasks: [{ id: 'page-1', title: 'Tarefa 1', completed: false, fields: {} }],
      fetchedAt: '2026-09-10T12:00:00.000Z',
    })
    cache.replaceSnapshot({
      connectionId: 'connection-a',
      dataSourceId: 'source-2',
      schema: {},
      tasks: [{ id: 'page-2', title: 'Tarefa 2', completed: false, fields: {} }],
      fetchedAt: '2026-09-10T12:00:00.000Z',
    })
    cache.replaceSnapshot({
      connectionId: 'connection-b',
      dataSourceId: 'source-1',
      schema: {},
      tasks: [{ id: 'page-3', title: 'Tarefa de outra conexão', completed: false, fields: {} }],
      fetchedAt: '2026-09-10T12:00:00.000Z',
    })

    cache.clearConnection({ connectionId: 'connection-a' })

    assert.deepEqual(cache.readSnapshot({ connectionId: 'connection-a', dataSourceId: 'source-1' }).tasks, [])
    assert.equal(cache.readSnapshot({ connectionId: 'connection-a', dataSourceId: 'source-1' }).status, 'idle')
    assert.deepEqual(cache.readSnapshot({ connectionId: 'connection-a', dataSourceId: 'source-2' }).tasks, [])
    // A outra conexão continua intacta.
    assert.deepEqual(
      cache.readSnapshot({ connectionId: 'connection-b', dataSourceId: 'source-1' }).tasks,
      [{ id: 'page-3', title: 'Tarefa de outra conexão', completed: false, fields: {} }],
    )

    database.close()
  } finally {
    fs.rmSync(databaseDir, { recursive: true, force: true })
  }
})

/**
 * Envolve a MESMA conexão SQLite real, mas faz o N-ésimo `.run()` de um
 * INSERT em notion_task_cache lançar em vez de escrever — simula o
 * processo caindo (ou a conexão morrendo) no meio de um batch de escrita,
 * depois de outras statements já terem rodado dentro da mesma transação
 * ainda não commitada.
 */
function wrapConnectionToCrashOnNthInsert(database, n) {
  const real = database?.connection ?? database
  let insertCalls = 0
  return {
    exec: (...args) => real.exec(...args),
    prepare(sql) {
      const statement = real.prepare(sql)
      if (!sql.includes('INSERT INTO notion_task_cache')) {
        return statement
      }
      return {
        run: (...args) => {
          insertCalls += 1
          if (insertCalls === n) {
            throw new Error('processo encerrado no meio da escrita')
          }
          return statement.run(...args)
        },
      }
    },
  }
}

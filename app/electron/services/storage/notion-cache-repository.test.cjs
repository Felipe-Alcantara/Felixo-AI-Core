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

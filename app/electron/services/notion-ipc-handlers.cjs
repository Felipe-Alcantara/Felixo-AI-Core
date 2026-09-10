'use strict'

const { ipcMain, safeStorage } = require('electron')
const { createNotionConnectionStore } = require('./notion-connection-store.cjs')
const { createNotionService } = require('./notion-service.cjs')
const { createNotionCacheRepository } = require('./storage/notion-cache-repository.cjs')

function registerNotionIpcHandlers({
  appPaths,
  database,
  ipc = ipcMain,
  electronSafeStorage = safeStorage,
  createStore = createNotionConnectionStore,
  createCache = createNotionCacheRepository,
  createService = createNotionService,
} = {}) {
  const connectionStore = createStore({
    userData: appPaths?.userData,
    safeStorage: electronSafeStorage,
  })
  const cacheRepository = createCache(database)
  const service = createService({ connectionStore, cacheRepository })

  ipc.handle('notion:connections:list', () => guard(() => service.listConnections()))
  ipc.handle('notion:connections:save', (_event, input) =>
    guard(() => service.saveConnection(input)),
  )
  ipc.handle('notion:connections:remove', (_event, connectionId) =>
    guard(() => service.removeConnection(connectionId)),
  )
  ipc.handle('notion:connections:test', (_event, connectionId) =>
    guard(() => service.testConnection(connectionId)),
  )
  ipc.handle('notion:databases:list', (_event, input) =>
    guard(() => service.listDatabases(input || {})),
  )
  ipc.handle('notion:database:schema', (_event, input) =>
    guard(() => service.getSchema(input || {})),
  )
  ipc.handle('notion:tasks:list', (_event, input) =>
    guard(() => service.listTasks(input || {})),
  )
  // Leitura local, sem rede — o "stale" de stale-while-revalidate. `guard`
  // continua async por uniformidade de contrato, mas `getCachedTasks` em si
  // não aguarda nada de I/O remoto.
  ipc.handle('notion:tasks:cached', (_event, input) =>
    guard(() => service.getCachedTasks(input || {})),
  )
  ipc.handle('notion:tasks:content', (_event, input) =>
    guard(() => service.getTaskContent(input || {})),
  )
  ipc.handle('notion:tasks:create', (_event, input) =>
    guard(() => service.createTask(input || {})),
  )
  ipc.handle('notion:tasks:update', (_event, input) =>
    guard(() => service.updateTask(input || {})),
  )
  ipc.handle('notion:tasks:archive', (_event, input) =>
    guard(() => service.archiveTask(input || {})),
  )

  return { cacheRepository, connectionStore, service }
}

async function guard(run) {
  try {
    return { ok: true, ...(await run()) }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Não foi possível concluir a operação do Notion.',
    }
  }
}

module.exports = {
  guard,
  registerNotionIpcHandlers,
}

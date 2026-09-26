const assert = require('node:assert/strict')
const test = require('node:test')

const {
  registerChatHistoryIpcHandlers,
} = require('./chat-history-ipc-handlers.cjs')

function registerWithFakeIpc() {
  const handlers = new Map()
  const ipcMain = {
    handle(channel, handler) {
      handlers.set(channel, handler)
    },
  }
  // O repositório só exige uma conexão com `prepare` para ser montado.
  const database = { connection: { prepare: () => ({ all: () => [] }) } }

  registerChatHistoryIpcHandlers({ database, ipcMain })
  return handlers
}

test('o histórico de chats expõe só os canais que o renderer usa', () => {
  const handlers = registerWithFakeIpc()

  assert.deepEqual([...handlers.keys()].sort(), [
    'chats:delete',
    'chats:list',
    'chats:save',
  ])
})

test('chats:list devolve as sessões do repositório', async () => {
  const handlers = registerWithFakeIpc()

  assert.deepEqual(await handlers.get('chats:list')(null, { limit: 5 }), {
    ok: true,
    sessions: [],
  })
})

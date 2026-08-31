'use strict'

const assert = require('node:assert/strict')
const Module = require('node:module')
const test = require('node:test')

const handlers = new Map()
const originalLoad = Module._load
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'electron') {
    return {
      ipcMain: {
        handle(channel, listener) {
          handlers.set(channel, listener)
        },
      },
    }
  }

  return originalLoad.call(this, request, parent, isMain)
}

const {
  registerCliAccountIpcHandlers,
} = require('./cli-account-ipc-handlers.cjs')
Module._load = originalLoad

test('remoção de perfil retorna falha segura ao IPC', async () => {
  handlers.clear()
  const store = {
    remove() {
      const error = new Error(
        'Não foi possível apagar a pasta de login da conta. A conta e a credencial foram preservadas; corrija o bloqueio e tente novamente.',
      )
      error.code = 'CLI_ACCOUNT_PROFILE_REMOVE_FAILED'
      throw error
    },
  }

  registerCliAccountIpcHandlers({ store })

  const result = await handlers.get('cli-accounts:remove')(null, 'conta-1')

  assert.deepEqual(result, {
    ok: false,
    message:
      'Não foi possível apagar a pasta de login da conta. A conta e a credencial foram preservadas; corrija o bloqueio e tente novamente.',
  })
})

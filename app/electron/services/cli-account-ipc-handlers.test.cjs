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

test('remover sem confirmação devolve os terminais vivos e só repassa `true` estrito à loja', async () => {
  handlers.clear()
  const pedidos = []
  const sessoes = [{ sessionId: 'canvas:terminal-a', cwd: '/projetos/felixo', startedAt: 1_000 }]
  const store = {
    remove(accountId, options) {
      pedidos.push({ accountId, options })
      return options.confirmed
        ? { removed: true, sessions: sessoes, chainCleaned: true }
        : { removed: false, requiresConfirmation: true, sessions: sessoes }
    },
  }

  registerCliAccountIpcHandlers({ store, logEvent: () => assert.fail('nada a registrar') })
  const remover = handlers.get('cli-accounts:remove')

  assert.deepEqual(await remover(null, 'conta-1'), {
    ok: false,
    requiresConfirmation: true,
    sessions: sessoes,
    message: 'Remover a conta exige confirmação explícita.',
  })
  assert.equal((await remover(null, 'conta-1', { confirmed: 'true' })).requiresConfirmation, true)

  assert.deepEqual(
    await remover(null, 'conta-1', {
      confirmed: true,
      acknowledgedSessionIds: ['canvas:terminal-a', 7, '', null],
    }),
    { ok: true, removed: true, sessions: sessoes },
  )

  assert.deepEqual(
    pedidos.map((pedido) => pedido.options),
    [
      { confirmed: false, acknowledgedSessionIds: [] },
      { confirmed: false, acknowledgedSessionIds: [] },
      { confirmed: true, acknowledgedSessionIds: ['canvas:terminal-a'] },
    ],
  )
})

test('conta removida com a limpeza da cadeia falhando vira aviso no log, sem desfazer a remoção', async () => {
  handlers.clear()
  const avisos = []
  const store = {
    remove: () => ({ removed: true, sessions: [], chainCleaned: false }),
  }

  registerCliAccountIpcHandlers({ store, logEvent: (entry) => avisos.push(entry) })

  const result = await handlers.get('cli-accounts:remove')(null, 'conta-1', { confirmed: true })

  assert.deepEqual(result, { ok: true, removed: true, sessions: [] })
  assert.equal(avisos.length, 1)
  assert.equal(avisos[0].level, 'warn')
  assert.equal(avisos[0].scope, 'cli-accounts:remove')
  assert.doesNotMatch(JSON.stringify(avisos), /conta-1/)
})

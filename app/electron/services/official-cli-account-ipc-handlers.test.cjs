const test = require('node:test')
const assert = require('node:assert/strict')
const Module = require('node:module')

const handlers = new Map()
const originalLoad = Module._load
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'electron') {
    return { ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) } }
  }
  return originalLoad.call(this, request, parent, isMain)
}
const {
  registerOfficialCliAccountIpcHandlers,
} = require('./official-cli-account-ipc-handlers.cjs')
Module._load = originalLoad

test('a ponte não confirma a troca de conta em nome de quem usa', async () => {
  registerOfficialCliAccountIpcHandlers()

  const semConfirmacao = await handlers.get('cli:switch-official-account')(
    {},
    { id: 'codex' },
  )
  const confirmacaoFalsa = await handlers.get('cli:switch-official-account')(
    {},
    { id: 'codex', confirmed: 'sim' },
  )

  // Sem `confirmed === true` o serviço recusa. Um valor apenas "verdadeiro-ish"
  // vindo do renderer também não vale como confirmação.
  assert.equal(semConfirmacao.requiresConfirmation, true)
  assert.equal(confirmacaoFalsa.requiresConfirmation, true)
})

test('a consulta de sessões afetadas usa o gerenciador de PTY vivo', () => {
  registerOfficialCliAccountIpcHandlers({
    getPtyManager: () => ({
      listarSessoesVivas: () => [
        { sessionId: 'canvas:no-1', command: 'codex', cwd: '/projetos/alpha', startedAt: 1 },
        { sessionId: 'canvas:no-2', command: 'bash', cwd: '/projetos/beta', startedAt: 2 },
      ],
    }),
  })

  const result = handlers.get('cli:official-account-sessions')({}, { id: 'codex' })

  assert.equal(result.ok, true)
  assert.deepEqual(
    result.sessions.map((session) => session.elementId),
    ['no-1'],
  )
})

test('a consulta de sessões sobrevive a um gerenciador ainda não criado', () => {
  registerOfficialCliAccountIpcHandlers()

  const result = handlers.get('cli:official-account-sessions')({}, { id: 'codex' })

  assert.equal(result.ok, true)
  assert.deepEqual(result.sessions, [])
})

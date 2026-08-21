const { describe, it } = require('node:test')
const assert = require('node:assert/strict')

const {
  getOfficialCliAccountStatus,
  listOfficialCliAccountSessions,
  openOfficialCliLogin,
  parseCodexLoginStatus,
  switchOfficialCliAccount,
} = require('./official-cli-service.cjs')

describe('official-cli-service', () => {
  it('parses Codex ChatGPT login status', () => {
    assert.equal(
      parseCodexLoginStatus('Logged in using ChatGPT'),
      'logged_in',
    )
  })

  it('parses Codex logged out status before logged in substrings', () => {
    assert.equal(parseCodexLoginStatus('Not logged in'), 'logged_out')
  })

  it('returns unknown for empty or unexpected status output', () => {
    assert.equal(parseCodexLoginStatus(''), 'unknown')
    assert.equal(parseCodexLoginStatus('Something else'), 'unknown')
  })

  it('uses the Windows cmd shim when opening the Codex login terminal', () => {
    let launched

    const result = openOfficialCliLogin('codex', {
      platformName: 'win32',
      launchTerminal: (options) => {
        launched = options
        return { ok: true, command: 'cmd.exe', args: ['/c', 'codex.cmd', 'login'] }
      },
    })

    assert.equal(result.ok, true)
    assert.equal(launched.command, 'codex.cmd')
    assert.deepEqual(launched.args, ['login'])
  })
})

describe('switchOfficialCliAccount', () => {
  it('recusa a troca sem confirmação explícita, sem executar logout', async () => {
    const result = await switchOfficialCliAccount('codex')

    assert.equal(result.ok, false)
    assert.equal(result.requiresConfirmation, true)
  })

  it('recusa a troca para uma CLI sem operação de conta configurada', async () => {
    const result = await switchOfficialCliAccount('claude', { confirmed: true })

    assert.equal(result.ok, false)
    assert.equal(result.requiresConfirmation, undefined)
    assert.match(result.message, /troca de conta/i)
  })

  it('recusa uma CLI desconhecida', async () => {
    const result = await switchOfficialCliAccount('inexistente', {
      confirmed: true,
    })

    assert.equal(result.ok, false)
  })
})

describe('getOfficialCliAccountStatus', () => {
  it('entrega identidade e texto já redigido ao renderer', async () => {
    const result = await getOfficialCliAccountStatus('codex', {
      runCommand: async () => ({
        ok: true,
        stdout: 'Logged in using ChatGPT\n  Account: pessoa@example.com\n',
        stderr: '',
      }),
    })

    assert.equal(result.ok, true)
    assert.equal(result.authStatus, 'logged_in')
    assert.equal(result.account, 'pessoa@example.com')
    assert.equal(result.statusCommand, 'codex login status')
    // stdout/stderr crus não atravessam a ponte: só o texto redigido.
    assert.equal(result.stdout, undefined)
    assert.equal(result.stderr, undefined)
  })

  it('redige segredo que a CLI tenha escrito no erro', async () => {
    const result = await getOfficialCliAccountStatus('codex', {
      runCommand: async () => ({
        ok: false,
        stdout: '',
        stderr: 'falhou com token: sk-abcdefghijklmnop',
        message: 'codex encerrou com codigo 1',
      }),
    })

    assert.equal(result.ok, false)
    assert.equal(result.message.includes('sk-'), false)
    assert.match(result.message, /\[oculto\]/)
  })
})

describe('troca de conta com logout que falha', () => {
  it('não abre o login quando o logout estoura o tempo limite', async () => {
    let loginAberto = false

    const result = await switchOfficialCliAccount('codex', {
      confirmed: true,
      runCommand: async () => ({
        ok: false,
        message: 'codex excedeu o tempo limite de execucao.',
        stdout: '',
        stderr: '',
      }),
      openLogin: () => {
        loginAberto = true
        return { ok: true }
      },
    })

    assert.equal(result.ok, false)
    assert.equal(loginAberto, false)
    assert.equal(result.loggedOut, undefined)
    assert.match(result.message, /tempo limite/i)
  })

  it('avisa que a conta já saiu quando o logout funciona e o login não abre', async () => {
    const result = await switchOfficialCliAccount('codex', {
      confirmed: true,
      runCommand: async () => ({ ok: true, stdout: '', stderr: '' }),
      openLogin: () => ({
        ok: false,
        message: 'Nao foi possivel abrir um terminal.',
        manualCommand: 'codex login',
      }),
    })

    assert.equal(result.ok, false)
    // O logout já aconteceu: esconder isso faria a pessoa achar que nada mudou.
    assert.equal(result.loggedOut, true)
    assert.equal(result.manualCommand, 'codex login')
  })

  it('confirma a troca completa quando logout e login funcionam', async () => {
    const result = await switchOfficialCliAccount('codex', {
      confirmed: true,
      runCommand: async () => ({ ok: true, stdout: '', stderr: '' }),
      openLogin: () => ({ ok: true, command: 'codex', args: ['login'] }),
    })

    assert.equal(result.ok, true)
    assert.equal(result.loggedOut, true)
  })
})

describe('listOfficialCliAccountSessions', () => {
  const sessions = [
    { sessionId: 'canvas:no-1', command: 'codex', cwd: '/projetos/alpha', startedAt: 10 },
    { sessionId: 'canvas:no-2', command: 'claude', cwd: '/projetos/beta', startedAt: 20 },
    { sessionId: 'externo', command: '/usr/local/bin/codex', cwd: '/projetos/gama', startedAt: 30 },
    { sessionId: 'canvas:no-3', command: null, cwd: '/projetos/delta', startedAt: 40 },
  ]

  it('lista apenas as sessões da CLI pedida e expõe o id do elemento', () => {
    const result = listOfficialCliAccountSessions('codex', {
      listSessions: () => sessions,
      platformName: 'linux',
    })

    assert.equal(result.ok, true)
    assert.deepEqual(
      result.sessions.map((session) => session.sessionId),
      ['canvas:no-1', 'externo'],
    )
    assert.equal(result.sessions[0].elementId, 'no-1')
    // Sessão fora do canvas não tem elemento para reiniciar; dizer isso é
    // diferente de inventar um id que a UI tentaria abrir.
    assert.equal(result.sessions[1].elementId, null)
  })

  it('não confunde o shell padrão com a CLI', () => {
    const result = listOfficialCliAccountSessions('codex', {
      listSessions: () => [
        { sessionId: 'canvas:shell', command: null, cwd: '/projetos', startedAt: 1 },
      ],
      platformName: 'linux',
    })

    assert.deepEqual(result.sessions, [])
  })

  it('reconhece os shims .cmd/.exe no Windows', () => {
    const result = listOfficialCliAccountSessions('codex', {
      listSessions: () => [
        {
          sessionId: 'canvas:win',
          command: 'C\\\\Program Files\\\\nodejs\\\\codex.cmd',
          cwd: 'C:/projetos',
          startedAt: 5,
        },
      ],
      platformName: 'win32',
    })

    assert.deepEqual(
      result.sessions.map((session) => session.elementId),
      ['win'],
    )
  })

  it('devolve lista vazia para uma CLI desconhecida', () => {
    const result = listOfficialCliAccountSessions('inexistente', {
      listSessions: () => sessions,
    })

    assert.equal(result.ok, false)
    assert.deepEqual(result.sessions, [])
  })
})

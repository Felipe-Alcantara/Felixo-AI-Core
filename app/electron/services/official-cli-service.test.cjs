const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')

const {
  getOfficialCliAccountStatus,
  installOfficialCli,
  listOfficialCliAccountSessions,
  openOfficialCliLogin,
  parseCodexLoginStatus,
  resolveInstallRuntime,
  runBufferedCommand,
  switchOfficialCliAccount,
} = require('./official-cli-service.cjs')

/**
 * O Python que a máquina de teste teria. Sem isto, a instalação do Openia
 * perguntaria ao `py`/`python3` de quem roda a suíte.
 */
const pythonDisponivel = (command = 'python3') => async () => ({ ok: true, command, version: '3.12' })

describe('official-cli-service', () => {
  it('exige consentimento antes de instalar o código remoto do Openia', async () => {
    let called = false
    const result = await installOfficialCli('openia', {
      runCommand: async () => {
        called = true
        return { ok: true, stdout: '', stderr: '' }
      },
    })

    assert.equal(result.ok, false)
    assert.equal(result.requiresConfirmation, true)
    assert.equal(called, false)
  })

  it('instala o Openia com o Python do sistema e não o npm gerenciado', async () => {
    let invocation
    const result = await installOfficialCli('openia', {
      confirmed: true,
      platformName: 'win32',
      resolveRuntime: pythonDisponivel('py'),
      runCommand: async (options) => {
        invocation = options
        return { ok: true, stdout: 'Successfully installed openia', stderr: '' }
      },
      detect: async () => ({
        detected: true,
        version: '0.1.0',
        path: 'C:/Users/me/AppData/Roaming/Python/Python312/Scripts/openia.exe',
        error: null,
      }),
    })

    assert.equal(result.ok, true)
    assert.equal(result.cli.isLauncher, true)
    assert.equal(result.cli.models.length, 0)
    assert.equal(invocation.command, 'py')
    assert.deepEqual(invocation.args.slice(0, 5), [
      '-m',
      'pip',
      'install',
      '--user',
      '--upgrade',
    ])
  })

  it('repete a instalação com --break-system-packages quando o pip recusa por PEP 668', async () => {
    const invocations = []
    const result = await installOfficialCli('openia', {
      confirmed: true,
      resolveRuntime: pythonDisponivel(),
      runCommand: async (options) => {
        invocations.push(options)
        if (invocations.length === 1) {
          return {
            ok: false,
            stdout: '',
            stderr: 'error: externally-managed-environment\n\n× This environment is externally managed',
          }
        }
        return { ok: true, stdout: 'Successfully installed openia', stderr: '' }
      },
      detect: async () => ({ detected: true, version: '0.1.0', path: '/home/user/.local/bin/openia', error: null }),
    })

    assert.equal(invocations.length, 2)
    assert.equal(invocations[0].args.includes('--break-system-packages'), false)
    assert.equal(invocations[1].args.at(-1), '--break-system-packages')
    assert.equal(result.ok, true)
    assert.equal(result.retriedWithBreakSystemPackages, true)
    assert.match(result.message, /PEP 668/)
  })

  it('não repete quando o pip falha por outro motivo', async () => {
    let calls = 0
    const result = await installOfficialCli('openia', {
      confirmed: true,
      resolveRuntime: pythonDisponivel(),
      runCommand: async () => {
        calls += 1
        return {
          ok: false,
          stdout: '',
          stderr: 'ConnectionError: could not resolve host',
          message: 'python3 encerrou com código 1: ConnectionError: could not resolve host',
        }
      },
      detect: async () => ({ detected: false, version: null, path: null, error: null }),
    })

    assert.equal(calls, 1)
    assert.equal(result.ok, false)
    assert.equal(result.retriedWithBreakSystemPackages, false)
    assert.match(result.message, /ConnectionError/)
  })

  it('devolve mensagem redigida quando o PEP 668 persiste mesmo depois da nova tentativa', async () => {
    const result = await installOfficialCli('openia', {
      confirmed: true,
      resolveRuntime: pythonDisponivel(),
      runCommand: async () => ({
        ok: false,
        stdout: '',
        stderr: 'error: externally-managed-environment',
      }),
      detect: async () => ({ detected: false, version: null, path: null, error: null }),
    })

    assert.equal(result.ok, false)
    assert.equal(result.retriedWithBreakSystemPackages, true)
    assert.match(result.message, /--break-system-packages/)
    assert.match(result.message, /PEP 668/)
  })

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

  it('opens the Openia menu with its Windows executable', () => {
    let launched

    const result = openOfficialCliLogin('openia', {
      platformName: 'win32',
      launchTerminal: (options) => {
        launched = options
        return { ok: true, command: 'openia.exe', args: [] }
      },
    })

    assert.equal(result.ok, true)
    assert.equal(launched.command, 'openia.exe')
    assert.deepEqual(launched.args, [])
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

  it('terminal com conta própria não é afetado pela troca do login do sistema', () => {
    const result = listOfficialCliAccountSessions('codex', {
      listSessions: () => [
        { sessionId: 'canvas:sistema', command: 'codex', cwd: '/p', startedAt: 1, accountId: null },
        { sessionId: 'canvas:perfil', command: 'codex', cwd: '/p', startedAt: 2, accountId: 'conta-trabalho' },
      ],
      platformName: 'linux',
    })

    assert.deepEqual(
      result.sessions.map((session) => session.sessionId),
      ['canvas:sistema'],
    )
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

describe('runBufferedCommand', () => {
  it('marca timedOut quando o prazo vence, sem confundir com erro do executável', async () => {
    const result = await runBufferedCommand({
      command: process.execPath,
      args: ['-e', 'setTimeout(() => {}, 10_000)'],
      timeoutMs: 100,
    })

    assert.equal(result.ok, false)
    assert.equal(result.timedOut, true)
    assert.equal(result.errorCode, undefined)
  })

  it('devolve o errorCode do evento error quando o executável não existe', async () => {
    const result = await runBufferedCommand({
      command: 'felixo-cli-que-nao-existe-7c1d',
      timeoutMs: 5_000,
    })

    assert.equal(result.ok, false)
    assert.equal(result.errorCode, 'ENOENT')
    assert.equal(result.timedOut, undefined)
  })

  it('saída com código diferente de zero continua trazendo o stdout', async () => {
    const result = await runBufferedCommand({
      command: process.execPath,
      args: ['-e', 'process.stdout.write(JSON.stringify({ loggedIn: false })); process.exit(1)'],
      timeoutMs: 5_000,
    })

    assert.equal(result.ok, false)
    assert.deepEqual(JSON.parse(result.stdout), { loggedIn: false })
    assert.equal(result.timedOut, undefined)
    assert.equal(result.errorCode, undefined)
  })
})

// A rota Python (pip) do instalador: runtime, rede, permissão e interrupção. O catálogo tem
// uma CLI instalada assim hoje (Openia); o instalador aceita qualquer comando.
const SAIDA_PIP_SEM_REDE = [
  'Collecting https://github.com/Felipe-Alcantara/Openia/archive/6f75f8f.zip',
  '  WARNING: Retrying (Retry(total=1, connect=None, read=None, redirect=None, status=None)) after connection broken by',
  "'NewConnectionError(<pip._vendor.urllib3.connection.HTTPSConnection object>: Failed to establish a new connection: [Errno 11001] getaddrinfo failed)'",
  "ERROR: Could not install packages due to an OSError: HTTPSConnectionPool(host='github.com', port=443): Max retries exceeded with url",
].join('\n')
const SAIDA_PIP_404 = 'ERROR: HTTP error 404 while getting https://github.com/Felipe-Alcantara/Openia/archive/6f75f8f.zip'
const SAIDA_PIP_PERMISSAO = "PermissionError: [WinError 5] Acesso negado: 'C:\\\\Python314\\\\Lib\\\\site-packages'"
const detectado = async () => ({ detected: true, version: '0.2.1', path: '/home/u/.local/bin/openia', error: null })
const naoDetectado = async () => ({ detected: false, version: null, path: null, error: null })

describe('installOfficialCli: runtime do Python', () => {
  it('usa o comando que a procura achou, não o palpite do catálogo (Python sem o launcher `py`)', async () => {
    let invocation
    const result = await installOfficialCli('openia', {
      confirmed: true,
      platformName: 'win32',
      resolveRuntime: pythonDisponivel('python'),
      runCommand: async (options) => {
        invocation = options
        return { ok: true, stdout: '', stderr: '' }
      },
      detect: detectado,
    })

    assert.equal(result.ok, true)
    assert.equal(invocation.command, 'python')
    assert.deepEqual(invocation.args.slice(0, 3), ['-m', 'pip', 'install'])
  })

  it('pergunta pelo runtime com o que o catálogo declara: Python, versão mínima e o nome da CLI', async () => {
    let pedido
    await installOfficialCli('openia', {
      confirmed: true,
      platformName: 'linux',
      resolveRuntime: async (options) => {
        pedido = options
        return { ok: true, command: 'python3', version: '3.12' }
      },
      runCommand: async () => ({ ok: true, stdout: '', stderr: '' }),
      detect: detectado,
    })

    assert.deepEqual(pedido.runtime, { kind: 'python', minVersion: '3.10' })
    assert.equal(pedido.label, 'Openia (launcher OpenRouter)')
    assert.equal(pedido.platformName, 'linux')
  })

  it('Python ausente, antigo ou sem pip: explica a causa e nem roda o pip', async () => {
    let pipRodou = false
    const result = await installOfficialCli('openia', {
      confirmed: true,
      resolveRuntime: async () => ({
        ok: false,
        reason: 'too-old',
        message: 'O Python mais novo encontrado é o 3.9, mas Openia precisa do 3.10 ou mais novo.',
      }),
      runCommand: async () => {
        pipRodou = true
        return { ok: true, stdout: '', stderr: '' }
      },
      detect: async () => assert.fail('sem instalação não há o que detectar'),
    })

    assert.equal(pipRodou, false)
    assert.equal(result.ok, false)
    assert.equal(result.missingRuntime, 'too-old')
    assert.match(result.message, /3\.9/)
  })

  it('cancelado enquanto procura o Python: devolve cancelled, não "Python ausente"', async () => {
    const controlador = new AbortController()
    const result = await installOfficialCli('openia', {
      confirmed: true,
      signal: controlador.signal,
      resolveRuntime: async () => {
        controlador.abort()
        return { ok: false, reason: 'not-found', message: 'O Python não foi encontrado.' }
      },
      runCommand: async () => assert.fail('cancelado: não deveria instalar'),
    })

    assert.equal(result.ok, false)
    assert.equal(result.cancelled, true)
    assert.equal(result.missingRuntime, undefined)
  })

  it('a procura padrão consulta o Python de verdade desta máquina (ou explica que não há)', async () => {
    const resultado = await resolveInstallRuntime({
      runtime: { kind: 'python', minVersion: '3.0' },
      label: 'o teste',
      platformName: process.platform,
    })

    assert.equal(typeof resultado.ok, 'boolean')
    if (resultado.ok) {
      assert.match(resultado.version, /^3\.\d+$/)
    } else {
      assert.match(resultado.message, /Python/)
    }
  })

  it('um tipo de runtime que o instalador não conhece falha com mensagem, não com exceção', async () => {
    const resultado = await resolveInstallRuntime({ runtime: { kind: 'ruby' }, label: 'x', platformName: 'linux' })

    assert.equal(resultado.ok, false)
    assert.match(resultado.message, /ruby/)
  })
})

describe('installOfficialCli: rede, permissão e interrupção', () => {
  const opcoesBase = {
    confirmed: true,
    platformName: 'linux',
    resolveRuntime: pythonDisponivel(),
    detect: detectado,
  }

  it('repete a queda de rede do pip e termina instalado, dizendo quantas vezes repetiu', async () => {
    const esperas = []
    let chamadas = 0
    const result = await installOfficialCli('openia', {
      ...opcoesBase,
      retry: { delaysMs: [11, 22], sleep: async (ms) => esperas.push(ms) },
      runCommand: async () => {
        chamadas += 1
        return chamadas < 3
          ? { ok: false, stdout: '', stderr: SAIDA_PIP_SEM_REDE, message: 'python3 encerrou com codigo 1' }
          : { ok: true, stdout: 'Successfully installed openia', stderr: '', message: 'Comando concluido.' }
      },
    })

    assert.equal(chamadas, 3)
    assert.deepEqual(esperas, [11, 22])
    assert.equal(result.ok, true)
    assert.equal(result.networkRetries, 2)
  })

  it('com a rede fora o tempo todo desiste na terceira tentativa e a mensagem diz isso', async () => {
    let chamadas = 0
    const result = await installOfficialCli('openia', {
      ...opcoesBase,
      retry: { sleep: async () => {} },
      runCommand: async () => {
        chamadas += 1
        return { ok: false, stdout: '', stderr: SAIDA_PIP_SEM_REDE, message: 'python3 encerrou com codigo 1' }
      },
      detect: naoDetectado,
    })

    assert.equal(chamadas, 3)
    assert.equal(result.ok, false)
    assert.match(result.message, /A rede falhou nas 3 tentativas\.$/)
  })

  it('não repete o que a rede não explica: arquivo inexistente (404) e permissão negada', async () => {
    for (const stderr of [SAIDA_PIP_404, SAIDA_PIP_PERMISSAO]) {
      let chamadas = 0
      const result = await installOfficialCli('openia', {
        ...opcoesBase,
        retry: { sleep: async () => assert.fail('não deveria esperar') },
        runCommand: async () => {
          chamadas += 1
          return { ok: false, stdout: '', stderr, message: 'python3 encerrou com codigo 1' }
        },
        detect: naoDetectado,
      })

      assert.equal(chamadas, 1, stderr)
      assert.equal(result.ok, false)
      assert.equal(result.networkRetries, 0)
    }
  })

  it('não repete quando o pip nem abriu (EACCES no executável é problema da máquina)', async () => {
    let chamadas = 0
    await installOfficialCli('openia', {
      ...opcoesBase,
      retry: { sleep: async () => assert.fail('não deveria esperar') },
      runCommand: async () => {
        chamadas += 1
        return { ok: false, stdout: '', stderr: SAIDA_PIP_SEM_REDE, errorCode: 'EACCES', message: 'spawn python3 EACCES' }
      },
      detect: naoDetectado,
    })

    assert.equal(chamadas, 1)
  })

  it('PEP 668 depois de uma queda de rede: repete a rede, depois repete com --break-system-packages', async () => {
    const argumentos = []
    const respostas = [
      { ok: false, stdout: '', stderr: SAIDA_PIP_SEM_REDE, message: 'falhou' },
      { ok: false, stdout: '', stderr: 'error: externally-managed-environment', message: 'falhou' },
      { ok: true, stdout: 'Successfully installed openia', stderr: '', message: 'Comando concluido.' },
    ]
    const result = await installOfficialCli('openia', {
      ...opcoesBase,
      retry: { sleep: async () => {} },
      runCommand: async ({ args }) => {
        argumentos.push(args)
        return respostas[argumentos.length - 1]
      },
    })

    assert.equal(argumentos.length, 3)
    assert.equal(argumentos[0].includes('--break-system-packages'), false)
    assert.equal(argumentos[1].includes('--break-system-packages'), false)
    assert.equal(argumentos[2].at(-1), '--break-system-packages')
    assert.equal(result.ok, true)
    assert.equal(result.retriedWithBreakSystemPackages, true)
  })

  it('leva o sinal de cancelamento e o prazo de 10 minutos até o processo do pip', async () => {
    const controlador = new AbortController()
    let recebido
    await installOfficialCli('openia', {
      ...opcoesBase,
      signal: controlador.signal,
      runCommand: async (options) => {
        recebido = options
        return { ok: true, stdout: '', stderr: '' }
      },
    })

    assert.equal(recebido.signal, controlador.signal)
    assert.equal(recebido.timeoutMs, 10 * 60 * 1000)
  })

  it('cancelar devolve cancelled sem detectar a CLI nem importar modelos', async () => {
    const controlador = new AbortController()
    const result = await installOfficialCli('openia', {
      ...opcoesBase,
      signal: controlador.signal,
      runCommand: async () => {
        controlador.abort()
        return { ok: false, cancelled: true, stdout: '', stderr: '', message: 'python3 foi cancelado.' }
      },
      detect: async () => assert.fail('cancelado: não há o que detectar'),
    })

    assert.equal(result.ok, false)
    assert.equal(result.cancelled, true)
    assert.match(result.message, /cancelada/)
    assert.equal(result.models, undefined)
  })

  it('cancelar durante a espera entre as tentativas de rede não tenta de novo', async () => {
    const controlador = new AbortController()
    let chamadas = 0
    const result = await installOfficialCli('openia', {
      ...opcoesBase,
      signal: controlador.signal,
      retry: { sleep: async () => controlador.abort() },
      runCommand: async () => {
        chamadas += 1
        return { ok: false, stdout: '', stderr: SAIDA_PIP_SEM_REDE, message: 'falhou' }
      },
      detect: async () => assert.fail('cancelado: não há o que detectar'),
    })

    assert.equal(chamadas, 1)
    assert.equal(result.cancelled, true)
  })
})

describe('runBufferedCommand: árvore de processos, cancelamento e saída', () => {
  function criarFilho(pid = 5151) {
    const filho = new EventEmitter()
    filho.pid = pid
    filho.stdout = Object.assign(new EventEmitter(), { setEncoding() {} })
    filho.stderr = Object.assign(new EventEmitter(), { setEncoding() {} })
    filho.kill = () => assert.fail('interromper deveria matar pela árvore (killTree), não por child.kill')
    return filho
  }

  it('o prazo vencido mata a ÁRVORE do processo, não só o filho direto', async () => {
    const chamadas = []
    const result = await runBufferedCommand({
      command: 'py',
      timeoutMs: 5,
      platformName: 'win32',
      spawn: () => criarFilho(4242),
      killTree: async (options) => chamadas.push(options),
    })

    assert.equal(result.ok, false)
    assert.equal(result.timedOut, true)
    assert.deepEqual(chamadas, [{ pid: 4242, platformName: 'win32' }])
  })

  it('nasce detached no POSIX, para o kill de grupo alcançar os netos; no Windows não', () => {
    for (const [platformName, esperado] of [['linux', true], ['darwin', true], ['win32', false]]) {
      let opcoes
      void runBufferedCommand({
        command: 'py',
        platformName,
        spawn: (_comando, _args, options) => {
          opcoes = options
          const filho = criarFilho()
          setImmediate(() => filho.emit('close', 0, null))
          return filho
        },
      })

      assert.equal(opcoes.detached, esperado, `platformName=${platformName}`)
    }
  })

  it('cancelar mata a árvore e devolve cancelled:true', async () => {
    const controlador = new AbortController()
    const chamadas = []
    const promessa = runBufferedCommand({
      command: 'python3',
      signal: controlador.signal,
      spawn: () => criarFilho(9911),
      killTree: async (options) => chamadas.push(options.pid),
    })

    controlador.abort()
    const result = await promessa

    assert.equal(result.ok, false)
    assert.equal(result.cancelled, true)
    assert.equal(result.timedOut, undefined)
    assert.match(result.message, /cancelado/)
    assert.deepEqual(chamadas, [9911])
  })

  it('já cancelado antes de começar: nem nasce o processo', async () => {
    const controlador = new AbortController()
    controlador.abort()
    const result = await runBufferedCommand({
      command: 'python3',
      signal: controlador.signal,
      spawn: () => assert.fail('não deveria criar o processo'),
    })

    assert.equal(result.ok, false)
    assert.equal(result.cancelled, true)
  })

  // Mesmo defeito que o instalador do npm teve no macOS e no Ubuntu: o SIGTERM derruba o filho
  // na hora e o `close` chega enquanto o `killProcessTree` ainda espera a graça do SIGKILL.
  describe('quando o processo fecha durante o kill da árvore', () => {
    async function interrompidoPor({ timeoutMs, abortar }) {
      const controlador = new AbortController()
      const eventos = []
      let filho

      const promessa = runBufferedCommand({
        command: 'python3',
        signal: controlador.signal,
        ...(timeoutMs ? { timeoutMs } : {}),
        spawn: () => {
          filho = criarFilho(7001)
          return filho
        },
        killTree: async () => {
          eventos.push('kill-comecou')
          filho.emit('close', null, 'SIGTERM')
          await new Promise((resolve) => setTimeout(resolve, 20))
          eventos.push('kill-terminou')
        },
      })

      if (abortar) controlador.abort()
      const result = await promessa
      eventos.push('resolveu')
      return { result, eventos }
    }

    it('cancelar devolve cancelled:true e só resolve depois de o kill terminar', async () => {
      const { result, eventos } = await interrompidoPor({ abortar: true })

      assert.equal(result.cancelled, true)
      assert.deepEqual(eventos, ['kill-comecou', 'kill-terminou', 'resolveu'])
    })

    it('o prazo diz que passou do tempo, não "sinal SIGTERM", e só resolve depois do kill', async () => {
      const { result, eventos } = await interrompidoPor({ timeoutMs: 5 })

      assert.equal(result.timedOut, true)
      assert.doesNotMatch(result.message, /SIGTERM|codigo/)
      assert.deepEqual(eventos, ['kill-comecou', 'kill-terminou', 'resolveu'])
    })
  })

  it('um killTree que rejeita não deixa a chamada pendurada', async () => {
    const controlador = new AbortController()
    const promessa = runBufferedCommand({
      command: 'python3',
      signal: controlador.signal,
      spawn: () => criarFilho(7002),
      killTree: async () => {
        throw new Error('taskkill não existe')
      },
    })

    controlador.abort()

    assert.equal((await promessa).cancelled, true)
  })

  it('cancelar DEPOIS de terminar não muda o resultado nem mata nada', async () => {
    const controlador = new AbortController()
    const result = await runBufferedCommand({
      command: 'python3',
      signal: controlador.signal,
      spawn: () => {
        const filho = criarFilho()
        setImmediate(() => filho.emit('close', 0, null))
        return filho
      },
      killTree: async () => assert.fail('o processo já tinha terminado'),
    })

    controlador.abort()

    assert.equal(result.ok, true)
  })

  it('executável sem permissão (EACCES ao abrir) volta com o errorCode, sem confundir com rede', async () => {
    const result = await runBufferedCommand({
      command: 'instalar.sh',
      spawn: () => {
        const filho = criarFilho()
        setImmediate(() => filho.emit('error', Object.assign(new Error('spawn instalar.sh EACCES'), { code: 'EACCES' })))
        return filho
      },
    })

    assert.equal(result.ok, false)
    assert.equal(result.errorCode, 'EACCES')
    assert.equal(result.timedOut, undefined)
  })

  it('o aviso [notice] do pip, que vem depois do erro, não toma o lugar dele na mensagem', async () => {
    const result = await runBufferedCommand({
      command: process.execPath,
      args: [
        '-e',
        "process.stderr.write('ERROR: Could not install packages\\n\\n[notice] A new release of pip is available: 25.3 -> 26.2.2\\n[notice] To update, run: python.exe -m pip install --upgrade pip\\n'); process.exitCode = 1",
      ],
      timeoutMs: 20_000,
    })

    assert.match(result.message, /Could not install packages$/)
    assert.doesNotMatch(result.message, /notice|new release/)
  })

  it('saída maior que o limite fica com o FIM, onde o pip e o npm põem o erro final', async () => {
    const result = await runBufferedCommand({
      command: process.execPath,
      args: [
        '-e',
        // `exitCode`, não `exit()`: no POSIX a escrita num pipe é assíncrona e `exit()` cortaria o fim
        // da saída (visto no CI do Ubuntu e do macOS); no Windows ela é síncrona e esconderia isso.
        "process.stderr.write('barulho de progresso\\n'.repeat(20000)); process.stderr.write('ERROR: ECONNRESET no fim'); process.exitCode = 1",
      ],
      timeoutMs: 20_000,
    })

    assert.equal(result.ok, false)
    assert.ok(result.stderr.length <= 12000, `guardou ${result.stderr.length} caracteres`)
    assert.ok(result.stderr.endsWith('ERROR: ECONNRESET no fim'))
    assert.match(result.message, /ECONNRESET no fim$/, 'a mensagem mostra o fim da saída, não o começo')
  })
})

'use strict'

const nodeTest = require('node:test')
const assert = require('node:assert/strict')
const {
  CREATED_GRACE_MS,
  FOLLOW_UP_TIMEOUT_MS,
  LAUNCH_TIMEOUT_MS,
  createCloudSessionService,
  describeCloudSessionEvent,
} = require('./cloud-session-service.cjs')
const { parseWindowsCommandLine } = require('./test-support/parse-windows-command-line.cjs')

// Um disparo que nunca recebe saída ficaria esperando para sempre; com o
// teto curto, uma regressão (ex.: sem a trava do nó) falha em segundos.
const test = (name, fn) => nodeTest(name, { timeout: 3000 }, fn)

const ID = 'session_01EXEMPLO0000000000000000'
const URL_OK = `https://claude.ai/code/${ID}?from=cli&m=0`
const SUCCESS = [
  'Created cloud session: Resposta sem alterações',
  `View: ${URL_OK}`,
  `Resume with: claude --teleport ${ID}`,
  '',
].join('\r\n')
const TRUST_SCREEN = `Quick safety check: Is this a project you created or one you trust?\r\nYes, I trust this folder`
const CWD = 'P:\\Programação\\Github\\Repositórios\\Meus repositórios\\Projeto'

/** PTY falso: o teste dispara `data` e `exit` à mão. */
function createFakePty() {
  const handlers = { data: [], exit: [] }
  const pty = {
    killed: 0,
    onData: (callback) => handlers.data.push(callback),
    onExit: (callback) => handlers.exit.push(callback),
    kill() {
      pty.killed += 1
    },
  }
  return {
    pty,
    emit: (chunk) => handlers.data.forEach((callback) => callback(chunk)),
    emitInChunks(text, size = 7) {
      for (let at = 0; at < text.length; at += size) {
        handlers.data.forEach((callback) => callback(text.slice(at, at + size)))
      }
    },
    exit: (exitCode = 0) => handlers.exit.forEach((callback) => callback({ exitCode })),
  }
}

/** Relógio manual: `advance` dispara o que venceu. */
function createFakeTimers() {
  let now = 0
  let nextId = 0
  const pending = new Map()
  return {
    setTimeoutFn(callback, ms) {
      nextId += 1
      pending.set(nextId, { callback, at: now + ms })
      return nextId
    },
    clearTimeoutFn: (id) => pending.delete(id),
    advance(ms) {
      now += ms
      for (const [id, timer] of [...pending]) {
        if (timer.at <= now) {
          pending.delete(id)
          timer.callback()
        }
      }
    },
    get pendingCount() {
      return pending.size
    },
  }
}

function setup(overrides = {}) {
  const ptys = []
  const spawns = []
  const execs = []
  const timers = createFakeTimers()
  const service = createCloudSessionService({
    spawnPty(file, args, options) {
      const fake = createFakePty()
      ptys.push(fake)
      spawns.push({ file, args, options })
      return fake.pty
    },
    execFile(file, args, options, callback) {
      const record = { file, args, options, callback, stdinEnded: 0 }
      execs.push(record)
      return { stdin: { end: () => (record.stdinEnded += 1) } }
    },
    resolveProfileEnv: () => ({}),
    createBaseEnv: () => ({ PATH: 'C:\\base', ANTHROPIC_API_KEY: 'sk-ant-api03-segredo', anthropic_auth_token: 'tok' }),
    resolveClaude: () => ({ command: 'C:\\npm\\claude.exe', viaShell: false }),
    platform: { name: 'win32' },
    fsApi: { statSync: (target) => ({ isDirectory: () => target === CWD || target === '/tmp/x' }) },
    setTimeoutFn: timers.setTimeoutFn,
    clearTimeoutFn: timers.clearTimeoutFn,
    ...overrides,
  })
  return { service, ptys, spawns, execs, timers }
}

const input = (extra = {}) => ({ nodeId: 'no-1', task: 'Corrigir o bug', cwd: CWD, ...extra })

test('launch cria o PTY com --cloud e a tarefa como argv, na pasta certa e sem credenciais herdadas', async () => {
  const { service, spawns, ptys } = setup()

  const pending = service.launch(input({ task: 'Linha 1\nLinha "2" com %PATH% & emoji' }))
  ptys[0].emitInChunks(SUCCESS)
  const result = await pending

  // No Windows o PTY recebe a linha de comando já montada; o parser do sistema
  // a separa de volta em exatamente --cloud e a tarefa.
  assert.deepEqual(parseWindowsCommandLine(spawns[0].args), [
    '--cloud',
    'Linha 1\nLinha "2" com %PATH% & emoji',
  ])
  assert.equal(spawns[0].file, 'C:\\npm\\claude.exe')
  assert.equal(spawns[0].options.cwd, CWD)
  assert.equal(spawns[0].options.cols, 120)
  assert.equal(spawns[0].options.env.PATH, 'C:\\base')
  assert.equal('ANTHROPIC_API_KEY' in spawns[0].options.env, false)
  assert.equal('anthropic_auth_token' in spawns[0].options.env, false)
  assert.deepEqual(result, {
    ok: true,
    session: { id: ID, url: URL_OK, title: 'Resposta sem alterações' },
  })
})

test('launch junta ao ambiente as variáveis do perfil da conta escolhida', async () => {
  const chamadas = []
  const { service, spawns, ptys } = setup({
    resolveProfileEnv: (accountId) => {
      chamadas.push(accountId)
      return { CLAUDE_CONFIG_DIR: 'C:\\perfis\\conta-a' }
    },
  })

  const pending = service.launch(input({ accountId: 'conta-a' }))
  ptys[0].emit(SUCCESS)
  await pending

  assert.deepEqual(chamadas, ['conta-a'])
  assert.equal(spawns[0].options.env.CLAUDE_CONFIG_DIR, 'C:\\perfis\\conta-a')
})

test('dois launch do mesmo nó executam uma vez e o segundo devolve busy', async () => {
  const { service, spawns, ptys } = setup()

  const primeiro = service.launch(input())
  const segundo = service.launch(input())
  // Sem a trava o segundo disparo ficaria pendente esperando um PTY; a corrida
  // faz o teste falhar na hora em vez de travar. O `setImmediate` só vence
  // depois de todas as microtarefas, então não depende de quantas camadas
  // `async` existem entre a chamada e o resultado.
  const resposta = await Promise.race([
    segundo,
    new Promise((resolve) => setImmediate(() => resolve({ code: 'pendente: criou outro PTY' }))),
  ])
  ptys[0].emit(SUCCESS)

  assert.equal(resposta.code, 'busy')
  assert.equal(spawns.length, 1)
  assert.equal((await primeiro).ok, true)
})

test('a trava do nó é liberada depois do fim e nós diferentes rodam em paralelo', async () => {
  const { service, spawns, ptys } = setup()

  const a = service.launch(input({ nodeId: 'a' }))
  const b = service.launch(input({ nodeId: 'b' }))
  ptys[0].emit(SUCCESS)
  ptys[1].emit(SUCCESS)
  await Promise.all([a, b])
  const denovo = service.launch(input({ nodeId: 'a' }))
  ptys[2].emit(SUCCESS)

  assert.equal(spawns.length, 3)
  assert.equal((await denovo).ok, true)
})

test('launch devolve trust-required e encerra o PTY quando a tela de confiança aparece', async () => {
  const { service, ptys } = setup()

  const pending = service.launch(input())
  ptys[0].emit(TRUST_SCREEN)
  const result = await pending

  assert.deepEqual({ ok: result.ok, code: result.code }, { ok: false, code: 'trust-required' })
  assert.equal(ptys[0].pty.killed, 1)
})

test('launch estoura o tempo em 60 s, encerra o PTY e libera o nó', async () => {
  const { service, ptys, timers } = setup()

  const pending = service.launch(input())
  timers.advance(LAUNCH_TIMEOUT_MS)
  const result = await pending

  assert.deepEqual({ ok: result.ok, code: result.code }, { ok: false, code: 'timeout' })
  assert.equal(ptys[0].pty.killed, 1)
  // A trava foi liberada: um novo disparo do mesmo nó cria outro PTY.
  const segundo = service.launch(input())
  ptys[1].emit(SUCCESS)
  assert.equal((await segundo).ok, true)
})

test('launch com saída desconhecida e código de saída vira unknown com o rastro sem segredo', async () => {
  const { service, ptys } = setup()

  const pending = service.launch(input())
  ptys[0].emit('algo inesperado\r\nANTHROPIC_API_KEY=sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789\r\n')
  ptys[0].exit(1)
  const result = await pending

  assert.equal(result.code, 'unknown')
  assert.match(result.message, /algo inesperado/)
  assert.doesNotMatch(result.message, /sk-ant-api03/)
})

test('launch classifica login ausente que o CLI imprime antes de sair', async () => {
  const { service, ptys } = setup()

  const pending = service.launch(input())
  ptys[0].emit('Not logged in · Please run /login\r\n')
  const result = await pending

  assert.deepEqual({ ok: result.ok, code: result.code }, { ok: false, code: 'login-required' })
})

test('launch aceita a última linha sem quebra quando o processo sai', async () => {
  const { service, ptys } = setup()

  const pending = service.launch(input())
  ptys[0].emit(SUCCESS.trimEnd())
  ptys[0].exit(0)
  const result = await pending

  assert.equal(result.ok, true)
  assert.equal(result.session.id, ID)
})

test('launch deixa o CLI terminar sozinho e só o encerra depois da tolerância', async () => {
  const { service, ptys, timers } = setup()

  const pending = service.launch(input())
  ptys[0].emit(SUCCESS)
  await pending
  assert.equal(ptys[0].pty.killed, 0)
  timers.advance(CREATED_GRACE_MS)

  assert.equal(ptys[0].pty.killed, 1)
})

test('launch recusa entrada inválida sem criar PTY', async () => {
  const { service, spawns } = setup()

  const vazia = await service.launch(input({ task: '   ' }))
  const semPasta = await service.launch(input({ cwd: '/nao/existe' }))

  assert.deepEqual([vazia.code, semPasta.code], ['invalid-input', 'invalid-input'])
  assert.equal(spawns.length, 0)
})

test('sem o claude nativo, tarefa com caractere que o cmd reinterpreta é recusada sem criar PTY', async () => {
  const { service, spawns } = setup({ resolveClaude: () => ({ command: 'claude', viaShell: true }) })

  const result = await service.launch(input({ task: 'rodar %PATH% & apagar' }))

  assert.deepEqual({ ok: result.ok, code: result.code }, { ok: false, code: 'invalid-input' })
  assert.equal(spawns.length, 0)
})

test('conta inexistente vira invalid-input com a mensagem do cadastro de contas', async () => {
  const { service, spawns } = setup({
    resolveProfileEnv: () => {
      throw new Error('A conta selecionada não existe mais.')
    },
  })

  const result = await service.launch(input({ accountId: 'sumiu' }))

  assert.deepEqual({ code: result.code, message: result.message }, {
    code: 'invalid-input',
    message: 'A conta selecionada não existe mais.',
  })
  assert.equal(spawns.length, 0)
})

test('falha ao criar o PTY vira unknown e libera o nó', async () => {
  let tentativas = 0
  const { service } = setup({
    spawnPty() {
      tentativas += 1
      throw new Error('spawn falhou')
    },
  })

  const primeiro = await service.launch(input())
  const segundo = await service.launch(input())

  assert.equal(primeiro.code, 'unknown')
  assert.equal(segundo.code, 'unknown')
  assert.equal(tentativas, 2)
})

test('followUp roda claude -p com a mensagem como argv, fecha o stdin e confirma o envio', async () => {
  const { service, execs } = setup()

  const pending = service.followUp({ nodeId: 'no-1', sessionId: ID, text: 'Agora responda "pronto" & 50%', cwd: CWD })
  assert.deepEqual(execs[0].args, ['-p', 'Agora responda "pronto" & 50%', '--cloud', ID])
  assert.equal(execs[0].file, 'C:\\npm\\claude.exe')
  assert.equal(execs[0].options.cwd, CWD)
  assert.equal(execs[0].options.timeout, FOLLOW_UP_TIMEOUT_MS)
  assert.equal('ANTHROPIC_API_KEY' in execs[0].options.env, false)
  assert.equal(execs[0].stdinEnded, 1)
  execs[0].callback(null, `Sent to cloud session.\r\nSession ID: ${ID}\r\n`, '')

  assert.deepEqual(await pending, { ok: true })
})

test('followUp sem a confirmação do CLI devolve o erro classificado', async () => {
  const { service, execs } = setup()

  const pending = service.followUp({ nodeId: 'no-1', sessionId: ID, text: 'oi', cwd: CWD })
  execs[0].callback(null, '', 'Not logged in · Please run /login\n')
  const result = await pending

  assert.deepEqual({ ok: result.ok, code: result.code }, { ok: false, code: 'login-required' })
})

test('followUp que estoura o tempo devolve timeout', async () => {
  const { service, execs } = setup()

  const pending = service.followUp({ nodeId: 'no-1', sessionId: ID, text: 'oi', cwd: CWD })
  execs[0].callback(Object.assign(new Error('timeout'), { killed: true }), '', '')

  assert.equal((await pending).code, 'timeout')
})

test('followUp recusa ID de sessão inválido sem executar nada', async () => {
  const { service, execs } = setup()

  const result = await service.followUp({ nodeId: 'no-1', sessionId: 'x; rm -rf /', text: 'oi', cwd: CWD })

  assert.equal(result.code, 'invalid-input')
  assert.equal(execs.length, 0)
})

test('followUp e launch do mesmo nó não rodam ao mesmo tempo', async () => {
  const { service, execs, spawns } = setup()

  const followUp = service.followUp({ nodeId: 'no-1', sessionId: ID, text: 'oi', cwd: CWD })
  const launch = await service.launch(input())
  execs[0].callback(null, 'Sent to cloud session.', '')
  await followUp

  assert.equal(launch.code, 'busy')
  assert.equal(spawns.length, 0)
})

test('dispose encerra os PTY que ainda estão vivos', async () => {
  const { service, ptys } = setup()

  const pending = service.launch(input())
  service.dispose()
  const result = await pending

  assert.equal(ptys[0].pty.killed, 1)
  assert.equal(result.ok, false)
})

// --- Observabilidade (DESIGN_SYSTEM_BACKEND §9.2) ---------------------------

/** Relógio que avança 250 ms a cada leitura: a duração de uma operação é sempre 250. */
function steppingClock() {
  let t = 1000
  return () => (t += 250)
}

test('onEvent recebe o disparo bem-sucedido com a duração, sem a tarefa nem a pasta', async () => {
  const events = []
  const { service, ptys } = setup({ onEvent: (event) => events.push(event), now: steppingClock() })

  const pending = service.launch(input({ task: 'Tarefa privada do cliente' }))
  ptys[0].emit(SUCCESS)
  await pending

  assert.deepEqual(events, [{ operation: 'launch', ok: true, durationMs: 250 }])
  const serialized = JSON.stringify(events)
  assert.doesNotMatch(serialized, /Tarefa privada|Programação|session_01EXEMPLO/)
})

test('onEvent recebe a falha do disparo com o código classificado', async () => {
  const events = []
  const { service, ptys } = setup({ onEvent: (event) => events.push(event), now: steppingClock() })

  const pending = service.launch(input())
  ptys[0].emit(TRUST_SCREEN)
  await pending

  assert.deepEqual(events, [{ operation: 'launch', ok: false, code: 'trust-required', durationMs: 250 }])
})

test('onEvent recebe o follow-up com a operação follow-up', async () => {
  const events = []
  const { service, execs } = setup({ onEvent: (event) => events.push(event), now: steppingClock() })

  const pending = service.followUp({ nodeId: 'no-1', sessionId: ID, text: 'segredo do cliente', cwd: CWD })
  execs[0].callback(null, 'Sent to cloud session.', '')
  await pending

  assert.deepEqual(events, [{ operation: 'follow-up', ok: true, durationMs: 250 }])
  assert.doesNotMatch(JSON.stringify(events), /segredo do cliente|session_01EXEMPLO/)
})

test('onEvent não registra busy nem entrada inválida: são ruído de uso, não falha de integração', async () => {
  const events = []
  const { service, ptys } = setup({ onEvent: (event) => events.push(event), now: steppingClock() })

  const primeiro = service.launch(input())
  await service.launch(input()) // busy
  await service.launch(input({ nodeId: 'outro', task: '   ' })) // entrada inválida
  ptys[0].emit(SUCCESS)
  await primeiro

  assert.deepEqual(events.map((event) => event.ok), [true])
})

test('um onEvent que lança nunca muda o resultado do disparo', async () => {
  const { service, ptys } = setup({
    onEvent: () => {
      throw new Error('log quebrado')
    },
  })

  const pending = service.launch(input())
  ptys[0].emit(SUCCESS)
  const result = await pending

  assert.equal(result.ok, true)
})

test('describeCloudSessionEvent traduz o evento em nível, mensagem neutra e detalhes sem conteúdo privado', () => {
  assert.deepEqual(describeCloudSessionEvent({ operation: 'launch', ok: true, durationMs: 250 }), {
    level: 'info',
    message: 'Sessão na nuvem criada em 250 ms.',
    details: { operation: 'launch', durationMs: 250 },
  })
  assert.deepEqual(describeCloudSessionEvent({ operation: 'launch', ok: false, code: 'trust-required', durationMs: 90 }), {
    level: 'warn',
    message: 'Falha ao criar a sessão na nuvem (trust-required) após 90 ms.',
    details: { operation: 'launch', code: 'trust-required', durationMs: 90 },
  })
  assert.equal(describeCloudSessionEvent({ operation: 'follow-up', ok: false, code: 'timeout', durationMs: 1 }).level, 'error')
  assert.equal(describeCloudSessionEvent({ operation: 'follow-up', ok: false, code: 'unknown', durationMs: 1 }).level, 'error')
  assert.equal(describeCloudSessionEvent({ operation: 'follow-up', ok: false, code: 'login-required', durationMs: 1 }).level, 'warn')
  assert.match(describeCloudSessionEvent({ operation: 'follow-up', ok: true, durationMs: 5 }).message, /Mensagem enviada/)
})

// --- Argumentos chegam como argv, em cada plataforma (achado da revisão #1) --


test('no Windows o PTY recebe uma linha de comando que o parser do sistema separa em exatamente --cloud e a tarefa', async () => {
  // O node-pty não cita um argumento que começa e termina com aspas; sem a nossa
  // montagem, o --settings abaixo viraria uma opção do claude.
  const tarefa = '"Corrija o bug" --settings={"apiKeyHelper":"x"} "e pronto"'
  const { service, spawns, ptys } = setup()

  const pending = service.launch(input({ task: tarefa }))
  ptys[0].emit(SUCCESS)
  await pending

  assert.equal(typeof spawns[0].args, 'string')
  assert.deepEqual(parseWindowsCommandLine(spawns[0].args), ['--cloud', tarefa])
})

test('fora do Windows o PTY recebe o argv como lista, sem montar linha de comando', async () => {
  const { service, spawns, ptys } = setup({
    platform: { name: 'linux' },
    resolveClaude: () => ({ command: 'claude', viaShell: false }),
  })

  const pending = service.launch(input({ task: 'Linha 1\nLinha "2" com %PATH% & emoji' }))
  ptys[0].emit(SUCCESS)
  await pending

  assert.equal(spawns[0].file, 'claude')
  assert.deepEqual(spawns[0].args, ['--cloud', 'Linha 1\nLinha "2" com %PATH% & emoji'])
})

test('o follow-up no Windows continua como lista para o execFile, que cita corretamente', async () => {
  const { service, execs } = setup()

  const pending = service.followUp({ nodeId: 'no-1', sessionId: ID, text: '"entre aspas" e mais', cwd: CWD })
  execs[0].callback(null, 'Sent to cloud session.', '')
  await pending

  assert.deepEqual(execs[0].args, ['-p', '"entre aspas" e mais', '--cloud', ID])
})

// --- macOS: o texto viaja por variável de ambiente, nunca pelo escape do shell -

const MAC = { name: 'darwin', getDefaultShell: () => '/bin/zsh', escapeArg: (value) => `'${value}'` }
const TAREFA_PERIGOSA = 'Linha 1\nLinha "2" $(rm -rf ~) `x`'

test('no macOS o PTY roda o shell de login e o texto da tarefa só aparece nas variáveis', async () => {
  const { service, spawns, ptys } = setup({
    platform: MAC,
    resolveClaude: () => ({ command: 'claude', viaShell: false }),
  })

  const pending = service.launch(input({ task: TAREFA_PERIGOSA }))
  ptys[0].emit(SUCCESS)
  await pending

  assert.equal(spawns[0].file, '/bin/zsh')
  assert.deepEqual(spawns[0].args, ['-l', '-i', '-c', 'exec \'claude\' "${FELIXO_ARG_0}" "${FELIXO_ARG_1}"'])
  assert.doesNotMatch(spawns[0].args.join(' '), /Linha 1|rm -rf/)
  assert.equal(spawns[0].options.env.FELIXO_ARG_0, '--cloud')
  assert.equal(spawns[0].options.env.FELIXO_ARG_1, TAREFA_PERIGOSA)
  assert.equal('ANTHROPIC_API_KEY' in spawns[0].options.env, false)
})

test('no macOS o follow-up usa o shell de login sem modo interativo (não há TTY) e as variáveis', async () => {
  const { service, execs } = setup({
    platform: MAC,
    resolveClaude: () => ({ command: 'claude', viaShell: false }),
  })

  const pending = service.followUp({ nodeId: 'no-1', sessionId: ID, text: TAREFA_PERIGOSA, cwd: CWD })
  execs[0].callback(null, 'Sent to cloud session.', '')
  await pending

  assert.equal(execs[0].file, '/bin/zsh')
  assert.deepEqual(execs[0].args, [
    '-l',
    '-c',
    'exec \'claude\' "${FELIXO_ARG_0}" "${FELIXO_ARG_1}" "${FELIXO_ARG_2}" "${FELIXO_ARG_3}"',
  ])
  assert.deepEqual(
    [0, 1, 2, 3].map((index) => execs[0].options.env[`FELIXO_ARG_${index}`]),
    ['-p', TAREFA_PERIGOSA, '--cloud', ID],
  )
})

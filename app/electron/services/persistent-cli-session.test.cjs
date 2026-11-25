require('../../scripts/test-support/pasta-do-teste.cjs') // isola o temporário deste arquivo (ver pasta-do-teste.cjs)
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

// Este módulo mantém o estado das sessões dentro do factory e depende de
// processo, adapter e streams reais, o que torna caro montar um harness
// completo só para o ciclo de vida dos timers. O teste abaixo é estrutural:
// vigia a invariante que o bug violou, que é barata de verificar por leitura
// e cara de descobrir em produção.
const SOURCE = fs.readFileSync(
  path.join(__dirname, 'persistent-cli-session.cjs'),
  'utf8',
)

/** Corpo de uma função de nível superior do módulo, por chaves balanceadas. */
function corpoDaFuncao(fonte, nome) {
  const inicio = fonte.indexOf(`function ${nome}(`)
  assert.notEqual(inicio, -1, `função ${nome} não encontrada`)

  // Começa depois da lista de parâmetros, senão um default como
  // `options = {}` abriria e fecharia chave antes do corpo de verdade.
  const abreCorpo = fonte.indexOf(') {', inicio)
  assert.notEqual(abreCorpo, -1, `não achei o início do corpo de ${nome}`)

  let profundidade = 0
  for (let i = abreCorpo + 2; i < fonte.length; i += 1) {
    if (fonte[i] === '{') profundidade += 1
    if (fonte[i] === '}') {
      profundidade -= 1
      if (profundidade === 0) return fonte.slice(inicio, i + 1)
    }
  }
  throw new Error(`não consegui delimitar o corpo de ${nome}`)
}

test('as funções que encerram a sessão cancelam o fallback de prompt', () => {
  // Os dois timers pertencem ao mesmo `activeRun`. Nos caminhos de
  // encerramento eles têm de morrer juntos: limpar só o da execução deixava o
  // fallback agendado sobreviver, e ao disparar ele escrevia num stdin já
  // morto — o write falhava e a UI recebia um erro espúrio segundos depois de
  // a thread ter sido parada pelo usuário.
  //
  // A verificação é por função inteira, não por proximidade de linha: nem todo
  // `clearPersistentRunTimer` encerra a execução (em `handlePersistentEvent`
  // ele só marca que houve saída visível, com o prompt ainda por enviar, e ali
  // cancelar o fallback quebraria o fluxo).
  for (const nome of ['handlePersistentClose', 'closePersistentSession', 'failPersistentRun']) {
    const corpo = corpoDaFuncao(SOURCE, nome)
    assert.ok(
      corpo.includes('clearDeferredPromptFallback('),
      `${nome} encerra a execução mas não cancela o fallback de prompt`,
    )
  }
})

test('cada caminho de saída de handlePersistentClose cancela o fallback', () => {
  // A função tem retornos antecipados; um deles esquecido reintroduz o bug.
  const corpo = corpoDaFuncao(SOURCE, 'handlePersistentClose')
  const cancelamentos = corpo.match(/clearDeferredPromptFallback\(/g) ?? []

  assert.ok(
    cancelamentos.length >= 2,
    `esperava um cancelamento por caminho de saída, encontrei ${cancelamentos.length}`,
  )
})

test('o fallback de prompt é sempre cancelado antes de ser reagendado', () => {
  // Reagendar sem cancelar perderia a referência do timer anterior, que
  // seguiria vivo sem ninguém para pará-lo.
  const agendamentos = SOURCE.split('\n').filter((linha) =>
    linha.includes('deferredPromptFallbackTimer = setTimeout('),
  )

  assert.equal(
    agendamentos.length,
    1,
    'há mais de um ponto agendando o fallback — cada um precisaria cancelar o anterior',
  )
  assert.match(
    SOURCE,
    /!activeRun\.deferredPromptFallbackTimer/,
    'o agendamento deveria ser guardado por uma checagem de timer já existente',
  )
})

// ── Conta do chat no processo persistente (15/11/2026) ───────────────────────

test('o processo persistente só é reaproveitado na mesma conta; trocar de conta abre outro com o ambiente dela', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const { EventEmitter } = require('node:events')
  const { PassThrough } = require('node:stream')
  const { createPersistentCliSessionManager } = require('./persistent-cli-session.cjs')

  const spawns = []
  const live = new Set()
  const cliManager = {
    spawn(threadId, command, args, cwd, options) {
      spawns.push({ threadId, env: options.env ?? null })
      live.add(threadId)
      const child = new EventEmitter()
      child.stdout = new PassThrough()
      child.stderr = new PassThrough()
      child.pid = spawns.length
      return child
    },
    has: (threadId) => live.has(threadId),
    write: () => true,
    kill(threadId) {
      live.delete(threadId)
      return true
    },
  }
  const manager = createPersistentCliSessionManager({
    cliManager,
    stoppedSessions: new Set(),
    sendTerminalEvents: () => {},
    sendCliEvent: () => {},
    recordModelAvailabilityEvent: () => null,
  })
  const adapter = {
    getPersistentSpawnArgs: () => ({ command: 'cli-falsa', args: [] }),
    createPersistentInput: () => ({ input: 'prompt\n', didStartSession: true, didSendPrompt: true }),
  }
  const model = { id: 'm', name: 'Modelo', cliType: 'codex-app-server' }
  const contaA = { accountId: 'codex-a', label: 'Pessoal', env: { CODEX_HOME: '/perfis/a' } }
  const contaB = { accountId: 'codex-b', label: 'Trabalho', env: { CODEX_HOME: '/perfis/b' } }
  const send = (account) =>
    manager.sendPersistentCliRequest({
      adapter,
      targetWebContents: null,
      streamSessionId: 's',
      threadId: 'thread-1',
      prompt: 'oi',
      context: { isContinuation: false },
      threadSession: {},
      cliType: 'codex-app-server',
      model,
      cwd: '/projeto',
      orchestrationBridge: null,
      orchestrationContext: {},
      account,
    })

  assert.equal(send(contaA).ok, true)
  assert.deepEqual(spawns.map((item) => item.env), [{ CODEX_HOME: '/perfis/a' }])
  assert.equal(manager.canReusePersistentSession('thread-1', model, '/projeto', 'codex-a'), true)
  assert.equal(manager.canReusePersistentSession('thread-1', model, '/projeto', 'codex-b'), false)
  assert.equal(manager.canReusePersistentSession('thread-1', model, '/projeto', null), false)

  // Mesma conta: o processo vivo continua sendo o da conversa (ainda ocupado, não abre outro).
  assert.equal(send(contaA).ok, false)
  assert.equal(spawns.length, 1)

  // Outra conta: o processo da anterior fecha e o novo nasce com o ambiente dela.
  assert.equal(send(contaB).ok, true)
  assert.deepEqual(spawns.map((item) => item.env), [{ CODEX_HOME: '/perfis/a' }, { CODEX_HOME: '/perfis/b' }])

  // Login do sistema: sem ambiente próprio (o cliManager usa o de sempre).
  assert.equal(send(null).ok, true)
  assert.equal(spawns[2].env, null)
  manager.closePersistentSession('thread-1', { force: true })
})

// ── Ações sensíveis e custo por resposta (16/11/2026) ───────────────────────

function permissionHarness(t) {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const { EventEmitter } = require('node:events')
  const { PassThrough } = require('node:stream')
  const { createPersistentCliSessionManager } = require('./persistent-cli-session.cjs')

  const writes = []
  const events = []
  const children = []
  const live = new Set()
  let clock = Date.parse('2026-11-16T03:00:00.000Z')
  let ids = 0
  const cliManager = {
    spawn(threadId) {
      live.add(threadId)
      const child = new EventEmitter()
      child.stdout = new PassThrough()
      child.stderr = new PassThrough()
      children.push(child)
      return child
    },
    has: (threadId) => live.has(threadId),
    write(threadId, input) {
      writes.push(input)
      return live.has(threadId)
    },
    kill(threadId) {
      live.delete(threadId)
      return true
    },
  }
  const manager = createPersistentCliSessionManager({
    cliManager,
    stoppedSessions: new Set(),
    sendTerminalEvents: () => {},
    sendCliEvent: (_target, event) => events.push(event),
    recordModelAvailabilityEvent: () => null,
    now: () => clock,
    createDecisionId: () => `00000000-0000-4000-8000-00000000000${++ids}`,
  })
  // A CLI de mentira devolve o evento que a linha descreve (JSON).
  const adapter = {
    getPersistentSpawnArgs: () => ({ command: 'cli-falsa', args: [] }),
    createPersistentInput: () => ({ input: 'prompt\n', didStartSession: true, didSendPrompt: true }),
    parseLine: (line) => JSON.parse(line),
  }
  const send = (confirmSensitiveActions) =>
    manager.sendPersistentCliRequest({
      adapter,
      targetWebContents: null,
      streamSessionId: 's',
      threadId: 'thread-1',
      prompt: 'oi',
      context: { isContinuation: false, confirmSensitiveActions },
      threadSession: {},
      cliType: 'codex-app-server',
      model: { id: 'm', name: 'Modelo', cliType: 'codex-app-server' },
      cwd: '/projeto',
      orchestrationBridge: { handleCliEvent: () => ({ handled: false }) },
      orchestrationContext: { parentThreadId: 'conversa-1' },
    })
  const emit = async (event) => {
    children.at(-1).stdout.write(`${JSON.stringify(event)}\n`)
    await new Promise((resolve) => setImmediate(resolve))
  }
  const permission = {
    type: 'control',
    responseInput: 'APROVA\n',
    permission: { title: 'O Codex quer rodar um comando', detail: 'Comando: rm -rf build', denyInput: 'NEGA\n' },
  }
  return { manager, writes, events, send, emit, permission, advance: (ms) => (clock += ms) }
}

test('ações sensíveis: com a opção, o pedido da CLI espera o sim no chat; o não chega à CLI', async (t) => {
  const h = permissionHarness(t)
  assert.equal(h.send(true).ok, true)
  await h.emit(h.permission)

  assert.equal(h.writes.includes('APROVA\n'), false, 'nada é aprovado sozinho')
  const [card] = h.manager.listPermissionRequests()
  assert.equal(card.kind, 'permission')
  assert.equal(card.reason, 'O Codex quer rodar um comando')
  assert.equal(card.permissionDetail, 'Comando: rm -rf build')
  assert.equal(card.parentThreadId, 'conversa-1')
  assert.equal(card.approveInput, undefined, 'a resposta crua não sai do processo principal')
  assert.equal(h.events.find((event) => event.type === 'provider_switch_request').threadId, 'conversa-1')

  assert.deepEqual(h.manager.respondPermission({ decisionId: card.decisionId, allow: false }), {
    ok: true,
    decisionId: card.decisionId,
    outcome: 'refused',
  })
  assert.equal(h.writes.at(-1), 'NEGA\n')
  assert.equal(h.manager.respondPermission({ decisionId: card.decisionId, allow: true }).code, 'DECISION_NOT_PENDING')
  assert.equal(h.writes.includes('APROVA\n'), false)
})

test('ações sensíveis: sem resposta em 10 minutos o pedido é negado; sem a opção, aprova como antes', async (t) => {
  const h = permissionHarness(t)
  h.send(true)
  await h.emit(h.permission)
  h.advance(9 * 60 * 1000)
  h.manager.expirePermissionRequests()
  assert.equal(h.manager.listPermissionRequests().length, 1)
  h.advance(60 * 1000)
  h.manager.expirePermissionRequests()
  assert.equal(h.manager.listPermissionRequests().length, 0)
  assert.equal(h.writes.at(-1), 'NEGA\n')
  assert.equal(h.events.at(-1).outcome, 'expired')

  // Ligar ou desligar a opção troca o processo: ele nasceu com ou sem acesso total.
  assert.equal(h.manager.canReusePersistentSession('thread-1', { id: 'm', name: 'Modelo', cliType: 'codex-app-server' }, '/projeto', null, false), false)
  h.manager.closePersistentSession('thread-1', { force: true })
  h.send(false)
  await h.emit(h.permission)
  assert.equal(h.writes.at(-1), 'APROVA\n')
  assert.equal(h.manager.listPermissionRequests().length, 0)
})

test('ações sensíveis: no prazo de 10 minutos vale a recomendada do pedido; sem recomendada, nega', async (t) => {
  const h = permissionHarness(t)
  h.send(true)
  await h.emit({ ...h.permission, permission: { ...h.permission.permission, recommendedAllow: true, kind: 'read' } })
  assert.equal(h.events.find((e) => e.type === 'provider_switch_request').onTimeout, 'allow')
  h.advance(10 * 60 * 1000)
  h.manager.expirePermissionRequests()
  assert.equal(h.writes.at(-1), 'APROVA\n')
  assert.equal(h.events.at(-1).outcome, 'expired')
  assert.match(h.events.at(-1).message, /Aplicada por falta de resposta/)
})

for (const kind of ['delete', 'move', 'execute', 'edit', 'fetch', 'other', undefined]) {
  test(`ações sensíveis: recomendada do tipo ${kind} continua negada no prazo`, async (t) => {
    const h = permissionHarness(t)
    h.send(true)
    await h.emit({ ...h.permission, permission: { ...h.permission.permission, recommendedAllow: true, kind } })
    assert.equal(h.events.find((e) => e.type === 'provider_switch_request').onTimeout, 'deny', String(kind))
    h.advance(10 * 60 * 1000)
    h.manager.expirePermissionRequests()
    assert.equal(h.writes.at(-1), 'NEGA\n', String(kind))
    assert.match(h.events.at(-1).message, /destrutiva/)
  })
}

test('custo do processo persistente: o total acumulado do Claude vira o custo de cada resposta', async (t) => {
  const h = permissionHarness(t)
  h.send(false)
  const custos = []
  const original = h.events.push.bind(h.events)
  h.events.push = (event) => {
    if (event.type === 'done') custos.push(event.cost)
    return original(event)
  }
  await h.emit({ type: 'done', cost: 0.05 })
  h.send(false)
  await h.emit({ type: 'done', cost: 0.12 })
  assert.deepEqual(custos, [0.05, 0.07])
})

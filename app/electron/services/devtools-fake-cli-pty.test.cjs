'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const {
  FAKE_CODEX_LOGIN_STATUS_OUTPUT,
  PROMPT,
  SMOKE_LINK_OUTPUTS,
  SMOKE_MOUSE_TRACKING_OUTPUTS,
  SMOKE_STREAM_LINES,
  SMOKE_STREAM_TRIGGER,
  SMOKE_TRIGGER_OUTPUTS,
  SMOKE_TRIGGER_PHRASES,
  createFakeAuthCommandRunner,
  createFakeCliPtyFactory,
} = require('./devtools-fake-cli-pty.cjs')
const { PtyProcessManager } = require('./pty-process-manager.cjs')
const { classifyFailure, normalizeTerminalText } = require('./accounts/failure-taxonomy.cjs')
const { parseAgentAuth } = require('./agent-usage-report.cjs')
const vocabulary = require('../__fixtures__/cli-failure-vocabulary.json')

const CHUNK_DELAY_MS = 20

/**
 * Relógio manual: os timers só correm quando o teste manda, em ordem de
 * vencimento, e registram o instante virtual de cada disparo.
 */
function createManualTimers() {
  const pending = new Map()
  let now = 0
  let sequence = 0
  return {
    setTimer(callback, delayMs = 0) {
      sequence += 1
      pending.set(sequence, { callback, at: now + Math.max(0, delayMs), sequence })
      return sequence
    },
    clearTimer(id) {
      pending.delete(id)
    },
    now: () => now,
    runAll() {
      for (let guard = 0; pending.size > 0; guard += 1) {
        assert.ok(guard < 10_000, 'os timers do PTY roteirizado não terminam')
        const [id, next] = [...pending.entries()].sort(
          ([, left], [, right]) => left.at - right.at || left.sequence - right.sequence,
        )[0]
        pending.delete(id)
        now = next.at
        next.callback()
      }
    },
  }
}

const RECORDINGS_DIR = path.join(__dirname, '..', '..', 'src', 'features', 'canvas', 'terminal', '__fixtures__', 'terminal-output')

function spawnScripted({ recordingsDir = RECORDINGS_DIR } = {}) {
  const timers = createManualTimers()
  const spawnPty = createFakeCliPtyFactory({
    chunkDelayMs: CHUNK_DELAY_MS,
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
    recordingsDir,
  })
  const pty = spawnPty('codex', ['--model', 'gpt-5.5-codex'], {
    name: 'xterm-256color',
    cols: 100,
    rows: 30,
    cwd: os.homedir(),
    env: { OPENAI_API_KEY: 'sk-segredo-que-nao-pode-aparecer' },
  })
  const events = []
  pty.onData((data) => events.push({ data, at: timers.now() }))
  const output = () => events.map((event) => event.data).join('')
  const reset = () => events.splice(0, events.length)
  return { pty, spawnPty, timers, events, output, reset }
}

function classifyPty(text) {
  return classifyFailure({ origin: 'pty', providerId: 'codex', text })
}

test('nasce como o node-pty: nada sai dentro do spawn; banner e prompt chegam depois, sem ambiente', () => {
  const { pty, spawnPty, timers, events, output } = spawnScripted()

  assert.equal(events.length, 0, 'o node-pty nunca emite dentro do spawn')
  timers.runAll()

  assert.match(output(), /Nenhum processo externo foi iniciado\./)
  assert.ok(output().endsWith(PROMPT), 'termina no prompt')
  assert.doesNotMatch(output(), /sk-segredo/)
  assert.equal(classifyPty(output()).failureClass, 'unknown', 'o banner não é falha')
  assert.ok(Number.isInteger(pty.pid) && pty.pid > 0)
  assert.notEqual(spawnPty('bash', [], {}).pid, pty.pid, 'cada PTY tem o seu pid')
  assert.equal(pty.cols, 100)
  assert.equal(pty.rows, 30)
})

test('ecoa o que recebe, apaga com Backspace, ignora escapes do teclado e responde o Enter com prompt novo', () => {
  const { pty, timers, output, reset } = spawnScripted()
  timers.runAll()
  reset()

  pty.write('ab')
  assert.equal(output(), '', 'o eco também é assíncrono, nunca dentro do write')
  timers.runAll()
  assert.equal(output(), 'ab')

  reset()
  pty.write('\u007f')
  pty.write('\u001b[A\u001b[200~\u001bOP')
  timers.runAll()
  assert.equal(output(), '\b \b', 'Backspace apaga um caractere; setas e colagem não viram texto')

  reset()
  pty.write('\r\n')
  timers.runAll()
  assert.equal(output(), `\r\n${PROMPT}`, 'CR LF é um Enter só')

  reset()
  pty.write('xyz\u0003')
  timers.runAll()
  assert.equal(output(), `xyz^C\r\n${PROMPT}`, 'Ctrl+C descarta a linha')
})

const TRIGGER_CASES = [
  { trigger: '__felixo_smoke_limite__', failureClass: 'limit', scope: 'account' },
  { trigger: '__felixo_smoke_rede__', failureClass: 'network', scope: 'account' },
  { trigger: '__felixo_smoke_401__', failureClass: 'auth', scope: 'account' },
]

test('os gatilhos cobrem exatamente as frases do roteiro, tiradas do vocabulário versionado do Codex', () => {
  assert.deepEqual(
    Object.keys(SMOKE_TRIGGER_PHRASES).sort(),
    TRIGGER_CASES.map(({ trigger }) => trigger).sort(),
  )
  for (const { trigger, failureClass } of TRIGGER_CASES) {
    const phrase = vocabulary.providers.codex.phrases.find(
      (item) => item.id === SMOKE_TRIGGER_PHRASES[trigger],
    )
    assert.ok(phrase, trigger)
    assert.equal(phrase.terminal, true, `${trigger}: frase que vale no terminal`)
    assert.equal(phrase.failureClass, failureClass, trigger)
    assert.equal(SMOKE_TRIGGER_OUTPUTS[trigger], phrase.example, trigger)
  }
})

for (const { trigger, failureClass, scope } of TRIGGER_CASES) {
  test(`${trigger}: a fixture sai em 3 pedaços com CSI de cursor e só junta vira ${failureClass}`, () => {
    const { pty, timers, events, output } = spawnScripted()
    timers.runAll()
    const start = events.length

    pty.write(`${trigger}\r`)
    timers.runAll()

    const after = events.slice(start).map((event) => event.data)
    const enter = after.indexOf('\r\n')
    assert.equal(after.slice(0, enter).join(''), trigger, 'o gatilho é ecoado antes')
    assert.equal(after.at(-1), PROMPT, 'volta ao prompt depois da falha')
    const chunks = after.slice(enter + 1, -1)
    assert.equal(chunks.length, 3)
    for (const chunk of chunks) {
      assert.match(chunk, /\u001b\[/, 'cada pedaço carrega CSI de cursor')
      assert.notEqual(
        classifyPty(chunk).failureClass,
        failureClass,
        `pedaço sozinho não basta: ${JSON.stringify(chunk)}`,
      )
    }
    const scriptedEvents = events.slice(start).filter((event) => chunks.includes(event.data))
    assert.deepEqual(
      scriptedEvents.slice(1).map((event, index) => event.at - scriptedEvents[index].at),
      [CHUNK_DELAY_MS, CHUNK_DELAY_MS],
      'os pedaços chegam em onData separados, com intervalo',
    )

    assert.deepEqual(normalizeTerminalText(chunks.join('')), [SMOKE_TRIGGER_OUTPUTS[trigger]])
    const verdict = classifyPty(output())
    assert.equal(verdict.failureClass, failureClass)
    assert.equal(verdict.scope, scope)
  })
}

test('só a linha que é exatamente o gatilho dispara: texto em volta, sem Enter ou colado num contexto não dispara', () => {
  const { pty, timers, output } = spawnScripted()
  timers.runAll()

  pty.write('diga __felixo_smoke_limite__\r')
  pty.write('Contexto da passagem:\n› __felixo_smoke_limite__\nfim\r')
  pty.write('__felixo_smoke_rede__')
  timers.runAll()
  pty.write('\u0003')
  timers.runAll()

  assert.equal(classifyPty(output()).failureClass, 'unknown')
  assert.doesNotMatch(output(), /usage limit|stream disconnected/i)
})

test('gatilho de links: hyperlinks OSC 8 com destino diferente do texto e um file: para recusar', () => {
  const { pty, timers, output, reset } = spawnScripted()
  timers.runAll()
  reset()

  pty.write('__felixo_smoke_osc8__\r')
  timers.runAll()

  const printed = output()
  // O eco do que foi digitado, a quebra do Enter, os links e o prompt novo.
  assert.equal(printed, `__felixo_smoke_osc8__\r\n${SMOKE_LINK_OUTPUTS.__felixo_smoke_osc8__}${PROMPT}`)
  assert.match(printed, /\u001b\]8;;https:\/\/example\.com\/destino-real\u001b\\banco\.example\u001b\]8;;\u001b\\/)
  assert.match(printed, /\u001b\]8;;file:\/\/\/etc\/hosts\u001b\\hosts do sistema\u001b\]8;;\u001b\\/)
  // Não é frase de falha: a cadeia de contas não pode ver limite nem rede aqui.
  assert.equal(classifyPty(printed).failureClass, 'unknown')
})

test('respostas do terminal às perguntas da CLI (OSC 10/11, DCS) não viram texto nem sujam o gatilho', () => {
  const { pty, timers, output, reset } = spawnScripted()
  timers.runAll()
  reset()

  pty.write('\u001b]10;rgb:ffff/ffff/ffff\u001b\\\u001b]11;rgb:0b0b/0f0f/1414\u0007\u001bP1$r0m\u001b\\')
  pty.write('__felixo_smoke_osc8__\r')
  timers.runAll()

  assert.equal(output(), `__felixo_smoke_osc8__\r\n${SMOKE_LINK_OUTPUTS.__felixo_smoke_osc8__}${PROMPT}`)
})

test('gatilho de gravação: limpa a tela e toca a gravação inteira, em ordem, sem prompt no fim', () => {
  const { pty, timers, events, output, reset } = spawnScripted()
  timers.runAll()
  reset()

  pty.write('__felixo_smoke_gravacao_claude-resposta__\r')
  timers.runAll()

  const recording = JSON.parse(fs.readFileSync(path.join(RECORDINGS_DIR, 'claude-resposta.json'), 'utf8'))
  const printed = output()
  assert.ok(printed.startsWith('__felixo_smoke_gravacao_claude-resposta__\r\n\u001b[3J\u001b[2J\u001b[H'))
  assert.ok(printed.endsWith(recording.chunks.map((chunk) => chunk.data).join('')))
  assert.notEqual(events.at(-1).data, PROMPT)
  // Os intervalos da gravação ficam curtos: o smoke não espera 30 s.
  assert.ok(events.at(-1).at <= recording.chunks.length * 40 + CHUNK_DELAY_MS)
})

test('gatilho de gravação: nome com caminho não é gatilho; gravação ausente ou pasta faltando viram aviso', () => {
  const { pty, timers, output, reset } = spawnScripted()
  timers.runAll()
  reset()
  pty.write('__felixo_smoke_gravacao_../../etc-passwd__\r')
  pty.write('__felixo_smoke_gravacao_nao-existe__\r')
  timers.runAll()
  const printed = output()
  assert.doesNotMatch(printed, /root:/)
  assert.match(printed, /\[Felixo\] gravação nao-existe não foi lida \(ENOENT\)\./)

  const semPasta = spawnScripted({ recordingsDir: '' })
  semPasta.timers.runAll()
  semPasta.reset()
  semPasta.pty.write('__felixo_smoke_gravacao_claude-resposta__\r')
  semPasta.timers.runAll()
  assert.match(semPasta.output(), /gravações do terminal não configuradas/)
})

test('gatilho de streaming: as linhas saem uma a uma, espaçadas, e o prompt só no fim', () => {
  const { pty, timers, events, reset } = spawnScripted()
  timers.runAll()
  reset()

  pty.write(`${SMOKE_STREAM_TRIGGER}\r`)
  timers.runAll()

  const lines = events.filter((event) => event.data.includes('da saída em streaming'))
  assert.equal(lines.length, SMOKE_STREAM_LINES)
  assert.ok(lines.at(-1).at > lines[0].at, 'a saída precisa se espalhar no tempo, não chegar de uma vez')
  assert.equal(events.at(-1).data, PROMPT)
})

test('gatilhos de mouse tracking: ligam e desligam o relato de cliques em SGR, como as CLIs de tela cheia', () => {
  // `?1000` pede o relato de cada clique ao processo; `?1006`, as coordenadas em SGR.
  assert.deepEqual(SMOKE_MOUSE_TRACKING_OUTPUTS, {
    __felixo_smoke_mouse_on__: '\u001b[?1000h\u001b[?1006h',
    __felixo_smoke_mouse_off__: '\u001b[?1000l\u001b[?1006l',
  })
  const { pty, timers, output, reset } = spawnScripted()
  timers.runAll()
  reset()

  pty.write('__felixo_smoke_mouse_on__\r')
  timers.runAll()
  // O eco do que foi digitado, a quebra do Enter, os modos e o prompt novo.
  const on = SMOKE_MOUSE_TRACKING_OUTPUTS.__felixo_smoke_mouse_on__
  assert.equal(output(), `__felixo_smoke_mouse_on__\r\n${on}${PROMPT}`)
  assert.equal(classifyPty(output()).failureClass, 'unknown', 'não é frase de falha')

  // Com o modo ligado, o xterm relata cada clique ao processo em SGR (apertar
  // e soltar). É escape, não texto: nada é ecoado, e o gatilho seguinte ainda
  // casa exatamente.
  reset()
  pty.write('\u001b[<0;12;5M\u001b[<0;12;5m')
  timers.runAll()
  assert.equal(output(), '')

  pty.write('__felixo_smoke_mouse_off__\r')
  timers.runAll()
  const off = SMOKE_MOUSE_TRACKING_OUTPUTS.__felixo_smoke_mouse_off__
  assert.equal(output(), `__felixo_smoke_mouse_off__\r\n${off}${PROMPT}`)
})

test('kill encerra com um onExit só, corta o roteiro em andamento e ignora escrita depois do fim', () => {
  const { pty, timers, output } = spawnScripted()
  const exits = []
  const disposedExits = []
  pty.onExit((event) => exits.push(event))
  pty.onExit((event) => disposedExits.push(event)).dispose()
  timers.runAll()

  pty.write('__felixo_smoke_limite__\r')
  pty.kill('SIGTERM')
  assert.deepEqual(exits, [], 'o fim também chega assíncrono, como no node-pty')
  timers.runAll()

  assert.deepEqual(exits, [{ exitCode: 0, signal: os.constants.signals.SIGTERM }])
  assert.deepEqual(disposedExits, [], 'dispose tira o ouvinte')
  assert.equal(classifyPty(output()).failureClass, 'unknown', 'nada do roteiro sai depois do kill')

  const before = output()
  pty.write('__felixo_smoke_limite__\r')
  pty.kill('SIGKILL')
  timers.runAll()
  assert.equal(output(), before)
  assert.equal(exits.length, 1, 'kill repetido não gera outro onExit')

  const { pty: other, timers: otherTimers } = spawnScripted()
  const otherExits = []
  other.onExit((event) => otherExits.push(event))
  other.kill()
  otherTimers.runAll()
  assert.deepEqual(otherExits, [{ exitCode: 0, signal: os.constants.signals.SIGHUP }], 'sem sinal vale o SIGHUP do node-pty')
})

test('resize guarda o tamanho novo e recusa tamanho inválido como o node-pty', () => {
  const { pty } = spawnScripted()

  pty.resize(120, 40)
  assert.equal(pty.cols, 120)
  assert.equal(pty.rows, 40)
  assert.throws(() => pty.resize(0, 10), /positive cols and rows/)
  assert.throws(() => pty.resize(80, Number.NaN), /positive cols and rows/)
})

test('o PtyProcessManager usa o PTY roteirizado como usaria o node-pty: onData, write, resize, kill e onExit', () => {
  const timers = createManualTimers()
  const spawnPty = createFakeCliPtyFactory({
    chunkDelayMs: CHUNK_DELAY_MS,
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
  })
  const manager = new PtyProcessManager({
    spawnPty,
    platform: { name: 'linux', getDefaultShell: () => '/bin/bash' },
  })
  const received = []
  const exits = []

  const pty = manager.spawn('smoke-1', {
    cols: 90,
    rows: 20,
    onData: (data) => received.push(data),
    onExit: (event) => exits.push(event),
  })
  timers.runAll()
  assert.ok(received.join('').endsWith(PROMPT))

  assert.equal(manager.write('smoke-1', '__felixo_smoke_limite__\r'), true)
  timers.runAll()
  assert.equal(classifyPty(received.join('')).failureClass, 'limit')

  assert.equal(manager.resize('smoke-1', 132, 43), true)
  assert.equal(pty.cols, 132)
  assert.equal(pty.rows, 43)

  assert.equal(manager.kill('smoke-1'), true)
  timers.runAll()
  assert.deepEqual(exits, [{ exitCode: 0, signal: os.constants.signals.SIGTERM }])
  assert.equal(manager.write('smoke-1', 'depois do fim'), false)
})

test('checagem de login falsa: codex login status devolve a saída real e o parser lê logado, sem processo', async () => {
  const run = createFakeAuthCommandRunner()

  for (const command of ['codex', '/usr/local/bin/codex', 'C:\\Tools\\codex.cmd']) {
    const result = await run({ command, args: ['login', 'status'], env: { CODEX_HOME: '/tmp/perfil' } })
    assert.equal(result.ok, true, command)
    assert.equal(result.stdout, FAKE_CODEX_LOGIN_STATUS_OUTPUT)
  }
  assert.equal(FAKE_CODEX_LOGIN_STATUS_OUTPUT.trim(), 'Logged in using ChatGPT')
  assert.equal(parseAgentAuth('codex', FAKE_CODEX_LOGIN_STATUS_OUTPUT).authStatus, 'logged_in')
})

test('checagem de login falsa: qualquer outro comando é CLI ausente (fail-closed), nunca logado', async () => {
  const run = createFakeAuthCommandRunner()

  for (const request of [
    { command: 'claude', args: ['auth', 'status', '--json'] },
    { command: 'codex', args: ['login'] },
    { command: 'codex', args: ['exec', 'login status'] },
    { command: 'openia', args: ['key', 'status', '--json'] },
    {},
  ]) {
    const result = await run(request)
    assert.equal(result.ok, false, JSON.stringify(request))
    assert.equal(result.errorCode, 'ENOENT')
    assert.equal(result.stdout, '')
  }
})

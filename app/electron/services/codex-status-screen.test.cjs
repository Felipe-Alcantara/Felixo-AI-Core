'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const {
  CODEX_SESSION_LABELS,
  buildCodexStatusArgs,
  createCodexStatusScreenQuery,
  parseCodexStatusScreen,
  selectAccountStatusLines,
  stripCodexTerminalOutput,
  toTomlString,
} = require('./codex-status-screen.cjs')

const FIXTURES_DIR = path.join(__dirname, '..', '..', 'src', 'features', 'canvas', 'terminal', '__fixtures__', 'terminal-output')

/** Gravações reais e anonimizadas do Codex 0.156.1 (scripts/record-terminal-fixture.cjs). */
function recordedOutput(name) {
  const fixture = JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, name), 'utf8'))
  return fixture.chunks.map((chunk) => chunk.data).join('')
}

/**
 * Rótulos do `/status` que o painel mostra. Junto com `CODEX_SESSION_LABELS`
 * (omitidos de propósito), cobre tudo o que a CLI publica no quadro — é o
 * critério de aceite da task: cada campo aparece ou está registrado como
 * omitido.
 */
const SHOWN_LABELS = ['Model', 'Model provider', 'Account', '5h limit', 'Weekly limit', 'Luna Reserve Weekly limit']
/**
 * "Limits: refresh requested" é um aviso de passagem do primeiro /status, não
 * um campo: a leitura repete o comando, e se o tempo acabar os detalhes dizem
 * por extenso que a tela veio sem os limites (codex-status-details.cjs).
 */
const TRANSIENT_LABELS = ['Limits']

test('lê o quadro do fluxo do painel: sessão nova, /status duas vezes', () => {
  const parsed = parseCodexStatusScreen(recordedOutput('codex-status-conta.json'))

  assert.equal(parsed.version, '0.156.1')
  assert.equal(parsed.usagePage, 'https://chatgpt.com/codex/settings/usage')
  assert.equal(parsed.limitsPending, false)
  assert.deepEqual(parsed.fields.map((field) => field.label), [
    'Model',
    'Model provider',
    'Directory',
    'Permissions',
    'Agents.md',
    'Account',
    'Collaboration mode',
    'Session',
    '5h limit',
    'Weekly limit',
    'Luna Reserve Weekly limit',
  ])
  assert.equal(parsed.fields[0].value, 'GPT-6-Luna (reasoning max, summaries auto)')
  assert.match(parsed.fields.at(-1).value, /^\[█+\] 100% left \(resets \d{2}:\d{2} on \d+ \w+\)$/)
})

test('o primeiro /status de uma sessão nova pode vir sem os limites', () => {
  // Gravação da sonda de 02/10/2026 que digitou o /status logo na abertura
  // (antes de a CLI buscar os limites sozinha), anonimizada com
  // `record-terminal-fixture.cjs --reanonymize`.
  const parsed = parseCodexStatusScreen(recordedOutput('codex-status-conta-pendente.json'))

  assert.equal(parsed.limitsPending, true)
  assert.ok(!parsed.fields.some((field) => /\blimit$/.test(field.label)))

  // O aviso transitório não vira linha do painel.
  const { lines } = selectAccountStatusLines(parsed)
  assert.ok(lines.some((line) => line.startsWith('Model: ')))
  assert.ok(!lines.some((line) => /refresh requested/.test(line)))
})

test('lê o quadro depois de uma conversa (com nome da conversa e janela de contexto)', () => {
  const parsed = parseCodexStatusScreen(recordedOutput('codex-status.json'))

  assert.equal(parsed.version, '0.156.1')
  assert.ok(parsed.fields.some((field) => field.label === 'Thread name'))
  assert.ok(parsed.fields.some((field) => field.label === 'Context window'))
  assert.ok(parsed.fields.some((field) => field.label === 'Luna Reserve Weekly limit'))
})

test('contrato: todo rótulo gravado aparece no painel ou é omitido de propósito', () => {
  const known = new Set([...SHOWN_LABELS, ...CODEX_SESSION_LABELS, ...TRANSIENT_LABELS])
  const seen = new Set()

  for (const name of ['codex-status-conta.json', 'codex-status-conta-pendente.json', 'codex-status.json']) {
    const parsed = parseCodexStatusScreen(recordedOutput(name))
    const unknown = parsed.fields.map((field) => field.label).filter((label) => !known.has(label))
    assert.deepEqual(unknown, [], `${name}: rótulo novo do /status sem decisão registrada`)

    const selected = selectAccountStatusLines(parsed)
    for (const { label } of parsed.fields) {
      seen.add(label)
      const shown = selected.lines.some((line) => line.startsWith(`${label}: `))
      if (SHOWN_LABELS.includes(label)) {
        assert.ok(shown, `${name}: "${label}" precisa chegar ao painel`)
      } else {
        assert.ok(!shown, `${name}: "${label}" fica fora do painel de propósito`)
      }
      assert.equal(
        selected.omittedLabels.includes(label),
        CODEX_SESSION_LABELS.includes(label),
        `${name}: "${label}" só é registrado como omitido se for da sessão`,
      )
    }
  }

  // As gravações cobrem todos os rótulos com decisão: nenhum ficou sem prova.
  assert.deepEqual(
    [...known].filter((label) => !seen.has(label) && label !== 'Token usage'),
    [],
    'rótulo com decisão registrada que nenhuma gravação mostra',
  )
})

test('linhas da conta: cabeçalho, aviso da página de uso e campos, sem os da sessão', () => {
  const selected = selectAccountStatusLines(parseCodexStatusScreen(recordedOutput('codex-status-conta.json')))

  assert.deepEqual(selected.lines.slice(0, 5), [
    'OpenAI Codex (v0.156.1)',
    'Visit https://chatgpt.com/codex/settings/usage for up-to-date information on rate limits and credits',
    'Model: GPT-6-Luna (reasoning max, summaries auto)',
    'Model provider: openai',
    'Account: Plano',
  ])
  assert.deepEqual(selected.omittedLabels, ['Directory', 'Permissions', 'Agents.md', 'Collaboration mode', 'Session'])
  assert.ok(!selected.lines.some((line) => line.includes('/tmp/felixo-fixture')))
  assert.ok(!selected.lines.some((line) => line.includes('00000000-0000')))
})

test('o quadro de boas-vindas (model:/directory: em minúsculas) não conta como /status', () => {
  const welcome = [
    '╭──────────────────────────────────────────────╮',
    '│ >_ OpenAI Codex (v0.156.1)                   │',
    '│                                              │',
    '│ model:     GPT-6-Luna max   /model to change │',
    '│ directory: /tmp/felixo-codex-status-abc      │',
    '╰──────────────────────────────────────────────╯',
  ].join('\r\n')

  assert.equal(parseCodexStatusScreen(welcome), null)
})

test('valor quebrado em duas linhas é juntado; segredo na tela é redigido', () => {
  const box = [
    '╭────────────────────────────────────────────╮',
    '│  >_ OpenAI Codex (v0.157.0)                │',
    '│                                            │',
    '│  Model:      GPT-7 (reasoning high,        │',
    '│              summaries auto)               │',
    '│  Account:    token sk-abcdefghijklmnop123  │',
    '│  Credits:    12 credits                    │',
    '╰────────────────────────────────────────────╯',
  ].join('\r\n')

  const parsed = parseCodexStatusScreen(box)
  assert.deepEqual(parsed.fields[0], { label: 'Model', value: 'GPT-7 (reasoning high, summaries auto)' })
  // Rótulo desconhecido continua aparecendo.
  assert.deepEqual(parsed.fields[2], { label: 'Credits', value: '12 credits' })

  const { lines } = selectAccountStatusLines(parsed)
  assert.ok(!lines.join('\n').includes('sk-abcdefghijklmnop123'))
})

test('a pasta da leitura entra como confiável só nesta execução, em TOML válido', () => {
  assert.deepEqual(buildCodexStatusArgs(['/tmp/felixo-codex-status-abc']), [
    '--no-daemon',
    '--no-alt-screen',
    '-c',
    'check_for_update_on_startup=false',
    '-c',
    "projects={'/tmp/felixo-codex-status-abc'={trust_level='trusted'}}",
  ])
  // Barra invertida do Windows passa intacta na string literal do TOML.
  assert.equal(
    toTomlString('C:\\Users\\Pessoa Exemplo\\AppData\\Local\\Temp\\felixo-codex-status-abc'),
    "'C:\\Users\\Pessoa Exemplo\\AppData\\Local\\Temp\\felixo-codex-status-abc'",
  )
  // Aspas simples no caminho: string básica com escape.
  assert.equal(toTomlString("/tmp/d'agua"), '"/tmp/d\'agua"')
})

/**
 * PTY falso: devolve o que o roteiro manda a cada tecla recebida. Registra
 * tudo o que a leitura escreveu, para provar o que ela nunca digita.
 */
function fakePty({ onSpawn = () => {}, onWrite = () => {} } = {}) {
  const pty = { writes: [], killed: false, spawn: null }
  let dataListener = () => {}
  let exitListener = () => {}
  pty.emit = (data) => setTimeout(() => dataListener(data), 0)
  pty.exit = () => setTimeout(() => exitListener({ exitCode: 0 }), 0)
  pty.factory = (command, args, options) => {
    pty.spawn = { command, args, options }
    const handle = {
      onData: (listener) => {
        dataListener = listener
      },
      onExit: (listener) => {
        exitListener = listener
      },
      write: (data) => {
        pty.writes.push(data)
        onWrite(data, pty)
      },
      kill: () => {
        // Como o node-pty: matar o processo dispara o aviso de saída.
        pty.killed = true
        pty.exit()
      },
    }
    setTimeout(() => onSpawn(pty), 0)
    return handle
  }
  return pty
}

const STATUS_BOX = (lines) =>
  ['\r\n╭────────────────────────────────────────╮', '│  >_ OpenAI Codex (v0.156.1)          │', ...lines, '╰────────────────────────────────────────╯\r\n']
    .join('\r\n')

/** Campo de mensagem vazio e o rodapé com a pasta da sessão, como a CLI desenha. */
const composer = (fake, field = 'Ask Codex to do anything') =>
  `\u001b[2J\u001b[H› ${field}\r\n\r\n  GPT-6-Luna max · ${fake.spawn.options.cwd}\r\n`

// Prazos curtos para o roteiro andar rápido. O `timeoutMs` só limita o
// caminho de falha: folgado, o teste não quebra com a máquina carregada.
const FAST = {
  readyQuietMs: 20,
  minEnterDelayMs: 5,
  popupFallbackMs: 200,
  enterRetryMs: 400,
  refreshRetryMs: 30,
  timeoutMs: 15_000,
}

const LINUX = { name: 'linux' }

test('fluxo completo: espera o campo, digita, repete enquanto os limites não chegam', async () => {
  let statusCount = 0
  const pty = fakePty({
    onSpawn: (fake) => fake.emit(`\u001b[6n${composer(fake)}`),
    onWrite: (data, fake) => {
      if (data === '/status') {
        fake.emit('\r\n/status   show current session configuration and token usage\r\n')
      }
      if (data === '\r') {
        statusCount += 1
        fake.emit(STATUS_BOX(
          statusCount === 1
            ? ['│  Model:     GPT-6-Luna (reasoning max)  │', '│  Limits:    refresh requested; run /status again shortly. │']
            : ['│  Model:     GPT-6-Luna (reasoning max)  │', '│  Directory: /tmp/x                      │', '│  5h limit:  [████] 80% left (resets 19:33) │'],
        ))
      }
    },
  })
  const read = createCodexStatusScreenQuery({ spawnPty: pty.factory, platform: LINUX })

  const result = await read({ ...FAST, env: { CODEX_HOME: '/perfis/conta-b' } })

  assert.equal(result.ok, true)
  assert.equal(result.limitsPending, false)
  assert.deepEqual(result.lines, [
    'OpenAI Codex (v0.156.1)',
    'Model: GPT-6-Luna (reasoning max)',
    '5h limit: [████] 80% left (resets 19:33)',
  ])
  assert.deepEqual(result.omittedLabels, ['Directory'])
  // Resposta à pergunta da posição do cursor, depois dois /status com Enter.
  assert.deepEqual(pty.writes, ['\u001b[1;1R', '/status', '\r', '/status', '\r'])
  assert.equal(pty.killed, true)
  assert.equal(pty.spawn.options.env.CODEX_HOME, '/perfis/conta-b')
  assert.ok(pty.spawn.args.includes('--no-daemon'))
  assert.ok(
    pty.spawn.args.some((arg) => arg.startsWith('projects={') && arg.includes(path.basename(pty.spawn.options.cwd))),
    'a pasta da sessão é a que entra como confiável',
  )
  await new Promise((resolve) => setTimeout(resolve, 50))
  assert.equal(fs.existsSync(pty.spawn.options.cwd), false, 'a pasta temporária é apagada quando o PTY sai')
})

test('pergunta de confiança na pasta: sai com Esc e nunca envia Enter', async () => {
  const pty = fakePty({
    onSpawn: (fake) => fake.emit('> You are in /tmp/x\r\n\r\n  Do you trust the files in this folder?\r\n\r\n› 1. Yes, continue\r\n  2. No, quit\r\n'),
  })
  const read = createCodexStatusScreenQuery({ spawnPty: pty.factory, platform: LINUX })

  const result = await read(FAST)

  assert.equal(result.ok, false)
  assert.match(result.message, /confiança/)
  assert.deepEqual(pty.writes, ['\u001b'])
})

test('sem o campo de mensagem na tela, nada é digitado', async () => {
  const pty = fakePty({
    onSpawn: (fake) => fake.emit('Bem-vindo! Escolha uma opção:\r\n› 1. Entrar com ChatGPT\r\n'),
  })
  const read = createCodexStatusScreenQuery({ spawnPty: pty.factory, platform: LINUX })

  const result = await read({ ...FAST, timeoutMs: 300 })

  assert.equal(result.ok, false)
  assert.match(result.message, /não ficou pronta/)
  assert.deepEqual(pty.writes, [])
})

test('tempo esgotado com o quadro ainda sem limites devolve o quadro e avisa', async () => {
  const pty = fakePty({
    onSpawn: (fake) => fake.emit(composer(fake)),
    onWrite: (data, fake) => {
      if (data === '\r') {
        fake.emit(STATUS_BOX(['│  Model:     GPT-6-Luna  │', '│  Limits:    refresh requested; run /status again shortly. │']))
      }
    },
  })
  const read = createCodexStatusScreenQuery({ spawnPty: pty.factory, platform: LINUX })

  const result = await read({ ...FAST, maxStatusAttempts: 2 })

  assert.equal(result.ok, true)
  assert.equal(result.limitsPending, true)
  assert.deepEqual(result.lines, ['OpenAI Codex (v0.156.1)', 'Model: GPT-6-Luna'])
  assert.equal(pty.writes.filter((data) => data === '/status').length, 2)
})

test('servidores MCP subindo: espera a linha sumir antes de digitar', async () => {
  let clearedAt = null
  const pty = fakePty({
    onSpawn: (fake) => {
      fake.emit(`${composer(fake)}• Starting MCP servers (1/2): railway (0s • esc to interrupt)\r\n`)
      setTimeout(() => {
        clearedAt = Date.now()
        fake.emit(composer(fake))
      }, 400)
    },
    onWrite: (data, fake) => {
      if (data === '/status') {
        pty.typedAt = Date.now()
        fake.emit('\r\n/status   show current session configuration and token usage\r\n')
      }
      if (data === '\r') {
        fake.emit(STATUS_BOX(['│  Model:     GPT-6-Luna  │', '│  5h limit:  [████] 80% left │']))
      }
    },
  })
  const read = createCodexStatusScreenQuery({ spawnPty: pty.factory, platform: LINUX })

  const result = await read(FAST)

  assert.equal(result.ok, true)
  assert.ok(clearedAt !== null && pty.typedAt >= clearedAt, 'digitou só depois que os servidores subiram')
})

test('Enter ignorado: repete o Enter só enquanto o /status continua no campo', async () => {
  let enters = 0
  const pty = fakePty({
    onSpawn: (fake) => fake.emit(composer(fake)),
    onWrite: (data, fake) => {
      if (data === '/status') {
        fake.emit(`${composer(fake, '/status')}/status   show current session configuration and token usage\r\n`)
      }
      if (data === '\r') {
        enters += 1
        if (enters === 1) {
          return // a CLI ainda não aceitava comandos: o texto fica no campo
        }
        fake.emit(composer(fake))
        fake.emit(STATUS_BOX(['│  Model:     GPT-6-Luna  │', '│  5h limit:  [████] 80% left │']))
      }
    },
  })
  const read = createCodexStatusScreenQuery({ spawnPty: pty.factory, platform: LINUX })

  const result = await read({ ...FAST, enterRetryMs: 150 })

  assert.equal(result.ok, true)
  assert.deepEqual(pty.writes, ['/status', '\r', '\r'])
})

test('campo com outra coisa: nunca envia Enter de novo nem digita por cima', async () => {
  const pty = fakePty({
    onSpawn: (fake) => fake.emit(composer(fake)),
    onWrite: (data, fake) => {
      if (data === '/status') {
        fake.emit(`${composer(fake, '/status')}/status   show current session configuration and token usage\r\n`)
      }
      if (data === '\r') {
        // Algo inesperado no campo: um Enter ali poderia virar mensagem.
        fake.emit(composer(fake, '/status/status'))
      }
    },
  })
  const read = createCodexStatusScreenQuery({ spawnPty: pty.factory, platform: LINUX })

  const result = await read({ ...FAST, enterRetryMs: 100, timeoutMs: 2_000 })

  assert.equal(result.ok, false)
  assert.deepEqual(pty.writes, ['/status', '\r'])
})

test('falha ao abrir o Codex devolve mensagem e não deixa pasta para trás', async () => {
  const created = []
  const fileSystem = {
    mkdtempSync: (prefix) => {
      const dir = fs.mkdtempSync(prefix)
      created.push(dir)
      return dir
    },
    realpathSync: fs.realpathSync,
    rmSync: fs.rmSync,
  }
  const read = createCodexStatusScreenQuery({
    spawnPty: () => {
      throw new Error('ENOENT')
    },
    platform: LINUX,
    fileSystem,
  })

  const result = await read(FAST)

  assert.equal(result.ok, false)
  assert.match(result.message, /Não foi possível abrir o Codex/)
  assert.equal(created.length, 1)
  assert.equal(fs.existsSync(created[0]), false)
  assert.ok(created[0].startsWith(path.join(os.tmpdir(), 'felixo-codex-status-')))
})

test('cancelar fecha o terminal oculto na hora', async () => {
  const pty = fakePty({ onSpawn: (fake) => fake.emit(composer(fake)) })
  const read = createCodexStatusScreenQuery({ spawnPty: pty.factory, platform: LINUX })
  const controller = new AbortController()

  const pending = read({ ...FAST, signal: controller.signal })
  setTimeout(() => controller.abort(), 20)
  const result = await pending

  assert.equal(result.ok, false)
  assert.match(result.message, /cancelada/)
  assert.equal(pty.killed, true)
})

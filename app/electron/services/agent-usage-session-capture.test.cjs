'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { createAgentUsageSessionCapture } = require('./agent-usage-session-capture.cjs')
const { createClaudeStatuslineScript } = require('./claude-statusline-script.cjs')

function createDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo session capture '))
  return { dir, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) }
}

function writeSession(sessionsDir, id, body, secondsAhead = 0) {
  fs.mkdirSync(sessionsDir, { recursive: true })
  const file = path.join(sessionsDir, `${id}.json`)
  fs.writeFileSync(file, JSON.stringify(body), 'utf8')
  if (secondsAhead) {
    const when = new Date(Date.now() + secondsAhead * 1000)
    fs.utimesSync(file, when, when)
  }
}

const BODY = {
  v: 1,
  measuredAt: '2026-11-17T12:00:00.000Z',
  agentSessionId: 'conversa-1',
  model: 'claude-opus-5-5',
  effort: 'high',
  fastMode: false,
  costUsd: 1.25,
  contextUsedPercent: 12,
  contextWindowTokens: 200000,
  inputTokens: 1000,
  outputTokens: 500,
  rateLimits: { five_hour: { used_percentage: 41, resets_at: 1790000000 } },
}

function build(dir, live, overrides = {}) {
  const windows = []
  const batches = []
  const capture = createAgentUsageSessionCapture({
    sessionsDir: path.join(dir, 'sessions'),
    listSessions: () => live.items,
    recordWindows: async (reading) => {
      windows.push(reading)
    },
    onChanged: (batch) => batches.push(batch),
    ...overrides,
  })
  return { capture, windows, batches }
}

test('lê a sessão do terminal vivo, entrega a janela à conta dele e só avisa quando o arquivo muda', () => {
  const { dir, cleanup } = createDir()
  try {
    const live = { items: [{ sessionId: 'canvas-a', providerId: 'claude', accountId: 'conta-b' }] }
    const { capture, windows, batches } = build(dir, live)
    const sessions = path.join(dir, 'sessions')

    capture.tick()
    assert.equal(batches.length, 0, 'sem arquivo ainda: pendente, nada a avisar')

    writeSession(sessions, 'canvas-a', BODY)
    capture.tick()

    assert.equal(batches.length, 1)
    const [reading] = batches[0].changed
    assert.equal(reading.ptySessionId, 'canvas-a')
    assert.equal(reading.accountId, 'conta-b')
    assert.equal(reading.session.model, 'claude-opus-5-5')
    assert.deepEqual(reading.session.tokens, {
      input: 1000, output: 500, cacheRead: null, cacheWrite: null, reasoning: null, total: 1500,
    })
    assert.equal(reading.session.costUsdEquivalent, 1.25)
    assert.equal(reading.accountWindows[0].key, 'rate_limits.five_hour')
    assert.equal(reading.accountWindows[0].used, 41)
    assert.equal(windows.length, 1)
    assert.equal(windows[0].accountId, 'conta-b')

    capture.tick()
    assert.equal(batches.length, 1, 'arquivo igual não volta a ser lido nem anunciado')

    writeSession(sessions, 'canvas-a', { ...BODY, inputTokens: 2000 }, 5)
    capture.tick()
    assert.equal(batches.length, 2)
    assert.equal(capture.list()[0].session.tokens.input, 2000)
    assert.equal(windows.length, 2, 'cada resposta confirma a janela da conta; o serviço decide se grava')
  } finally {
    cleanup()
  }
})

test('terminal fechado sai da memória e o arquivo dele é apagado; sobra de app que caiu some na partida', () => {
  const { dir, cleanup } = createDir()
  try {
    const sessions = path.join(dir, 'sessions')
    const live = { items: [{ sessionId: 'canvas-a', providerId: 'claude', accountId: null }] }
    writeSession(sessions, 'canvas-velho', BODY)
    fs.writeFileSync(path.join(sessions, 'canvas-a.json.9.tmp'), '{}')
    const { capture, batches } = build(dir, live)

    capture.start()
    capture.stop()
    assert.deepEqual(fs.readdirSync(sessions), [], 'nenhum arquivo de terminal que não está vivo')

    writeSession(sessions, 'canvas-a', BODY)
    capture.tick()
    assert.equal(capture.list().length, 1)

    live.items = []
    capture.tick()
    assert.deepEqual(batches.at(-1), { changed: [], removed: ['canvas-a'] })
    assert.equal(capture.list().length, 0)
    assert.equal(fs.existsSync(path.join(sessions, 'canvas-a.json')), false)
  } finally {
    cleanup()
  }
})

test('ignora terminal de outro provider, arquivo quebrado ou truncado e leitura sem horário', () => {
  const { dir, cleanup } = createDir()
  try {
    const sessions = path.join(dir, 'sessions')
    const live = {
      items: [
        { sessionId: 'canvas-codex', providerId: 'codex', accountId: null },
        { sessionId: 'canvas-quebrado', providerId: 'claude', accountId: null },
        { sessionId: 'canvas-sem-hora', providerId: 'claude', accountId: null },
        { sessionId: '../fora', providerId: 'claude', accountId: null },
      ],
    }
    const { capture, batches, windows } = build(dir, live)
    writeSession(sessions, 'canvas-codex', BODY)
    fs.writeFileSync(path.join(sessions, 'canvas-quebrado.json'), '{"measuredAt": "2026-11-17T1')
    writeSession(sessions, 'canvas-sem-hora', { ...BODY, measuredAt: 'ontem' })

    capture.tick()
    assert.equal(batches.length, 0)
    assert.equal(windows.length, 0)
  } finally {
    cleanup()
  }
})

test('valor que não é número finito ou texto curto vira nulo, sem derrubar a leitura', () => {
  const { dir, cleanup } = createDir()
  try {
    const live = { items: [{ sessionId: 'canvas-a', providerId: 'claude', accountId: null }] }
    const { capture, batches } = build(dir, live)
    writeSession(path.join(dir, 'sessions'), 'canvas-a', {
      ...BODY,
      costUsd: 'caro',
      contextUsedPercent: null,
      model: 'm'.repeat(500),
      inputTokens: null,
      outputTokens: null,
      rateLimits: 'nada',
    })
    capture.tick()
    const reading = batches[0].changed[0]
    assert.equal(reading.session.costUsdEquivalent, null)
    assert.equal(reading.session.tokens, null)
    assert.equal(reading.session.model.length, 100)
    assert.deepEqual(reading.accountWindows, [])
  } finally {
    cleanup()
  }
})

test('o script por terminal grava só a lista branca (caminho com espaço), de forma atômica, e chama a status line da pessoa', () => {
  const { dir, cleanup } = createDir()
  try {
    const sessions = path.join(dir, 'sessions')
    const scriptPath = path.join(dir, 'script.cjs')
    fs.writeFileSync(
      scriptPath,
      createClaudeStatuslineScript(path.join(dir, 'rate-limits.json'), { sessionsDir: sessions }),
      'utf8',
    )
    const configDir = path.join(dir, 'perfil')
    fs.mkdirSync(configDir)
    fs.writeFileSync(
      path.join(configDir, 'settings.json'),
      JSON.stringify({
        statusLine: { type: 'command', command: `"${process.execPath}" -e "process.stdout.write('linha-da-pessoa')"` },
      }),
    )
    const payload = {
      session_id: 'conversa-1',
      version: '2.1.300',
      transcript_path: '/segredo/transcricao.jsonl',
      session_name: 'Título gerado da conversa',
      cwd: '/segredo/pasta',
      workspace: { current_dir: '/segredo/pasta' },
      model: { id: 'claude-opus-5-5', display_name: 'Opus' },
      effort: { level: 'high' },
      cost: { total_cost_usd: 0.5 },
      context_window: { used_percentage: 7, context_window_size: 200000, total_input_tokens: 10, total_output_tokens: 4 },
      rate_limits: { five_hour: { used_percentage: 16, resets_at: 1790000000 } },
    }
    const run = (env) =>
      spawnSync(process.execPath, [scriptPath], {
        input: JSON.stringify(payload),
        encoding: 'utf8',
        env: { ...process.env, ...env },
      })

    const result = run({ FELIXO_PTY_SESSION_ID: 'canvas-a', CLAUDE_CONFIG_DIR: configDir })
    assert.equal(result.status, 0, result.stderr)
    assert.equal(result.stdout, 'linha-da-pessoa')

    const saved = fs.readFileSync(path.join(sessions, 'canvas-a.json'), 'utf8')
    const body = JSON.parse(saved)
    assert.equal(body.model, 'claude-opus-5-5')
    assert.equal(body.inputTokens, 10)
    assert.equal(body.rateLimits.five_hour.used_percentage, 16)
    for (const secret of ['segredo', 'transcricao', 'Título', 'cwd', 'transcript']) {
      assert.equal(saved.includes(secret), false, `${secret} não pode ir para o arquivo`)
    }
    assert.deepEqual(fs.readdirSync(sessions), ['canvas-a.json'], 'sem temporário esquecido')
    assert.equal(fs.existsSync(path.join(dir, 'rate-limits.json')), false, 'terminal do app não escreve a captura global')

    // Sem status line da pessoa, a linha do app volta a ser a de sempre.
    fs.rmSync(path.join(configDir, 'settings.json'))
    assert.equal(run({ FELIXO_PTY_SESSION_ID: 'canvas-a', CLAUDE_CONFIG_DIR: configDir }).stdout, 'Opus · pasta · 16% do limite')

    // ID de terminal inválido ou ausente: comportamento de antes, captura global.
    run({ FELIXO_PTY_SESSION_ID: '../x', CLAUDE_CONFIG_DIR: configDir })
    assert.equal(fs.existsSync(path.join(dir, 'rate-limits.json')), true)
  } finally {
    cleanup()
  }
})

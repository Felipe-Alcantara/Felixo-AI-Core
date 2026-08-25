const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { discoverAgentSession } = require('./agent-session-discovery.cjs')

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-agent-session-'))
  return {
    root,
    cwd: path.join(root, 'repo'),
    dispose: () => fs.rmSync(root, { recursive: true, force: true }),
  }
}

test('descobre somente o metadata do rollout Codex criado para o cwd', () => {
  const item = fixture()
  try {
    const file = path.join(item.root, '.codex', 'sessions', '2026', '08', '25', 'rollout-test.jsonl')
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(
      file,
      `${JSON.stringify({ type: 'session_meta', payload: { id: 'codex-session-123', cwd: item.cwd } })}\n` +
        `${JSON.stringify({ role: 'user', content: 'não deve ser lido' })}\n`,
    )
    const startedAt = Date.now()
    const result = discoverAgentSession({
      command: 'codex',
      cwd: item.cwd,
      startedAt,
      homeDir: item.root,
      now: Date.now(),
    })

    assert.deepEqual(result, {
      version: 1,
      provider: 'codex',
      sessionId: 'codex-session-123',
      cwd: item.cwd,
      capturedAt: result.capturedAt,
      source: 'cli-history',
    })
  } finally {
    item.dispose()
  }
})

test('não associa rollout de outro diretório nem sessão antiga', () => {
  const item = fixture()
  try {
    const file = path.join(item.root, '.codex', 'sessions', '2026', '08', '25', 'rollout-old.jsonl')
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, JSON.stringify({ payload: { id: 'old-session', cwd: path.join(item.root, 'outro') } }))
    const result = discoverAgentSession({
      command: 'codex',
      cwd: item.cwd,
      startedAt: Date.now(),
      homeDir: item.root,
      now: Date.now(),
    })
    assert.equal(result, null)
  } finally {
    item.dispose()
  }
})

test('descobre a sessão Gemini usando somente a raiz de projeto e o cabeçalho', () => {
  const item = fixture()
  try {
    const project = path.join(item.root, '.gemini', 'tmp', 'hash')
    const file = path.join(project, 'chats', 'session-test.jsonl')
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(path.join(project, '.project_root'), `${item.cwd}\n`)
    fs.writeFileSync(file, `${JSON.stringify({ sessionId: 'gemini-session-123' })}\n`)
    const result = discoverAgentSession({
      command: 'gemini',
      cwd: item.cwd,
      startedAt: Date.now(),
      homeDir: item.root,
      now: Date.now(),
    })
    assert.equal(result?.provider, 'gemini')
    assert.equal(result?.sessionId, 'gemini-session-123')
    assert.equal(result?.cwd, item.cwd)
  } finally {
    item.dispose()
  }
})

test('descobre a sessão Claude no diretório de projeto codificado pela própria CLI', () => {
  const item = fixture()
  try {
    const encoded = item.cwd
      .split(path.sep)
      .join('-')
      .replace(/[^A-Za-z0-9_-]/g, '-')
    const file = path.join(item.root, '.claude', 'projects', encoded, 'session.jsonl')
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, `${JSON.stringify({ type: 'mode', sessionId: 'claude-session-123' })}\n`)
    const result = discoverAgentSession({
      command: 'claude',
      cwd: item.cwd,
      startedAt: Date.now(),
      homeDir: item.root,
      now: Date.now(),
    })
    assert.equal(result?.provider, 'claude')
    assert.equal(result?.sessionId, 'claude-session-123')
  } finally {
    item.dispose()
  }
})

'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { encodeProjectDir, listClaudeApiSessions, readClaudeApiTranscript } = require('./claude-api-sessions.cjs')

const A = '1b763539-ed0a-41c1-af33-b54382ca6328'
const B = '2c874640-fe1b-42d2-b044-c65493db7439'

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-resume-'))
  const cwd = path.join(root, 'meu projeto')
  const dir = path.join(root, 'perfil', 'projects', encodeProjectDir(cwd))
  fs.mkdirSync(dir, { recursive: true })
  const write = (id, lines, mtime) => {
    const file = path.join(dir, `${id}.jsonl`)
    fs.writeFileSync(file, lines.map((l) => JSON.stringify(l)).join('\n') + '\n{"cortad')
    fs.utimesSync(file, mtime, mtime)
  }
  write(A, [
    { type: 'user', isMeta: true, message: { content: '<command-name>/x</command-name>' } },
    { type: 'user', message: { role: 'user', content: 'Crie   o arquivo\nola.txt' } },
    { type: 'assistant', message: { model: 'm', content: [{ type: 'text', text: 'Vou criar.' }, { type: 'tool_use', id: 't1', name: 'Write', input: { file_path: 'ola.txt' } }] } },
    { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't1', content: 'ok' }] } },
    { type: 'assistant', isSidechain: true, message: { content: [{ type: 'text', text: 'subagente' }] } },
    { type: 'assistant', message: { model: '<synthetic>', content: [{ type: 'text', text: 'Credit balance too low' }] } },
    { type: 'user', message: { content: [{ type: 'text', text: 'Obrigado' }] } },
  ], new Date('2026-10-18T10:00:00Z'))
  write(B, [{ type: 'user', message: { content: 'Outra conversa' } }], new Date('2026-10-19T10:00:00Z'))
  fs.writeFileSync(path.join(dir, 'nao-e-uuid.jsonl'), '{}')
  return { root, cwd, configDir: path.join(root, 'perfil'), cleanup: () => fs.rmSync(root, { recursive: true, force: true }) }
}

test('lista as conversas da conta no projeto, mais recente primeiro, com a primeira pergunta', () => {
  const env = setup()
  try {
    const list = listClaudeApiSessions({ configDir: env.configDir, cwd: env.cwd })
    assert.deepEqual(list.map((s) => s.sessionId), [B, A])
    assert.equal(list[1].firstPrompt, 'Crie o arquivo ola.txt')
    assert.equal(list[1].turns, 2)
    assert.deepEqual(listClaudeApiSessions({ configDir: env.configDir, cwd: '/outro' }), [])
    assert.deepEqual(listClaudeApiSessions({ configDir: null, cwd: env.cwd }), [])
  } finally {
    env.cleanup()
  }
})

test('o histórico volta no formato do bloco, sem subagente, aviso sintético nem linha cortada', () => {
  const env = setup()
  try {
    const entries = readClaudeApiTranscript({ configDir: env.configDir, cwd: env.cwd, sessionId: A })
    assert.deepEqual(entries, [
      { role: 'user', text: 'Crie   o arquivo\nola.txt' },
      { role: 'assistant', text: 'Vou criar.' },
      { role: 'tool', toolUseId: 't1', name: 'Write', input: { file_path: 'ola.txt' } },
      { role: 'tool-result', toolUseId: 't1', isError: false, text: 'ok' },
      { role: 'user', text: 'Obrigado' },
    ])
    assert.equal(readClaudeApiTranscript({ configDir: env.configDir, cwd: env.cwd, sessionId: '../../etc/passwd' }), null)
    assert.equal(readClaudeApiTranscript({ configDir: env.configDir, cwd: env.cwd, sessionId: '3d985751-0f2c-43e3-a155-d76504eb8540' }), null)
  } finally {
    env.cleanup()
  }
})

const test = require('node:test')
const assert = require('node:assert/strict')
const {
  assertAllowedGitArgs,
  normalizeCommitMessage,
  parseGitBranch,
  parseGitStatusLines,
} = require('./git-service.cjs')

test('parses git status lines without empty output', () => {
  assert.deepEqual(
    parseGitStatusLines('## main...origin/main\n M app/src/App.tsx\n\n?? docs/x.md\n'),
    ['## main...origin/main', ' M app/src/App.tsx', '?? docs/x.md'],
  )
})

test('parses branch from porcelain branch header', () => {
  assert.equal(
    parseGitBranch(['## feature/task...origin/feature/task', ' M file.js']),
    'feature/task',
  )
})

test('falls back to branch command output when status has no branch header', () => {
  assert.equal(parseGitBranch([' M file.js'], 'main\n'), 'main')
})

test('allows only safe git command shapes used by Code panel', () => {
  assert.doesNotThrow(() =>
    assertAllowedGitArgs(['status', '--short', '--branch']),
  )
  assert.doesNotThrow(() => assertAllowedGitArgs(['diff', '--stat']))
  assert.doesNotThrow(() => assertAllowedGitArgs(['add', '--all']))
  assert.doesNotThrow(() =>
    assertAllowedGitArgs(['restore', '--staged', '--', '.']),
  )
  assert.doesNotThrow(() =>
    assertAllowedGitArgs(['commit', '-m', 'feat: update docs']),
  )
  assert.throws(
    () => assertAllowedGitArgs(['reset', '--hard']),
    /nao permitido/,
  )
})

test('normalizes commit messages to a single safe line', () => {
  assert.equal(normalizeCommitMessage('  feat:   update docs  '), 'feat: update docs')
  assert.throws(() => normalizeCommitMessage(''), /Informe uma mensagem/)
  assert.throws(() => normalizeCommitMessage('feat: one\nbody'), /apenas uma linha/)
  assert.throws(() => normalizeCommitMessage('x'.repeat(201)), /ate 200/)
})

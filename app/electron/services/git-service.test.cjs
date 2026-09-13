const test = require('node:test')
const assert = require('node:assert/strict')
const {
  assertAllowedGitArgs,
  normalizeCommitMessage,
  parseGitBranch,
  assertSafeRepoRelativePath,
  parseGitStatusEntries,
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

test('parseGitStatusEntries separa indice de arvore de trabalho', () => {
  const entradas = parseGitStatusEntries([
    '## main...origin/main',
    ' M src/editado.ts',
    'M  src/no-stage.ts',
    'MM src/nos-dois.ts',
    '?? src/novo.ts',
    'R  src/velho.ts -> src/novo-nome.ts',
    'D  src/removido.ts',
  ])

  const porCaminho = new Map(entradas.map((item) => [item.path, item]))

  // O cabecalho de branch nao e um arquivo.
  assert.equal(entradas.length, 6)

  assert.deepEqual(
    { staged: porCaminho.get('src/editado.ts').staged, unstaged: porCaminho.get('src/editado.ts').unstaged },
    { staged: false, unstaged: true },
  )
  assert.deepEqual(
    { staged: porCaminho.get('src/no-stage.ts').staged, unstaged: porCaminho.get('src/no-stage.ts').unstaged },
    { staged: true, unstaged: false },
  )
  // O caso que a lista antiga escondia: editado depois de adicionado, entao
  // aparece nos dois lados e precisa de duas linhas na interface.
  assert.deepEqual(
    { staged: porCaminho.get('src/nos-dois.ts').staged, unstaged: porCaminho.get('src/nos-dois.ts').unstaged },
    { staged: true, unstaged: true },
  )

  const novo = porCaminho.get('src/novo.ts')
  assert.equal(novo.untracked, true)
  // Untracked nao e "staged" nem "unstaged": nao ha versao anterior com que
  // comparar, e tratar como modificacao pediria um diff que nao existe.
  assert.equal(novo.staged, false)
  assert.equal(novo.unstaged, false)

  const renomeado = porCaminho.get('src/novo-nome.ts')
  assert.equal(renomeado.originalPath, 'src/velho.ts')
  assert.equal(renomeado.staged, true)

  assert.equal(porCaminho.get('src/removido.ts').index, 'D')
})

test('parseGitStatusEntries desfaz o escape de caminho com acento', () => {
  // Com core.quotePath ligado (o padrao) o git entrega o caminho escapado em
  // octal. Sem desfazer, a interface mostraria "configura\303\247\303\243o.ts".
  const [entrada] = parseGitStatusEntries([
    ' M "src/configura\303\247\303\243o.ts"',
  ])

  assert.equal(entrada.path, 'src/configuração.ts')
})

test('assertSafeRepoRelativePath recusa tudo que sai do repositorio ou vira opcao', () => {
  assert.equal(assertSafeRepoRelativePath('src/app.ts'), 'src/app.ts')
  assert.equal(assertSafeRepoRelativePath('src/../src/app.ts'), 'src/app.ts')

  for (const invalido of ['', '   ', '../fora.txt', '/etc/passwd', 'C:/Windows/x']) {
    assert.throws(() => assertSafeRepoRelativePath(invalido), /invalido|relativo|fora do reposit/)
  }

  // Um caminho que comeca com hifen viraria opcao do git se o `--` sumisse.
  assert.throws(() => assertSafeRepoRelativePath('--upload-pack=rm -rf /'), /invalido/)
  assert.throws(() => assertSafeRepoRelativePath(`a${String.fromCharCode(0)}b`), /invalido/)
  assert.throws(() => assertSafeRepoRelativePath(null), /invalido/)
})

test('a allowlist aceita as formas por arquivo e continua recusando o resto', () => {
  assert.doesNotThrow(() => assertAllowedGitArgs(['add', '--', 'src/app.ts']))
  assert.doesNotThrow(() => assertAllowedGitArgs(['restore', '--staged', '--', 'src/app.ts']))
  assert.doesNotThrow(() => assertAllowedGitArgs(['diff', '--unified=3', '--', 'src/app.ts']))
  assert.doesNotThrow(() =>
    assertAllowedGitArgs(['diff', '--staged', '--unified=3', '--', 'src/app.ts']),
  )
  assert.doesNotThrow(() =>
    assertAllowedGitArgs(['diff', '--no-index', '--unified=3', '--', '/dev/null', 'src/novo.ts']),
  )
  assert.doesNotThrow(() =>
    assertAllowedGitArgs(['status', '--short', '--branch', '--untracked-files=all']),
  )

  // O caminho variavel nao pode ser porta de entrada para outro comando nem
  // para um arquivo fora do repositorio.
  assert.throws(() => assertAllowedGitArgs(['add', '--', '../../fora.txt']), /fora do reposit/)
  assert.throws(() => assertAllowedGitArgs(['add', '--', '--force']), /invalido/)
  assert.throws(() => assertAllowedGitArgs(['push', '--force']), /nao permitido/)
  assert.throws(() => assertAllowedGitArgs(['checkout', '--', 'src/app.ts']), /nao permitido/)
  assert.throws(() => assertAllowedGitArgs(['clean', '-fd']), /nao permitido/)
})

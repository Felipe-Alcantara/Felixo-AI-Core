const test = require('node:test')
const assert = require('node:assert/strict')
const os = require('node:os')
const fsp = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const {
  assertAllowedGitArgs,
  assertSafeBranchName,
  getCommitLog,
  listRepoFiles,
  normalizeCommitMessage,
  parseBranchTracking,
  parseGitBranch,
  assertSafeRepoRelativePath,
  parseGitStatusEntries,
  parseGitStatusLines,
  readRepoFile,
} = require('./git-service.cjs')

test('parseBranchTracking le upstream e distancia do cabecalho do porcelain', () => {
  assert.deepEqual(parseBranchTracking(['## main...origin/main [ahead 2, behind 1]']), {
    upstream: 'origin/main',
    ahead: 2,
    behind: 1,
  })
  assert.deepEqual(parseBranchTracking(['## feature']), { upstream: null, ahead: 0, behind: 0 })
})

test('assertSafeBranchName recusa o que viraria opcao ou ref invalida', () => {
  assert.equal(assertSafeBranchName('feature/login-2'), 'feature/login-2')
  for (const ruim of ['-x', '--force', 'a..b', 'a b', 'x/', 'x.lock', 'feat@{1}', 'a~1', 'a^', 'a:b']) {
    assert.throws(() => assertSafeBranchName(ruim), /invalido/, ruim)
  }
})

test('a allowlist de rede e branch aceita so as formas fixas', () => {
  assert.doesNotThrow(() => assertAllowedGitArgs(['push']))
  assert.doesNotThrow(() => assertAllowedGitArgs(['pull', '--ff-only']))
  assert.doesNotThrow(() => assertAllowedGitArgs(['switch', 'main']))
  assert.doesNotThrow(() => assertAllowedGitArgs(['push', '--set-upstream', 'origin', 'main']))
  assert.throws(() => assertAllowedGitArgs(['push', '--force']), /nao permitido/)
  assert.throws(() => assertAllowedGitArgs(['pull']), /nao permitido/)
  assert.throws(() => assertAllowedGitArgs(['switch', '-c', 'nova']), /nao permitido|invalido/)
  assert.throws(() => assertAllowedGitArgs(['switch', '--detach']), /invalido/)
})

test('descartar nunca aceita a raiz inteira como caminho', () => {
  assert.doesNotThrow(() => assertAllowedGitArgs(['clean', '-f', '--', 'novo.txt']))
  assert.doesNotThrow(() => assertAllowedGitArgs(['restore', '--staged', '--worktree', '--', 'a.ts']))
  assert.throws(() => assertAllowedGitArgs(['clean', '-f', '--', '.']), /invalido/)
  assert.throws(() => assertAllowedGitArgs(['clean', '-fd', '--', 'x']), /nao permitido/)
  assert.throws(() => assertSafeRepoRelativePath('.'), /invalido/)
})

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
    assertAllowedGitArgs(['ls-files', '--cached', '--others', '--exclude-standard', '-z']),
  )
  // Sem --exclude-standard a mesma listagem despejaria node_modules inteiro:
  // a forma aceita e uma so, nao o comando com qualquer combinacao de flags.
  assert.throws(
    () => assertAllowedGitArgs(['ls-files', '--cached', '--others', '-z']),
    /nao permitido/,
  )
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

test('listRepoFiles lista o repositorio sem o que o .gitignore exclui', async () => {
  const repo = fsp.mkdtempSync(path.join(os.tmpdir(), 'felixo-git-'))
  execFileSync('git', ['init', '--quiet'], { cwd: repo })
  fsp.writeFileSync(path.join(repo, '.gitignore'), 'ignorado/')
  fsp.mkdirSync(path.join(repo, 'src'))
  fsp.mkdirSync(path.join(repo, 'ignorado'))
  fsp.writeFileSync(path.join(repo, 'src', 'app.ts'), 'export const x = 1')
  fsp.writeFileSync(path.join(repo, 'ignorado', 'lixo.txt'), 'nao deve aparecer')

  try {
    const tree = await listRepoFiles(repo)
    assert.ok(tree.files.includes('src/app.ts'))
    assert.ok(tree.files.includes('.gitignore'))
    assert.equal(
      tree.files.some((file) => file.startsWith('ignorado/')),
      false,
    )
    // Sem duplicata: o mesmo caminho sai uma vez por estagio durante conflito.
    assert.equal(new Set(tree.files).size, tree.files.length)
    assert.equal(tree.truncated, false)
    assert.equal(tree.total, tree.files.length)
  } finally {
    fsp.rmSync(repo, { recursive: true, force: true })
  }
})

test('getCommitLog e readRepoFile trabalham sobre um repositorio real', async () => {
  const repo = fsp.mkdtempSync(path.join(os.tmpdir(), 'felixo-git-log-'))
  const git = (...args) =>
    execFileSync('git', args, {
      cwd: repo,
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: 'Teste',
        GIT_AUTHOR_EMAIL: 't@t.dev',
        GIT_COMMITTER_NAME: 'Teste',
        GIT_COMMITTER_EMAIL: 't@t.dev',
      },
    })
  git('init', '--quiet')
  fsp.writeFileSync(path.join(repo, 'a.txt'), 'linha 1')
  fsp.writeFileSync(path.join(repo, 'bin.dat'), Buffer.from([0, 1, 2, 3]))
  git('add', '--all')
  git('commit', '--quiet', '-m', 'feat: primeiro')

  try {
    const { commits } = await getCommitLog(repo)
    assert.equal(commits.length, 1)
    assert.equal(commits[0].subject, 'feat: primeiro')
    assert.equal(commits[0].author, 'Teste')
    assert.match(commits[0].shortHash, /^[0-9a-f]{7,}$/)

    const texto = readRepoFile(repo, 'a.txt')
    assert.equal(texto.content, 'linha 1')
    assert.equal(texto.binary, false)

    assert.equal(readRepoFile(repo, 'bin.dat').binary, true)
    assert.throws(() => readRepoFile(repo, '../fora.txt'), /fora do repositorio/)
    assert.throws(() => readRepoFile(repo, 'nao-existe.txt'), /ENOENT/)
  } finally {
    fsp.rmSync(repo, { recursive: true, force: true })
  }
})

test('listRepoFiles recusa pasta que nao e repositorio', async () => {
  const vazio = fsp.mkdtempSync(path.join(os.tmpdir(), 'felixo-sem-git-'))
  try {
    await assert.rejects(() => listRepoFiles(vazio), /repositorio Git/)
  } finally {
    fsp.rmSync(vazio, { recursive: true, force: true })
  }
})

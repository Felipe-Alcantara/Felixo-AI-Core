const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const {
  REPO_STATES,
  analyzeRepo,
  assertAllowedGitArgs,
  commitAllChanges,
  normalizeCommitMessage,
  pullFastForward,
  pushCurrentBranch,
} = require('./repo-analyzer.cjs')

// Os testes usam repositórios de verdade com um remoto bare local: nenhuma
// rede é tocada, e o comportamento medido é o do git instalado, não o de um
// dublê que poderia divergir dele.
function git(cwd, ...args) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  })
}

function makeWorkspace() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-analyzer-'))
  const remote = path.join(root, 'remoto.git')
  const local = path.join(root, 'local')

  fs.mkdirSync(remote)
  git(remote, 'init', '--bare', '--initial-branch=main')
  git(root, 'clone', remote, 'local')
  git(local, 'config', 'user.email', 'teste@exemplo.invalido')
  git(local, 'config', 'user.name', 'Teste')

  fs.writeFileSync(path.join(local, 'leia.md'), 'inicial\n')
  git(local, 'add', '-A')
  git(local, 'commit', '-m', 'chore: commit inicial')
  git(local, 'push', '-u', 'origin', 'main')

  return { root, remote, local }
}

test('assertAllowedGitArgs recusa qualquer comando fora da lista', () => {
  assert.doesNotThrow(() => assertAllowedGitArgs(['status', '--porcelain']))
  assert.doesNotThrow(() => assertAllowedGitArgs(['commit', '-m', 'feat: algo']))
  assert.throws(() => assertAllowedGitArgs(['push', '--force']), /não permitido/)
  assert.throws(() => assertAllowedGitArgs(['reset', '--hard']), /não permitido/)
  assert.throws(() => assertAllowedGitArgs('status'), /não permitido/)
})

test('normalizeCommitMessage exige uma linha útil dentro do limite', () => {
  assert.equal(normalizeCommitMessage('  feat:  algo\nnovo '), 'feat: algo novo')
  assert.throws(() => normalizeCommitMessage('   '), /Informe uma mensagem/)
  assert.throws(() => normalizeCommitMessage('x'.repeat(201)), /até 200/)
  assert.throws(() => normalizeCommitMessage(42), /inválida/)
})

test('analyzeRepo classifica repositório sincronizado como atualizado', async () => {
  const { local } = makeWorkspace()
  const status = await analyzeRepo(local)

  assert.equal(status.state, REPO_STATES.UP_TO_DATE)
  assert.equal(status.branch, 'main')
  assert.equal(status.ahead, 0)
  assert.equal(status.behind, 0)
})

test('analyzeRepo detecta commits locais pendentes de push', async () => {
  const { local } = makeWorkspace()

  fs.writeFileSync(path.join(local, 'novo.md'), 'conteúdo\n')
  git(local, 'add', '-A')
  git(local, 'commit', '-m', 'feat: novo arquivo')

  const status = await analyzeRepo(local)

  assert.equal(status.state, REPO_STATES.NEEDS_PUSH)
  assert.equal(status.ahead, 1)
})

test('analyzeRepo detecta commits remotos pendentes de pull', async () => {
  const { root, remote, local } = makeWorkspace()
  const outro = path.join(root, 'outro')

  git(root, 'clone', remote, 'outro')
  git(outro, 'config', 'user.email', 'teste@exemplo.invalido')
  git(outro, 'config', 'user.name', 'Teste')
  fs.writeFileSync(path.join(outro, 'remoto.md'), 'do outro clone\n')
  git(outro, 'add', '-A')
  git(outro, 'commit', '-m', 'feat: vindo de outro clone')
  git(outro, 'push')

  const status = await analyzeRepo(local)

  assert.equal(status.state, REPO_STATES.NEEDS_PULL)
  assert.equal(status.behind, 1)

  const pulled = await pullFastForward(local)

  assert.equal(pulled.ok, true)
  assert.equal((await analyzeRepo(local)).state, REPO_STATES.UP_TO_DATE)
})

test('analyzeRepo reporta mudanças não commitadas antes de qualquer ação', async () => {
  const { local } = makeWorkspace()

  fs.writeFileSync(path.join(local, 'leia.md'), 'alterado\n')

  const status = await analyzeRepo(local)

  assert.equal(status.state, REPO_STATES.DIRTY)
  assert.equal(status.dirtyFiles.length, 1)
  assert.match(status.detail, /1 arquivo/)
})

test('analyzeRepo reporta divergência sem tentar mesclar', async () => {
  const { root, remote, local } = makeWorkspace()
  const outro = path.join(root, 'outro')

  git(root, 'clone', remote, 'outro')
  git(outro, 'config', 'user.email', 'teste@exemplo.invalido')
  git(outro, 'config', 'user.name', 'Teste')
  fs.writeFileSync(path.join(outro, 'remoto.md'), 'do outro clone\n')
  git(outro, 'add', '-A')
  git(outro, 'commit', '-m', 'feat: vindo de outro clone')
  git(outro, 'push')

  fs.writeFileSync(path.join(local, 'local.md'), 'só aqui\n')
  git(local, 'add', '-A')
  git(local, 'commit', '-m', 'feat: só no local')

  const status = await analyzeRepo(local)

  assert.equal(status.state, REPO_STATES.DIVERGED)
  assert.equal(status.ahead, 1)
  assert.equal(status.behind, 1)

  // A trava principal da ferramenta: em divergência o pull precisa falhar sem
  // criar merge, deixando o repositório exatamente como estava.
  const headBefore = git(local, 'rev-parse', 'HEAD')
  const pulled = await pullFastForward(local)

  assert.equal(pulled.ok, false)
  assert.equal(git(local, 'rev-parse', 'HEAD'), headBefore)
})

test('analyzeRepo reconhece repositório sem remoto e HEAD desanexado', async () => {
  const local = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-sozinho-'))

  git(local, 'init', '--initial-branch=main')
  git(local, 'config', 'user.email', 'teste@exemplo.invalido')
  git(local, 'config', 'user.name', 'Teste')
  fs.writeFileSync(path.join(local, 'leia.md'), 'sozinho\n')
  git(local, 'add', '-A')
  git(local, 'commit', '-m', 'chore: inicial')

  assert.equal((await analyzeRepo(local)).state, REPO_STATES.NO_REMOTE)

  git(local, 'checkout', '--detach', 'HEAD')

  assert.equal((await analyzeRepo(local)).state, REPO_STATES.DETACHED)
})

test('analyzeRepo prioriza merge inacabado sobre qualquer outro estado', async () => {
  const { local } = makeWorkspace()

  fs.writeFileSync(path.join(local, 'leia.md'), 'sujo\n')
  fs.writeFileSync(path.join(local, '.git', 'MERGE_HEAD'), 'abc123\n')

  const status = await analyzeRepo(local)

  assert.equal(status.state, REPO_STATES.CONFLICT)
  assert.match(status.detail, /MERGE_HEAD/)
})

test('analyzeRepo devolve GIT_ERROR fora de um repositório, sem lançar', async () => {
  const semGit = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-sem-git-'))
  const status = await analyzeRepo(semGit)

  assert.equal(status.state, REPO_STATES.GIT_ERROR)
})

test('commitAllChanges e pushCurrentBranch fecham o ciclo do commit automático', async () => {
  const { local } = makeWorkspace()

  fs.writeFileSync(path.join(local, 'novo.md'), 'automático\n')

  const committed = await commitAllChanges(local, 'chore: commit automático de teste')

  assert.equal(committed.ok, true)
  assert.equal((await analyzeRepo(local)).state, REPO_STATES.NEEDS_PUSH)

  const pushed = await pushCurrentBranch(local)

  assert.equal(pushed.ok, true)
  assert.equal((await analyzeRepo(local)).state, REPO_STATES.UP_TO_DATE)
})

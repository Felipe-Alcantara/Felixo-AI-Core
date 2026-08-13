const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const { REPO_STATES, buildStatus } = require('./repo-analyzer.cjs')
const {
  analyzeRepos,
  autoCommitCandidates,
  buildAutoCommitMessage,
  buildSyncPlan,
  executeAutoCommits,
  executePlan,
  planHasActions,
} = require('./sync-planner.cjs')

function git(cwd, ...args) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  })
}

function makeWorkspace() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-planner-'))
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

test('buildSyncPlan separa por destino e ordena por caminho', () => {
  const plan = buildSyncPlan([
    buildStatus('/z/atualizado', REPO_STATES.UP_TO_DATE),
    buildStatus('/b/pull', REPO_STATES.NEEDS_PULL),
    buildStatus('/a/pull', REPO_STATES.NEEDS_PULL),
    buildStatus('/c/push', REPO_STATES.NEEDS_PUSH),
    buildStatus('/d/sujo', REPO_STATES.DIRTY),
    buildStatus('/e/conflito', REPO_STATES.CONFLICT),
  ])

  assert.deepEqual(
    plan.toPull.map((status) => status.path),
    ['/a/pull', '/b/pull'],
  )
  assert.equal(plan.toPush.length, 1)
  assert.equal(plan.problems.length, 2)
  assert.equal(plan.upToDate.length, 1)
  assert.equal(plan.total, 6)
  assert.equal(planHasActions(plan), true)
})

test('autoCommitCandidates ignora repositórios sujos que estão atrás do remoto', () => {
  const plan = buildSyncPlan([
    buildStatus('/a', REPO_STATES.DIRTY, { behind: 0 }),
    // Commitar este criaria divergência: ele fica só reportado.
    buildStatus('/b', REPO_STATES.DIRTY, { behind: 2 }),
    buildStatus('/c', REPO_STATES.CONFLICT),
  ])

  assert.deepEqual(
    autoCommitCandidates(plan).map((status) => status.path),
    ['/a'],
  )
})

test('buildAutoCommitMessage descreve a passada em uma linha', () => {
  const message = buildAutoCommitMessage(new Date(2026, 6, 5, 14, 30))

  assert.equal(
    message,
    'chore: commit automático do Fetch All — domingo, 05/07/2026 14:30',
  )
})

test('analyzeRepos reporta progresso e respeita o cancelamento', async () => {
  const { local } = makeWorkspace()
  const progress = []

  const statuses = await analyzeRepos([local], {
    concurrency: 2,
    onProgress: (event) => progress.push(event),
  })

  assert.equal(statuses.length, 1)
  assert.equal(progress.length, 1)
  assert.equal(progress[0].total, 1)

  const controller = new AbortController()
  controller.abort()

  assert.deepEqual(await analyzeRepos([local], { signal: controller.signal }), [])
})

test('executePlan recusa a ação quando o estado mudou depois da revisão', async () => {
  const { local } = makeWorkspace()
  // O plano diz "precisa de pull", mas no disco não há nada a puxar: o
  // repositório mudou entre a revisão e a execução.
  const plan = buildSyncPlan([buildStatus(local, REPO_STATES.NEEDS_PULL, { behind: 1 })])
  const results = await executePlan(plan)

  assert.equal(results.length, 1)
  assert.equal(results[0].ok, false)
  assert.match(results[0].message, /estado mudou desde a revisão/)
})

test('executePlan faz o push do que está realmente à frente do remoto', async () => {
  const { local } = makeWorkspace()

  fs.writeFileSync(path.join(local, 'novo.md'), 'conteúdo\n')
  git(local, 'add', '-A')
  git(local, 'commit', '-m', 'feat: novo arquivo')

  const plan = buildSyncPlan([buildStatus(local, REPO_STATES.NEEDS_PUSH, { ahead: 1 })])
  const results = await executePlan(plan)

  assert.equal(results.length, 1)
  assert.equal(results[0].ok, true)
  assert.equal(results[0].action, 'push')
  assert.equal(git(local, 'rev-parse', 'HEAD'), git(local, 'rev-parse', 'origin/main'))
})

test('executeAutoCommits commita e envia o repositório sujo ao remoto', async () => {
  const { local } = makeWorkspace()

  fs.writeFileSync(path.join(local, 'novo.md'), 'pendente\n')

  const candidate = buildStatus(local, REPO_STATES.DIRTY, { behind: 0 })
  const results = await executeAutoCommits([candidate], 'chore: commit automático')

  assert.deepEqual(
    results.map((result) => [result.action, result.ok]),
    [
      ['commit', true],
      ['push', true],
    ],
  )
  assert.equal(git(local, 'status', '--porcelain').trim(), '')
})

test('executeAutoCommits não commita repositório que ficou atrás do remoto', async () => {
  const { root, remote, local } = makeWorkspace()
  const outro = path.join(root, 'outro')

  git(root, 'clone', remote, 'outro')
  git(outro, 'config', 'user.email', 'teste@exemplo.invalido')
  git(outro, 'config', 'user.name', 'Teste')
  fs.writeFileSync(path.join(outro, 'remoto.md'), 'do outro clone\n')
  git(outro, 'add', '-A')
  git(outro, 'commit', '-m', 'feat: vindo de outro clone')
  git(outro, 'push')

  fs.writeFileSync(path.join(local, 'novo.md'), 'pendente\n')

  const candidate = buildStatus(local, REPO_STATES.DIRTY, { behind: 0 })
  const results = await executeAutoCommits([candidate], 'chore: commit automático')

  assert.equal(results.length, 1)
  assert.equal(results[0].ok, false)
  assert.match(results[0].message, /estado mudou desde a revisão/)
  // O arquivo continua fora do histórico: nada foi commitado.
  assert.match(git(local, 'status', '--porcelain'), /novo\.md/)
})

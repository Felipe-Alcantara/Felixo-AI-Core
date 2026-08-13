const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const { createFetchAllService, dropIgnoredFromPlan } = require('./fetch-all-service.cjs')
const { REPO_STATES, buildStatus } = require('./fetch-all/repo-analyzer.cjs')
const { buildSyncPlan } = require('./fetch-all/sync-planner.cjs')

function git(cwd, ...args) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  })
}

/** Um espaço de trabalho com dois repositórios locais sem remoto. */
function makeWorkspace() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-service-'))

  for (const name of ['projeto-a', 'arquivo-morto/projeto-b']) {
    const repo = path.join(root, name)

    fs.mkdirSync(repo, { recursive: true })
    git(repo, 'init', '--initial-branch=main')
    git(repo, 'config', 'user.email', 'teste@exemplo.invalido')
    git(repo, 'config', 'user.name', 'Teste')
    fs.writeFileSync(path.join(repo, 'leia.md'), 'conteúdo\n')
    git(repo, 'add', '-A')
    git(repo, 'commit', '-m', 'chore: inicial')
  }

  return root
}

function makeService(events = []) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-paths-'))
  const appPaths = {
    config: path.join(base, 'config'),
    cache: path.join(base, 'cache'),
    reports: path.join(base, 'reports'),
  }

  for (const dir of Object.values(appPaths)) fs.mkdirSync(dir, { recursive: true })

  return {
    appPaths,
    service: createFetchAllService({ appPaths, sendEvent: (event) => events.push(event) }),
  }
}

test('dropIgnoredFromPlan tira os repositórios ignorados e recalcula o total', () => {
  const plan = buildSyncPlan([
    buildStatus('/repos/fica', REPO_STATES.NEEDS_PULL),
    buildStatus('/repos/arquivo/sai', REPO_STATES.DIRTY),
  ])
  const filtered = dropIgnoredFromPlan(plan, ['/repos/arquivo'])

  assert.equal(filtered.total, 1)
  assert.equal(filtered.problems.length, 0)
  assert.deepEqual(
    filtered.toPull.map((status) => status.path),
    ['/repos/fica'],
  )
})

test('a varredura classifica os repositórios encontrados e publica progresso', async () => {
  const workspace = makeWorkspace()
  const events = []
  const { service } = makeService(events)

  await service.saveSettings({ scanRoots: [workspace] })

  const result = await service.scan()

  assert.equal(result.ok, true)
  // Sem remoto configurado, nada é ação segura: os dois só são reportados.
  assert.equal(result.plan.total, 2)
  assert.equal(result.plan.problems.length, 2)
  assert.equal(
    result.plan.problems.every((status) => status.state === REPO_STATES.NO_REMOTE),
    true,
  )
  assert.ok(events.some((event) => event.type === 'analyze'))
  assert.equal(events.at(-1).type, 'done')
})

test('ignorar uma pasta a tira do plano atual e das varreduras seguintes', async () => {
  const workspace = makeWorkspace()
  const { service } = makeService()

  await service.saveSettings({ scanRoots: [workspace] })
  await service.scan()

  const ignored = await service.ignorePath(path.join(workspace, 'arquivo-morto'))

  assert.equal(ignored.plan.total, 1)
  assert.deepEqual(ignored.settings.ignoredPaths, [path.join(workspace, 'arquivo-morto')])

  const rescanned = await service.scan()

  assert.equal(rescanned.plan.total, 1)

  const restored = await service.unignorePath(path.join(workspace, 'arquivo-morto'))

  assert.deepEqual(restored.ignoredPaths, [])
  assert.equal((await service.scan()).plan.total, 2)
})

test('a varredura rápida reaproveita o cache da varredura completa', async () => {
  const workspace = makeWorkspace()
  const { service } = makeService()

  await service.saveSettings({ scanRoots: [workspace] })
  await service.scan()

  const cached = await service.scan({ useCache: true })

  assert.equal(cached.plan.total, 2)
  assert.match(cached.scanMode, /^rápida/)

  // Um repositório apagado depois do cache não pode reaparecer no plano.
  fs.rmSync(path.join(workspace, 'projeto-a'), { recursive: true, force: true })

  assert.equal((await service.scan({ useCache: true })).plan.total, 1)
})

test('executar sem plano ou sem ação segura é recusado com mensagem', async () => {
  const workspace = makeWorkspace()
  const { service } = makeService()

  assert.match((await service.execute()).message, /varredura antes/)

  await service.saveSettings({ scanRoots: [workspace] })
  await service.scan()

  // Os dois repositórios estão sem remoto: só reportados, nunca executados.
  assert.match((await service.execute()).message, /nenhuma ação segura/)
})

test('o estado atual sobrevive ao fechamento do painel', async () => {
  const workspace = makeWorkspace()
  const { service } = makeService()

  await service.saveSettings({ scanRoots: [workspace] })
  await service.scan()

  const state = service.getState()

  assert.equal(state.busy, false)
  assert.equal(state.phase, 'idle')
  assert.equal(state.plan.total, 2)
})

test('descreve o escopo da varredura para a interface', async () => {
  const { service } = makeService()
  const scope = await service.describeScanScope()

  assert.deepEqual(scope.configured, [])
  assert.ok(scope.resolved.length > 0)
  assert.ok(scope.available.length > 0)
})

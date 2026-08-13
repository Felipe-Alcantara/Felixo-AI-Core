const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { REPO_STATES, buildStatus } = require('./repo-analyzer.cjs')
const { buildSyncPlan } = require('./sync-planner.cjs')
const { buildReportFileName, buildRunReport, writeRunReport } = require('./run-report.cjs')
const { redactSensitiveText } = require('./secret-redaction.cjs')

const WHEN = new Date(2026, 6, 5, 14, 30, 15)

test('redactSensitiveText mascara credenciais em URL, parâmetro e token', () => {
  assert.equal(
    redactSensitiveText('https://usuario:senha@github.com/org/repo.git'),
    'https://***@github.com/org/repo.git',
  )
  assert.equal(redactSensitiveText('?access_token=abc123&x=1'), '?access_token=***&x=1')
  assert.equal(
    redactSensitiveText(`falhou com ghp_${'a'.repeat(30)}`),
    'falhou com ***',
  )
  assert.equal(redactSensitiveText(null), '')
})

test('buildRunReport separa o que foi feito, o que ficou e o que subiu', () => {
  const plan = buildSyncPlan([
    buildStatus('/repos/enviado', REPO_STATES.NEEDS_PUSH, { branch: 'main', ahead: 1 }),
    buildStatus('/repos/puxar', REPO_STATES.NEEDS_PULL, { branch: 'main', behind: 1 }),
    buildStatus('/repos/divergido', REPO_STATES.DIVERGED, {
      branch: 'main',
      detail: 'resolva manualmente',
    }),
  ])
  const report = buildRunReport({
    plan,
    results: [
      { status: plan.toPush[0], action: 'push', ok: true, message: 'ok' },
      { status: plan.toPull[0], action: 'pull', ok: false, message: 'sem permissão' },
    ],
    executed: true,
    scanMode: 'completa',
    when: WHEN,
  })

  assert.match(report, /# Passada de 05\/07\/2026 14:30:15/)
  assert.match(report, /\*\*Repositórios encontrados:\*\* 3/)
  assert.match(report, /push concluído/)
  assert.match(report, /pull FALHOU: sem permissão/)
  assert.match(report, /Divergiu do remoto — resolva manualmente/)
  assert.match(report, /push enviado ao remoto/)
  assert.match(report, /2 item\(ns\) exigem atenção manual/)
})

test('buildRunReport registra o plano não executado como pendência', () => {
  const plan = buildSyncPlan([
    buildStatus('/repos/puxar', REPO_STATES.NEEDS_PULL, { branch: 'main', behind: 1 }),
  ])
  const report = buildRunReport({
    plan,
    results: [],
    executed: false,
    scanMode: 'rápida',
    when: WHEN,
  })

  assert.match(report, /Nada foi executado/)
  assert.match(report, /pull planejado, não executado/)
  assert.match(report, /1 item\(ns\) exigem atenção manual/)
})

test('buildRunReport não deixa texto externo quebrar o Markdown nem vazar segredo', () => {
  const plan = buildSyncPlan([
    buildStatus('/repos/`estranho`', REPO_STATES.NEEDS_PUSH, { branch: 'main', ahead: 1 }),
  ])
  const report = buildRunReport({
    plan,
    results: [
      {
        status: plan.toPush[0],
        action: 'push',
        ok: false,
        message: 'erro\n## Cabeçalho falso em https://user:senha@host/repo.git',
      },
    ],
    executed: true,
    scanMode: 'completa',
    when: WHEN,
  })

  // A mensagem do git virou uma linha só, sem virar cabeçalho do relatório.
  assert.equal(report.includes('\n## Cabeçalho falso'), false)
  assert.equal(report.includes('senha@host'), false)
  // O caminho com crase é cercado por uma cerca maior, e não quebra o código.
  assert.match(report, /`` \/repos\/`estranho` ``/)
})

test('writeRunReport grava na subpasta da ferramenta com nome ordenável', async () => {
  const reportsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-report-'))
  const plan = buildSyncPlan([])
  const filePath = await writeRunReport({
    reportsDir,
    plan,
    results: [],
    executed: false,
    scanMode: 'completa',
    when: WHEN,
  })

  assert.equal(path.basename(filePath), buildReportFileName(WHEN))
  assert.equal(path.basename(path.dirname(filePath)), 'fetch-all')
  assert.match(fs.readFileSync(filePath, 'utf8'), /Nenhuma pendência/)
})

'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { buildProblemReport, writeProblemReportFile } = require('./qa-report-builder.cjs')

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-qa-report-'))
}

test('buildProblemReport inclui versão do app, SO, arquitetura e horário', () => {
  const report = buildProblemReport({
    appVersion: '0.1.335',
    platformName: 'linux',
    arch: 'x64',
    qaEntries: [],
    cliDetectionResults: [],
    generatedAt: '2026-09-14T09:00:00.000Z',
  })

  assert.deepEqual(report.app, { version: '0.1.335', platform: 'linux', arch: 'x64' })
  assert.equal(report.generatedAt, '2026-09-14T09:00:00.000Z')
  assert.equal(report.version, 1)
})

test('buildProblemReport resume o estado de cada CLI (detectada, versão, erro)', () => {
  const report = buildProblemReport({
    appVersion: '0.1.0',
    platformName: 'linux',
    arch: 'x64',
    cliDetectionResults: [
      { name: 'Claude Code', detected: true, version: '2.1.270' },
      { name: 'Codex', detected: false, error: 'não encontrada no PATH' },
    ],
  })

  assert.deepEqual(report.cliStatus, [
    { name: 'Claude Code', detected: true, version: '2.1.270', error: null },
    { name: 'Codex', detected: false, version: null, error: 'não encontrada no PATH' },
  ])
})

test('buildProblemReport limita as entradas de log às últimas maxEntries', () => {
  const qaEntries = Array.from({ length: 10 }, (_, index) => ({ id: index, message: `evento-${index}` }))
  const report = buildProblemReport({ appVersion: '0.1.0', platformName: 'linux', arch: 'x64', qaEntries, maxEntries: 3 })

  assert.deepEqual(report.recentLogEntries.map((entry) => entry.message), ['evento-7', 'evento-8', 'evento-9'])
})

test('buildProblemReport nunca carrega segredo — nem em texto livre nem em chave sensível de detalhe', () => {
  const SEGREDOS = {
    tokenGithub: 'ghp_1234567890abcdefghijklmnopqrstuvwx',
    senha: 'MinhaSenhaSuperSecreta!2026',
    apiKeyOpenRouter: 'sk-or-v1-abcdef0123456789',
  }

  const report = buildProblemReport({
    appVersion: '0.1.0',
    platformName: 'linux',
    arch: 'x64',
    cliDetectionResults: [
      { name: 'Openia', detected: true, version: '0.1.0', error: `falhou ao autenticar: token=${SEGREDOS.tokenGithub}` },
    ],
    qaEntries: [
      {
        id: 1,
        level: 'error',
        scope: 'git:sync',
        message: `push falhou com password=${SEGREDOS.senha}`,
        details: {
          apiKey: SEGREDOS.apiKeyOpenRouter,
          headers: { authorization: `Bearer ${SEGREDOS.apiKeyOpenRouter}` },
          nested: { credentials: { password: SEGREDOS.senha } },
        },
      },
    ],
  })

  const serialized = JSON.stringify(report)
  for (const segredo of Object.values(SEGREDOS)) {
    assert.doesNotMatch(serialized, new RegExp(segredo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  }
})

test('writeProblemReportFile grava o JSON legível na pasta informada e devolve o caminho', () => {
  const directory = tempDir()
  const report = buildProblemReport({
    appVersion: '0.1.0',
    platformName: 'linux',
    arch: 'x64',
    generatedAt: '2026-09-14T09:00:00.000Z',
  })

  const filePath = writeProblemReportFile(report, { directory })

  assert.equal(fs.existsSync(filePath), true)
  assert.match(path.basename(filePath), /^problema-2026-09-14T09-00-00-000Z\.json$/)
  assert.deepEqual(JSON.parse(fs.readFileSync(filePath, 'utf8')), report)
})

test('writeProblemReportFile exige um diretório', () => {
  assert.throws(() => writeProblemReportFile(buildProblemReport({}), {}), /Diretório de relatórios não informado/)
})

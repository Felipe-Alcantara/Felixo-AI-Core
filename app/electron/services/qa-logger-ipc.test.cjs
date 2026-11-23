const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const Module = require('node:module')

const handlers = new Map()
const originalLoad = Module._load
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'electron') {
    return { ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) } }
  }
  return originalLoad.call(this, request, parent, isMain)
}
const { registerQaLoggerIpcHandlers, logQaEvent } = require('./qa-logger.cjs')
Module._load = originalLoad

test('qa-logger:build-report monta o relatório com o contexto injetado e grava o arquivo na pasta pedida', async () => {
  const reportsDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-qa-report-'))
  try {
    registerQaLoggerIpcHandlers(() => null, {
      getReportContext: async () => ({
        appVersion: '9.9.9-teste',
        platformName: 'plataforma-de-teste',
        arch: 'arch-de-teste',
        cliDetectionResults: [],
        reportsDirectory,
      }),
    })
    logQaEvent({ level: 'warn', scope: 'teste-do-relatorio', message: 'entrada que deve ir para o relatório' })

    const result = await handlers.get('qa-logger:build-report')()

    assert.equal(result.ok, true)
    assert.equal(path.dirname(result.filePath), reportsDirectory)
    assert.ok(fs.existsSync(result.filePath), 'o arquivo do relatório deveria existir')
    assert.equal(result.report.version, 1)
    const gravado = JSON.parse(fs.readFileSync(result.filePath, 'utf8'))
    assert.equal(gravado.generatedAt, result.report.generatedAt)
    assert.match(JSON.stringify(gravado), /entrada que deve ir para o relatório/)
    assert.match(JSON.stringify(gravado), /9\.9\.9-teste/)
  } finally {
    fs.rmSync(reportsDirectory, { recursive: true, force: true })
  }
})

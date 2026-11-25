'use strict'
require('../../scripts/test-support/pasta-do-teste.cjs') // isola o temporário deste arquivo (ver pasta-do-teste.cjs)

const test = require('node:test')
const assert = require('node:assert/strict')
const os = require('node:os')
const path = require('node:path')
const { loadAutomationSaveDialog, requestedSaveFile } = require('./devtools-save-file-guard.cjs')

const arquivo = path.join(os.tmpdir(), 'canvas-do-smoke.fxcanvas')

test('sem porta de automação o app normal nunca recebe o substituto', () => {
  assert.equal(loadAutomationSaveDialog({ env: { FELIXO_DEVTOOLS_SAVE_FILE: arquivo } }), null)
  assert.equal(loadAutomationSaveDialog({ env: { FELIXO_DEVTOOLS_SAVE_FILE: arquivo }, devtoolsPort: 0 }), null)
  assert.equal(loadAutomationSaveDialog({ env: { FELIXO_DEVTOOLS_SAVE_FILE: arquivo }, devtoolsPort: 70000 }), null)
})

test('na automação com pasta existente, o "Salvar como" devolve esse arquivo', async () => {
  const dialog = loadAutomationSaveDialog({ env: { FELIXO_DEVTOOLS_SAVE_FILE: arquivo }, devtoolsPort: 9333 })
  assert.deepEqual(await dialog.showSaveDialog(), { canceled: false, filePath: arquivo })
})

test('caminho relativo, de pasta inexistente ou ausente não vira diálogo', () => {
  const opcoes = (file) => ({ env: { FELIXO_DEVTOOLS_SAVE_FILE: file }, devtoolsPort: 9333 })
  assert.equal(requestedSaveFile(opcoes('relativo/canvas.fxcanvas')), null)
  assert.equal(requestedSaveFile(opcoes(path.join(os.tmpdir(), `nao-existe-${Date.now()}`, 'canvas.fxcanvas'))), null)
  assert.equal(requestedSaveFile({ env: {}, devtoolsPort: 9333 }), null)
})

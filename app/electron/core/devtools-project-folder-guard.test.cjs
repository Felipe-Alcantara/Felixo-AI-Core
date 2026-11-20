'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const os = require('node:os')
const { loadAutomationProjectDialog, requestedProjectFolder } = require('./devtools-project-folder-guard.cjs')

const pasta = os.tmpdir()

test('sem porta de automação o app normal nunca recebe o substituto', async () => {
  assert.equal(loadAutomationProjectDialog({ env: { FELIXO_DEVTOOLS_PROJECT_FOLDER: pasta } }), null)
  assert.equal(loadAutomationProjectDialog({ env: { FELIXO_DEVTOOLS_PROJECT_FOLDER: pasta }, devtoolsPort: 0 }), null)
  assert.equal(loadAutomationProjectDialog({ env: { FELIXO_DEVTOOLS_PROJECT_FOLDER: pasta }, devtoolsPort: 70000 }), null)
})

test('na automação com pasta existente, o seletor devolve essa pasta', async () => {
  const dialog = loadAutomationProjectDialog({ env: { FELIXO_DEVTOOLS_PROJECT_FOLDER: pasta }, devtoolsPort: 9333 })
  assert.deepEqual(await dialog.showOpenDialog(), { canceled: false, filePaths: [pasta] })
})

test('caminho relativo, inexistente, de arquivo ou ausente não vira seletor', () => {
  const opcoes = (folder) => ({ env: { FELIXO_DEVTOOLS_PROJECT_FOLDER: folder }, devtoolsPort: 9333 })
  assert.equal(requestedProjectFolder(opcoes('relativa/pasta')), null)
  assert.equal(requestedProjectFolder(opcoes(`${pasta}/nao-existe-${Date.now()}`)), null)
  assert.equal(requestedProjectFolder(opcoes(__filename)), null)
  assert.equal(requestedProjectFolder({ env: {}, devtoolsPort: 9333 }), null)
})

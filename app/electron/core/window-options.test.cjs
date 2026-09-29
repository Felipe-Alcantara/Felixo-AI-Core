const test = require('node:test')
const assert = require('node:assert/strict')
const { mainWindowOptions } = require('./window-options.cjs')

test('main window keeps vscode-like resize controls enabled', () => {
  assert.equal(mainWindowOptions.resizable, true)
  assert.equal(mainWindowOptions.maximizable, true)
  assert.equal(mainWindowOptions.fullscreenable, true)
  assert.ok(mainWindowOptions.minWidth >= 720)
  assert.ok(mainWindowOptions.minHeight >= 500)
})

test('main window is visible by default outside the isolated DevTools process', () => {
  assert.equal(mainWindowOptions.show, true)
})

test('o renderer principal fica isolado: sem Node, com sandbox e contexto separado do preload', () => {
  // O preload expõe PTY e arquivos. Estas três flags são o que impede uma
  // página que chegue ao renderer de alcançar o Node por fora dessa ponte;
  // a guarda de navegação (navigation-guard.cjs) impede que ela chegue.
  const { webPreferences } = mainWindowOptions
  assert.equal(webPreferences.contextIsolation, true)
  assert.equal(webPreferences.nodeIntegration, false)
  assert.equal(webPreferences.sandbox, true)
  assert.notEqual(webPreferences.webSecurity, false)
  assert.notEqual(webPreferences.allowRunningInsecureContent, true)
  assert.notEqual(webPreferences.nodeIntegrationInSubFrames, true)
})

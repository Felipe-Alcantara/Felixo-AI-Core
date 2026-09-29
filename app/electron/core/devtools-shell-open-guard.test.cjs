const test = require('node:test')
const assert = require('node:assert/strict')

const { isShellOpenFailureRequested, loadAutomationShellOpen } = require('./devtools-shell-open-guard.cjs')

test('só a instância de automação que pediu troca o shell', () => {
  const pediu = { FELIXO_DEVTOOLS_SHELL_OPEN: 'falha' }
  assert.equal(isShellOpenFailureRequested({ env: pediu, devtoolsPort: 9222 }), true)
  assert.equal(isShellOpenFailureRequested({ env: pediu, devtoolsPort: '9222' }), true)
  // Sem porta de depuração válida, é o app normal: nunca troca.
  for (const devtoolsPort of [undefined, '', 'abc', 0, -1, 70000, Number.NaN]) {
    assert.equal(isShellOpenFailureRequested({ env: pediu, devtoolsPort }), false, String(devtoolsPort))
  }
  // Com a porta, mas sem o pedido exato, também não.
  for (const valor of [undefined, '', '1', 'FALHA', 'grava']) {
    assert.equal(
      isShellOpenFailureRequested({ env: { FELIXO_DEVTOOLS_SHELL_OPEN: valor }, devtoolsPort: 9222 }),
      false,
      String(valor),
    )
  }
  assert.equal(loadAutomationShellOpen({ env: {}, devtoolsPort: 9222 }), null)
  assert.equal(loadAutomationShellOpen({ env: pediu }), null)
})

test('o shell da automação falha sempre, como um sistema sem navegador padrão', async () => {
  const shell = loadAutomationShellOpen({ env: { FELIXO_DEVTOOLS_SHELL_OPEN: 'falha' }, devtoolsPort: 9222 })
  await assert.rejects(shell.openExternal('https://example.com/'), /Nenhum navegador aceitou/)
})

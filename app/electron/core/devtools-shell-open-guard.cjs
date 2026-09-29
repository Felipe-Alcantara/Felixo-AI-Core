'use strict'

/**
 * @module devtools-shell-open-guard
 * Se esta instância do app troca o `shell.openExternal` por um que falha.
 *
 * Mesma guarda da CLI roteirizada (`devtools-fake-cli-pty-guard.cjs`): só a
 * instância de automação (porta de depuração válida, criada pelo
 * `felixo devtools` ou pelo smoke) que pediu explicitamente
 * (`FELIXO_DEVTOOLS_SHELL_OPEN=falha`) recebe o substituto. Com ele, o smoke
 * prova o aviso de "não foi possível abrir no navegador" sem depender de uma
 * máquina sem navegador, e sem abrir navegador nenhum.
 */

/**
 * @param {{ env?: Record<string, string | undefined>, devtoolsPort?: unknown }} [options]
 * @returns {boolean}
 */
function isShellOpenFailureRequested({ env = {}, devtoolsPort } = {}) {
  const port =
    typeof devtoolsPort === 'number' ? devtoolsPort : Number.parseInt(String(devtoolsPort ?? ''), 10)
  const automationInstance = Number.isInteger(port) && port > 0 && port <= 65535
  return automationInstance && env?.FELIXO_DEVTOOLS_SHELL_OPEN === 'falha'
}

/**
 * O `shell` que o processo principal usa para abrir links: o do Electron
 * (`null` aqui) ou, só na automação que pediu, um que sempre falha como um
 * sistema sem navegador padrão.
 *
 * @param {{ env?: Record<string, string | undefined>, devtoolsPort?: unknown }} [options]
 * @returns {{ openExternal: (url: string) => Promise<void> } | null}
 */
function loadAutomationShellOpen(options = {}) {
  if (!isShellOpenFailureRequested(options)) return null
  return {
    openExternal: async () => {
      throw new Error('Nenhum navegador aceitou o endereço (automação: FELIXO_DEVTOOLS_SHELL_OPEN=falha).')
    },
  }
}

module.exports = {
  isShellOpenFailureRequested,
  loadAutomationShellOpen,
}

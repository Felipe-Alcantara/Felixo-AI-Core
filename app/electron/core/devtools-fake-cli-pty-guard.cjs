'use strict'

/**
 * @module devtools-fake-cli-pty-guard
 * Se esta instância do app troca o `node-pty` pelo PTY roteirizado do smoke.
 *
 * Mesma guarda do `hardware:get-profile` com `FELIXO_DEVTOOLS_HARDWARE_NOTICES`
 * e do tutorial com `FELIXO_DEVTOOLS_ONBOARDING`: só a instância de automação
 * (porta de depuração válida, criada pelo `felixo devtools` ou pelo smoke) que
 * pediu explicitamente (`FELIXO_DEVTOOLS_FAKE_CLI_PTY=1`) carrega
 * `services/devtools-fake-cli-pty.cjs`. O `require` do módulo fica atrás desta
 * guarda: o app normal nunca o carrega, e um terminal de verdade nunca vira
 * roteiro por engano.
 */

/**
 * @param {{ env?: Record<string, string | undefined>, devtoolsPort?: unknown }} [options]
 * @returns {boolean}
 */
function isFakeCliPtyRequested({ env = {}, devtoolsPort } = {}) {
  const port =
    typeof devtoolsPort === 'number' ? devtoolsPort : Number.parseInt(String(devtoolsPort ?? ''), 10)
  const automationInstance = Number.isInteger(port) && port > 0 && port <= 65535
  return automationInstance && env?.FELIXO_DEVTOOLS_FAKE_CLI_PTY === '1'
}

/**
 * Carrega o PTY roteirizado só quando a guarda deixa; senão devolve `null` sem
 * tocar no módulo.
 *
 * @param {{ env?: Record<string, string | undefined>, devtoolsPort?: unknown, load?: () => typeof import('../services/devtools-fake-cli-pty.cjs') }} [options]
 * @returns {typeof import('../services/devtools-fake-cli-pty.cjs') | null}
 */
function loadDevtoolsFakeCliPty({
  env,
  devtoolsPort,
  load = () => require('../services/devtools-fake-cli-pty.cjs'),
} = {}) {
  return isFakeCliPtyRequested({ env, devtoolsPort }) ? load() : null
}

module.exports = {
  isFakeCliPtyRequested,
  loadDevtoolsFakeCliPty,
}

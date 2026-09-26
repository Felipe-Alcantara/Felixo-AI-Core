'use strict'

/**
 * @module onboarding-automation
 * Se o tutorial pode abrir (e gravar) sozinho nesta instância do app.
 *
 * Decidido no processo principal, no mesmo molde do `hardware:get-profile`
 * com `FELIXO_DEVTOOLS_HARDWARE_NOTICES`: a instância de automação (`felixo
 * devtools`, `canvas-smoke`, `ui-render-performance`, `hardware-check`, todas
 * com porta de depuração) não abre o tutorial nem grava nada sozinha, para não
 * cobrir botões, não entrar nas capturas e não mudar os números das bancadas.
 * `FELIXO_DEVTOOLS_ONBOARDING=1` liga o comportamento de produto nela, para o
 * smoke provar o primeiro uso de verdade.
 *
 * Ações explícitas da pessoa pela Ajuda continuam gravando em qualquer caso.
 */

/**
 * @param {{ env?: Record<string, string | undefined>, devtoolsPort?: unknown }} options
 * @returns {{ autoOpen: boolean, reason: 'produto' | 'devtools' | 'devtools-opt-in' }}
 */
function resolveOnboardingAutomation({ env = {}, devtoolsPort } = {}) {
  const port = typeof devtoolsPort === 'number' ? devtoolsPort : Number.parseInt(String(devtoolsPort ?? ''), 10)
  const automationInstance = Number.isInteger(port) && port > 0 && port <= 65535

  if (!automationInstance) return { autoOpen: true, reason: 'produto' }
  if (env.FELIXO_DEVTOOLS_ONBOARDING === '1') return { autoOpen: true, reason: 'devtools-opt-in' }
  return { autoOpen: false, reason: 'devtools' }
}

module.exports = {
  resolveOnboardingAutomation,
}

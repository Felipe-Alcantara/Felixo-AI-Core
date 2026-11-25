'use strict'

/**
 * @module devtools-fake-openia-guard
 * Se esta instância do app troca o Openia (catálogo, preço, geração, versão e
 * instalação) pelo roteirizado do smoke do popover "Gerar imagem".
 *
 * Mesma guarda da CLI roteirizada e do seletor de pasta: só a instância de
 * automação (porta de depuração válida, criada pelo `felixo devtools` ou pelo
 * smoke) que pediu (`FELIXO_DEVTOOLS_FAKE_OPENIA=1`) carrega
 * `services/devtools-fake-openia.cjs`. O `require` fica atrás desta guarda: o
 * app normal nunca o carrega, e nenhuma chamada à OpenRouter parte do smoke.
 */

/**
 * @param {{ env?: Record<string, string | undefined>, devtoolsPort?: unknown }} [options]
 * @returns {boolean}
 */
function isFakeOpeniaRequested({ env = {}, devtoolsPort } = {}) {
  const port =
    typeof devtoolsPort === 'number' ? devtoolsPort : Number.parseInt(String(devtoolsPort ?? ''), 10)
  const automationInstance = Number.isInteger(port) && port > 0 && port <= 65535
  return automationInstance && env?.FELIXO_DEVTOOLS_FAKE_OPENIA === '1'
}

/**
 * @param {{ env?: Record<string, string | undefined>, devtoolsPort?: unknown, load?: () => typeof import('../services/devtools-fake-openia.cjs') }} [options]
 * @returns {ReturnType<typeof import('../services/devtools-fake-openia.cjs').createFakeOpenia> | null}
 */
function loadDevtoolsFakeOpenia({
  env,
  devtoolsPort,
  load = () => require('../services/devtools-fake-openia.cjs'),
} = {}) {
  return isFakeOpeniaRequested({ env, devtoolsPort }) ? load().createFakeOpenia() : null
}

module.exports = {
  isFakeOpeniaRequested,
  loadDevtoolsFakeOpenia,
}

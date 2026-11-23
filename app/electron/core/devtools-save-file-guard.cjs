'use strict'

/**
 * @module devtools-save-file-guard
 * O "Salvar como" nativo trocado por um caminho fixo, só na automação.
 *
 * Mesma guarda do seletor de pasta dos projetos: só a instância de automação (porta de depuração válida, criada pelo
 * `felixo devtools` ou pelo smoke) que pediu (`FELIXO_DEVTOOLS_SAVE_FILE=<caminho absoluto de um arquivo cuja pasta
 * existe>`) recebe o substituto. O smoke precisa exportar o canvas e o diálogo nativo não é acionável por teste. O app
 * normal nunca recebe o substituto.
 */

const fs = require('node:fs')
const path = require('node:path')

/**
 * @param {{ env?: Record<string, string | undefined>, devtoolsPort?: unknown, fileSystem?: Pick<typeof fs, 'statSync'> }} [options]
 * @returns {string | null} o arquivo pedido, ou null fora da automação
 */
function requestedSaveFile({ env = {}, devtoolsPort, fileSystem = fs } = {}) {
  const port = typeof devtoolsPort === 'number' ? devtoolsPort : Number.parseInt(String(devtoolsPort ?? ''), 10)
  const automationInstance = Number.isInteger(port) && port > 0 && port <= 65535
  const file = env?.FELIXO_DEVTOOLS_SAVE_FILE
  if (!automationInstance || typeof file !== 'string' || !path.isAbsolute(file)) return null
  try {
    return fileSystem.statSync(path.dirname(file)).isDirectory() ? file : null
  } catch {
    return null
  }
}

/**
 * O `dialog` que o export usa: o do Electron (`null` aqui) ou, só na automação que pediu, um que sempre "escolhe" o
 * arquivo combinado.
 *
 * @returns {{ showSaveDialog: () => Promise<{ canceled: false, filePath: string }> } | null}
 */
function loadAutomationSaveDialog(options = {}) {
  const file = requestedSaveFile(options)
  if (!file) return null
  return { showSaveDialog: async () => ({ canceled: false, filePath: file }) }
}

module.exports = { loadAutomationSaveDialog, requestedSaveFile }

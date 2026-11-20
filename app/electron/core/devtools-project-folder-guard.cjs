'use strict'

/**
 * @module devtools-project-folder-guard
 * O seletor de pasta dos projetos trocado por uma pasta fixa, só na automação.
 *
 * Mesma guarda da CLI roteirizada e do shell que falha: só a instância de automação (porta de depuração válida, criada
 * pelo `felixo devtools` ou pelo smoke) que pediu (`FELIXO_DEVTOOLS_PROJECT_FOLDER=<pasta existente>`) recebe o
 * substituto. O smoke dos painéis precisa de um projeto real (um repositório Git de fixture) e o único caminho para o
 * main autorizar uma pasta é o seletor nativo, que um teste não consegue acionar. A pasta passa pelo mesmo
 * `grantDirectory` do app: nada é autorizado por fora dele.
 */

const fs = require('node:fs')
const path = require('node:path')

/**
 * @param {{ env?: Record<string, string | undefined>, devtoolsPort?: unknown, fileSystem?: Pick<typeof fs, 'statSync'> }} [options]
 * @returns {string | null} a pasta pedida, ou null fora da automação
 */
function requestedProjectFolder({ env = {}, devtoolsPort, fileSystem = fs } = {}) {
  const port = typeof devtoolsPort === 'number' ? devtoolsPort : Number.parseInt(String(devtoolsPort ?? ''), 10)
  const automationInstance = Number.isInteger(port) && port > 0 && port <= 65535
  const folder = env?.FELIXO_DEVTOOLS_PROJECT_FOLDER
  if (!automationInstance || typeof folder !== 'string' || !path.isAbsolute(folder)) return null
  try {
    return fileSystem.statSync(folder).isDirectory() ? folder : null
  } catch {
    return null
  }
}

/**
 * O `dialog` que os handlers de projetos usam: o do Electron (`null` aqui) ou, só na automação que pediu, um que sempre
 * "escolhe" a pasta combinada.
 *
 * @returns {{ showOpenDialog: () => Promise<{ canceled: false, filePaths: string[] }> } | null}
 */
function loadAutomationProjectDialog(options = {}) {
  const folder = requestedProjectFolder(options)
  if (!folder) return null
  return { showOpenDialog: async () => ({ canceled: false, filePaths: [folder] }) }
}

module.exports = { loadAutomationProjectDialog, requestedProjectFolder }

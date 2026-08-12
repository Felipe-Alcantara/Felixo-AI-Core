/**
 * @module text-file-access
 * Quais arquivos do disco o canvas pode abrir, ler e gravar.
 *
 * Os blocos de arquivo do canvas nasceram presos a uma pasta do proprio app
 * (`canvas-files`), em que confinar era trivial. Abrir um arquivo qualquer do
 * disco tira esse chao: sem uma regra explicita, um `text-file:read` passa a
 * ler qualquer caminho que o renderer resolva nomear.
 *
 * A regra aqui e uma so: **o renderer nunca autoriza um caminho, ele so usa um
 * caminho ja autorizado**. Um caminho entra por dois caminhos legitimos:
 *
 * 1. Esta dentro de um projeto registrado — a fronteira que o app ja aceita em
 *    `projects:list-directory`, e que a pessoa criou ao registrar a pasta.
 * 2. A **pessoa** escolheu o arquivo num dialogo nativo, e o processo principal
 *    guardou aquele caminho exato. O renderer nao participa da escolha; ele
 *    recebe o caminho ja concedido.
 *
 * As concessoes vivem so em memoria, entao fecham junto com o app: reabrir um
 * bloco apontado para fora dos projetos exige escolher o arquivo de novo, o que
 * e o comportamento seguro para uma permissao que a pessoa deu uma vez.
 */

const fs = require('node:fs')
const path = require('node:path')

/**
 * @param {object} options
 * @param {() => string[]} options.listProjectRoots - Raizes dos projetos
 *   registrados, consultadas a cada verificacao para que registrar ou remover
 *   um projeto valha na hora.
 * @param {(filePath: string) => string} [options.realPath] - Injetavel em teste.
 */
function createTextFileAccess({ listProjectRoots, realPath = defaultRealPath }) {
  if (typeof listProjectRoots !== 'function') {
    throw new Error('listProjectRoots e obrigatorio.')
  }

  /** Caminhos concedidos nesta sessao, ja resolvidos. */
  const granted = new Set()

  /**
   * Registra um caminho escolhido pela pessoa num dialogo nativo.
   *
   * @param {string} filePath
   * @returns {string} o caminho resolvido, que e o que deve circular daqui pra frente
   */
  function grant(filePath) {
    const resolved = resolveExisting(filePath, realPath)
    granted.add(resolved)
    return resolved
  }

  /**
   * Devolve o caminho resolvido se ele puder ser aberto; lanca se nao puder.
   *
   * Resolver antes de comparar e o que fecha a porta do link simbolico: sem
   * isso, um atalho dentro de um projeto apontando para fora dele passaria pela
   * verificacao de prefixo.
   *
   * @param {unknown} filePath
   * @returns {string}
   */
  function authorize(filePath) {
    const resolved = resolveExisting(filePath, realPath)

    if (granted.has(resolved)) {
      return resolved
    }

    for (const root of listProjectRoots()) {
      if (isPathInside(safeRealPath(root, realPath), resolved)) {
        return resolved
      }
    }

    throw new Error('Arquivo fora dos projetos registrados. Abra-o pelo seletor de arquivos.')
  }

  /** Esquece as concessoes — usado ao limpar o canvas. */
  function revokeAll() {
    granted.clear()
  }

  return { authorize, grant, revokeAll }
}

/**
 * Um arquivo que ainda nao existe nao pode ser autorizado: `realpath` e o que
 * elimina `..` e link simbolico, e sem ele a comparacao de prefixo vira
 * comparacao de texto.
 */
function resolveExisting(filePath, realPath) {
  if (typeof filePath !== 'string' || filePath.trim() === '') {
    throw new Error('Caminho de arquivo invalido.')
  }

  try {
    return realPath(path.resolve(filePath.trim()))
  } catch {
    throw new Error('Arquivo nao encontrado.')
  }
}

/** Uma raiz que sumiu do disco nao autoriza nada, mas tambem nao derruba a checagem. */
function safeRealPath(rootPath, realPath) {
  try {
    return realPath(path.resolve(rootPath))
  } catch {
    return ''
  }
}

function isPathInside(rootPath, targetPath) {
  if (!rootPath) {
    return false
  }

  return (
    targetPath === rootPath || targetPath.startsWith(`${rootPath}${path.sep}`)
  )
}

function defaultRealPath(filePath) {
  return fs.realpathSync(filePath)
}

module.exports = {
  createTextFileAccess,
  isPathInside,
}

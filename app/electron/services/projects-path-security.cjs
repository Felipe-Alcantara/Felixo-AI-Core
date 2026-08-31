/**
 * Politica de autorizacao dos diretorios usados pelos IPCs de projetos.
 *
 * Um caminho vindo do renderer nunca e uma permissao. A permissao nasce de
 * uma pasta escolhida no dialogo nativo ou de uma raiz que ja foi registrada.
 * Todos os caminhos sao resolvidos antes da comparacao para fechar escapes por
 * `..` e por links simbolicos.
 */

const fs = require('node:fs')
const path = require('node:path')

const SYSTEM_ROOT_ERROR = 'A raiz do sistema nao pode ser registrada.'
const INVALID_DIRECTORY_ERROR = 'Caminho de projeto invalido.'
const DIRECTORY_NOT_FOUND_ERROR = 'Diretorio nao encontrado.'
const NOT_DIRECTORY_ERROR = 'O caminho do projeto nao e um diretorio.'
const NOT_AUTHORIZED_ERROR =
  'Diretorio nao autorizado. Escolha a pasta pelo seletor de pastas.'

/**
 * Mantem as concessoes feitas nesta execucao e valida as raizes persistidas.
 *
 * @param {object} options
 * @param {() => unknown} [options.listProjectRoots] - caminhos persistidos
 * @param {(filePath: string) => string} [options.realPath] - injetavel em teste
 * @param {(filePath: string) => { isDirectory: () => boolean }} [options.stat]
 * @param {(filePath: string) => { isSymbolicLink: () => boolean }} [options.lstat]
 * @returns {{
 *   grantDirectory: (directoryPath: unknown) => string,
 *   authorizeGrantedDirectory: (directoryPath: unknown) => string,
 *   authorizeProjectDirectory: (directoryPath: unknown) => string,
 *   authorizeRegisteredRoot: (directoryPath: unknown) => string,
 *   listProjectRoots: () => string[],
 *   revokeAll: () => void,
 * }}
 */
function createProjectPathAccess({
  listProjectRoots = () => [],
  realPath = defaultRealPath,
  stat = defaultStat,
  lstat = defaultLstat,
} = {}) {
  if (typeof listProjectRoots !== 'function') {
    throw new Error('listProjectRoots e obrigatorio.')
  }

  const grantedDirectories = new Set()

  function grantDirectory(directoryPath) {
    const resolved = resolveExistingDirectory(directoryPath, { realPath, stat })
    grantedDirectories.add(resolved)
    return resolved
  }

  function authorizeGrantedDirectory(directoryPath) {
    const resolved = resolveExistingDirectory(directoryPath, { realPath, stat })
    if (!isInsideAny(resolved, grantedDirectories)) {
      throw new Error(NOT_AUTHORIZED_ERROR)
    }
    return resolved
  }

  /**
   * Autoriza o registro de uma nova raiz. Uma raiz persistida tambem e uma
   * concessao equivalente: isso permite editar um projeto ja registrado apos
   * reiniciar o app sem transformar o renderer em um seletor de caminhos.
   */
  function authorizeProjectDirectory(directoryPath) {
    const resolved = resolveExistingDirectory(directoryPath, { realPath, stat })
    if (
      isInsideAny(resolved, grantedDirectories) ||
      isInsideAny(resolved, listRegisteredRoots())
    ) {
      return resolved
    }

    throw new Error(NOT_AUTHORIZED_ERROR)
  }

  /**
   * A navegacao e o indexador aceitam somente a raiz exata de um projeto
   * persistido. Um diretorio filho nao pode ser promovido a nova raiz pelo
   * renderer.
   */
  function authorizeRegisteredRoot(directoryPath) {
    const resolved = resolveExistingDirectory(directoryPath, { realPath, stat })
    if (listRegisteredRoots().some((root) => samePath(root, resolved))) {
      return resolved
    }

    throw new Error(NOT_AUTHORIZED_ERROR)
  }

  function listRegisteredRoots() {
    let roots
    try {
      roots = listProjectRoots()
    } catch {
      return []
    }

    if (!Array.isArray(roots)) {
      return []
    }

    const resolvedRoots = []
    for (const root of roots) {
      try {
        const resolved = resolveExistingDirectory(root, {
          realPath,
          stat,
          lstat,
          rejectSymbolicLinks: true,
        })
        if (!resolvedRoots.some((item) => samePath(item, resolved))) {
          resolvedRoots.push(resolved)
        }
      } catch {
        // Um projeto apagado ou legado invalido nao concede acesso a nada.
      }
    }
    return resolvedRoots
  }

  function revokeAll() {
    grantedDirectories.clear()
  }

  return {
    grantDirectory,
    authorizeGrantedDirectory,
    authorizeProjectDirectory,
    authorizeRegisteredRoot,
    listProjectRoots: listRegisteredRoots,
    revokeAll,
  }
}

/** Resolve, canonicaliza e valida uma pasta existente. */
function resolveExistingDirectory(
  directoryPath,
  {
    realPath = defaultRealPath,
    stat = defaultStat,
    lstat = defaultLstat,
    rejectSymbolicLinks = false,
  } = {},
) {
  if (typeof directoryPath !== 'string' || directoryPath.trim() === '') {
    throw new Error(INVALID_DIRECTORY_ERROR)
  }

  const normalizedInput = path.resolve(directoryPath.trim())
  if (rejectSymbolicLinks && hasSymbolicLinkComponent(normalizedInput, lstat)) {
    throw new Error('A raiz registrada nao pode conter link simbolico.')
  }

  let resolved
  try {
    resolved = path.resolve(realPath(normalizedInput))
  } catch {
    throw new Error(DIRECTORY_NOT_FOUND_ERROR)
  }

  if (isFilesystemRoot(resolved)) {
    throw new Error(SYSTEM_ROOT_ERROR)
  }

  let stats
  try {
    stats = stat(resolved)
  } catch {
    throw new Error(DIRECTORY_NOT_FOUND_ERROR)
  }

  if (!stats || typeof stats.isDirectory !== 'function' || !stats.isDirectory()) {
    throw new Error(NOT_DIRECTORY_ERROR)
  }

  return resolved
}

function hasSymbolicLinkComponent(directoryPath, lstat) {
  let current = path.resolve(directoryPath)
  while (true) {
    try {
      if (lstat(current).isSymbolicLink()) {
        return true
      }
    } catch {
      // realpath/stat abaixo devolvem a mensagem apropriada para caminho ausente.
      return false
    }

    const parent = path.dirname(current)
    if (parent === current) {
      return false
    }
    current = parent
  }
}

function isFilesystemRoot(directoryPath) {
  const resolved = path.resolve(directoryPath)
  return path.parse(resolved).root === resolved
}

function isInsideAny(targetPath, roots) {
  for (const root of roots) {
    if (isPathInside(root, targetPath)) {
      return true
    }
  }
  return false
}

function samePath(firstPath, secondPath) {
  const first = path.resolve(firstPath)
  const second = path.resolve(secondPath)
  if (process.platform === 'win32') {
    return first.toLowerCase() === second.toLowerCase()
  }
  return first === second
}

function isPathInside(rootPath, targetPath) {
  if (
    typeof rootPath !== 'string' ||
    typeof targetPath !== 'string' ||
    rootPath.trim() === '' ||
    targetPath.trim() === ''
  ) {
    return false
  }

  let normalizedRoot = path.resolve(rootPath)
  let normalizedTarget = path.resolve(targetPath)
  if (process.platform === 'win32') {
    normalizedRoot = normalizedRoot.toLowerCase()
    normalizedTarget = normalizedTarget.toLowerCase()
  }

  return (
    normalizedTarget === normalizedRoot ||
    normalizedTarget.startsWith(`${normalizedRoot}${path.sep}`)
  )
}

function defaultRealPath(filePath) {
  return fs.realpathSync(filePath)
}

function defaultStat(filePath) {
  return fs.statSync(filePath)
}

function defaultLstat(filePath) {
  return fs.lstatSync(filePath)
}

module.exports = {
  DIRECTORY_NOT_FOUND_ERROR,
  INVALID_DIRECTORY_ERROR,
  NOT_AUTHORIZED_ERROR,
  NOT_DIRECTORY_ERROR,
  SYSTEM_ROOT_ERROR,
  createProjectPathAccess,
  isFilesystemRoot,
  isPathInside,
  resolveExistingDirectory,
}

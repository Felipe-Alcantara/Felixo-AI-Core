const { ipcMain, dialog } = require('electron')
const fs = require('fs')
const path = require('path')
const { toErrorResult } = require('./ipc-result.cjs')
const {
  createProjectsRepository,
} = require('./storage/projects-repository.cjs')
const {
  createSettingsRepository,
} = require('./storage/settings-repository.cjs')

const ACTIVE_PROJECT_IDS_KEY = 'projects.activeIds'

/**
 * Ordem dos arquivos e pastas mostrados ao navegar um projeto.
 *
 * `numeric` para `script2.sh` vir antes de `script10.sh`, como a lista de
 * projetos do painel — sem isso, as duas listas da mesma aba discordam sobre
 * numeros na tela. Um collator so, no modulo, porque `readdir` de uma pasta
 * grande faz muitas comparacoes.
 */
const entryCollator = new Intl.Collator(undefined, { numeric: true })

function registerProjectsIpcHandlers(getMainWindow, options = {}) {
  const projectsRepository = options.database
    ? createProjectsRepository(options.database)
    : null
  const settingsRepository = options.database
    ? createSettingsRepository(options.database)
    : null

  ipcMain.handle('projects:pick-folder', async (_event) => {
    const { BrowserWindow } = require('electron')
    const win =
      BrowserWindow.getFocusedWindow() ??
      (typeof getMainWindow === 'function' ? getMainWindow() : getMainWindow)
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory'],
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle('projects:detect-repos', (_event, folderPath) => {
    if (!folderPath || typeof folderPath !== 'string') return []
    try {
      // If the selected folder is itself a repo, it IS the project — don't
      // descend into it (avoids picking up repos nested inside another repo,
      // e.g. a vendored standards repo).
      if (hasGit(folderPath)) {
        return [{ name: path.basename(folderPath), path: folderPath }]
      }

      // Otherwise it's a parent folder: register each direct child that is a
      // repo, one project per repo. Only the first level is scanned, so a repo
      // nested inside one of those children is never split out.
      const entries = fs.readdirSync(folderPath, { withFileTypes: true })
      return entries
        .filter((e) => e.isDirectory() && hasGit(path.join(folderPath, e.name)))
        .map((e) => ({ name: e.name, path: path.join(folderPath, e.name) }))
    } catch {
      return []
    }
  })

  ipcMain.handle('projects:list', () => {
    try {
      return {
        ok: true,
        projects: projectsRepository?.list() ?? [],
      }
    } catch (error) {
      return toErrorResult(error, 'Nao foi possivel carregar os projetos.')
    }
  })

  ipcMain.handle('projects:save', (_event, project) => {
    try {
      if (!projectsRepository) {
        throw new Error('Repositorio de projetos indisponivel.')
      }

      return {
        ok: true,
        project: projectsRepository.save(project),
      }
    } catch (error) {
      return toErrorResult(error, 'Nao foi possivel salvar o projeto.')
    }
  })

  ipcMain.handle('projects:delete', (_event, projectId) => {
    try {
      if (!projectsRepository) {
        throw new Error('Repositorio de projetos indisponivel.')
      }

      return {
        ok: true,
        deleted: projectsRepository.delete(projectId),
      }
    } catch (error) {
      return toErrorResult(error, 'Nao foi possivel remover o projeto.')
    }
  })

  ipcMain.handle('projects:load-active-ids', () => {
    try {
      const activeIds = settingsRepository?.get(ACTIVE_PROJECT_IDS_KEY)

      return {
        ok: true,
        projectIds: normalizeActiveProjectIdsValue(activeIds),
      }
    } catch (error) {
      return toErrorResult(error, 'Nao foi possivel carregar projetos ativos.')
    }
  })

  ipcMain.handle('projects:save-active-ids', (_event, projectIds) => {
    try {
      if (!settingsRepository) {
        throw new Error('Repositorio de configuracoes indisponivel.')
      }

      const normalizedIds = Array.isArray(projectIds)
        ? [...new Set(projectIds.filter((item) => typeof item === 'string'))]
        : []

      settingsRepository.set(ACTIVE_PROJECT_IDS_KEY, normalizedIds)

      return {
        ok: true,
        projectIds: normalizedIds,
      }
    } catch (error) {
      return toErrorResult(error, 'Nao foi possivel salvar projetos ativos.')
    }
  })

  // Lists a project's own directory (or a subfolder inside it, via `subPath`)
  // so the canvas can offer a "browse and run a file" panel without spawning
  // a terminal first. Resolves `subPath` relative to `rootPath` and rejects
  // anything that escapes it (defence against a stray `..` reaching outside
  // the folder the user actually picked).
  ipcMain.handle('projects:list-directory', (_event, params) => {
    try {
      if (!params || typeof params.rootPath !== 'string') {
        return { ok: false, message: 'Caminho do projeto invalido.' }
      }

      const { rootPath, targetPath } = resolvePathInside(
        params.rootPath,
        typeof params.subPath === 'string' ? params.subPath : '',
      )

      const entries = fs
        .readdirSync(targetPath, { withFileTypes: true })
        .filter((entry) => !entry.name.startsWith('.') && entry.name !== 'node_modules')
        .map((entry) => {
          const entryPath = path.join(targetPath, entry.name)
          try {
            const realEntryPath = fs.realpathSync(entryPath)
            if (!isPathInside(rootPath, realEntryPath)) {
              return null
            }
          } catch {
            return null
          }
          return {
            name: entry.name,
            isDirectory: entry.isDirectory(),
            path: entryPath,
          }
        })
        .filter(Boolean)
        .sort((a, b) =>
          a.isDirectory !== b.isDirectory
            ? a.isDirectory
              ? -1
              : 1
            : entryCollator.compare(a.name, b.name),
        )

      return {
        ok: true,
        path: targetPath,
        relativePath: path.relative(rootPath, targetPath),
        entries,
      }
    } catch (error) {
      return toErrorResult(error, 'Nao foi possivel listar o diretorio.')
    }
  })

  ipcMain.handle('projects:build-docs-index', (_event, params) => {
    try {
      if (!params || typeof params.projectPath !== 'string' || typeof params.docsDirectory !== 'string') {
        return { ok: false, message: 'Parametros invalidos para indexar docs.' }
      }

      const projectPath = fs.realpathSync(path.resolve(params.projectPath))
      const docsCandidate = path.resolve(projectPath, params.docsDirectory)

      if (!isPathInside(projectPath, docsCandidate)) {
        return { ok: false, message: 'Diretorio de docs fora do projeto.' }
      }

      if (!fs.existsSync(docsCandidate)) {
        return { ok: true, entries: [], docsPath: docsCandidate }
      }

      const docsPath = fs.realpathSync(docsCandidate)
      if (!isPathInside(projectPath, docsPath)) {
        return { ok: false, message: 'Diretorio de docs fora do projeto.' }
      }

      const MAX_FILES = 50
      const files = fs
        .readdirSync(docsPath)
        .filter((f) => /\.(md|txt|markdown)$/i.test(f))
        .filter((filename) => {
          try {
            const filePath = fs.realpathSync(path.join(docsPath, filename))
            return isPathInside(docsPath, filePath) && fs.statSync(filePath).isFile()
          } catch {
            return false
          }
        })
        .sort()
        .slice(0, MAX_FILES)

      const entries = files.map((filename) => {
        const filePath = path.join(docsPath, filename)
        const summary = readFirstMeaningfulLine(filePath)
        return { filename, summary }
      })

      return { ok: true, entries, docsPath }
    } catch (error) {
      return toErrorResult(error, 'Erro ao indexar diretorio de docs.')
    }
  })
}

/** Resolves an existing path and rejects lexical or symlink escapes. */
function resolvePathInside(rootPath, childPath = '') {
  const resolvedRoot = fs.realpathSync(path.resolve(rootPath))
  const resolvedTarget = fs.realpathSync(path.resolve(resolvedRoot, childPath))

  if (!isPathInside(resolvedRoot, resolvedTarget)) {
    throw new Error('Diretorio fora do projeto.')
  }

  return { rootPath: resolvedRoot, targetPath: resolvedTarget }
}

function isPathInside(rootPath, targetPath) {
  const normalizedRoot = path.resolve(rootPath)
  const normalizedTarget = path.resolve(targetPath)
  return (
    normalizedTarget === normalizedRoot ||
    normalizedTarget.startsWith(`${normalizedRoot}${path.sep}`)
  )
}

function readFirstMeaningfulLine(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    const lines = content.split('\n')

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue

      const cleaned = trimmed.replace(/^#+\s*/, '')
      if (cleaned) return cleaned.slice(0, 120)
    }

    return path.basename(filePath)
  } catch {
    return path.basename(filePath)
  }
}

function normalizeActiveProjectIdsValue(activeIds) {
  if (activeIds == null) {
    return null
  }

  return Array.isArray(activeIds)
    ? activeIds.filter((item) => typeof item === 'string')
    : []
}

function hasGit(dirPath) {
  try {
    return fs.existsSync(path.join(dirPath, '.git'))
  } catch {
    return false
  }
}

module.exports = {
  ACTIVE_PROJECT_IDS_KEY,
  isPathInside,
  registerProjectsIpcHandlers,
  resolvePathInside,
}

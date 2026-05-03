const { ipcMain, dialog } = require('electron')
const fs = require('fs')
const path = require('path')
const {
  createProjectsRepository,
} = require('./storage/projects-repository.cjs')
const {
  createSettingsRepository,
} = require('./storage/settings-repository.cjs')

const ACTIVE_PROJECT_IDS_KEY = 'projects.activeIds'

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

function toErrorResult(error, fallbackMessage) {
  return {
    ok: false,
    message: error instanceof Error ? error.message : fallbackMessage,
  }
}

module.exports = {
  ACTIVE_PROJECT_IDS_KEY,
  registerProjectsIpcHandlers,
}

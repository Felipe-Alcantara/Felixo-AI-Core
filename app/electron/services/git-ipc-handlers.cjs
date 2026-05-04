const { ipcMain } = require('electron')
const {
  commitStagedChanges,
  getGitProjectSummary,
  stageAllChanges,
  unstageAllChanges,
} = require('./git-service.cjs')

function registerGitIpcHandlers() {
  ipcMain.handle('git:get-summary', async (_event, params) => {
    const projectPath =
      typeof params?.projectPath === 'string' ? params.projectPath : ''

    if (!projectPath) {
      return { ok: false, message: 'Projeto Git invalido.' }
    }

    try {
      return {
        ok: true,
        summary: await getGitProjectSummary(projectPath),
      }
    } catch (error) {
      return {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : 'Falha ao consultar repositorio Git.',
      }
    }
  })

  ipcMain.handle('git:stage-all', async (_event, params) => {
    const projectPath =
      typeof params?.projectPath === 'string' ? params.projectPath : ''

    if (!projectPath) {
      return { ok: false, message: 'Projeto Git invalido.' }
    }

    try {
      return {
        ok: true,
        summary: await stageAllChanges(projectPath),
      }
    } catch (error) {
      return {
        ok: false,
        message: getGitErrorMessage(error, 'Falha ao preparar alteracoes.'),
      }
    }
  })

  ipcMain.handle('git:unstage-all', async (_event, params) => {
    const projectPath =
      typeof params?.projectPath === 'string' ? params.projectPath : ''

    if (!projectPath) {
      return { ok: false, message: 'Projeto Git invalido.' }
    }

    try {
      return {
        ok: true,
        summary: await unstageAllChanges(projectPath),
      }
    } catch (error) {
      return {
        ok: false,
        message: getGitErrorMessage(error, 'Falha ao remover stage.'),
      }
    }
  })

  ipcMain.handle('git:commit', async (_event, params) => {
    const projectPath =
      typeof params?.projectPath === 'string' ? params.projectPath : ''
    const message = typeof params?.message === 'string' ? params.message : ''

    if (!projectPath) {
      return { ok: false, message: 'Projeto Git invalido.' }
    }

    try {
      const result = await commitStagedChanges(projectPath, message)

      return {
        ok: true,
        output: result.output,
        summary: result.summary,
      }
    } catch (error) {
      return {
        ok: false,
        message: getGitErrorMessage(error, 'Falha ao criar commit.'),
      }
    }
  })
}

function getGitErrorMessage(error, fallback) {
  return error instanceof Error ? error.message : fallback
}

module.exports = {
  registerGitIpcHandlers,
}

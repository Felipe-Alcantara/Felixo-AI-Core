const { ipcMain } = require('electron')
const {
  commitStagedChanges,
  getFileDiff,
  getGitProjectSummary,
  stageAllChanges,
  stageFile,
  unstageAllChanges,
  unstageFile,
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

  ipcMain.handle('git:get-file-diff', async (_event, params) => {
    const projectPath =
      typeof params?.projectPath === 'string' ? params.projectPath : ''
    const filePath = typeof params?.filePath === 'string' ? params.filePath : ''

    if (!projectPath || !filePath) {
      return { ok: false, message: 'Arquivo Git invalido.' }
    }

    try {
      return {
        ok: true,
        diff: await getFileDiff(projectPath, filePath, {
          staged: Boolean(params?.staged),
          untracked: Boolean(params?.untracked),
        }),
      }
    } catch (error) {
      return {
        ok: false,
        message: getGitErrorMessage(error, 'Falha ao ler as diferencas do arquivo.'),
      }
    }
  })

  ipcMain.handle('git:stage-file', async (_event, params) => {
    const projectPath =
      typeof params?.projectPath === 'string' ? params.projectPath : ''
    const filePath = typeof params?.filePath === 'string' ? params.filePath : ''

    if (!projectPath || !filePath) {
      return { ok: false, message: 'Arquivo Git invalido.' }
    }

    try {
      return { ok: true, summary: await stageFile(projectPath, filePath) }
    } catch (error) {
      return {
        ok: false,
        message: getGitErrorMessage(error, 'Falha ao preparar o arquivo.'),
      }
    }
  })

  ipcMain.handle('git:unstage-file', async (_event, params) => {
    const projectPath =
      typeof params?.projectPath === 'string' ? params.projectPath : ''
    const filePath = typeof params?.filePath === 'string' ? params.filePath : ''

    if (!projectPath || !filePath) {
      return { ok: false, message: 'Arquivo Git invalido.' }
    }

    try {
      return { ok: true, summary: await unstageFile(projectPath, filePath) }
    } catch (error) {
      return {
        ok: false,
        message: getGitErrorMessage(error, 'Falha ao remover o arquivo do stage.'),
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

const { ipcMain } = require('electron')
const { getGitProjectSummary } = require('./git-service.cjs')

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
}

module.exports = {
  registerGitIpcHandlers,
}

const { ipcMain } = require('electron')
const {
  commitStagedChanges,
  discardFileChanges,
  getCommitLog,
  getFileDiff,
  getGitProjectSummary,
  listBranches,
  listRepoFiles,
  pullCurrentBranch,
  pushCurrentBranch,
  readRepoFile,
  stageAllChanges,
  stageFile,
  switchBranch,
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

  ipcMain.handle('git:list-files', async (_event, params) => {
    const projectPath =
      typeof params?.projectPath === 'string' ? params.projectPath : ''

    if (!projectPath) {
      return { ok: false, message: 'Projeto Git invalido.' }
    }

    try {
      return {
        ok: true,
        tree: await listRepoFiles(projectPath),
      }
    } catch (error) {
      return {
        ok: false,
        message: getGitErrorMessage(error, 'Falha ao listar os arquivos do repositorio.'),
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

  // As operacoes abaixo seguem o mesmo contrato: { ok, ...dados } ou
  // { ok: false, message }. O helper tira a repeticao do try/catch sem
  // esconder qual parametro cada uma exige.
  handleProject('git:list-branches', 'Falha ao listar as branches.', (projectPath) =>
    listBranches(projectPath),
  )
  handleProject('git:get-log', 'Falha ao ler o historico.', (projectPath) =>
    getCommitLog(projectPath),
  )
  handleProject('git:push', 'Falha ao enviar (push).', (projectPath) =>
    pushCurrentBranch(projectPath),
  )
  handleProject('git:pull', 'Falha ao atualizar (pull).', (projectPath) =>
    pullCurrentBranch(projectPath),
  )

  ipcMain.handle('git:switch-branch', async (_event, params) => {
    const projectPath =
      typeof params?.projectPath === 'string' ? params.projectPath : ''
    const branch = typeof params?.branch === 'string' ? params.branch : ''
    if (!projectPath || !branch) {
      return { ok: false, message: 'Branch invalida.' }
    }
    try {
      return { ok: true, ...(await switchBranch(projectPath, branch)) }
    } catch (error) {
      return { ok: false, message: getGitErrorMessage(error, 'Falha ao trocar de branch.') }
    }
  })

  ipcMain.handle('git:discard-file', async (_event, params) => {
    const projectPath =
      typeof params?.projectPath === 'string' ? params.projectPath : ''
    const filePath = typeof params?.filePath === 'string' ? params.filePath : ''
    if (!projectPath || !filePath) {
      return { ok: false, message: 'Arquivo Git invalido.' }
    }
    try {
      const summary = await discardFileChanges(projectPath, filePath, {
        untracked: Boolean(params?.untracked),
      })
      return { ok: true, summary }
    } catch (error) {
      return { ok: false, message: getGitErrorMessage(error, 'Falha ao descartar as alteracoes.') }
    }
  })

  ipcMain.handle('git:read-file', (_event, params) => {
    const projectPath =
      typeof params?.projectPath === 'string' ? params.projectPath : ''
    const filePath = typeof params?.filePath === 'string' ? params.filePath : ''
    if (!projectPath || !filePath) {
      return { ok: false, message: 'Arquivo Git invalido.' }
    }
    try {
      return { ok: true, file: readRepoFile(projectPath, filePath) }
    } catch (error) {
      return { ok: false, message: getGitErrorMessage(error, 'Falha ao ler o arquivo.') }
    }
  })
}

function handleProject(channel, fallback, run) {
  ipcMain.handle(channel, async (_event, params) => {
    const projectPath =
      typeof params?.projectPath === 'string' ? params.projectPath : ''
    if (!projectPath) {
      return { ok: false, message: 'Projeto Git invalido.' }
    }
    try {
      return { ok: true, ...(await run(projectPath)) }
    } catch (error) {
      return { ok: false, message: getGitErrorMessage(error, fallback) }
    }
  })
}

function getGitErrorMessage(error, fallback) {
  return error instanceof Error ? error.message : fallback
}

module.exports = {
  registerGitIpcHandlers,
}

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const { registerProjectsIpcHandlers } = require('./projects-ipc-handlers.cjs')
const { registerTextFileIpcHandlers } = require('./text-file-ipc-handlers.cjs')

function createHarness({ projects = [], selection = [] } = {}) {
  const storedProjects = projects.map((project) => ({ ...project }))
  const handlers = new Map()
  const ipcMain = {
    handle(channel, handler) {
      handlers.set(channel, handler)
    },
  }
  const repository = {
    list() {
      return storedProjects.map((project) => ({ ...project }))
    },
    save(project) {
      const index = storedProjects.findIndex((item) => item.id === project.id)
      if (index === -1) {
        storedProjects.push({ ...project })
      } else {
        storedProjects[index] = { ...project }
      }
      return { ...project }
    },
    delete(projectId) {
      const index = storedProjects.findIndex((project) => project.id === projectId)
      if (index === -1) return false
      storedProjects.splice(index, 1)
      return true
    },
  }
  let nextSelection = [...selection]
  const dialog = {
    async showOpenDialog() {
      return { canceled: false, filePaths: nextSelection }
    },
  }

  const projectsApi = registerProjectsIpcHandlers(() => null, {
    ipcMain,
    dialog,
    getFocusedWindow: () => null,
    projectsRepository: repository,
  })

  return {
    handlers,
    projectsApi,
    repository,
    setSelection(filePaths) {
      nextSelection = [...filePaths]
    },
  }
}

function project(id, projectPath) {
  return { id, name: id, path: projectPath }
}

function createTempDirectory(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix))
}

test('projects:save rejeita raiz do sistema e diretorio inexistente', (t) => {
  const tempRoot = createTempDirectory('felixo-project-ipc-save-')
  t.after(() => fs.rmSync(tempRoot, { recursive: true, force: true }))

  const { handlers, repository } = createHarness()
  const save = handlers.get('projects:save')

  const rootResult = save(null, project('root', path.parse(tempRoot).root))
  assert.equal(rootResult.ok, false)
  assert.match(rootResult.message, /raiz do sistema/i)

  const missingResult = save(null, project('missing', path.join(tempRoot, 'missing')))
  assert.equal(missingResult.ok, false)
  assert.match(missingResult.message, /nao encontrado/i)
  assert.deepEqual(repository.list(), [])
})

test('projects:save so aceita uma pasta concedida pelo dialogo nativo', async (t) => {
  const selectedRoot = createTempDirectory('felixo-project-ipc-selected-')
  const externalRoot = createTempDirectory('felixo-project-ipc-external-')
  t.after(() => {
    fs.rmSync(selectedRoot, { recursive: true, force: true })
    fs.rmSync(externalRoot, { recursive: true, force: true })
  })

  const repoPath = path.join(selectedRoot, 'repo')
  fs.mkdirSync(path.join(repoPath, '.git'), { recursive: true })
  const { handlers, setSelection } = createHarness()
  const save = handlers.get('projects:save')
  const detect = handlers.get('projects:detect-repos')
  const pickFolder = handlers.get('projects:pick-folder')

  const beforeGrant = save(null, project('external', externalRoot))
  assert.equal(beforeGrant.ok, false)
  assert.match(beforeGrant.message, /nao autorizado/i)
  assert.deepEqual(detect(null, externalRoot), [])

  setSelection([path.parse(selectedRoot).root])
  assert.equal(await pickFolder(null), null)

  setSelection([selectedRoot])
  assert.equal(await pickFolder(null), fs.realpathSync(selectedRoot))
  const detected = detect(null, selectedRoot)
  assert.deepEqual(detected, [{ name: 'repo', path: fs.realpathSync(repoPath) }])

  const saved = save(null, project('repo', detected[0].path))
  assert.equal(saved.ok, true)
  assert.equal(saved.project.path, fs.realpathSync(repoPath))
})

test('listagem, indexacao e texto usam somente a raiz registrada', async (t) => {
  const projectRoot = createTempDirectory('felixo-project-ipc-internal-')
  const externalRoot = createTempDirectory('felixo-project-ipc-outside-')
  t.after(() => {
    fs.rmSync(projectRoot, { recursive: true, force: true })
    fs.rmSync(externalRoot, { recursive: true, force: true })
  })

  const internalFile = path.join(projectRoot, 'README.md')
  const docsDirectory = path.join(projectRoot, 'docs')
  const externalFile = path.join(externalRoot, 'private.md')
  fs.mkdirSync(docsDirectory)
  fs.writeFileSync(internalFile, '# Interno\nconteudo', 'utf8')
  fs.writeFileSync(path.join(docsDirectory, 'guia.md'), '# Guia\nconteudo', 'utf8')
  fs.writeFileSync(externalFile, '# Privado\nconteudo', 'utf8')

  const harness = createHarness({ selection: [projectRoot] })
  const { handlers, projectsApi } = harness
  const pickFolder = handlers.get('projects:pick-folder')
  const save = handlers.get('projects:save')
  const listDirectory = handlers.get('projects:list-directory')
  const buildDocsIndex = handlers.get('projects:build-docs-index')

  // A concessao e feita pelo proprio canal nativo antes do registro.
  const picked = await pickFolder(null)
  const saved = save(null, project('internal', picked))
  assert.equal(saved.ok, true)

  const root = fs.realpathSync(projectRoot)
  const listed = listDirectory(null, {
    rootPath: root,
    subPath: '',
  })
  assert.equal(listed.ok, true)
  const resolvedInternalFile = fs.realpathSync(internalFile)
  assert.equal(
    listed.entries.some((entry) => entry.path === resolvedInternalFile),
    true,
  )

  const indexed = buildDocsIndex(null, {
    projectPath: root,
    docsDirectory: 'docs',
  })
  assert.equal(indexed.ok, true)
  assert.deepEqual(indexed.entries, [{ filename: 'guia.md', summary: 'Guia' }])

  const inventedRoot = listDirectory(null, { rootPath: externalRoot, subPath: '' })
  assert.equal(inventedRoot.ok, false)
  assert.match(inventedRoot.message, /nao autorizado/i)
  const inventedDocsRoot = buildDocsIndex(null, {
    projectPath: externalRoot,
    docsDirectory: '.',
  })
  assert.equal(inventedDocsRoot.ok, false)
  assert.match(inventedDocsRoot.message, /nao autorizado/i)

  const textHandlers = new Map()
  const textIpcMain = {
    handle(channel, handler) {
      textHandlers.set(channel, handler)
    },
  }
  registerTextFileIpcHandlers(() => null, {
    ipcMain: textIpcMain,
    dialog: {
      showOpenDialog: async () => ({
        canceled: false,
        filePaths: [externalFile],
      }),
    },
    listProjectRoots: projectsApi.listProjectRoots,
  })
  const textRead = await textHandlers.get('text-file:read')(null, { path: internalFile })
  assert.equal(textRead.ok, true)
  assert.equal(textRead.content, '# Interno\nconteudo')
  const textWrite = await textHandlers.get('text-file:write')(null, {
    path: internalFile,
    content: '# Atualizado',
  })
  assert.equal(textWrite.ok, true)
  const textReadAfterWrite = await textHandlers.get('text-file:read')(null, {
    path: internalFile,
  })
  assert.equal(textReadAfterWrite.content, '# Atualizado')
  const textOpenOutside = textHandlers.get('text-file:open-in-project')(null, {
    path: externalFile,
  })
  assert.equal(textOpenOutside.ok, false)
  assert.match(textOpenOutside.message, /fora dos projetos/i)

  const nativePicked = await textHandlers.get('text-file:pick')(null)
  assert.equal(nativePicked.ok, true)
  assert.equal(nativePicked.path, fs.realpathSync(externalFile))
  const textReadGranted = await textHandlers.get('text-file:read')(null, {
    path: externalFile,
  })
  assert.equal(textReadGranted.ok, true)
})

test('listagem, indexacao e texto rejeitam link simbolico para fora', async (t) => {
  if (process.platform === 'win32') {
    t.skip('Criacao de symlink pode exigir privilegio adicional no Windows.')
    return
  }

  const projectRoot = createTempDirectory('felixo-project-ipc-symlink-')
  const outsideRoot = createTempDirectory('felixo-project-ipc-symlink-outside-')
  t.after(() => {
    fs.rmSync(projectRoot, { recursive: true, force: true })
    fs.rmSync(outsideRoot, { recursive: true, force: true })
  })

  const outsideDocs = path.join(outsideRoot, 'docs')
  const outsideFile = path.join(outsideRoot, 'secret.md')
  fs.mkdirSync(outsideDocs)
  fs.writeFileSync(outsideFile, '# Secreto', 'utf8')
  const linkedDirectory = path.join(projectRoot, 'linked-docs')
  const linkedFile = path.join(projectRoot, 'linked-secret.md')
  fs.symlinkSync(outsideDocs, linkedDirectory)
  fs.symlinkSync(outsideFile, linkedFile)

  const harness = createHarness({ selection: [projectRoot] })
  const picked = await harness.handlers.get('projects:pick-folder')(null)
  const save = harness.handlers.get('projects:save')
  const saveEscape = save(null, project('escape', linkedDirectory))
  assert.equal(saveEscape.ok, false)
  assert.match(saveEscape.message, /nao autorizado/i)
  assert.equal(save(null, project('symlink', picked)).ok, true)

  const root = fs.realpathSync(projectRoot)
  const listEscape = harness.handlers.get('projects:list-directory')(null, {
    rootPath: root,
    subPath: 'linked-docs',
  })
  assert.equal(listEscape.ok, false)
  assert.match(listEscape.message, /fora do projeto/i)

  const docsEscape = harness.handlers.get('projects:build-docs-index')(null, {
    projectPath: root,
    docsDirectory: 'linked-docs',
  })
  assert.equal(docsEscape.ok, false)
  assert.match(docsEscape.message, /fora do projeto/i)

  const textHandlers = new Map()
  registerTextFileIpcHandlers(() => null, {
    ipcMain: {
      handle(channel, handler) {
        textHandlers.set(channel, handler)
      },
    },
    listProjectRoots: harness.projectsApi.listProjectRoots,
  })
  const textEscape = await textHandlers.get('text-file:read')(null, { path: linkedFile })
  assert.equal(textEscape.ok, false)
  assert.match(textEscape.message, /fora dos projetos/i)
})

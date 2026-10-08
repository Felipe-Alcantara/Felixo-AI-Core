'use strict'

const fsp = require('node:fs/promises')
const path = require('node:path')
const { ipcMain } = require('electron')
const {
  createSettingsRepository,
} = require('./storage/settings-repository.cjs')
const {
  createSystemDesignRepository,
} = require('./storage/system-design-repository.cjs')
const { syncSystemDesignRepository } = require('./system-design-service.cjs')
const {
  collectLocalGuideDocuments,
  findProjectRoot,
  inspectProjectRoot,
  readLocalGuideDocument,
} = require('./system-design-project-service.cjs')
const {
  SYNC_STATES,
  applyConfigChange,
  extractLegacySyncEntries,
  mergeSyncEntries,
  migrateStoredConfig,
  normalizeSyncStore,
  recordClearedCache,
  recordFailedSync,
  recordSuccessfulSync,
  sourceDirName,
  sourceKey,
  toPublicConfig,
  toPublicGuide,
} = require('../core/system-design-source.cjs')
const {
  applyProjectChange,
  normalizeProjectSettingsStore,
  projectGuideLabel,
  resolveEffectiveGuides,
  resolveProjectLayer,
  settingsForRoot,
} = require('../core/system-design-project.cjs')
const { logQaEvent } = require('./qa-logger.cjs')
const { toErrorResult } = require('./ipc-result.cjs')
const {
  createRedactedGitError,
  sanitizeGitErrorText,
} = require('./git-secret-redaction.cjs')

const SYSTEM_DESIGN_CONFIG_KEY = 'system-design.config'
/** Estado de sincronização por fonte (sha, data, erro) — fatos, não escolhas. */
const SYSTEM_DESIGN_SYNC_KEY = 'system-design.sync'
/** Escolhas da camada de projeto, por raiz. */
const SYSTEM_DESIGN_PROJECTS_KEY = 'system-design.projects'
const LOCAL_KEY_PREFIX = 'local:'

/**
 * Forma que o renderer lê quando nada foi gravado. O default vive em
 * `core/system-design-source.cjs` — aqui não há cópia dele.
 */
function defaultConfig() {
  return toPublicConfig(migrateStoredConfig(null))
}

/** Lê qualquer coisa gravada (v1, v2, v3 ou lixo) na forma que o renderer lê. */
function normalizeConfig(value) {
  const legacy = extractLegacySyncEntries(value)
  return toPublicConfig(
    migrateStoredConfig(value),
    mergeSyncEntries(normalizeSyncStore(null), legacy.entries),
  )
}

function registerSystemDesignIpcHandlers(appPaths, options = {}) {
  const activeIpcMain = options.ipcMain ?? ipcMain
  const syncRepository =
    options.syncSystemDesignRepository ?? syncSystemDesignRepository
  const fileSystem = options.fileSystem ?? fsp
  /** Mesma régua dos IPCs de projetos: pasta do seletor ou projeto registrado. */
  const authorizeProjectDirectory = options.authorizeProjectDirectory ?? null
  const settingsRepository = createSettingsRepository(options.database)
  const documents = createSystemDesignRepository(options.database)
  const cacheBaseDir = path.join(appPaths.config, 'system-design')

  /**
   * Lê o que está gravado já na forma v3 (config + store por fonte).
   *
   * A migração de uma v1/v2 é gravada na primeira leitura e é idempotente:
   * a escolha vira a lista da v3, o que foi sincronizado vai para o store por
   * fonte e os documentos da tabela antiga passam para a chave da fonte que os
   * entregou. Credencial já persistida sai no mesmo passo.
   */
  function loadState() {
    const raw = settingsRepository.get(SYSTEM_DESIGN_CONFIG_KEY)
    const config = migrateStoredConfig(raw)
    let store = normalizeSyncStore(settingsRepository.get(SYSTEM_DESIGN_SYNC_KEY))

    if (raw && typeof raw === 'object' && JSON.stringify(raw) !== JSON.stringify(config)) {
      const legacy = extractLegacySyncEntries(raw)
      if (legacy.entries.length) {
        store = mergeSyncEntries(store, legacy.entries)
        settingsRepository.set(SYSTEM_DESIGN_SYNC_KEY, store)
      }
      if (legacy.documentsSource && documents.countLegacyDocuments() > 0) {
        documents.migrateLegacyDocuments(sourceKey(legacy.documentsSource))
      }
      if (legacy.entries.length || legacy.documentsSource) {
        // O clone único de antes da lista de guias: o cache agora é por fonte
        // (`sources/<hash>`). É só cache — a próxima sincronização refaz.
        void Promise.resolve(fileSystem.rm?.(path.join(cacheBaseDir, 'repo'), { recursive: true, force: true })).catch(() => {})
      }
      settingsRepository.set(SYSTEM_DESIGN_CONFIG_KEY, config)
    }

    return { config, store }
  }

  function saveConfig(config) {
    settingsRepository.set(SYSTEM_DESIGN_CONFIG_KEY, config)
    return config
  }

  function saveStore(store) {
    settingsRepository.set(SYSTEM_DESIGN_SYNC_KEY, store)
    return store
  }

  function loadProjectStore() {
    return normalizeProjectSettingsStore(settingsRepository.get(SYSTEM_DESIGN_PROJECTS_KEY))
  }

  function withDocumentCounts(publicConfig) {
    const guides = publicConfig.guides.map((guide) => ({
      ...guide,
      documentCount: documents.forSource(guide.key).list().length,
    }))
    return { ...publicConfig, guides }
  }

  function loadConfig() {
    const { config, store } = loadState()
    return withDocumentCounts(toPublicConfig(config, store))
  }

  /** Forma pública de um guia de projeto (git com estado, local sempre à mão). */
  function publicProjectGuide(guide, { enabled, store }) {
    if (guide.kind === 'local') {
      return {
        key: guide.key,
        kind: 'local',
        path: guide.path,
        repoUrl: '',
        branch: '',
        label: guide.label,
        origin: guide.origin,
        syncState: enabled ? SYNC_STATES.SYNCED : SYNC_STATES.DISABLED,
        sha: null,
        syncedAt: null,
        lastError: null,
      }
    }
    const publicGuide = toPublicGuide(guide, { enabled, store, origin: guide.origin })
    return {
      ...publicGuide,
      label: guide.label,
      documentCount: documents.forSource(publicGuide.key).list().length,
    }
  }

  /**
   * A camada de projeto de um diretório (cwd de terminal ou raiz de projeto),
   * já cruzada com a do usuário. Fora do autorizado, nada é lido: volta a
   * camada do usuário com `authorized: false`.
   */
  async function resolveProject(directory) {
    const { config, store } = loadState()
    const userConfig = withDocumentCounts(toPublicConfig(config, store))
    const userLayer = resolveEffectiveGuides({
      userGuides: userConfig.guides,
      userSourceMode: config.sourceMode,
      projectLayer: null,
    })

    if (typeof directory !== 'string' || !directory.trim() || !authorizeProjectDirectory) {
      return { directory: directory ?? null, root: null, authorized: false, ...userLayer, file: null, folders: [], appGuides: [], useGuideFolders: true }
    }

    let root
    try {
      root = await findProjectRoot(directory, { authorize: authorizeProjectDirectory, fileSystem })
    } catch {
      return { directory, root: null, authorized: false, ...userLayer, file: null, folders: [], appGuides: [], useGuideFolders: true }
    }

    const inspection = await inspectProjectRoot(root, { fileSystem })
    const settings = settingsForRoot(loadProjectStore(), root)
    const layer = resolveProjectLayer({ settings, file: inspection.file, folders: inspection.folders })
    const effective = resolveEffectiveGuides({
      userGuides: userConfig.guides,
      userSourceMode: config.sourceMode,
      projectLayer: layer,
    })
    const toPublic = (guide) =>
      effective.layer === 'projeto' || guide.origin?.startsWith('projeto')
        ? publicProjectGuide(guide, { enabled: config.enabled, store })
        : guide

    return {
      directory,
      root,
      authorized: true,
      layer: effective.layer,
      guides: effective.guides.map(toPublic),
      replaced: effective.replaced,
      file: {
        ...layer.file,
        guides: layer.file.guides.map((guide) =>
          publicProjectGuide({ ...guide, key: sourceKey(guide), kind: 'git', label: projectGuideLabel(guide), origin: 'projeto-arquivo' }, { enabled: config.enabled, store }),
        ),
      },
      folders: layer.folders,
      appGuides: settings.guides.map((guide) =>
        publicProjectGuide({ ...guide, key: sourceKey(guide), kind: 'git', label: projectGuideLabel(guide), origin: 'projeto-app' }, { enabled: config.enabled, store }),
      ),
      useGuideFolders: layer.useGuideFolders,
    }
  }

  // Sincronização em andamento por fonte. Duas chamadas para a mesma fonte ao
  // mesmo tempo (a tela confirma o arquivo e sincroniza; o canvas vê o projeto
  // passar a valer e sincroniza também) clonariam na mesma pasta de cache, e a
  // segunda falhava com o diretório já existente (medido no app em 08/10/2026).
  const inFlightSyncs = new Map()

  /** Sincroniza UMA fonte git; chamada repetida enquanto ela roda devolve a mesma. */
  function syncOne(guide) {
    const key = sourceKey(guide)
    const running = inFlightSyncs.get(key)
    if (running) return running
    const task = syncOneNow(guide).finally(() => inFlightSyncs.delete(key))
    inFlightSyncs.set(key, task)
    return task
  }

  /** Sincroniza UMA fonte git e registra o resultado no store dela. */
  async function syncOneNow(guide) {
    const key = sourceKey(guide)
    try {
      const result = await syncRepository({
        repoUrl: guide.repoUrl,
        branch: guide.branch,
        cacheDir: path.join(cacheBaseDir, 'sources', sourceDirName(key)),
        repository: documents.forSource(key),
        logger: {
          warn: (message) => logQaEvent({ level: 'warn', scope: 'system-design:sync', message }),
        },
      })
      // A entrega é registrada com a fonte que DE FATO sincronizou (a lista
      // pode ter mudado durante o clone).
      saveStore(recordSuccessfulSync(loadState().store, {
        repoUrl: guide.repoUrl,
        branch: guide.branch,
        sha: result.headSha,
        syncedAt: new Date().toISOString(),
      }))
      logQaEvent({
        level: 'info',
        scope: 'system-design:sync',
        message: `Sincronizado ${result.indexedCount} doc(s) (sha=${result.headSha.slice(0, 7)}, removidos=${result.removedCount}).`,
      })
      return { key, ok: true, indexedCount: result.indexedCount, removedCount: result.removedCount }
    } catch (error) {
      const message = error?.isRedactedGitError
        ? sanitizeGitErrorText(error.message)
        : createRedactedGitError(error, {
            stage: error?.stage ?? 'sincronização',
            repoUrl: guide.repoUrl,
            branch: guide.branch,
          }).message
      try {
        saveStore(recordFailedSync(loadState().store, guide, message))
      } catch {
        // ignore
      }
      logQaEvent({ level: 'error', scope: 'system-design:sync', message: `Sync falhou: ${message}` })
      return { key, ok: false, message }
    }
  }

  /** Raiz autorizada para gravar escolhas de projeto (a mesma que o resolve devolve). */
  async function authorizedRoot(root) {
    if (!authorizeProjectDirectory) throw new Error('Projetos indisponíveis nesta instância.')
    return findProjectRoot(root, { authorize: authorizeProjectDirectory, fileSystem })
  }

  /** Guia de chave `local:` só é lido se a pasta estiver num projeto autorizado. */
  function authorizeLocalKey(key) {
    if (!authorizeProjectDirectory) throw new Error('Projetos indisponíveis nesta instância.')
    return authorizeProjectDirectory(key.slice(LOCAL_KEY_PREFIX.length))
  }

  function firstUserGuideKey() {
    const { config, store } = loadState()
    return toPublicConfig(config, store).guides[0].key
  }

  activeIpcMain.handle('system-design:get-config', () => {
    try {
      return { ok: true, config: loadConfig() }
    } catch (error) {
      return toErrorResult(error, 'Falha ao carregar configuracao do System Design.')
    }
  })

  activeIpcMain.handle('system-design:save-config', (_event, partial) => {
    try {
      const { config, store } = loadState()
      const change = applyConfigChange(config, partial)
      if (!change.ok) {
        return { ok: false, message: change.message }
      }
      saveConfig(change.stored)
      return { ok: true, config: withDocumentCounts(toPublicConfig(change.stored, store)) }
    } catch (error) {
      return toErrorResult(error, 'Falha ao salvar configuracao do System Design.')
    }
  })

  // Sem argumento: o índice do primeiro guia do usuário (forma de antes).
  // Com `{ guideKey }`: o de qualquer guia — git pelo store, local pelo disco.
  activeIpcMain.handle('system-design:list-documents', async (_event, request) => {
    try {
      const key = typeof request?.guideKey === 'string' && request.guideKey ? request.guideKey : firstUserGuideKey()
      if (key.startsWith(LOCAL_KEY_PREFIX)) {
        const folder = authorizeLocalKey(key)
        return { ok: true, documents: await collectLocalGuideDocuments(folder, { fileSystem }) }
      }
      return { ok: true, documents: documents.forSource(key).list() }
    } catch (error) {
      return toErrorResult(error, 'Falha ao listar documentos do System Design.')
    }
  })

  activeIpcMain.handle('system-design:get-document', async (_event, documentPath, guideKey) => {
    try {
      const key = typeof guideKey === 'string' && guideKey ? guideKey : firstUserGuideKey()
      const document = key.startsWith(LOCAL_KEY_PREFIX)
        ? await readLocalGuideDocument(authorizeLocalKey(key), documentPath, { fileSystem })
        : documents.forSource(key).get(documentPath)
      return document
        ? { ok: true, document }
        : { ok: false, message: 'Documento nao encontrado.' }
    } catch (error) {
      return toErrorResult(error, 'Falha ao carregar documento do System Design.')
    }
  })

  // Sem argumento: todos os guias git do usuário. Com `{ projectRoot }`: os guias
  // git que JÁ VALEM naquele projeto — escolha no app e arquivo confirmado.
  // Guia de arquivo pendente nunca chega aqui: quem decide é o resolve, que só
  // inclui o arquivo depois da confirmação.
  activeIpcMain.handle('system-design:sync', async (_event, request) => {
    try {
      let guides
      if (typeof request?.projectRoot === 'string' && request.projectRoot) {
        const project = await resolveProject(request.projectRoot)
        guides = project.layer === 'projeto'
          ? project.guides.filter((guide) => guide.kind === 'git')
          : []
      } else {
        const { config } = loadState()
        guides = toPublicConfig(config).guides
      }

      const results = []
      for (const guide of guides) {
        results.push(await syncOne(guide))
      }
      const failure = results.find((result) => !result.ok)
      return {
        ok: !failure,
        ...(failure ? { message: failure.message } : {}),
        config: loadConfig(),
        results,
        indexedCount: results.reduce((total, result) => total + (result.indexedCount ?? 0), 0),
        removedCount: results.reduce((total, result) => total + (result.removedCount ?? 0), 0),
      }
    } catch (error) {
      return toErrorResult(error, 'Falha ao sincronizar o System Design.')
    }
  })

  activeIpcMain.handle('system-design:reset-cache', () => {
    try {
      const cleared = documents.clearAll()
      saveStore(recordClearedCache())
      return { ok: true, cleared, config: loadConfig() }
    } catch (error) {
      return toErrorResult(error, 'Falha ao limpar cache do System Design.')
    }
  })

  activeIpcMain.handle('system-design:resolve-project', async (_event, directory) => {
    try {
      return { ok: true, project: await resolveProject(directory) }
    } catch (error) {
      return toErrorResult(error, 'Falha ao ler os guias do projeto.')
    }
  })

  activeIpcMain.handle('system-design:save-project', async (_event, root, partial) => {
    try {
      const projectRoot = await authorizedRoot(root)
      const inspection = await inspectProjectRoot(projectRoot, { fileSystem })
      const store = loadProjectStore()
      const change = applyProjectChange(settingsForRoot(store, projectRoot), partial, {
        currentFileHash: inspection.file.parsed?.hash ?? null,
      })
      if (!change.ok) {
        return { ok: false, message: change.message }
      }
      settingsRepository.set(SYSTEM_DESIGN_PROJECTS_KEY, {
        ...store,
        projects: { ...store.projects, [projectRoot]: change.settings },
      })
      return { ok: true, project: await resolveProject(projectRoot) }
    } catch (error) {
      return toErrorResult(error, 'Falha ao salvar os guias do projeto.')
    }
  })
}

module.exports = {
  registerSystemDesignIpcHandlers,
  SYSTEM_DESIGN_CONFIG_KEY,
  SYSTEM_DESIGN_PROJECTS_KEY,
  SYSTEM_DESIGN_SYNC_KEY,
  defaultConfig: defaultConfig,
  normalizeConfig,
}

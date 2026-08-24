const { contextBridge, ipcRenderer, webUtils } = require('electron')

contextBridge.exposeInMainWorld('felixo', {
  platform: process.platform,
  versions: {
    chrome: process.versions.chrome,
    electron: process.versions.electron,
    node: process.versions.node,
  },
  getFilePath: (file) => webUtils?.getPathForFile(file) ?? '',
  getVersion: () => ipcRenderer.invoke('app:get-version'),
  cli: {
    send: (params) => ipcRenderer.invoke('cli:send', params),
    stop: (params) => ipcRenderer.invoke('cli:stop', params),
    resetThread: (params) => ipcRenderer.invoke('cli:reset-thread', params),
    listOfficial: () => ipcRenderer.invoke('cli:list-official'),
    installOfficial: (params) => ipcRenderer.invoke('cli:install-official', params),
    openOfficialLogin: (params) =>
      ipcRenderer.invoke('cli:open-official-login', params),
    getOfficialAccountStatus: (params) =>
      ipcRenderer.invoke('cli:official-account-status', params),
    getOfficialAccountSessions: (params) =>
      ipcRenderer.invoke('cli:official-account-sessions', params),
    switchOfficialAccount: (params) =>
      ipcRenderer.invoke('cli:switch-official-account', params),
    orchestrationStatus: (params) =>
      ipcRenderer.invoke('cli:orchestration-status', params),
    onStream: (callback) => {
      const handler = (_event, data) => callback(data)
      ipcRenderer.on('cli:stream', handler)
      return () => ipcRenderer.removeListener('cli:stream', handler)
    },
    onRawOutput: (callback) => {
      const handler = (_event, data) => callback(data)
      ipcRenderer.on('cli:terminal-output', handler)
      return () => ipcRenderer.removeListener('cli:terminal-output', handler)
    },
    onTerminalOutput: (callback) => {
      const handler = (_event, data) => callback(data)
      ipcRenderer.on('cli:terminal-output', handler)
      return () => ipcRenderer.removeListener('cli:terminal-output', handler)
    },
  },
  pty: {
    spawn: (params) => ipcRenderer.invoke('pty:spawn', params),
    write: (params) => ipcRenderer.invoke('pty:write', params),
    resize: (params) => ipcRenderer.invoke('pty:resize', params),
    kill: (params) => ipcRenderer.invoke('pty:kill', params),
    onData: (callback) => {
      const handler = (_event, data) => callback(data)
      ipcRenderer.on('pty:data', handler)
      return () => ipcRenderer.removeListener('pty:data', handler)
    },
    onExit: (callback) => {
      const handler = (_event, data) => callback(data)
      ipcRenderer.on('pty:exit', handler)
      return () => ipcRenderer.removeListener('pty:exit', handler)
    },
  },
  projects: {
    pickFolder: () => ipcRenderer.invoke('projects:pick-folder'),
    detectRepos: (folderPath) => ipcRenderer.invoke('projects:detect-repos', folderPath),
    list: () => ipcRenderer.invoke('projects:list'),
    save: (project) => ipcRenderer.invoke('projects:save', project),
    delete: (projectId) => ipcRenderer.invoke('projects:delete', projectId),
    loadActiveIds: () => ipcRenderer.invoke('projects:load-active-ids'),
    saveActiveIds: (projectIds) =>
      ipcRenderer.invoke('projects:save-active-ids', projectIds),
    buildDocsIndex: (params) =>
      ipcRenderer.invoke('projects:build-docs-index', params),
    listDirectory: (params) =>
      ipcRenderer.invoke('projects:list-directory', params),
  },
  notes: {
    list: () => ipcRenderer.invoke('notes:list'),
    save: (note) => ipcRenderer.invoke('notes:save', note),
    delete: (noteId) => ipcRenderer.invoke('notes:delete', noteId),
  },
  canvas: {
    list: () => ipcRenderer.invoke('canvas:list'),
    save: (node) => ipcRenderer.invoke('canvas:save', node),
    delete: (nodeId) => ipcRenderer.invoke('canvas:delete', nodeId),
    clear: () => ipcRenderer.invoke('canvas:clear'),
    exportBundle: (state) => ipcRenderer.invoke('canvas:export', state),
    validateImport: (content) => ipcRenderer.invoke('canvas:validate-import', content),
    importBundle: (content) => ipcRenderer.invoke('canvas:import', content),
    listEdges: () => ipcRenderer.invoke('canvas:list-edges'),
    saveEdge: (edge) => ipcRenderer.invoke('canvas:save-edge', edge),
    deleteEdge: (edgeId) => ipcRenderer.invoke('canvas:delete-edge', edgeId),
    getFileLinkPrompt: () => ipcRenderer.invoke('canvas:get-file-link-prompt'),
    setFileLinkPrompt: (prompt) =>
      ipcRenderer.invoke('canvas:set-file-link-prompt', prompt),
    getFileBootstrapPrompt: () =>
      ipcRenderer.invoke('canvas:get-file-bootstrap-prompt'),
    setFileBootstrapPrompt: (prompt) =>
      ipcRenderer.invoke('canvas:set-file-bootstrap-prompt', prompt),
    getQualityStandard: () => ipcRenderer.invoke('canvas:get-quality-standard'),
    setQualityStandard: (params) =>
      ipcRenderer.invoke('canvas:set-quality-standard', params),
    getSkills: () => ipcRenderer.invoke('canvas:get-skills'),
    setSkills: (skills) => ipcRenderer.invoke('canvas:set-skills', skills),
    listAvailableSkills: () => ipcRenderer.invoke('canvas:list-available-skills'),
    setSkillsSettings: (params) => ipcRenderer.invoke('canvas:set-skills-settings', params),
  },
  canvasFiles: {
    list: () => ipcRenderer.invoke('canvas-file:list'),
    read: (params) => ipcRenderer.invoke('canvas-file:read', params),
    write: (params) => ipcRenderer.invoke('canvas-file:write', params),
    resolve: (params) => ipcRenderer.invoke('canvas-file:resolve', params),
    watch: (params) => ipcRenderer.invoke('canvas-file:watch', params),
    unwatch: (params) => ipcRenderer.invoke('canvas-file:unwatch', params),
    onChanged: (callback) => {
      const handler = (_event, data) => callback(data)
      ipcRenderer.on('canvas-file:changed', handler)
      return () => ipcRenderer.removeListener('canvas-file:changed', handler)
    },
  },
  contextFiles: {
    write: (params) => ipcRenderer.invoke('context-file:write', params),
    release: (params) => ipcRenderer.invoke('context-file:release', params),
  },
  // Arquivos de texto que ja existem no disco, abertos num bloco do canvas.
  // Diferente de `canvasFiles`, aqui o bloco nao e dono do arquivo: so aponta.
  textFiles: {
    pick: () => ipcRenderer.invoke('text-file:pick'),
    openInProject: (params) => ipcRenderer.invoke('text-file:open-in-project', params),
    read: (params) => ipcRenderer.invoke('text-file:read', params),
    resolveEditor: () => ipcRenderer.invoke('text-file:resolve-editor'),
    write: (params) => ipcRenderer.invoke('text-file:write', params),
    watch: (params) => ipcRenderer.invoke('text-file:watch', params),
    unwatch: (params) => ipcRenderer.invoke('text-file:unwatch', params),
    onChanged: (callback) => {
      const handler = (_event, data) => callback(data)
      ipcRenderer.on('text-file:changed', handler)
      return () => ipcRenderer.removeListener('text-file:changed', handler)
    },
  },
  automations: {
    list: () => ipcRenderer.invoke('automations:list'),
    save: (automation) => ipcRenderer.invoke('automations:save', automation),
    delete: (automationId) =>
      ipcRenderer.invoke('automations:delete', automationId),
  },
  models: {
    list: () => ipcRenderer.invoke('models:list'),
    save: (model) => ipcRenderer.invoke('models:save', model),
    delete: (modelId) => ipcRenderer.invoke('models:delete', modelId),
  },
  // Modelos que cada CLI de agente oferece hoje: `get` lê o cache (imediato,
  // é o que abre o menu), `refresh` consulta as CLIs em background.
  agentModels: {
    get: () => ipcRenderer.invoke('agent-models:get'),
    refresh: () => ipcRenderer.invoke('agent-models:refresh'),
  },
  systemDesign: {
    getConfig: () => ipcRenderer.invoke('system-design:get-config'),
    saveConfig: (partial) =>
      ipcRenderer.invoke('system-design:save-config', partial),
    listDocuments: () => ipcRenderer.invoke('system-design:list-documents'),
    getDocument: (documentPath) =>
      ipcRenderer.invoke('system-design:get-document', documentPath),
    sync: () => ipcRenderer.invoke('system-design:sync'),
    resetCache: () => ipcRenderer.invoke('system-design:reset-cache'),
  },
  chats: {
    list: (params) => ipcRenderer.invoke('chats:list', params),
    get: (chatId) => ipcRenderer.invoke('chats:get', chatId),
    save: (session) => ipcRenderer.invoke('chats:save', session),
    delete: (chatId) => ipcRenderer.invoke('chats:delete', chatId),
  },
  files: {
    readImageAttachment: (params) =>
      ipcRenderer.invoke('files:read-image-attachment', params),
    saveAttachment: (params) => ipcRenderer.invoke('files:save-attachment', params),
    saveClipboardImage: () => ipcRenderer.invoke('files:save-clipboard-image'),
    saveTextFile: (params) => ipcRenderer.invoke('files:save-text', params),
  },
  settings: {
    loadOrchestrator: () => ipcRenderer.invoke('settings:load-orchestrator'),
    saveOrchestrator: (settings) =>
      ipcRenderer.invoke('settings:save-orchestrator', settings),
  },
  updates: {
    getStatus: () => ipcRenderer.invoke('updates:get-status'),
    check: () => ipcRenderer.invoke('updates:check'),
    install: () => ipcRenderer.invoke('updates:install'),
    onStatus: (callback) => {
      const handler = (_event, data) => callback(data)
      ipcRenderer.on('updates:status', handler)
      return () => ipcRenderer.removeListener('updates:status', handler)
    },
  },
  // Instalacao automatica das CLIs de IA: roda em segundo plano na primeira
  // abertura do app instalado, e o status vira um indicador discreto.
  cliSetup: {
    getStatus: () => ipcRenderer.invoke('clis:get-setup-status'),
    retry: () => ipcRenderer.invoke('clis:retry-setup'),
    onStatus: (callback) => {
      const handler = (_event, data) => callback(data)
      ipcRenderer.on('clis:setup-status', handler)
      return () => ipcRenderer.removeListener('clis:setup-status', handler)
    },
  },
  git: {
    getSummary: (params) => ipcRenderer.invoke('git:get-summary', params),
    stageAll: (params) => ipcRenderer.invoke('git:stage-all', params),
    unstageAll: (params) => ipcRenderer.invoke('git:unstage-all', params),
    commit: (params) => ipcRenderer.invoke('git:commit', params),
  },
  // Fetch All: varre os discos atras de repositorios git, classifica cada um
  // e sincroniza os seguros. O progresso chega por evento porque a varredura
  // demora minutos e a interface precisa mostrar o avanco.
  fetchAll: {
    getState: () => ipcRenderer.invoke('fetch-all:get-state'),
    getSettings: () => ipcRenderer.invoke('fetch-all:get-settings'),
    saveSettings: (settings) =>
      ipcRenderer.invoke('fetch-all:save-settings', { settings }),
    getScope: () => ipcRenderer.invoke('fetch-all:get-scope'),
    scan: (params) => ipcRenderer.invoke('fetch-all:scan', params),
    execute: (params) => ipcRenderer.invoke('fetch-all:execute', params),
    cancel: () => ipcRenderer.invoke('fetch-all:cancel'),
    ignorePath: (params) => ipcRenderer.invoke('fetch-all:ignore-path', params),
    unignorePath: (params) => ipcRenderer.invoke('fetch-all:unignore-path', params),
    onProgress: (callback) => {
      const handler = (_event, data) => callback(data)
      ipcRenderer.on('fetch-all:progress', handler)
      return () => ipcRenderer.removeListener('fetch-all:progress', handler)
    },
    // Pedidos deixados por agentes nos terminais do canvas. Eles nunca
    // escrevem: so pedem, e quem confirma e a pessoa, aqui na tela.
    listRequests: () => ipcRenderer.invoke('fetch-all:list-requests'),
    resolveRequest: (params) => ipcRenderer.invoke('fetch-all:resolve-request', params),
    onRequests: (callback) => {
      const handler = (_event, data) => callback(data)
      ipcRenderer.on('fetch-all:agent-requests', handler)
      return () => ipcRenderer.removeListener('fetch-all:agent-requests', handler)
    },
  },
  fileOpen: {
    getPending: () => ipcRenderer.invoke('file:get-pending'),
    onOpened: (callback) => {
      const handler = (_event, data) => callback(data)
      ipcRenderer.on('file:opened', handler)
      return () => ipcRenderer.removeListener('file:opened', handler)
    },
  },
  qaLogger: {
    getEntries: () => ipcRenderer.invoke('qa-logger:get'),
    clear: () => ipcRenderer.invoke('qa-logger:clear'),
    onEntry: (callback) => {
      const handler = (_event, data) => callback(data)
      ipcRenderer.on('qa-logger:entry', handler)
      return () => ipcRenderer.removeListener('qa-logger:entry', handler)
    },
    onCleared: (callback) => {
      const handler = () => callback()
      ipcRenderer.on('qa-logger:cleared', handler)
      return () => ipcRenderer.removeListener('qa-logger:cleared', handler)
    },
  },
})

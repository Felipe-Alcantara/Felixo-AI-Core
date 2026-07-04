import { useEffect, useMemo, useRef, useState } from 'react'
import { PanelLeft } from 'lucide-react'
import {
  initialModels,
  ideaStarters,
  quickPrompts,
} from '../data/models'
import { defaultAutomations } from '../../shared/data/automations'
import {
  createAssistantMessage,
  createUserMessage,
  formatTime,
  initialMessages,
} from '../services/chat-service'
import {
  createAutomationId,
  deleteAutomationFromBackend,
  hasAutomationsBackendMigrationRun,
  loadAutomationsFromBackend,
  loadCustomAutomations,
  markAutomationsBackendMigrationRun,
  saveAutomationsToBackend,
  saveCustomAutomations,
} from '../services/automation-storage'
import { applyOrchestratorTierOverride } from '../services/delegation-policy'
import {
  createCliPrompt,
  createOrchestrationPromptHint,
  resolveActiveProjectCwd,
  shouldUseLeanContextForCurrentPrompt,
  shouldUseOrchestrationProtocol,
} from '../services/cli-prompt'
import {
  createNextMessageId,
  createSessionId,
  findLastAssistantMessageIndex,
  formatAwaitingAgentsStatus,
  formatOrchestrationRunStatus,
  formatOrchestrationStatusLabel,
  inferAvailabilityCliType,
  inferAvailabilityStatus,
} from '../services/stream-status'
import { createSystemDesignPromptBlock } from '../services/system-design-prompt'
import { useSystemDesignSettings } from '../hooks/useSystemDesignSettings'
import {
  createSuggestedExportFileName,
  exportChat,
} from '../services/chat-export'
import type { ExportFormat } from '../services/chat-export'
import {
  createChatSessionFromMessages,
  createChatSessionId,
  loadChatSessionsFromBackend,
  saveChatSessionToBackend,
} from '../services/chat-history-storage'
import {
  areModelsEquivalent,
  createModelDedupeKey,
  dedupeModels,
  deleteModelFromBackend,
  hasModelsBackendMigrationRun,
  loadModels,
  loadModelsFromBackend,
  markModelsBackendMigrationRun,
  preferModelForDedupe,
  saveModels,
  saveModelsToBackend,
} from '../services/model-storage'
import {
  createNoteFromMessages,
  deleteNoteFromBackend,
  hasNotesBackendMigrationRun,
  loadNotes,
  loadNotesFromBackend,
  markNotesBackendMigrationRun,
  saveNoteToBackend,
  saveNotes,
  saveNotesToBackend,
} from '../services/note-storage'
import {
  createGlobalMemoriesContextBlock,
  createModelCapabilityProfiles,
  createOrchestratorContextBlock,
  createSkillsContextBlock,
  loadInitialOrchestratorSettings,
  loadOrchestratorSettings,
  saveOrchestratorSettings,
} from '../services/orchestrator-settings-storage'
import {
  deleteProjectFromBackend,
  hasProjectsBackendMigrationRun,
  loadActiveProjectIds,
  loadActiveProjectIdsFromBackend,
  loadProjects,
  loadProjectsFromBackend,
  markProjectsBackendMigrationRun,
  saveActiveProjectIds,
  saveActiveProjectIdsToBackend,
  saveProjectToBackend,
  saveProjects,
  saveProjectsToBackend,
  buildDocsIndexForProject,
  type DocsIndexEntry,
} from '../services/project-storage'
import { loadTheme, saveTheme } from '../services/theme-storage'
import type {
  AutomationDefinition,
  AppTheme,
  ChatMessage,
  ChatSession,
  ContextAttachment,
  Model,
  ModelAvailabilityStatus,
  ModelId,
  OrchestratorSettings,
  Project,
  ProjectNote,
  StreamEvent,
} from '../types'
import { useTerminalOutput } from '../hooks/useTerminalOutput'
import { AutomationsModal } from './AutomationsModal'
import { ChatExportModal } from './ChatExportModal'
import { CodePanel } from './CodePanel'
import { FelixoSettingsModal } from './FelixoSettingsModal'
import { ModelConfigModal } from './ModelConfigModal'
import { ModelManagerModal } from './ModelManagerModal'
import { NotesModal } from './NotesModal'
import { OrchestratorSettingsModal } from './OrchestratorSettingsModal'
import { ProjectsModal } from './ProjectsModal'
import { AppSidebar } from './AppSidebar'
import { ChatThread } from './ChatThread'
import { Composer } from './Composer'
import { OrchestrationDashboardPanel } from './OrchestrationDashboardPanel'
import { QaLoggerPanel } from './QaLoggerPanel'
import { SkillsModal } from './SkillsModal'
import { TerminalPanel } from './TerminalPanel'

type ResetConversationThreadOptions = { resetProjectDiff?: boolean }

export function ChatWorkspace() {
  const [models, setModels] = useState<Model[]>(() => loadModels(initialModels))
  const [selectedModelId, setSelectedModelId] = useState<ModelId>(
    initialModels[0]?.id ?? '',
  )
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages)
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [projects, setProjects] = useState<Project[]>(() => loadProjects())
  const [theme, setTheme] = useState<AppTheme>(() => loadTheme())
  const [activeProjectIds, setActiveProjectIds] = useState<Set<string>>(() =>
    loadActiveProjectIds(loadProjects()),
  )
  const [notes, setNotes] = useState<ProjectNote[]>(() => loadNotes())
  const [orchestratorSettings, setOrchestratorSettings] =
    useState<OrchestratorSettings>(() => loadInitialOrchestratorSettings())
  const [customAutomations, setCustomAutomations] = useState<AutomationDefinition[]>(
    () => loadCustomAutomations(),
  )
  const [contextAttachments, setContextAttachments] = useState<ContextAttachment[]>([])
  const [input, setInput] = useState('')
  const [isModelManagerOpen, setIsModelManagerOpen] = useState(false)
  const [modelConfigTargetId, setModelConfigTargetId] = useState<ModelId | null>(null)
  const [isProjectsOpen, setIsProjectsOpen] = useState(false)
  const [isAutomationsOpen, setIsAutomationsOpen] = useState(false)
  const [isCodePanelOpen, setIsCodePanelOpen] = useState(false)
  const [isExportOpen, setIsExportOpen] = useState(false)
  const [isFelixoSettingsOpen, setIsFelixoSettingsOpen] = useState(false)
  const [isNotesOpen, setIsNotesOpen] = useState(false)
  const [isOrchestratorSettingsOpen, setIsOrchestratorSettingsOpen] =
    useState(false)
  const [isSkillsOpen, setIsSkillsOpen] = useState(false)
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [activeOrchestrationRunId, setActiveOrchestrationRunId] = useState<string | null>(null)
  const [orchestrationStatusText, setOrchestrationStatusText] = useState<string | null>(null)
  const [modelAvailability, setModelAvailability] = useState<
    Record<string, ModelAvailabilityStatus>
  >({})
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const [isTerminalPanelOpen, setIsTerminalPanelOpen] = useState(true)
  const [isOrchestrationDashboardOpen, setIsOrchestrationDashboardOpen] = useState(true)
  const [isQaLoggerOpen, setIsQaLoggerOpen] = useState(true)
  const activeSessionIdRef = useRef<string | null>(null)
  const activeThreadIdRef = useRef<string | null>(null)
  const activeChatSessionIdRef = useRef<string | null>(null)
  const conversationThreadIdRef = useRef<string | null>(null)
  const conversationModelIdRef = useRef<ModelId | null>(null)
  const messagesRef = useRef(messages)
  const sessionsRef = useRef(sessions)
  const chatHistoryLoadedRef = useRef(false)
  const orchestratorSettingsLoadedRef = useRef(false)
  const orchestratorSettingsUserEditedRef = useRef(false)
  const orchestratorSettingsRef = useRef(orchestratorSettings)
  const notesRef = useRef(notes)
  const notesUserEditedRef = useRef(false)
  const automationsRef = useRef(customAutomations)
  const automationsUserEditedRef = useRef(false)
  const automationsBackendLoadedRef = useRef(false)
  const modelsRef = useRef(models)
  const modelsUserEditedRef = useRef(false)
  const modelsBackendLoadedRef = useRef(false)
  const projectsRef = useRef(projects)
  const activeProjectIdsRef = useRef(activeProjectIds)
  const projectsBackendLoadedRef = useRef(false)
  const projectsUserEditedRef = useRef(false)
  const activeProjectIdsUserEditedRef = useRef(false)
  const lastSentProjectIdsRef = useRef<Set<string>>(new Set())
  const messageThreadIdsRef = useRef<Map<string, string>>(new Map())
  const streamHandlerRef = useRef(handleStreamEvent)
  const {
    sessions: terminalSessions,
    startSession: startTerminalSession,
    markSessionStatus: markTerminalSessionStatus,
    clearSessions: clearTerminalSessions,
  } = useTerminalOutput()

  const { state: systemDesignState } = useSystemDesignSettings()

  const selectedModel = useMemo(
    () =>
      models.find((model) => model.id === selectedModelId) ??
      models[0] ??
      null,
    [models, selectedModelId],
  )

  const automations = useMemo(
    () => [...defaultAutomations, ...customAutomations],
    [customAutomations],
  )

  const activeProjects = useMemo(
    () => projects.filter((project) => activeProjectIds.has(project.id)),
    [activeProjectIds, projects],
  )

  const [projectDocsIndexes, setProjectDocsIndexes] = useState<
    Record<string, { entries: DocsIndexEntry[]; docsPath: string }>
  >({})

  useEffect(() => {
    let cancelled = false

    async function rebuildIndexes() {
      const indexes: Record<string, { entries: DocsIndexEntry[]; docsPath: string }> = {}

      for (const project of activeProjects) {
        if (project.docsDirectory) {
          const result = await buildDocsIndexForProject(project)
          if (result && result.entries.length > 0 && !cancelled) {
            indexes[project.id] = result
          }
        }
      }

      if (!cancelled) setProjectDocsIndexes(indexes)
    }

    void rebuildIndexes()
    return () => { cancelled = true }
  }, [activeProjects])

  const meaningfulMessagesCount = useMemo(
    () => messages.filter((message) => message.content.trim()).length,
    [messages],
  )
  const suggestedExportFileName = useMemo(
    () => createSuggestedExportFileName(messages, 'markdown'),
    [messages],
  )

  const runtimeLabel = window.felixo?.versions.electron
    ? `Electron ${window.felixo.versions.electron}`
    : 'Web'

  useEffect(() => {
    streamHandlerRef.current = handleStreamEvent
  })

  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  useEffect(() => {
    sessionsRef.current = sessions
  }, [sessions])

  useEffect(() => {
    let cancelled = false

    loadChatSessionsFromBackend()
      .then((backendSessions) => {
        if (cancelled) {
          return
        }

        chatHistoryLoadedRef.current = true

        if (backendSessions !== null) {
          setSessions(backendSessions)
        }
      })
      .catch(() => {
        chatHistoryLoadedRef.current = true
      })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!messages.some((message) => message.content.trim())) {
      return
    }

    const saveTimer = window.setTimeout(() => {
      persistCurrentSession(messages)
    }, 500)

    return () => window.clearTimeout(saveTimer)
    // Persist only when messages change; refs keep the active session fresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages])

  useEffect(() => {
    orchestratorSettingsRef.current = orchestratorSettings
  }, [orchestratorSettings])

  useEffect(() => {
    notesRef.current = notes
  }, [notes])

  useEffect(() => {
    automationsRef.current = customAutomations
  }, [customAutomations])

  useEffect(() => {
    modelsRef.current = models
    if (modelsBackendLoadedRef.current) {
      void saveModelsToBackend(models)
    }
  }, [models])

  useEffect(() => {
    projectsRef.current = projects
  }, [projects])

  useEffect(() => {
    activeProjectIdsRef.current = activeProjectIds
  }, [activeProjectIds])

  useEffect(() => {
    let cancelled = false

    async function loadBackendProjects() {
      const backendProjects = await loadProjectsFromBackend()

      if (cancelled || backendProjects === null) {
        return
      }

      let currentProjects = projectsRef.current

      if (backendProjects.length > 0) {
        markProjectsBackendMigrationRun()

        if (projectsUserEditedRef.current) {
          void saveProjectsToBackend(currentProjects)
        } else {
          currentProjects = backendProjects
          setProjects(backendProjects)
        }
      } else if (!hasProjectsBackendMigrationRun() && currentProjects.length > 0) {
        const saved = await saveProjectsToBackend(currentProjects)

        if (saved) {
          markProjectsBackendMigrationRun()
        }
      } else {
        markProjectsBackendMigrationRun()
      }

      const backendActiveIds = await loadActiveProjectIdsFromBackend(currentProjects)

      if (cancelled) {
        return
      }

      if (backendActiveIds !== null) {
        if (activeProjectIdsUserEditedRef.current) {
          void saveActiveProjectIdsToBackend(activeProjectIdsRef.current)
        } else {
          setActiveProjectIds(backendActiveIds)
        }
      } else if (currentProjects.length > 0) {
        void saveActiveProjectIdsToBackend(activeProjectIdsRef.current)
      }

      projectsBackendLoadedRef.current = true
    }

    void loadBackendProjects()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    loadNotesFromBackend()
      .then((backendNotes) => {
        if (cancelled || backendNotes === null) {
          return
        }

        if (backendNotes.length > 0) {
          if (notesUserEditedRef.current) {
            void saveNotesToBackend(notesRef.current)
            markNotesBackendMigrationRun()
            return
          }

          setNotes(backendNotes)
          markNotesBackendMigrationRun()
          return
        }

        if (!hasNotesBackendMigrationRun() && notesRef.current.length > 0) {
          void saveNotesToBackend(notesRef.current).then((saved) => {
            if (saved) {
              markNotesBackendMigrationRun()
            }
          })
          return
        }

        markNotesBackendMigrationRun()
      })
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    loadModelsFromBackend()
      .then((backendModels) => {
        if (cancelled || backendModels === null) {
          return
        }

        modelsBackendLoadedRef.current = true

        if (backendModels.length > 0) {
          if (modelsUserEditedRef.current) {
            void saveModelsToBackend(modelsRef.current)
            markModelsBackendMigrationRun()
            return
          }
          setModels(backendModels)
          markModelsBackendMigrationRun()
          return
        }

        if (
          !hasModelsBackendMigrationRun() &&
          modelsRef.current.length > 0
        ) {
          void saveModelsToBackend(modelsRef.current).then((saved) => {
            if (saved) {
              markModelsBackendMigrationRun()
            }
          })
          return
        }

        markModelsBackendMigrationRun()
      })
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    loadAutomationsFromBackend()
      .then((backendAutomations) => {
        if (cancelled || backendAutomations === null) {
          return
        }

        automationsBackendLoadedRef.current = true

        if (backendAutomations.length > 0) {
          if (automationsUserEditedRef.current) {
            void saveAutomationsToBackend(automationsRef.current)
            markAutomationsBackendMigrationRun()
            return
          }
          setCustomAutomations(backendAutomations)
          markAutomationsBackendMigrationRun()
          return
        }

        if (
          !hasAutomationsBackendMigrationRun() &&
          automationsRef.current.length > 0
        ) {
          void saveAutomationsToBackend(automationsRef.current).then(
            (saved) => {
              if (saved) {
                markAutomationsBackendMigrationRun()
              }
            },
          )
          return
        }

        markAutomationsBackendMigrationRun()
      })
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    loadOrchestratorSettings()
      .then((settings) => {
        if (cancelled) {
          return
        }

        orchestratorSettingsLoadedRef.current = true

        if (orchestratorSettingsUserEditedRef.current) {
          void saveOrchestratorSettings(orchestratorSettingsRef.current)
          return
        }

        setOrchestratorSettings(settings)
      })
      .catch(() => {
        orchestratorSettingsLoadedRef.current = true
      })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!activeOrchestrationRunId || !window.felixo?.cli?.orchestrationStatus) {
      return
    }

    const pollStatus = () => {
      window.felixo?.cli
        ?.orchestrationStatus({ runId: activeOrchestrationRunId })
        .then((result) => {
          if (!result.ok || !result.run) {
            return
          }

          setOrchestrationStatusText(formatOrchestrationRunStatus(result.run))

          if (result.run.status === 'completed' || result.run.status === 'failed') {
            setActiveOrchestrationRunId(null)
          }
        })
        .catch(() => {})
    }

    pollStatus()
    const intervalId = window.setInterval(pollStatus, 1500)

    return () => window.clearInterval(intervalId)
  }, [activeOrchestrationRunId])

  useEffect(() => {
    return window.felixo?.cli?.onStream?.((event) => {
      streamHandlerRef.current(event)
    })
  }, [])

  useEffect(() => {
    saveProjects(projects)
    if (projectsBackendLoadedRef.current) {
      void saveProjectsToBackend(projects)
    }
  }, [projects])

  useEffect(() => {
    saveActiveProjectIds(activeProjectIds)
    if (projectsBackendLoadedRef.current) {
      void saveActiveProjectIdsToBackend(activeProjectIds)
    }
  }, [activeProjectIds])

  useEffect(() => {
    saveCustomAutomations(customAutomations)
    if (automationsBackendLoadedRef.current) {
      void saveAutomationsToBackend(customAutomations)
    }
  }, [customAutomations])

  useEffect(() => {
    saveNotes(notes)
  }, [notes])

  useEffect(() => {
    if (!orchestratorSettingsLoadedRef.current) {
      return
    }

    if (!orchestratorSettingsUserEditedRef.current) {
      return
    }

    void saveOrchestratorSettings(orchestratorSettings)
  }, [orchestratorSettings])

  useEffect(() => {
    saveTheme(theme)
    document.documentElement.dataset.theme = theme
  }, [theme])

  function sendMessage() {
    const trimmedInput = input.trim()
    const content =
      trimmedInput ||
      (contextAttachments.length > 0 ? 'Analise os anexos enviados.' : '')

    if (!content || activeSessionIdRef.current) {
      return
    }

    if (!selectedModel) {
      setIsModelManagerOpen(true)
      return
    }

    if (selectedModel.cliType === 'unknown') {
      appendImmediateError(
        content,
        selectedModel,
        'Este modelo não tem um tipo de CLI reconhecido.',
      )
      setInput('')
      return
    }

    if (!window.felixo?.cli) {
      appendImmediateError(
        content,
        selectedModel,
        'Bridge Electron indisponível para executar CLIs.',
      )
      setInput('')
      return
    }

    const sessionId = createSessionId()
    ensureActiveChatSessionId()
    const useLeanContext = shouldUseLeanContextForCurrentPrompt(content)
    const threadId = useLeanContext
      ? createSessionId()
      : getConversationThreadId(selectedModel)
    const cliCwd = useLeanContext
      ? undefined
      : resolveActiveProjectCwd(activeProjects)
    const prevIds = lastSentProjectIdsRef.current
    const added = activeProjects.filter((p) => !prevIds.has(p.id))
    const removed = [...prevIds]
      .filter((id) => !activeProjectIds.has(id))
      .map((id) => projects.find((p) => p.id === id))
      .filter(Boolean) as Project[]
    const projectDiff = { added, removed }
    lastSentProjectIdsRef.current = new Set(activeProjectIds)
    const orchestrationHint = createOrchestrationPromptHint(content, sessionId)
    const modelCapabilities = createModelCapabilityProfiles(
      models,
      orchestratorSettings,
      modelAvailability,
    )
    const baseContextBlock = createOrchestratorContextBlock(
      modelCapabilities,
      orchestratorSettings,
    )
    const systemDesignBlock = createSystemDesignPromptBlock(
      systemDesignState.config,
      systemDesignState.documents,
    )
    const orchestrationContextBlock = systemDesignBlock
      ? `${baseContextBlock}\n\n${systemDesignBlock}`
      : baseContextBlock
    const globalMemoriesContextBlock = createGlobalMemoriesContextBlock(
      orchestratorSettings,
    )
    const skillsContextBlock = createSkillsContextBlock(orchestratorSettings)
    const messageAttachments = contextAttachments.map((attachment) => ({
      ...attachment,
    }))

    const cliPrompt = createCliPrompt(
      messages,
      content,
      models,
      selectedModel,
      activeProjects,
      projectDiff,
      messageAttachments,
      {
        orchestrationHint,
        orchestrationContextBlock,
        globalMemoriesContextBlock,
        skillsContextBlock,
        projectDocsIndexes,
      },
    )
    const resumePrompt = createCliPrompt(
      messages,
      content,
      models,
      selectedModel,
      activeProjects,
      projectDiff,
      messageAttachments,
      {
        includeHistory: false,
        orchestrationHint,
        orchestrationContextBlock,
        globalMemoriesContextBlock,
        skillsContextBlock,
        projectDocsIndexes,
      },
    )

    setMessages((currentMessages) => [
      ...currentMessages,
      createUserMessage(content, messageAttachments),
      createAssistantMessage(selectedModel, sessionId),
    ])
    setInput('')
    setContextAttachments([])
    messageThreadIdsRef.current.set(sessionId, threadId)
    startTerminalSession(threadId)
    setActiveStreamingSession(sessionId, threadId)

    // When the orchestration protocol is being injected, this CLI is acting
    // as the orchestrator-mor. Force the top-tier variant regardless of what
    // the Composer shows: a small variant on the orchestrator breaks routing
    // (it can't see the catalog, can't reason about delegation properly, etc).
    const orchestratorActive =
      !useLeanContext && shouldUseOrchestrationProtocol(content)
    const effectiveModel = orchestratorActive
      ? applyOrchestratorTierOverride(selectedModel)
      : selectedModel

    window.felixo.cli
      .send({
        sessionId,
        threadId,
        prompt: cliPrompt,
        resumePrompt,
        promptHint: content,
        model: effectiveModel,
        cwd: cliCwd,
        availableModels: models,
        orchestratorSettings,
      })
      .then((result) => {
        if (!result.ok) {
          markTerminalSessionStatus(threadId, 'error')
          completeAssistantMessage(
            sessionId,
            result.message ?? 'Falha ao iniciar a CLI.',
            'error',
          )
        }
      })
      .catch((error: unknown) => {
        markTerminalSessionStatus(threadId, 'error')
        completeAssistantMessage(
          sessionId,
          error instanceof Error ? error.message : 'Falha ao iniciar a CLI.',
          'error',
        )
      })
  }

  function resetChat() {
    const backendThreadIds = collectKnownBackendThreadIds()

    persistCurrentSession(messagesRef.current)
    setInput('')
    setContextAttachments([])
    stopStreaming()
    resetBackendThreads(backendThreadIds)
    setActiveStreamingSession(null)
    activeChatSessionIdRef.current = null
    activeSessionIdRef.current = null
    activeThreadIdRef.current = null
    setMessages(initialMessages)
    clearTerminalSessions({ ignoreSessionIds: backendThreadIds })
    clearOrchestrationStatus()
    resetConversationThread()
    lastSentProjectIdsRef.current = new Set()
    window.felixo?.qaLogger?.clear?.()
  }

  function saveCurrentSession() {
    persistCurrentSession(messagesRef.current)
  }

  function persistCurrentSession(messagesToPersist: ChatMessage[]) {
    const chatSessionId = ensureActiveChatSessionId()
    const existingSession = sessionsRef.current.find(
      (session) => session.id === chatSessionId,
    )
    const session = createChatSessionFromMessages(
      chatSessionId,
      messagesToPersist,
      existingSession,
    )

    if (!session) {
      return
    }

    upsertChatSession(session)

    if (chatHistoryLoadedRef.current || window.felixo?.chats?.save) {
      void saveChatSessionToBackend(session).then((savedSession) => {
        if (savedSession) {
          upsertChatSession(savedSession)
        }
      })
    }
  }

  function ensureActiveChatSessionId() {
    if (!activeChatSessionIdRef.current) {
      activeChatSessionIdRef.current = createChatSessionId()
    }

    return activeChatSessionIdRef.current
  }

  function upsertChatSession(session: ChatSession) {
    setSessions((currentSessions) => {
      const nextSessions = [
        session,
        ...currentSessions.filter((item) => item.id !== session.id),
      ]

      return nextSessions.sort(
        (a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
      )
    })
  }

  function loadSession(session: ChatSession) {
    const backendThreadIds = collectKnownBackendThreadIds()

    saveCurrentSession()
    setInput('')
    setContextAttachments([])
    stopStreaming()
    resetBackendThreads(backendThreadIds)
    setActiveStreamingSession(null)
    clearOrchestrationStatus()
    resetConversationThread()
    activeChatSessionIdRef.current = session.id
    setMessages(session.messages.map((message) => ({ ...message, isStreaming: false })))
  }

  function addProjects(incoming: Project[]) {
    projectsUserEditedRef.current = true
    setProjects((prev) => {
      const existingPaths = new Set(prev.map((p) => p.path))
      const newProjects = incoming.filter((p) => !existingPaths.has(p.path))

      for (const project of newProjects) {
        void saveProjectToBackend(project)
      }

      return [...prev, ...newProjects]
    })
  }

  function removeProject(project: Project) {
    projectsUserEditedRef.current = true
    activeProjectIdsUserEditedRef.current = true
    setProjects((prev) => prev.filter((p) => p.id !== project.id))
    setActiveProjectIds((prev) => {
      const next = new Set(prev)
      next.delete(project.id)
      return next
    })
    void deleteProjectFromBackend(project.id)
  }

  function updateProject(updated: Project) {
    projectsUserEditedRef.current = true
    setProjects((prev) =>
      prev.map((p) => (p.id === updated.id ? updated : p)),
    )
    void saveProjectToBackend(updated)
  }

  function toggleProject(project: Project) {
    activeProjectIdsUserEditedRef.current = true
    setActiveProjectIds((prev) => {
      const next = new Set(prev)
      if (next.has(project.id)) {
        next.delete(project.id)
      } else {
        next.add(project.id)
      }
      return next
    })
  }

  function addContextAttachments(attachments: ContextAttachment[]) {
    setContextAttachments((currentAttachments) => [
      ...currentAttachments,
      ...attachments.filter(
        (attachment) =>
          !currentAttachments.some(
            (currentAttachment) =>
              currentAttachment.path &&
              attachment.path &&
              currentAttachment.path === attachment.path,
          ),
      ),
    ])
  }

  function removeContextAttachment(attachmentId: string) {
    setContextAttachments((currentAttachments) =>
      currentAttachments.filter((attachment) => attachment.id !== attachmentId),
    )
  }

  function addCustomAutomation(
    automation: Pick<
      AutomationDefinition,
      'description' | 'name' | 'prompt' | 'scope'
    >,
  ) {
    const now = new Date().toISOString()
    automationsUserEditedRef.current = true
    setCustomAutomations((currentAutomations) => [
      {
        ...automation,
        id: createAutomationId(automation.name),
        createdAt: now,
        updatedAt: now,
      },
      ...currentAutomations,
    ])
  }

  function removeCustomAutomation(automationId: string) {
    automationsUserEditedRef.current = true
    if (automationsBackendLoadedRef.current) {
      void deleteAutomationFromBackend(automationId)
    }
    setCustomAutomations((currentAutomations) =>
      currentAutomations.filter((automation) => automation.id !== automationId),
    )
  }

  function applyAutomation(automation: AutomationDefinition) {
    setInput((currentInput) => {
      const separator = currentInput.trim() ? '\n\n' : ''
      return `${currentInput}${separator}${automation.prompt} `
    })
    setIsAutomationsOpen(false)
  }

  function updateOrchestratorSettings(settings: OrchestratorSettings) {
    orchestratorSettingsUserEditedRef.current = true
    setOrchestratorSettings(settings)
  }

  function updateTheme(themeValue: AppTheme) {
    setTheme(themeValue)
  }

  function saveNote(note: ProjectNote) {
    notesUserEditedRef.current = true
    setNotes((currentNotes) => {
      const exists = currentNotes.some((item) => item.id === note.id)

      return exists
        ? currentNotes.map((item) => (item.id === note.id ? note : item))
        : [note, ...currentNotes]
    })
    void saveNoteToBackend(note)
  }

  function deleteNote(noteId: string) {
    notesUserEditedRef.current = true
    setNotes((currentNotes) => currentNotes.filter((note) => note.id !== noteId))
    void deleteNoteFromBackend(noteId)
  }

  function useNoteAsContext(note: ProjectNote) {
    addContextAttachments([
      {
        id: `note-${note.id}-${Date.now()}`,
        name: `Nota: ${note.title}`,
        type: 'text/markdown',
        size: new TextEncoder().encode(note.content).length,
        contentPreview: note.content,
      },
    ])
    setIsNotesOpen(false)
  }

  function createNoteFromCurrentChat() {
    if (meaningfulMessagesCount === 0) {
      return
    }

    saveNote(createNoteFromMessages(messages, models))
  }

  async function exportCurrentChat(
    format: ExportFormat,
    fileName: string,
  ) {
    const result = await exportChat({
      format,
      fileName,
      messages,
      models,
      activeProjects,
      attachments: contextAttachments,
      terminalSessions,
    })
    if (!result.ok && !result.canceled) {
      window.alert(result.message ?? 'Nao foi possivel exportar o chat.')
      return
    }
    if (result.canceled) {
      return
    }
    setIsExportOpen(false)
  }

  function addModel(model: Model) {
    const existingModel = models.find((item) => areModelsEquivalent(item, model))

    if (existingModel) {
      const preferredModel = preferModelForDedupe(existingModel, model)

      stopStreaming()

      if (preferredModel !== existingModel) {
        setModels((currentModels) => {
          const nextModels = dedupeModels(
            currentModels.map((currentModel) =>
              areModelsEquivalent(currentModel, preferredModel)
                ? preferredModel
                : currentModel,
            ),
          )
          saveModels(nextModels)
          return nextModels
        })
      }

      setSelectedModelId(preferredModel.id)
      resetConversationThread({ resetProjectDiff: false })
      return
    }

    stopStreaming()
    setModels((currentModels) => {
      const nextModels = dedupeModels([...currentModels, model])
      saveModels(nextModels)
      return nextModels
    })
    setSelectedModelId(model.id)
    resetConversationThread({ resetProjectDiff: false })
  }

  function updateModel(updatedModel: Model) {
    stopStreaming()
    setModels((currentModels) => {
      const nextModels = dedupeModels(
        currentModels.map((model) =>
          model.id === updatedModel.id ? updatedModel : model,
        ),
      )
      saveModels(nextModels)
      return nextModels
    })

    if (updatedModel.id === selectedModelId) {
      resetConversationThread({ resetProjectDiff: false })
    }
  }

  function updateSelectedModelConfig(
    patch: Partial<Pick<Model, 'providerModel' | 'reasoningEffort'>>,
  ) {
    if (!selectedModel) {
      return
    }

    const updatedModel = { ...selectedModel }

    if ('providerModel' in patch) {
      const providerModel = patch.providerModel?.trim() ?? ''
      updatedModel.providerModel = providerModel || undefined
    }

    if ('reasoningEffort' in patch) {
      updatedModel.reasoningEffort = patch.reasoningEffort
    }

    updateModel(updatedModel)
  }

  function removeModel(modelToRemove: Model) {
    stopStreaming()
    resetConversationThread({ resetProjectDiff: false })
    modelsUserEditedRef.current = true
    if (modelsBackendLoadedRef.current) {
      void deleteModelFromBackend(modelToRemove.id)
    }
    setModels((currentModels) => {
      const modelToRemoveDedupeKey = createModelDedupeKey(modelToRemove)
      const nextModels = currentModels.filter(
        (model) =>
          model.id !== modelToRemove.id &&
          createModelDedupeKey(model) !== modelToRemoveDedupeKey,
      )
      saveModels(nextModels)

      if (!nextModels.some((model) => model.id === selectedModelId)) {
        setSelectedModelId(nextModels[0]?.id ?? '')
      }

      return nextModels
    })
  }

  function clearModels() {
    stopStreaming()
    setModels([])
    saveModels([])
    setSelectedModelId('')
    resetConversationThread({ resetProjectDiff: false })
  }

  function selectModel(modelId: ModelId) {
    if (modelId === selectedModelId) {
      return
    }

    setSelectedModelId(modelId)
    stopStreaming()
    resetConversationThread({ resetProjectDiff: false })
  }

  function openModelSettingsFor(modelId: ModelId) {
    setModelConfigTargetId(modelId)
  }

  function collectKnownBackendThreadIds() {
    return [
      conversationThreadIdRef.current,
      activeThreadIdRef.current,
      ...terminalSessions.flatMap((session) => [
        session.sessionId,
        session.parentThreadId ?? null,
      ]),
    ]
  }

  function resetBackendThreads(threadIds: Array<string | null | undefined>) {
    const uniqueThreadIds = new Set(
      threadIds.filter((threadId): threadId is string => Boolean(threadId)),
    )

    for (const threadId of uniqueThreadIds) {
      window.felixo?.cli?.resetThread?.({ threadId })
    }
  }

  function stopStreaming() {
    const sessionId = activeSessionIdRef.current
    const threadId = activeThreadIdRef.current

    if (!sessionId) {
      return
    }

    window.felixo?.cli
      ?.stop({ sessionId, threadId: threadId ?? undefined })
      .then((result) => {
        if (result.ok || activeSessionIdRef.current !== sessionId) {
          return
        }

        markTerminalSessionStatus(threadId ?? resolveThreadId(sessionId), 'stopped')
        completeAssistantMessage(sessionId, 'Execução interrompida.', 'stopped')
      })
      .catch(() => {
        markTerminalSessionStatus(threadId ?? resolveThreadId(sessionId), 'error')
        completeAssistantMessage(sessionId, 'Falha ao interromper a CLI.', 'error')
      })
  }

  function handleStreamEvent(event: StreamEvent) {
    if (event.type === 'spawn_agent') {
      setActiveOrchestrationRunId(event.runId ?? null)
      setOrchestrationStatusText(
        `Sub-agente ${event.agentId} iniciado (${event.cliType}).`,
      )
      return
    }

    if (event.type === 'awaiting_agents') {
      setActiveOrchestrationRunId(event.runId ?? null)
      setOrchestrationStatusText(formatAwaitingAgentsStatus(event.agentIds.length))
      return
    }

    if (event.type === 'orchestration_status') {
      setActiveOrchestrationRunId(event.runId ?? null)
      setOrchestrationStatusText(formatOrchestrationStatusLabel(event.status))
      return
    }

    if (event.type === 'final_answer') {
      const eventThreadId = resolveEventThreadId(event)
      const parentThreadId = event.parentThreadId ?? resolveThreadId(event.sessionId)

      markTerminalSessionStatus(eventThreadId, 'completed')
      if (parentThreadId !== eventThreadId) {
        markTerminalSessionStatus(parentThreadId, 'completed')
      }
      completeAssistantMessage(event.sessionId, event.content, 'done')
      clearOrchestrationStatus()
      return
    }

    if (event.type === 'text') {
      appendAssistantText(event.sessionId, event.text, event.streamItemId)
      return
    }

    if (event.type === 'error') {
      updateModelAvailabilityFromError(event)
      markTerminalSessionStatus(resolveEventThreadId(event), 'error')
      completeAssistantMessage(event.sessionId, event.message, 'error')
      clearOrchestrationStatus()
      return
    }

    if (event.type === 'done') {
      markTerminalSessionStatus(
        resolveEventThreadId(event),
        event.stopped ? 'stopped' : 'completed',
      )
      completeAssistantMessage(
        event.sessionId,
        event.stopped ? 'Execução interrompida.' : '',
        event.stopped ? 'stopped' : 'done',
      )
      clearOrchestrationStatus()
    }
  }

  function clearOrchestrationStatus() {
    setActiveOrchestrationRunId(null)
    setOrchestrationStatusText(null)
  }

  function updateModelAvailabilityFromError(
    event: Extract<StreamEvent, { type: 'error' }>,
  ) {
    const status = inferAvailabilityStatus(event.message)

    if (!status) {
      return
    }

    const eventThreadId = resolveEventThreadId(event)
    const fallbackModel =
      eventThreadId === activeThreadIdRef.current ? selectedModel : null
    const cliType = inferAvailabilityCliType(event.message, fallbackModel)

    if (!cliType || cliType === 'unknown') {
      return
    }

    setModelAvailability((current) => ({
      ...current,
      [`cli:${cliType}`]: status,
      [cliType]: status,
    }))
  }

  function appendAssistantText(
    sessionId: string,
    text: string,
    streamItemId?: string,
  ) {
    setMessages((currentMessages) => {
      const targetIndex = findLastAssistantMessageIndex(currentMessages, sessionId)

      if (targetIndex === -1) {
        return currentMessages
      }

      const targetMessage = currentMessages[targetIndex]

      if (!text.trim() && !targetMessage.content) {
        return currentMessages
      }

      if (
        streamItemId &&
        targetMessage.streamItemId &&
        targetMessage.streamItemId !== streamItemId &&
        text.trim()
      ) {
        if (!targetMessage.content.trim()) {
          return currentMessages.map((message, index) =>
            index === targetIndex
              ? {
                  ...message,
                  content: text,
                  streamItemId,
                  isStreaming: true,
                }
              : message,
          )
        }

        return [
          ...currentMessages.map((message) =>
            message.sessionId === sessionId
              ? { ...message, isStreaming: false }
              : message,
          ),
          {
            id: createNextMessageId(currentMessages),
            role: 'assistant',
            content: text,
            model: targetMessage.model,
            sessionId,
            streamItemId,
            isStreaming: true,
            createdAt: formatTime(),
          },
        ]
      }

      return currentMessages.map((message, index) =>
        index === targetIndex
          ? {
              ...message,
              content: `${message.content}${text}`,
              streamItemId: streamItemId ?? message.streamItemId,
              isStreaming: true,
            }
          : message,
      )
    })
  }

  function completeAssistantMessage(
    sessionId: string,
    content: string,
    status: 'done' | 'error' | 'stopped',
  ) {
    setMessages((currentMessages) => {
      const targetIndex = findLastAssistantMessageIndex(currentMessages, sessionId)

      if (targetIndex === -1) {
        return currentMessages
      }

      const hasSessionContent = currentMessages.some(
        (message) =>
          message.sessionId === sessionId &&
          message.role === 'assistant' &&
          message.content.trim(),
      )

      return currentMessages.map((message, index) => {
        if (message.sessionId !== sessionId || message.role !== 'assistant') {
          return message
        }

        const shouldApplyCompletionContent =
          index === targetIndex && (status !== 'done' || content || !hasSessionContent)

        return {
          ...message,
          content: shouldApplyCompletionContent
            ? createCompletedContent(message.content, content, status)
            : message.content,
          isStreaming: false,
        }
      })
    })

    if (activeSessionIdRef.current === sessionId) {
      setActiveStreamingSession(null)
    }

    messageThreadIdsRef.current.delete(sessionId)
  }

  function appendImmediateError(
    prompt: string,
    model: Model,
    message: string,
  ) {
    const sessionId = createSessionId()
    ensureActiveChatSessionId()

    setMessages((currentMessages) => [
      ...currentMessages,
      createUserMessage(prompt),
      {
        ...createAssistantMessage(model, sessionId),
        content: `Erro: ${message}`,
        isStreaming: false,
      },
    ])
  }

  function setActiveStreamingSession(
    sessionId: string | null,
    threadId: string | null = null,
  ) {
    activeSessionIdRef.current = sessionId
    activeThreadIdRef.current = threadId
    setActiveSessionId(sessionId)
  }

  function getConversationThreadId(model: Model) {
    if (
      conversationThreadIdRef.current &&
      conversationModelIdRef.current === model.id
    ) {
      return conversationThreadIdRef.current
    }

    const threadId = createSessionId()
    conversationThreadIdRef.current = threadId
    conversationModelIdRef.current = model.id
    return threadId
  }

  function resetConversationThread(options: ResetConversationThreadOptions = {}) {
    const { resetProjectDiff = true } = options
    conversationThreadIdRef.current = null
    conversationModelIdRef.current = null
    if (resetProjectDiff) {
      lastSentProjectIdsRef.current = new Set()
    }
    messageThreadIdsRef.current.clear()
  }

  function resolveThreadId(sessionId: string) {
    if (activeSessionIdRef.current === sessionId && activeThreadIdRef.current) {
      return activeThreadIdRef.current
    }

    return messageThreadIdsRef.current.get(sessionId) ?? sessionId
  }

  function resolveEventThreadId(event: StreamEvent) {
    return event.threadId ?? resolveThreadId(event.sessionId)
  }

  function createCompletedContent(
    currentContent: string,
    nextContent: string,
    status: 'done' | 'error' | 'stopped',
  ) {
    if (status === 'done') {
      return (
        currentContent ||
        nextContent ||
        'Execução concluída sem resposta textual.'
      )
    }

    const prefix = status === 'error' ? 'Erro: ' : ''
    const formattedContent = `${prefix}${nextContent}`

    if (!currentContent) {
      return formattedContent
    }

    return `${currentContent}\n\n${formattedContent}`
  }

  const hasMessages = messages.length > 0
  const isStreaming = activeSessionId !== null

  return (
    <div
      data-theme={theme}
      className="felixo-shell flex h-full min-h-0 bg-[var(--color-app-bg)] text-zinc-100"
    >
      <AppSidebar
        models={models}
        sessions={sessions}
        projects={projects}
        activeProjectIds={activeProjectIds}
        isOpen={isSidebarOpen}
        onNewIdea={resetChat}
        onOpenModelSettings={() => setIsModelManagerOpen(true)}
        onOpenProjects={() => setIsProjectsOpen(true)}
        onOpenAutomations={() => setIsAutomationsOpen(true)}
        onOpenSkills={() => setIsSkillsOpen(true)}
        onOpenCode={() => setIsCodePanelOpen(true)}
        onOpenExport={() => setIsExportOpen(true)}
        onOpenFelixoSettings={() => setIsFelixoSettingsOpen(true)}
        onOpenNotes={() => setIsNotesOpen(true)}
        onOpenOrchestratorSettings={() => setIsOrchestratorSettingsOpen(true)}
        onToggleSidebar={() => setIsSidebarOpen(false)}
        onSelectSession={loadSession}
        onToggleProject={toggleProject}
        onOpenModelSettingsFor={openModelSettingsFor}
        onRemoveModel={removeModel}
      />

      <main className="flex min-w-0 flex-1 flex-col bg-[var(--color-main-bg)]">
        <div className="relative flex min-h-0 flex-1 flex-col">
          <div
            className={[
              'absolute left-4 top-4 text-zinc-500 max-sm:hidden',
              'transition-opacity duration-300',
              isSidebarOpen ? 'opacity-0 pointer-events-none' : 'opacity-100',
            ].join(' ')}
          >
            <button
              type="button"
              title="Abrir sidebar"
              onClick={() => setIsSidebarOpen(true)}
              className="rounded p-0.5 transition hover:text-zinc-300"
            >
              <PanelLeft size={13} />
            </button>
          </div>
          <div className="absolute right-5 top-4 flex items-center gap-2 text-zinc-500 max-[920px]:right-4 max-sm:hidden">
            <span className="rounded-full border border-white/10 px-2.5 py-1 text-[11px]">
              {runtimeLabel}
            </span>
          </div>

          {hasMessages ? (
            <>
              <ChatThread models={models} messages={messages} />
              {orchestrationStatusText && (
                <div className="flex shrink-0 items-center gap-2 border-t border-white/[0.07] bg-[var(--color-status-bg)] px-5 py-2 text-[12px] text-zinc-400">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-300" />
                  <span className="min-w-0 truncate">{orchestrationStatusText}</span>
                </div>
              )}
              <Composer
                input={input}
                starters={ideaStarters}
                models={models}
                selectedModel={selectedModel}
                attachments={contextAttachments}
                onInputChange={setInput}
                onSelectModel={selectModel}
                onChangeModelConfig={updateSelectedModelConfig}
                onAddAttachments={addContextAttachments}
                onRemoveAttachment={removeContextAttachment}
                onSubmit={sendMessage}
                onStop={stopStreaming}
                isStreaming={isStreaming}
              />
            </>
          ) : (
            <section className="min-h-0 flex-1 overflow-y-auto px-8 py-12 max-sm:px-4 max-sm:py-8 [@media(max-height:620px)]:py-6">
              <div className="mx-auto flex min-h-full w-full max-w-[760px] flex-col justify-center">
                <div className="mb-7 text-center [@media(max-height:620px)]:mb-4">
                  <img
                    src="/brand/felixo-logo.png"
                    alt="Felixo"
                    className="mx-auto mb-4 h-9 w-9 object-contain [@media(max-height:620px)]:mb-2 [@media(max-height:620px)]:h-7 [@media(max-height:620px)]:w-7"
                  />
                  <h1 className="text-[30px] font-semibold tracking-[-0.02em] text-zinc-200 max-sm:text-2xl [@media(max-height:620px)]:text-2xl">
                    De volta ao trabalho, Felixo?
                  </h1>
                </div>

                <Composer
                  input={input}
                  starters={ideaStarters}
                  models={models}
                  selectedModel={selectedModel}
                  attachments={contextAttachments}
                  variant="home"
                  onInputChange={setInput}
                  onSelectModel={selectModel}
                  onChangeModelConfig={updateSelectedModelConfig}
                  onAddAttachments={addContextAttachments}
                  onRemoveAttachment={removeContextAttachment}
                  onSubmit={sendMessage}
                  onStop={stopStreaming}
                  isStreaming={isStreaming}
                />

                <div className="mx-auto mt-7 max-w-[560px] divide-y divide-white/[0.07] [@media(max-height:620px)]:mt-4">
                  {quickPrompts.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      disabled={isStreaming}
                      onClick={() => setInput(prompt)}
                      className="block w-full px-3 py-3 text-left text-[12px] text-zinc-500 transition hover:text-zinc-300 disabled:cursor-not-allowed disabled:text-zinc-700 [@media(max-height:620px)]:py-2"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            </section>
          )}
        </div>

        <OrchestrationDashboardPanel
          isOpen={isOrchestrationDashboardOpen}
          onToggleOpen={() =>
            setIsOrchestrationDashboardOpen((value) => !value)
          }
        />

        <QaLoggerPanel
          isOpen={isQaLoggerOpen}
          onToggleOpen={() => setIsQaLoggerOpen((value) => !value)}
        />
      </main>

      <TerminalPanel
        sessions={terminalSessions}
        isOpen={isTerminalPanelOpen}
        onToggleOpen={() => setIsTerminalPanelOpen((value) => !value)}
        onClear={clearTerminalSessions}
      />

      <AutomationsModal
        isOpen={isAutomationsOpen}
        automations={automations}
        customAutomations={customAutomations}
        onClose={() => setIsAutomationsOpen(false)}
        onApplyAutomation={applyAutomation}
        onAddAutomation={addCustomAutomation}
        onRemoveAutomation={removeCustomAutomation}
      />

      <SkillsModal
        isOpen={isSkillsOpen}
        skills={orchestratorSettings.skills}
        onClose={() => setIsSkillsOpen(false)}
        onSaveSkills={(skills) =>
          updateOrchestratorSettings({
            ...orchestratorSettings,
            skills,
          })
        }
      />

      <CodePanel
        isOpen={isCodePanelOpen}
        projects={projects}
        activeProjectIds={activeProjectIds}
        onClose={() => setIsCodePanelOpen(false)}
      />

      <FelixoSettingsModal
        isOpen={isFelixoSettingsOpen}
        runtimeLabel={runtimeLabel}
        theme={theme}
        orchestratorSettings={orchestratorSettings}
        projectsCount={projects.length}
        activeProjectsCount={activeProjectIds.size}
        automationsCount={automations.length}
        onClose={() => setIsFelixoSettingsOpen(false)}
        onThemeChange={updateTheme}
        onSaveOrchestratorSettings={updateOrchestratorSettings}
      />

      {isOrchestratorSettingsOpen && (
        <OrchestratorSettingsModal
          isOpen={isOrchestratorSettingsOpen}
          models={models}
          settings={orchestratorSettings}
          onClose={() => setIsOrchestratorSettingsOpen(false)}
          onSave={updateOrchestratorSettings}
        />
      )}

      {isNotesOpen && (
        <NotesModal
          isOpen={isNotesOpen}
          notes={notes}
          hasMessages={meaningfulMessagesCount > 0}
          onClose={() => setIsNotesOpen(false)}
          onSaveNote={saveNote}
          onDeleteNote={deleteNote}
          onUseAsContext={useNoteAsContext}
          onCreateFromChat={createNoteFromCurrentChat}
        />
      )}

      {isExportOpen && (
        <ChatExportModal
          isOpen={isExportOpen}
          messagesCount={meaningfulMessagesCount}
          suggestedFileName={suggestedExportFileName}
          onClose={() => setIsExportOpen(false)}
          onExport={exportCurrentChat}
        />
      )}

      <ModelManagerModal
        isOpen={isModelManagerOpen}
        models={models}
        onClose={() => setIsModelManagerOpen(false)}
        onAddModel={addModel}
        onClearModels={clearModels}
        onRemoveModel={removeModel}
      />

      {modelConfigTargetId && (
        <ModelConfigModal
          isOpen={true}
          model={models.find((m) => m.id === modelConfigTargetId) ?? models[0]}
          onClose={() => setModelConfigTargetId(null)}
          onUpdateModel={updateModel}
        />
      )}

      <ProjectsModal
        isOpen={isProjectsOpen}
        projects={projects}
        onClose={() => setIsProjectsOpen(false)}
        onAddProjects={addProjects}
        onRemoveProject={removeProject}
        onUpdateProject={updateProject}
      />

    </div>
  )
}

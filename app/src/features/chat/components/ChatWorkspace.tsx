import { useEffect, useMemo, useRef, useState } from 'react'
import {
  initialModels,
  ideaStarters,
  quickPrompts,
  recentItems,
} from '../data/models'
import {
  createAssistantMessage,
  createUserMessage,
  initialMessages,
} from '../services/chat-service'
import { loadModels, saveModels } from '../services/model-storage'
import type { ChatMessage, Model, ModelId, StreamEvent } from '../types'
import { ModelSettingsModal } from './ModelSettingsModal'
import { AppSidebar } from './AppSidebar'
import { ChatThread } from './ChatThread'
import { Composer } from './Composer'
import { QaLoggerPanel } from './QaLoggerPanel'

const CONTEXT_MESSAGE_LIMIT = 12

export function ChatWorkspace() {
  const [models, setModels] = useState<Model[]>(() => loadModels(initialModels))
  const [selectedModelId, setSelectedModelId] = useState<ModelId>(
    initialModels[0]?.id ?? '',
  )
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages)
  const [input, setInput] = useState('')
  const [isModelSettingsOpen, setIsModelSettingsOpen] = useState(false)
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const activeSessionIdRef = useRef<string | null>(null)
  const streamHandlerRef = useRef(handleStreamEvent)

  const selectedModel = useMemo(
    () =>
      models.find((model) => model.id === selectedModelId) ??
      models[0] ??
      null,
    [models, selectedModelId],
  )

  const runtimeLabel = window.felixo?.versions.electron
    ? `Electron ${window.felixo.versions.electron}`
    : 'Web'

  useEffect(() => {
    streamHandlerRef.current = handleStreamEvent
  })

  useEffect(() => {
    return window.felixo?.cli?.onStream?.((event) => {
      streamHandlerRef.current(event)
    })
  }, [])

  function sendMessage() {
    const content = input.trim()

    if (!content || activeSessionIdRef.current) {
      return
    }

    if (!selectedModel) {
      setIsModelSettingsOpen(true)
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
    const cliPrompt = createCliPrompt(messages, content, models, selectedModel)

    setMessages((currentMessages) => [
      ...currentMessages,
      createUserMessage(content),
      createAssistantMessage(selectedModel, sessionId),
    ])
    setInput('')
    setActiveStreamingSession(sessionId)

    window.felixo.cli
      .send({ sessionId, prompt: cliPrompt, model: selectedModel })
      .then((result) => {
        if (!result.ok) {
          completeAssistantMessage(
            sessionId,
            result.message ?? 'Falha ao iniciar a CLI.',
            'error',
          )
        }
      })
      .catch((error: unknown) => {
        completeAssistantMessage(
          sessionId,
          error instanceof Error ? error.message : 'Falha ao iniciar a CLI.',
          'error',
        )
      })
  }

  function resetChat() {
    setInput('')
    stopStreaming()
    setMessages(initialMessages)
  }

  function addModel(model: Model) {
    const existingModel = models.find((item) => item.command === model.command)

    if (existingModel) {
      setSelectedModelId(existingModel.id)
      return
    }

    setModels((currentModels) => {
      const nextModels = [...currentModels, model]
      saveModels(nextModels)
      return nextModels
    })
    setSelectedModelId(model.id)
  }

  function removeModel(modelToRemove: Model) {
    setModels((currentModels) => {
      const nextModels = currentModels.filter(
        (model) =>
          model.id !== modelToRemove.id &&
          model.command !== modelToRemove.command,
      )
      saveModels(nextModels)

      if (!nextModels.some((model) => model.id === selectedModelId)) {
        setSelectedModelId(nextModels[0]?.id ?? '')
      }

      return nextModels
    })
  }

  function clearModels() {
    setModels([])
    saveModels([])
    setSelectedModelId('')
  }

  function stopStreaming() {
    const sessionId = activeSessionIdRef.current

    if (!sessionId) {
      return
    }

    window.felixo?.cli?.stop({ sessionId }).catch(() => {
      completeAssistantMessage(sessionId, 'Falha ao interromper a CLI.', 'error')
    })
  }

  function handleStreamEvent(event: StreamEvent) {
    if (event.type === 'text') {
      appendAssistantText(event.sessionId, event.text)
      return
    }

    if (event.type === 'error') {
      completeAssistantMessage(event.sessionId, event.message, 'error')
      return
    }

    if (event.type === 'done') {
      completeAssistantMessage(
        event.sessionId,
        event.stopped ? 'Execução interrompida.' : '',
        event.stopped ? 'stopped' : 'done',
      )
    }
  }

  function appendAssistantText(sessionId: string, text: string) {
    setMessages((currentMessages) =>
      currentMessages.map((message) =>
        message.sessionId === sessionId
          ? {
              ...message,
              content: `${message.content}${text}`,
              isStreaming: true,
            }
          : message,
      ),
    )
  }

  function completeAssistantMessage(
    sessionId: string,
    content: string,
    status: 'done' | 'error' | 'stopped',
  ) {
    setMessages((currentMessages) =>
      currentMessages.map((message) => {
        if (message.sessionId !== sessionId) {
          return message
        }

        const nextContent = createCompletedContent(message.content, content, status)

        return {
          ...message,
          content: nextContent,
          isStreaming: false,
        }
      }),
    )

    if (activeSessionIdRef.current === sessionId) {
      setActiveStreamingSession(null)
    }
  }

  function appendImmediateError(
    prompt: string,
    model: Model,
    message: string,
  ) {
    const sessionId = createSessionId()

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

  function setActiveStreamingSession(sessionId: string | null) {
    activeSessionIdRef.current = sessionId
    setActiveSessionId(sessionId)
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
    <div className="flex h-full min-h-0 bg-[#191918] text-zinc-100">
      <AppSidebar
        models={models}
        recentItems={recentItems}
        onNewIdea={resetChat}
        onOpenModelSettings={() => setIsModelSettingsOpen(true)}
      />

      <main className="flex min-w-0 flex-1 flex-col bg-[#171716]">
        <div className="relative flex min-h-0 flex-1 flex-col">
          <div className="absolute right-5 top-4 flex items-center gap-2 text-zinc-500 max-[920px]:right-4 max-sm:hidden">
            <span className="rounded-full border border-white/10 px-2.5 py-1 text-[11px]">
              {runtimeLabel}
            </span>
          </div>

          {hasMessages ? (
            <>
              <ChatThread models={models} messages={messages} />
              <Composer
                input={input}
                starters={ideaStarters}
                models={models}
                selectedModel={selectedModel}
                onInputChange={setInput}
                onSelectModel={setSelectedModelId}
                onSubmit={sendMessage}
                onStop={stopStreaming}
                isStreaming={isStreaming}
              />
            </>
          ) : (
            <section className="min-h-0 flex-1 overflow-y-auto px-8 py-12 max-sm:px-4 max-sm:py-8 [@media(max-height:620px)]:py-6">
              <div className="mx-auto flex min-h-full w-full max-w-[760px] flex-col justify-center">
                <div className="mb-7 text-center [@media(max-height:620px)]:mb-4">
                  <div className="mx-auto mb-4 h-8 w-8 rounded-full bg-[conic-gradient(from_0deg,#f59e0b,#f97316,#fb7185,#f59e0b)] opacity-80 [@media(max-height:620px)]:mb-2 [@media(max-height:620px)]:h-6 [@media(max-height:620px)]:w-6" />
                  <h1 className="text-[30px] font-semibold tracking-[-0.02em] text-zinc-200 max-sm:text-2xl [@media(max-height:620px)]:text-2xl">
                    De volta ao trabalho, Felixo?
                  </h1>
                </div>

                <Composer
                  input={input}
                  starters={ideaStarters}
                  models={models}
                  selectedModel={selectedModel}
                  variant="home"
                  onInputChange={setInput}
                  onSelectModel={setSelectedModelId}
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

        <QaLoggerPanel />
      </main>

      <ModelSettingsModal
        models={models}
        selectedModel={selectedModel}
        isOpen={isModelSettingsOpen}
        onAddModel={addModel}
        onClearModels={clearModels}
        onRemoveModel={removeModel}
        onClose={() => setIsModelSettingsOpen(false)}
      />
    </div>
  )
}

function createSessionId() {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`
}

function createCliPrompt(
  messages: ChatMessage[],
  currentPrompt: string,
  models: Model[],
  selectedModel: Model,
) {
  const historyMessages = messages
    .filter((message) => message.content.trim())
    .slice(-CONTEXT_MESSAGE_LIMIT)

  if (historyMessages.length === 0) {
    return currentPrompt
  }

  return [
    'Use o histórico abaixo como contexto da conversa no app. Responda apenas à mensagem atual do usuário.',
    `Modelo que responderá agora: ${formatModelLabel(selectedModel)}`,
    '',
    'Histórico da conversa:',
    ...historyMessages.map((message, index) =>
      formatHistoryMessage(message, index, models),
    ),
    '',
    'Mensagem atual do usuário:',
    '--- Mensagem atual ---',
    'Autor: Usuário',
    'Conteúdo:',
    currentPrompt,
  ].join('\n')
}

function formatHistoryMessage(
  message: ChatMessage,
  index: number,
  models: Model[],
) {
  const lines = [
    `--- Mensagem ${index + 1} ---`,
    `Autor: ${message.role === 'user' ? 'Usuário' : 'Assistente'}`,
  ]

  if (message.role === 'assistant') {
    lines.push(`Modelo: ${resolveMessageModelLabel(message, models)}`)
  }

  lines.push('Conteúdo:', message.content.trim())

  return lines.join('\n')
}

function resolveMessageModelLabel(message: ChatMessage, models: Model[]) {
  if (!message.model) {
    return 'Não registrado'
  }

  const model = models.find((item) => item.id === message.model)

  return model ? formatModelLabel(model) : message.model
}

function formatModelLabel(model: Model) {
  return `${model.name} (${model.source})`
}

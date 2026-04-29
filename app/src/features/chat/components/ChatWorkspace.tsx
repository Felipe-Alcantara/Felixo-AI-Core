import { useMemo, useState } from 'react'
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
import type { ChatMessage, Model, ModelId } from '../types'
import { ModelSettingsModal } from './ModelSettingsModal'
import { AppSidebar } from './AppSidebar'
import { ChatThread } from './ChatThread'
import { Composer } from './Composer'

export function ChatWorkspace() {
  const [models, setModels] = useState<Model[]>(() => loadModels(initialModels))
  const [selectedModelId, setSelectedModelId] = useState<ModelId>(
    initialModels[0]?.id ?? '',
  )
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages)
  const [input, setInput] = useState('')
  const [isModelSettingsOpen, setIsModelSettingsOpen] = useState(false)

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

  function sendMessage() {
    const content = input.trim()

    if (!content) {
      return
    }

    if (!selectedModel) {
      setIsModelSettingsOpen(true)
      return
    }

    setMessages((currentMessages) => [
      ...currentMessages,
      createUserMessage(content),
      createAssistantMessage(content, selectedModel),
    ])
    setInput('')
  }

  function resetChat() {
    setInput('')
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

  const hasMessages = messages.length > 0

  return (
    <div className="flex h-full min-h-0 bg-[#191918] text-zinc-100">
      <AppSidebar
        models={models}
        recentItems={recentItems}
        onNewIdea={resetChat}
        onOpenModelSettings={() => setIsModelSettingsOpen(true)}
      />

      <main className="relative flex min-w-0 flex-1 flex-col bg-[#171716]">
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
              />

              <div className="mx-auto mt-7 max-w-[560px] divide-y divide-white/[0.07] [@media(max-height:620px)]:mt-4">
                {quickPrompts.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => setInput(prompt)}
                    className="block w-full px-3 py-3 text-left text-[12px] text-zinc-500 transition hover:text-zinc-300 [@media(max-height:620px)]:py-2"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          </section>
        )}
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

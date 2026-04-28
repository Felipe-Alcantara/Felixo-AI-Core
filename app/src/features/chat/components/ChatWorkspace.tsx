import { useMemo, useState } from 'react'
import { agents, ideaStarters } from '../data/agents'
import {
  createAssistantMessage,
  createUserMessage,
  initialMessages,
} from '../services/chat-service'
import type { AgentId, ChatMessage } from '../types'
import { AgentRail } from './AgentRail'
import { ChatHeader } from './ChatHeader'
import { ChatThread } from './ChatThread'
import { Composer } from './Composer'
import { ContextPanel } from './ContextPanel'

export function ChatWorkspace() {
  const [selectedAgentId, setSelectedAgentId] = useState<AgentId>('codex')
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages)
  const [input, setInput] = useState('')

  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.id === selectedAgentId) ?? agents[0],
    [selectedAgentId],
  )

  const runtimeLabel = window.felixo?.versions.electron
    ? `Electron ${window.felixo.versions.electron}`
    : 'Web'

  function sendMessage() {
    const content = input.trim()

    if (!content) {
      return
    }

    setMessages((currentMessages) => [
      ...currentMessages,
      createUserMessage(content),
      createAssistantMessage(content, selectedAgent),
    ])
    setInput('')
  }

  function resetChat() {
    setInput('')
    setMessages(initialMessages)
  }

  return (
    <div className="flex h-full min-h-0 bg-zinc-950 max-sm:flex-col">
      <AgentRail
        agents={agents}
        selectedAgent={selectedAgent}
        onSelectAgent={setSelectedAgentId}
        onNewIdea={resetChat}
      />

      <main className="flex min-w-0 flex-1 flex-col">
        <ChatHeader
          selectedAgent={selectedAgent}
          runtimeLabel={runtimeLabel}
          onClear={resetChat}
        />
        <ChatThread agents={agents} messages={messages} />
        <Composer
          input={input}
          starters={ideaStarters}
          onInputChange={setInput}
          onSubmit={sendMessage}
        />
      </main>

      <ContextPanel selectedAgent={selectedAgent} messageCount={messages.length} />
    </div>
  )
}

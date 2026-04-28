import type { FormEvent, KeyboardEvent } from 'react'
import { useMemo, useState } from 'react'
import {
  Bot,
  BrainCircuit,
  Command,
  Eraser,
  Lightbulb,
  MessageSquare,
  Plus,
  Send,
  Sparkles,
  Terminal,
  User,
} from 'lucide-react'

type AgentId = 'codex' | 'claude' | 'gemini' | 'openclaude'

type Agent = {
  id: AgentId
  name: string
  command: string
  tone: string
  accent: string
}

type ChatMessage = {
  id: number
  role: 'assistant' | 'user'
  content: string
  agent?: AgentId
  createdAt: string
}

const agents: Agent[] = [
  {
    id: 'codex',
    name: 'Codex',
    command: './ai-clis/codex.sh',
    tone: 'código e execução',
    accent: 'bg-violet-400',
  },
  {
    id: 'claude',
    name: 'Claude',
    command: './ai-clis/claude.sh',
    tone: 'clareza e revisão',
    accent: 'bg-amber-300',
  },
  {
    id: 'gemini',
    name: 'Gemini',
    command: './ai-clis/gemini.sh',
    tone: 'pesquisa e variações',
    accent: 'bg-sky-300',
  },
  {
    id: 'openclaude',
    name: 'OpenClaude',
    command: './ai-clis/openclaude-claude.sh',
    tone: 'ponte experimental',
    accent: 'bg-emerald-300',
  },
]

const ideaStarters = [
  'Transforme esta ideia em um MVP pequeno:',
  'Organize esta ideia em tarefas de desenvolvimento:',
  'Me ajude a descobrir o primeiro experimento:',
  'Crie um roadmap simples para:',
]

const initialMessages: ChatMessage[] = [
  {
    id: 1,
    role: 'assistant',
    content:
      'Bem-vindo ao Felixo AI Core. Manda uma ideia crua e eu transformo em um primeiro rascunho de direção.',
    agent: 'codex',
    createdAt: 'agora',
  },
]

function formatTime() {
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date())
}

function compactIdea(value: string) {
  const normalized = value.replace(/\s+/g, ' ').trim()
  return normalized.length > 82 ? `${normalized.slice(0, 82)}...` : normalized
}

function createLocalReply(prompt: string, agent: Agent) {
  const idea = compactIdea(prompt)

  return [
    `${agent.name} captou a ideia: "${idea}"`,
    '',
    '1. Objetivo inicial',
    'Definir a versão menor possível que já gere conversa, decisão ou material útil.',
    '',
    '2. Primeiro passo',
    'Escrever uma descrição de uma tela, fluxo ou resultado esperado antes de pensar em arquitetura.',
    '',
    '3. Pergunta de foco',
    'Qual parte disso precisa existir hoje para a ideia deixar de ser abstrata?',
  ].join('\n')
}

function App() {
  const [selectedAgentId, setSelectedAgentId] = useState<AgentId>('codex')
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages)
  const [input, setInput] = useState('')

  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.id === selectedAgentId) ?? agents[0],
    [selectedAgentId],
  )

  const runtimeLabel = window.felixo?.versions.electron
    ? `Electron ${window.felixo.versions.electron}`
    : 'Web preview'

  function sendMessage() {
    const content = input.trim()

    if (!content) {
      return
    }

    const userMessage: ChatMessage = {
      id: Date.now(),
      role: 'user',
      content,
      createdAt: formatTime(),
    }

    const assistantMessage: ChatMessage = {
      id: Date.now() + 1,
      role: 'assistant',
      content: createLocalReply(content, selectedAgent),
      agent: selectedAgent.id,
      createdAt: formatTime(),
    }

    setMessages((currentMessages) => [
      ...currentMessages,
      userMessage,
      assistantMessage,
    ])
    setInput('')
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    sendMessage()
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      sendMessage()
    }
  }

  function clearChat() {
    setMessages(initialMessages)
  }

  function startNewIdea() {
    setInput('')
    setMessages(initialMessages)
  }

  return (
    <div className="h-screen overflow-hidden bg-zinc-950 text-zinc-50">
      <div className="grid h-full grid-cols-[280px_minmax(0,1fr)_310px] max-xl:grid-cols-[250px_minmax(0,1fr)] max-lg:grid-cols-1">
        <aside className="flex min-h-0 flex-col border-r border-white/10 bg-black/35 p-4 max-lg:hidden">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-violet-300/30 bg-violet-300/10 text-violet-200">
              <BrainCircuit size={21} aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-base font-semibold text-white">
                Felixo AI Core
              </h1>
              <p className="text-xs text-zinc-500">{runtimeLabel}</p>
            </div>
          </div>

          <button
            type="button"
            title="Nova ideia"
            onClick={startNewIdea}
            className="mb-5 inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-emerald-300/20 bg-emerald-300/10 px-3 text-sm font-medium text-emerald-100 transition hover:bg-emerald-300/15 focus:outline-none focus:ring-2 focus:ring-emerald-300/50"
          >
            <Plus size={17} aria-hidden="true" />
            Nova ideia
          </button>

          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase text-zinc-500">
              Agentes
            </span>
            <Terminal size={15} className="text-zinc-600" aria-hidden="true" />
          </div>

          <div className="space-y-2">
            {agents.map((agent) => {
              const isSelected = agent.id === selectedAgent.id

              return (
                <button
                  key={agent.id}
                  type="button"
                  onClick={() => setSelectedAgentId(agent.id)}
                  className={`w-full rounded-lg border p-3 text-left transition focus:outline-none focus:ring-2 focus:ring-violet-300/50 ${
                    isSelected
                      ? 'border-violet-300/40 bg-white/10'
                      : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${agent.accent}`}
                    />
                    <span className="text-sm font-medium text-white">
                      {agent.name}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-zinc-500">{agent.tone}</p>
                  <code className="mt-2 block truncate rounded bg-black/35 px-2 py-1 font-mono text-[11px] text-zinc-400">
                    {agent.command}
                  </code>
                </button>
              )
            })}
          </div>

          <div className="mt-auto rounded-lg border border-white/10 bg-white/[0.03] p-3">
            <div className="flex items-center gap-2 text-sm font-medium text-zinc-200">
              <Command size={16} className="text-sky-300" aria-hidden="true" />
              Stack ativa
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-zinc-400">
              <span className="rounded border border-white/10 px-2 py-1">
                Electron
              </span>
              <span className="rounded border border-white/10 px-2 py-1">
                React
              </span>
              <span className="rounded border border-white/10 px-2 py-1">
                TypeScript
              </span>
              <span className="rounded border border-white/10 px-2 py-1">
                Tailwind
              </span>
            </div>
          </div>
        </aside>

        <main className="flex min-h-0 flex-col bg-zinc-950">
          <header className="flex h-16 shrink-0 items-center justify-between border-b border-white/10 px-5">
            <div>
              <div className="flex items-center gap-2">
                <MessageSquare size={18} className="text-violet-300" />
                <h2 className="text-sm font-semibold text-white">
                  Chat de ideias
                </h2>
              </div>
              <p className="mt-1 text-xs text-zinc-500">
                {selectedAgent.name} ativo
              </p>
            </div>

            <button
              type="button"
              title="Limpar conversa"
              onClick={clearChat}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-zinc-300 transition hover:bg-white/[0.08] focus:outline-none focus:ring-2 focus:ring-violet-300/50"
            >
              <Eraser size={17} aria-hidden="true" />
              <span className="sr-only">Limpar conversa</span>
            </button>
          </header>

          <section className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
            <div className="mx-auto flex max-w-4xl flex-col gap-4">
              {messages.map((message) => {
                const agent = agents.find((item) => item.id === message.agent)
                const isUser = message.role === 'user'

                return (
                  <article
                    key={message.id}
                    className={`flex gap-3 ${isUser ? 'justify-end' : ''}`}
                  >
                    {!isUser && (
                      <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-violet-300/25 bg-violet-300/10 text-violet-200">
                        <Bot size={18} aria-hidden="true" />
                      </div>
                    )}

                    <div
                      className={`max-w-[78%] rounded-lg border px-4 py-3 max-sm:max-w-[88%] ${
                        isUser
                          ? 'border-sky-300/25 bg-sky-300/10'
                          : 'border-white/10 bg-white/[0.04]'
                      }`}
                    >
                      <div className="mb-2 flex items-center justify-between gap-4">
                        <span className="text-xs font-medium text-zinc-300">
                          {isUser ? 'Você' : agent?.name ?? 'Felixo Core'}
                        </span>
                        <span className="text-[11px] text-zinc-600">
                          {message.createdAt}
                        </span>
                      </div>
                      <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-100">
                        {message.content}
                      </p>
                    </div>

                    {isUser && (
                      <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-sky-300/25 bg-sky-300/10 text-sky-200">
                        <User size={17} aria-hidden="true" />
                      </div>
                    )}
                  </article>
                )
              })}
            </div>
          </section>

          <form
            onSubmit={handleSubmit}
            className="shrink-0 border-t border-white/10 bg-black/25 p-4"
          >
            <div className="mx-auto max-w-4xl">
              <div className="mb-3 flex flex-wrap gap-2">
                {ideaStarters.map((starter) => (
                  <button
                    key={starter}
                    type="button"
                    onClick={() => setInput(starter)}
                    className="rounded border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-zinc-300 transition hover:bg-white/[0.07] focus:outline-none focus:ring-2 focus:ring-violet-300/50"
                  >
                    {starter}
                  </button>
                ))}
              </div>

              <div className="flex items-end gap-3 rounded-lg border border-white/10 bg-zinc-900/80 p-3 shadow-panel">
                <textarea
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={3}
                  placeholder="Escreva uma ideia, problema ou direção de produto..."
                  className="max-h-40 min-h-20 flex-1 resize-none bg-transparent text-sm leading-relaxed text-zinc-100 outline-none placeholder:text-zinc-600"
                />
                <button
                  type="submit"
                  title="Enviar"
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-violet-300 text-zinc-950 transition hover:bg-violet-200 focus:outline-none focus:ring-2 focus:ring-violet-200 focus:ring-offset-2 focus:ring-offset-zinc-900"
                >
                  <Send size={18} aria-hidden="true" />
                  <span className="sr-only">Enviar</span>
                </button>
              </div>
            </div>
          </form>
        </main>

        <aside className="flex min-h-0 flex-col border-l border-white/10 bg-black/25 p-4 max-xl:hidden">
          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <Sparkles size={17} className="text-amber-200" aria-hidden="true" />
              Sessão
            </div>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-zinc-500">Modo</dt>
                <dd className="text-zinc-200">Ideação</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-zinc-500">Mensagens</dt>
                <dd className="text-zinc-200">{messages.length}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-zinc-500">Plataforma</dt>
                <dd className="text-zinc-200">
                  {window.felixo?.platform ?? 'browser'}
                </dd>
              </div>
            </dl>
          </div>

          <div className="mt-4 rounded-lg border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <Lightbulb size={17} className="text-emerald-200" aria-hidden="true" />
              Foco
            </div>
            <div className="mt-4 space-y-2 text-sm text-zinc-300">
              <p className="rounded border border-violet-300/20 bg-violet-300/10 px-3 py-2">
                Capturar ideias sem sair do desktop.
              </p>
              <p className="rounded border border-sky-300/20 bg-sky-300/10 px-3 py-2">
                Preparar a conexão com CLIs locais.
              </p>
              <p className="rounded border border-emerald-300/20 bg-emerald-300/10 px-3 py-2">
                Evoluir para histórico persistente.
              </p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}

export default App

import { useState } from 'react'
import { TerminalSquare, X } from 'lucide-react'
import { ChatWorkspace } from './features/chat/components/ChatWorkspace'
import { LiveTerminalPanel } from './features/chat/components/LiveTerminalPanel'

function App() {
  // A non-empty session id both opens the overlay and gives the PTY a stable
  // id that survives re-renders while the terminal is visible.
  const [terminalSessionId, setTerminalSessionId] = useState('')

  const openTerminal = () => setTerminalSessionId(`term-${Date.now()}`)

  return (
    <div className="h-screen overflow-hidden bg-[var(--color-main-bg)] text-zinc-50">
      <ChatWorkspace />

      <button
        type="button"
        onClick={openTerminal}
        className="fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-full bg-zinc-800 px-4 py-2 text-sm text-zinc-100 shadow-lg ring-1 ring-white/10 hover:bg-zinc-700"
      >
        <TerminalSquare size={16} />
        Terminal
      </button>

      {terminalSessionId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6">
          <div className="relative flex h-[70vh] w-[80vw] max-w-4xl flex-col">
            <button
              type="button"
              onClick={() => setTerminalSessionId('')}
              className="absolute -top-3 -right-3 z-10 rounded-full bg-zinc-800 p-1.5 text-zinc-200 ring-1 ring-white/10 hover:bg-zinc-700"
              aria-label="Fechar terminal"
            >
              <X size={16} />
            </button>
            <LiveTerminalPanel sessionId={terminalSessionId} />
          </div>
        </div>
      )}
    </div>
  )
}

export default App

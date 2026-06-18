import { useState } from 'react'
import { LayoutGrid, MessageSquare } from 'lucide-react'
import { ChatWorkspace } from './features/chat/components/ChatWorkspace'
import { CanvasView } from './features/canvas/components/CanvasView'

type Screen = 'canvas' | 'chat'

function App() {
  // The canvas is the primary screen; chat remains reachable via the toggle.
  const [screen, setScreen] = useState<Screen>('canvas')

  return (
    <div className="relative h-screen overflow-hidden bg-[var(--color-main-bg)] text-zinc-50">
      {screen === 'canvas' ? <CanvasView /> : <ChatWorkspace />}

      <button
        type="button"
        onClick={() => setScreen((current) => (current === 'canvas' ? 'chat' : 'canvas'))}
        className="fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-full bg-zinc-800 px-4 py-2 text-sm text-zinc-100 shadow-lg ring-1 ring-white/10 hover:bg-zinc-700"
      >
        {screen === 'canvas' ? (
          <>
            <MessageSquare size={16} />
            Chat
          </>
        ) : (
          <>
            <LayoutGrid size={16} />
            Canvas
          </>
        )}
      </button>
    </div>
  )
}

export default App

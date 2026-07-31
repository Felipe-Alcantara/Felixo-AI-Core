import { useState } from 'react'
import { ChatWorkspace } from './features/chat/components/ChatWorkspace'
import { CanvasView } from './features/canvas/components/CanvasView'

type Screen = 'canvas' | 'chat'

function App() {
  // The canvas is the primary screen; chat remains reachable via the toolbar's
  // "Chat" button — a toolbar control, not a floating overlay, since terminal
  // windows live in canvas space and can be panned under any fixed corner.
  const [screen, setScreen] = useState<Screen>('canvas')

  return (
    <div className="relative h-screen overflow-hidden bg-[var(--color-main-bg)] text-zinc-50">
      {screen === 'canvas' ? (
        <CanvasView onOpenChat={() => setScreen('chat')} />
      ) : (
        <ChatWorkspace onBack={() => setScreen('canvas')} />
      )}
    </div>
  )
}

export default App

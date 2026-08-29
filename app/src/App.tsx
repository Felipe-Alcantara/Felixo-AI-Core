import { useState } from 'react'
import { ChatWorkspace } from './features/chat/components/ChatWorkspace'
import { CanvasView } from './features/canvas/components/CanvasView'
import { useFocusRestore } from './features/shared/focus/useFocusRestore'
import { ThemeProvider } from './features/shared/theme/ThemeProvider'

type Screen = 'canvas' | 'chat'

function App() {
  // The canvas is the primary screen; chat remains reachable via the toolbar's
  // "Chat" button — a toolbar control, not a floating overlay, since terminal
  // windows live in canvas space and can be panned under any fixed corner.
  const [screen, setScreen] = useState<Screen>('canvas')

  // Voltar de uma janela minimizada (ou de outro app) deixava o foco no
  // `<body>`: o terminal parecia pronto, mas nada do que era digitado chegava
  // ao PTY. Fica aqui, e não no drawer, porque o mesmo vale para os campos dos
  // menus — as duas telas do app são cobertas de uma vez.
  useFocusRestore()

  return (
    // O tema envolve as duas telas: quem escolhe é o painel de configurações do
    // canvas, e a escolha não pode depender de qual tela está montada.
    <ThemeProvider>
      <div className="relative h-screen overflow-hidden bg-[var(--color-main-bg)] text-zinc-50">
        {screen === 'canvas' ? (
          <CanvasView onOpenChat={() => setScreen('chat')} />
        ) : (
          <ChatWorkspace onBack={() => setScreen('canvas')} />
        )}
      </div>
    </ThemeProvider>
  )
}

export default App

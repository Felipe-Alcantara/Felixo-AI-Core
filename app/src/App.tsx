import { lazy, Suspense, useState } from 'react'
import { useFocusRestore } from './features/shared/focus/useFocusRestore'
import { ThemeProvider } from './features/shared/theme/ThemeProvider'

type Screen = 'canvas' | 'chat'

const CanvasView = lazy(() =>
  import('./features/canvas/components/CanvasView').then(({ CanvasView: component }) => ({
    default: component,
  })),
)

const ChatWorkspace = lazy(() =>
  import('./features/chat/components/ChatWorkspace').then(({ ChatWorkspace: component }) => ({
    default: component,
  })),
)

function ScreenLoading() {
  return (
    <div
      className="flex h-full items-center justify-center bg-[var(--color-main-bg)] text-sm text-zinc-400"
      role="status"
      aria-live="polite"
    >
      Carregando workspace…
    </div>
  )
}

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
      <div
        className="relative h-screen overflow-hidden bg-[var(--color-main-bg)] text-zinc-50"
        data-felixo-app-shell
      >
        <Suspense fallback={<ScreenLoading />}>
          {screen === 'canvas' ? (
            <CanvasView onOpenChat={() => setScreen('chat')} />
          ) : (
            <ChatWorkspace onBack={() => setScreen('canvas')} />
          )}
        </Suspense>
      </div>
    </ThemeProvider>
  )
}

export default App

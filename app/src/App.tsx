import { lazy, Suspense, useState } from 'react'
import { useFocusRestore } from './features/shared/focus/useFocusRestore'
import { ThemeProvider } from './features/shared/theme/ThemeProvider'
import { PerformanceModeProvider } from './features/shared/performance/PerformanceModeProvider'
import { HardwareNotices } from './features/shared/hardware/HardwareNotices'
import { SystemDesignLoginNotice } from './features/shared/system-design/SystemDesignLoginNotice'
import { AgentBrowserRequestCard } from './features/canvas/components/AgentBrowserRequestCard'
import { AgentWebpageInspectCard } from './features/canvas/components/AgentWebpageInspectCard'
import { LinkChooserHost } from './features/shared/links/LinkChooserHost'

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
      className="flex h-full items-center justify-center bg-(--color-main-bg) text-sm text-zinc-400"
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
    // O tema e o Modo Performance envolvem as duas telas: quem escolhe é o
    // painel de configurações do canvas (ou do chat), e a escolha não pode
    // depender de qual tela está montada.
    <ThemeProvider>
      <PerformanceModeProvider>
        {/* `overflow-clip`, e não `overflow-hidden`: o hidden ainda é um contêiner
            rolável, e um `focus()` sem `preventScroll` dentro da gaveta do terminal
            (a Leitura, a faixa de retomada) enquanto ela tem largura quase zero e o
            conteúdo transborda rolava o shell uns 434 px de lado: a moldura inteira
            pulava e voltava. O clip corta do mesmo jeito e não rola nunca. */}
        <div
          className="relative h-screen overflow-clip bg-(--color-main-bg) text-zinc-50"
          data-felixo-app-shell
        >
          <Suspense fallback={<ScreenLoading />}>
            {screen === 'canvas' ? (
              <CanvasView onOpenChat={() => setScreen('chat')} />
            ) : (
              <ChatWorkspace onBack={() => setScreen('canvas')} />
            )}
          </Suspense>
          {/* Volta automática da placa de vídeo e sugestão do Modo Performance:
              valem nas duas telas. */}
          <HardwareNotices />
          {/* Guia do System Design que a sincronização automática não
              atualizou por pedir login: o aviso oferece o clique que pode
              abrir a janela de login. */}
          <SystemDesignLoginNotice />
          {/* O menu "para onde abrir este link" também: terminal e Markdown
              existem no canvas e no chat. */}
          <LinkChooserHost />
          {/* Pedido de agente para abrir uma página (`felixo browser open`):
              espera a pessoa nas duas telas. No chat, o bloco Página Web não
              existe, então o botão leva ao canvas. */}
          <AgentBrowserRequestCard onOpenCanvas={screen === 'chat' ? () => setScreen('canvas') : undefined} />
          {/* Pedido para olhar um bloco Página Web (`felixo browser capture`/`read`):
              a pessoa permite uma vez. No chat não há bloco aberto: só recusa. */}
          <AgentWebpageInspectCard />
        </div>
      </PerformanceModeProvider>
    </ThemeProvider>
  )
}

export default App

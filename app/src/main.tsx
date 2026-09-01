import { StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import '@xterm/xterm/css/xterm.css'
import './index.css'
import App from './App.tsx'
import { LazyCanvasConnectionPerformanceHarness } from './features/canvas/benchmarks/CanvasConnectionPerformanceHarnessLoader'

const benchmark = new URLSearchParams(window.location.search).get('benchmark')

createRoot(document.getElementById('root')!).render(
  benchmark === 'canvas-connections' ? (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center bg-zinc-950 text-sm text-zinc-400">
          Carregando bancada…
        </div>
      }
    >
      {/* A bancada não usa StrictMode: os dois ciclos extras de montagem tornariam
          a amostra do Profiler diferente da interação que está sendo medida. */}
      <LazyCanvasConnectionPerformanceHarness />
    </Suspense>
  ) : (
    <StrictMode>
      <App />
    </StrictMode>
  ),
)

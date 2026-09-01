import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@xterm/xterm/css/xterm.css'
import './index.css'
import App from './App.tsx'
import { CanvasConnectionPerformanceHarness } from './features/canvas/benchmarks/CanvasConnectionPerformanceHarness'

const benchmark = new URLSearchParams(window.location.search).get('benchmark')

createRoot(document.getElementById('root')!).render(
  benchmark === 'canvas-connections' ? (
    // A bancada não usa StrictMode: os dois ciclos extras de montagem tornariam
    // a amostra do Profiler diferente da interação que está sendo medida.
    <CanvasConnectionPerformanceHarness />
  ) : (
    <StrictMode>
      <App />
    </StrictMode>
  ),
)

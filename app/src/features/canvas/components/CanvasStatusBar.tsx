import { CheckCircle2, GitFork, Layers3 } from 'lucide-react'

type CanvasStatusBarProps = {
  nodeCount: number
  edgeCount: number
  hydrated: boolean
}

/** Barra de estado compacta; expõe dados já presentes no canvas sem criar estado paralelo. */
export function CanvasStatusBar({ nodeCount, edgeCount, hydrated }: CanvasStatusBarProps) {
  return (
    <footer className="felixo-canvas-statusbar" aria-live="polite">
      <div className="felixo-statusbar-group">
        <span className="felixo-statusbar-workspace">Meu canvas</span>
        <span className="felixo-statusbar-separator" aria-hidden />
        <span className="felixo-statusbar-item">
          <Layers3 size={13} aria-hidden />
          {nodeCount} {nodeCount === 1 ? 'bloco' : 'blocos'}
        </span>
        <span className="felixo-statusbar-item">
          <GitFork size={13} aria-hidden />
          {edgeCount} {edgeCount === 1 ? 'conexão' : 'conexões'}
        </span>
      </div>
      <div className="felixo-statusbar-group">
        <span className={`felixo-statusbar-save ${hydrated ? 'is-ready' : ''}`}>
          <CheckCircle2 size={13} aria-hidden />
          {hydrated ? 'Canvas pronto' : 'Carregando canvas…'}
        </span>
      </div>
    </footer>
  )
}

import { CheckCircle2, GitFork, Layers3, MousePointer2, Trash2 } from 'lucide-react'

type CanvasStatusBarProps = {
  nodeCount: number
  edgeCount: number
  hydrated: boolean
  /** Frase da seleção atual ("1 conexão selecionada"); `null` sem seleção. */
  selectionLabel: string | null
  /** Remove o que está selecionado pelo mesmo caminho da tecla Delete. */
  onRemoveSelection: () => void
  /** Canvas travado: a seleção continua visível, mas não se edita. */
  removeDisabled: boolean
}

/**
 * Barra de estado compacta; expõe dados já presentes no canvas sem criar estado
 * paralelo. Com algo selecionado, também oferece remover a seleção: quem não
 * sabe da tecla Delete/Backspace não tinha outro jeito de apagar uma conexão.
 *
 * A largura sobra pouco com a gaveta do terminal aberta, então a barra nunca
 * quebra linha: `data-corte="N"` marca o que sai quando a barra fica mais
 * estreita que o corte N (index.css, `@container felixo-statusbar`). O botão
 * Remover nunca sai; no último corte perde só o rótulo e vira um ícone.
 */
export function CanvasStatusBar({
  nodeCount,
  edgeCount,
  hydrated,
  selectionLabel,
  onRemoveSelection,
  removeDisabled,
}: CanvasStatusBarProps) {
  return (
    <footer className="felixo-canvas-statusbar" aria-live="polite">
      <div className="felixo-statusbar-group">
        <span className="felixo-statusbar-workspace" data-corte="1">
          Meu canvas
        </span>
        <span className="felixo-statusbar-separator" aria-hidden data-corte="1" />
        <span className="felixo-statusbar-item felixo-statusbar-count">
          <Layers3 size={13} aria-hidden />
          {nodeCount}{' '}
          <span data-corte="2">{nodeCount === 1 ? 'bloco' : 'blocos'}</span>
        </span>
        <span className="felixo-statusbar-item felixo-statusbar-count">
          <GitFork size={13} aria-hidden />
          {edgeCount}{' '}
          <span data-corte="2">{edgeCount === 1 ? 'conexão' : 'conexões'}</span>
        </span>
        {selectionLabel && (
          <>
            <span className="felixo-statusbar-separator" aria-hidden data-corte="2" />
            <span className="felixo-statusbar-item" data-corte="2">
              <MousePointer2 size={13} aria-hidden />
              {selectionLabel}
            </span>
            <button
              type="button"
              className="felixo-btn felixo-statusbar-action"
              onClick={onRemoveSelection}
              disabled={removeDisabled}
              aria-label={`Remover ${selectionLabel}`}
              aria-keyshortcuts="Delete Backspace"
              title={
                removeDisabled
                  ? 'Destrave o canvas para remover'
                  : 'Remover a seleção (Delete ou Backspace)'
              }
            >
              <Trash2 size={12} aria-hidden />
              <span data-corte="4">Remover</span>{' '}
              <kbd className="felixo-statusbar-kbd" data-corte="1">
                Delete
              </kbd>
            </button>
          </>
        )}
      </div>
      <div className="felixo-statusbar-group">
        <span className={`felixo-statusbar-save ${hydrated ? 'is-ready' : ''}`}>
          <CheckCircle2 size={13} aria-hidden />
          <span data-corte="1">{hydrated ? 'Canvas pronto' : 'Carregando canvas…'}</span>
        </span>
      </div>
    </footer>
  )
}

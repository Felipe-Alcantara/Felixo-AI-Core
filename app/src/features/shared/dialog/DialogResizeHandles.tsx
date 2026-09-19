import type { ResizableDialog } from './useResizableDialog'
import type { DialogAxes } from './dialog-sizing'

const STEP = 24

const HANDLES: Array<{ name: string; axes: DialogAxes; label: string; className: string }> = [
  {
    name: 'right',
    axes: { horizontal: true, vertical: false },
    label: 'Ajustar a largura do modal',
    className: 'right-0 top-6 bottom-6 w-2 cursor-ew-resize',
  },
  {
    name: 'bottom',
    axes: { horizontal: false, vertical: true },
    label: 'Ajustar a altura do modal',
    className: 'bottom-0 left-6 right-6 h-2 cursor-ns-resize',
  },
  {
    name: 'corner',
    axes: { horizontal: true, vertical: true },
    label: 'Ajustar a largura e a altura do modal',
    className: 'bottom-0 right-0 h-5 w-5 cursor-nwse-resize',
  },
]

/**
 * Alças de redimensionar nas bordas direita/inferior e no canto. A moldura
 * precisa ser `relative`. Teclado: setas ajustam, Home/Enter voltam ao original.
 */
export function DialogResizeHandles({ dialog }: { dialog: ResizableDialog<HTMLElement> | ResizableDialog<HTMLDivElement> }) {
  return (
    <>
      {HANDLES.map(({ name, axes, label, className }) => (
        <div
          key={name}
          role="separator"
          aria-label={label}
          tabIndex={0}
          data-felixo-dialog-handle={name}
          className={`absolute z-10 rounded-full outline-none transition-colors hover:bg-white/15 focus-visible:bg-white/25 ${className}`}
          onMouseDown={(event) => dialog.startResize(event, axes)}
          onDoubleClick={dialog.reset}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            const dx = event.key === 'ArrowRight' ? STEP : event.key === 'ArrowLeft' ? -STEP : 0
            const dy = event.key === 'ArrowDown' ? STEP : event.key === 'ArrowUp' ? -STEP : 0
            if (event.key === 'Home' || event.key === 'Enter') {
              event.preventDefault()
              dialog.reset()
            } else if (dx || dy) {
              event.preventDefault()
              dialog.resizeBy({ dx: axes.horizontal ? dx : 0, dy: axes.vertical ? dy : 0 }, axes)
            }
          }}
        />
      ))}
    </>
  )
}

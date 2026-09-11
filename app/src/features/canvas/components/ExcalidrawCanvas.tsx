// Módulo pesado de verdade (~47MB descompactado da @excalidraw/excalidraw):
// só é importado por quem chama `loadExcalidrawCanvas()`, dentro do
// `React.lazy()` de `ExcalidrawDrawingNode.tsx` — nunca no chunk principal do
// canvas, nem no de um node 'drawing' leve.
import { Excalidraw } from '@excalidraw/excalidraw'
import '@excalidraw/excalidraw/index.css'
import type { AppState } from '@excalidraw/excalidraw/types'
import type { OrderedExcalidrawElement } from '@excalidraw/excalidraw/element/types'

export type ExcalidrawScene = {
  elements: readonly OrderedExcalidrawElement[]
  /** Só os campos que valem a pena reabrir com a cena; o resto é sessão. */
  appState: Pick<AppState, 'viewBackgroundColor'>
}

type ExcalidrawCanvasProps = {
  initialScene: ExcalidrawScene | null
  onSceneChange: (scene: ExcalidrawScene) => void
}

/**
 * Wrapper fino em volta do `<Excalidraw>` real: só traduz `onChange` pro
 * formato serializável que persistimos, e injeta a cena inicial salva.
 */
export default function ExcalidrawCanvas({ initialScene, onSceneChange }: ExcalidrawCanvasProps) {
  return (
    <div className="nodrag nowheel nopan h-full w-full">
      <Excalidraw
        initialData={{
          elements: initialScene?.elements ?? [],
          appState: {
            viewBackgroundColor: initialScene?.appState.viewBackgroundColor ?? '#ffffff',
          },
        }}
        onChange={(elements: readonly OrderedExcalidrawElement[], appState: AppState) => {
          onSceneChange({
            elements,
            appState: { viewBackgroundColor: appState.viewBackgroundColor },
          })
        }}
      />
    </div>
  )
}

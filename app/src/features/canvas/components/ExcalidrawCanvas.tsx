// Módulo pesado de verdade (~47MB descompactado da @excalidraw/excalidraw):
// só é importado por quem chama `loadExcalidrawCanvas()`, dentro do
// `React.lazy()` de `ExcalidrawDrawingNode.tsx` — nunca no chunk principal do
// canvas, nem no de um node 'drawing' leve.
import { Excalidraw } from '@excalidraw/excalidraw'
import '@excalidraw/excalidraw/index.css'
import type { AppState } from '@excalidraw/excalidraw/types'
import type { OrderedExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import { isExcalidrawEmbedLink, isolatedEmbedSrc } from '../services/excalidraw-embeds'
import { IsolatedEmbedFrame } from './IsolatedEmbedFrame'

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
        // Os 14 domínios do Excalidraw voltam (17/11/2026); o `frame-src` da CSP
        // do build (scripts/renderer-csp.cjs) tem os mesmos hosts. Função que
        // responde sempre boolean: `undefined` cairia na lista embutida.
        validateEmbeddable={isExcalidrawEmbedLink}
        // X, Reddit e Gist trariam script de terceiro num `srcdoc` com a
        // origem do app: vão para o frame isolado (excalidraw-embeds.ts).
        renderEmbeddable={(element, appState) => {
          const src = isolatedEmbedSrc(element.link, appState.theme)
          return src ? <IsolatedEmbedFrame src={src} /> : null
        }}
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

import { STAR_FIELD_STYLE_SHEET, STAR_LAYERS } from './canvas-starfield'
import { usePerformanceMode } from '../../shared/performance/performance-mode-context'

/**
 * Procedural, viewport-level atmosphere for the canvas: black, and a star
 * field over it. It is deliberately independent from React Flow's graph —
 * these marks are composition, never data, and therefore cannot be mistaken
 * for a real connection.
 *
 * The shadow lists are generated once at import (see `canvas-starfield.ts`)
 * and injected as a single static stylesheet, so the markup stays three
 * elements wide and React never rewrites it.
 *
 * Modo Performance skips the star field entirely (not just its animation):
 * one fewer compositor layer and ~1,280 box-shadow dots not painted, on top
 * of whatever the canvas itself is already rendering. The black backdrop
 * stays either way, so the surface behind the graph never changes.
 */
export function CanvasAmbientLayer({ dense }: { dense: boolean }) {
  const { performanceMode } = usePerformanceMode()

  return (
    <div className={`felixo-canvas-ambient ${dense ? 'is-dense' : ''}`} aria-hidden="true">
      {!performanceMode && (
        <>
          <style dangerouslySetInnerHTML={{ __html: STAR_FIELD_STYLE_SHEET }} />
          <div className="felixo-ambient-starfield">
            {STAR_LAYERS.map((layer) => (
              <div key={layer.id} className={`felixo-ambient-stars layer-${layer.id}`} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

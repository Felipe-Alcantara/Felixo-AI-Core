import { STAR_FIELD_STYLE_SHEET, STAR_LAYERS } from './canvas-starfield'

/**
 * Procedural, viewport-level atmosphere for the canvas: black, and a star
 * field over it. It is deliberately independent from React Flow's graph —
 * these marks are composition, never data, and therefore cannot be mistaken
 * for a real connection.
 *
 * The shadow lists are generated once at import (see `canvas-starfield.ts`)
 * and injected as a single static stylesheet, so the markup stays three
 * elements wide and React never rewrites it.
 */
export function CanvasAmbientLayer({ dense }: { dense: boolean }) {
  return (
    <div className={`felixo-canvas-ambient ${dense ? 'is-dense' : ''}`} aria-hidden="true">
      <style dangerouslySetInnerHTML={{ __html: STAR_FIELD_STYLE_SHEET }} />
      <div className="felixo-ambient-starfield">
        {STAR_LAYERS.map((layer) => (
          <div key={layer.id} className={`felixo-ambient-stars layer-${layer.id}`} />
        ))}
      </div>
    </div>
  )
}

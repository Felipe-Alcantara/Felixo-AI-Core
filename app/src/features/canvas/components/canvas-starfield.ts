/**
 * Procedural star field for the canvas atmosphere.
 *
 * Each layer is a single 1-3px element whose stars live entirely in one
 * `box-shadow` list: the browser paints hundreds of dots once, then the drift
 * is a plain `translateY` on that one element, so the cost stays flat no
 * matter how many nodes the canvas holds. A `::after` clone parked one tile
 * below closes the loop seamlessly.
 *
 * The seed is fixed on purpose. The sky is authored art, not noise — it must
 * look identical on every launch instead of reshuffling under the user.
 */

/** Vertical loop distance: the layer travels exactly one tile per cycle. */
export const STARFIELD_TILE = 2000

/** Horizontal spread, wide enough to cover an ultrawide viewport. */
export const STARFIELD_SPREAD = 2600

export type StarLayer = {
  /** Class suffix (`felixo-ambient-stars.layer-far`) and PRNG seed source. */
  id: string
  /** Star diameter in px — the only depth cue besides speed. */
  size: number
  count: number
  /** One full tile of travel. Farther layers drift slower. */
  duration: string
  seed: number
  /** Alpha range per star, so a layer never reads as one flat dot screen. */
  alpha: [number, number]
}

/**
 * Three planes of depth. Counts stay well under the original reference art
 * (which stacked ~900 shadows in the 1px layer alone): this canvas already
 * carries a dot grid and the route lines, so the sky only has to suggest
 * depth, not compete with them.
 */
export const STAR_LAYERS: StarLayer[] = [
  { id: 'far', size: 1, count: 900, duration: '160s', seed: 0x5e1f0, alpha: [0.45, 1] },
  { id: 'mid', size: 2, count: 260, duration: '260s', seed: 0x5e1f1, alpha: [0.35, 0.85] },
  { id: 'near', size: 3, count: 120, duration: '380s', seed: 0x5e1f2, alpha: [0.24, 0.6] },
]

/** mulberry32 — small, fast, and stable across engines, unlike Math.random. */
function createRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Builds the `box-shadow` list for one layer. Deterministic for a given layer. */
export function createStarField(layer: StarLayer): string {
  const random = createRandom(layer.seed)
  const [minAlpha, maxAlpha] = layer.alpha
  const stars: string[] = []
  for (let index = 0; index < layer.count; index += 1) {
    const x = Math.round(random() * STARFIELD_SPREAD)
    const y = Math.round(random() * STARFIELD_TILE)
    const alpha = (minAlpha + random() * (maxAlpha - minAlpha)).toFixed(2)
    stars.push(`${x}px ${y}px rgba(255, 255, 255, ${alpha})`)
  }
  return stars.join(', ')
}

/**
 * The generated half of the styling. Structure, motion and the dimming rules
 * live in `index.css` next to the rest of the ambient layer; only the parts
 * that are per-layer data (size, speed and the shadow list) are emitted here,
 * so neither file holds something the other should own.
 */
export function createStarFieldStyleSheet(layers: StarLayer[] = STAR_LAYERS): string {
  return layers
    .map((layer) => {
      const selector = `.felixo-ambient-stars.layer-${layer.id}`
      return [
        `${selector} {`,
        `  width: ${layer.size}px;`,
        `  height: ${layer.size}px;`,
        `  animation-duration: ${layer.duration};`,
        `}`,
        `${selector}, ${selector}::after {`,
        `  box-shadow: ${createStarField(layer)};`,
        `}`,
      ].join('\n')
    })
    .join('\n')
}

/** Built once at import: the field never changes, so neither does this string. */
export const STAR_FIELD_STYLE_SHEET = createStarFieldStyleSheet()

/**
 * Procedural, viewport-level atmosphere for the canvas. It is deliberately
 * independent from React Flow's graph: these marks are composition, never
 * data, and therefore cannot be mistaken for a real connection.
 */
export function CanvasAmbientLayer({ dense }: { dense: boolean }) {
  return (
    <div className={`felixo-canvas-ambient ${dense ? 'is-dense' : ''}`} aria-hidden="true">
      <svg className="felixo-ambient-routes" viewBox="0 0 1200 760" preserveAspectRatio="none">
        <path className="felixo-ambient-arc arc-top" d="M-190 310 C-75 -80, 390 -170, 735 58" />
        <path className="felixo-ambient-arc arc-bottom" d="M 660 845 C 930 650, 1230 770, 1370 470" />
        <path className="felixo-ambient-route route-a" d="M-80 180 C 170 42, 270 130, 360 290 S 630 420, 820 224" />
        <path className="felixo-ambient-route route-b" d="M 1200 620 C 1010 500, 1050 330, 880 292 S 640 180, 560 -60" />
        <path className="felixo-ambient-route route-c" d="M 120 820 C 260 650, 420 700, 560 760" />
        <g className="felixo-ambient-points">
          <circle cx="172" cy="101" r="2.2" />
          <circle cx="358" cy="289" r="1.8" />
          <circle cx="632" cy="390" r="1.5" />
          <circle cx="879" cy="292" r="2" />
          <circle cx="1055" cy="449" r="1.4" />
          <circle cx="255" cy="690" r="1.5" />
          <circle cx="1120" cy="690" r="2" />
        </g>
      </svg>
      <div className="felixo-ambient-grain" />
    </div>
  )
}

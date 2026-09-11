import { memo, useCallback, useRef, useState } from 'react'
import {
  Handle,
  Position,
  NodeResizer,
  useReactFlow,
  type NodeProps,
} from '@xyflow/react'
import { Eraser, Undo2 } from 'lucide-react'
import { NodeHeader } from './NodeHeader'
import type { DrawingNodeData, DrawingStroke } from '../types'

/**
 * Data carried by a drawing node. `onDataChange` is injected by CanvasView so
 * edits (new/undone strokes) flow back into canvas state and storage.
 */
type DrawingNodeDataWithHandler = DrawingNodeData & {
  onDataChange?: (nodeId: string, patch: Partial<DrawingNodeData>) => void
}

const PEN_COLORS = ['#f4f4f5', '#f59e0b', '#10b981', '#38bdf8', '#f43f5e'] as const
const PEN_WIDTHS = [2, 4, 8] as const

function parseStrokes(raw: string | undefined): DrawingStroke[] {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as DrawingStroke[]) : []
  } catch {
    return []
  }
}

/**
 * Traço livre e leve pra quem não precisa do Excalidraw completo — sem
 * dependência nova, só `<svg>` + pointer events. Cada traço vira um `<path>`
 * com o `d` montado a mão a partir dos pontos capturados; nada de libs de
 * curva suavizada, que custaria bundle e CPU num notebook modesto.
 */
function DrawingNodeComponent({ id, data, selected }: NodeProps) {
  const nodeData = (data ?? {}) as DrawingNodeDataWithHandler
  const [strokes, setStrokes] = useState<DrawingStroke[]>(() => parseStrokes(nodeData.strokes))
  const [color, setColor] = useState<string>(PEN_COLORS[0])
  const [penWidth, setPenWidth] = useState<number>(PEN_WIDTHS[0])
  const drawingRef = useRef<{ points: string[] } | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const { deleteElements } = useReactFlow()

  const onDataChange = nodeData.onDataChange
  const commitStrokes = useCallback(
    (next: DrawingStroke[]) => {
      setStrokes(next)
      onDataChange?.(id, { strokes: next.length ? JSON.stringify(next) : '' })
    },
    [id, onDataChange],
  )

  const toLocalPoint = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
    const bounds = svgRef.current?.getBoundingClientRect()
    if (!bounds) return { x: 0, y: 0 }
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top }
  }, [])

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      if (event.button !== 0) return
      event.currentTarget.setPointerCapture(event.pointerId)
      const { x, y } = toLocalPoint(event)
      drawingRef.current = { points: [`M ${x} ${y}`] }
    },
    [toLocalPoint],
  )

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      if (!drawingRef.current) return
      const { x, y } = toLocalPoint(event)
      drawingRef.current.points.push(`L ${x} ${y}`)
      // Redesenha em tempo real via um path temporário no próprio SVG.
      const preview = svgRef.current?.querySelector('[data-preview]')
      if (preview) {
        preview.setAttribute('d', drawingRef.current.points.join(' '))
      }
    },
    [toLocalPoint],
  )

  const finishStroke = useCallback(() => {
    const current = drawingRef.current
    drawingRef.current = null
    if (!current || current.points.length < 2) return
    commitStrokes([...strokes, { d: current.points.join(' '), color, width: penWidth }])
  }, [color, penWidth, strokes, commitStrokes])

  const undoLastStroke = useCallback(() => {
    if (!strokes.length) return
    commitStrokes(strokes.slice(0, -1))
  }, [strokes, commitStrokes])

  const clearAllStrokes = useCallback(() => {
    if (!strokes.length) return
    commitStrokes([])
  }, [strokes, commitStrokes])

  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-lg border border-zinc-700 bg-zinc-900 shadow-xl">
      <NodeResizer
        isVisible={selected}
        minWidth={220}
        minHeight={180}
        lineClassName="!border-white/20"
        handleClassName="!h-2.5 !w-2.5 !rounded-sm !bg-white/40"
      />
      <Handle type="target" position={Position.Left} className="!bg-white/40" />
      <NodeHeader
        editableValue={nodeData.label ?? ''}
        placeholder="Desenho"
        onTitleChange={(label) => nodeData.onDataChange?.(id, { label })}
        className="bg-zinc-800 text-zinc-100"
        onRemove={() => void deleteElements({ nodes: [{ id }] })}
      >
        <div className="nodrag flex items-center gap-1">
          {PEN_COLORS.map((swatch) => (
            <button
              key={swatch}
              type="button"
              onClick={() => setColor(swatch)}
              aria-label={`Cor ${swatch}`}
              style={{ backgroundColor: swatch }}
              className={`felixo-btn-icon h-3.5 w-3.5 rounded-full ring-1 ring-white/20 ${
                color === swatch ? 'ring-2 ring-white/70' : ''
              }`}
            />
          ))}
          {PEN_WIDTHS.map((width) => (
            <button
              key={width}
              type="button"
              onClick={() => setPenWidth(width)}
              aria-label={`Espessura ${width}px`}
              title={`Espessura ${width}px`}
              className={`felixo-btn-icon flex h-4 w-4 items-center justify-center rounded p-0.5 opacity-70 hover:bg-white/10 hover:opacity-100 ${
                penWidth === width ? 'bg-white/20 opacity-100' : ''
              }`}
            >
              <span
                className="rounded-full bg-current"
                style={{ width: Math.min(width, 8), height: Math.min(width, 8) }}
              />
            </button>
          ))}
          <button
            type="button"
            onClick={undoLastStroke}
            disabled={!strokes.length}
            className="felixo-btn-icon ml-1 rounded p-0.5 opacity-70 hover:bg-white/10 hover:opacity-100 disabled:opacity-30"
            aria-label="Desfazer último traço"
            title="Desfazer"
          >
            <Undo2 size={13} />
          </button>
          <button
            type="button"
            onClick={clearAllStrokes}
            disabled={!strokes.length}
            className="felixo-btn-icon rounded p-0.5 opacity-70 hover:bg-white/10 hover:opacity-100 disabled:opacity-30"
            aria-label="Limpar desenho"
            title="Limpar tudo"
          >
            <Eraser size={13} />
          </button>
        </div>
      </NodeHeader>

      <svg
        ref={svgRef}
        className="nodrag nowheel nopan min-h-0 w-full flex-1 touch-none bg-zinc-900"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishStroke}
        onPointerLeave={finishStroke}
      >
        {strokes.map((stroke, index) => (
          <path
            key={index}
            d={stroke.d}
            stroke={stroke.color}
            strokeWidth={stroke.width}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        ))}
        <path data-preview="" stroke={color} strokeWidth={penWidth} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </svg>
      <Handle type="source" position={Position.Right} className="!bg-white/40" />
    </div>
  )
}

export const DrawingNode = memo(DrawingNodeComponent)

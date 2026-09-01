import { Profiler, type ProfilerOnRenderCallback, type ReactNode } from 'react'
import {
  isCanvasProfilerEnabled,
  recordCanvasProfilerCommit,
} from './canvas-performance-profiler.ts'

type CanvasProfilerBoundaryProps = {
  children: ReactNode
  id?: string
  enabled?: boolean
  onRender?: ProfilerOnRenderCallback
}

/**
 * Instrumentação compartilhada pelo Canvas real e pela bancada de fixtures.
 * Sem `canvas-profiler=1`, o filho segue sem o overhead do React Profiler.
 */
export function CanvasProfilerBoundary({
  children,
  id = 'CanvasView',
  enabled = isCanvasProfilerEnabled(),
  onRender = recordCanvasProfilerCommit,
}: CanvasProfilerBoundaryProps) {
  if (!enabled) {
    return <>{children}</>
  }

  return (
    <Profiler id={id} onRender={onRender}>
      {children}
    </Profiler>
  )
}

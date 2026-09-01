export type CanvasProfilerCommit = {
  id: string
  phase: 'mount' | 'update' | 'nested-update'
  actualDuration: number
  baseDuration: number
  startTime: number
  commitTime: number
}

type CanvasProfilerWindow = Window & {
  __felixoCanvasProfiler?: {
    commits: CanvasProfilerCommit[]
  }
}

/** O parâmetro é opt-in para não adicionar custo de Profiler ao uso comum. */
export function isCanvasProfilerEnabled(search?: string): boolean {
  const currentSearch =
    search ?? (typeof window === 'undefined' ? '' : window.location.search)
  const params = new URLSearchParams(currentSearch)
  return params.get('canvas-profiler') === '1'
}

export function recordCanvasProfilerCommit(
  id: string,
  phase: CanvasProfilerCommit['phase'],
  actualDuration: number,
  baseDuration: number,
  startTime: number,
  commitTime: number,
): void {
  if (typeof window === 'undefined') return

  const target = window as CanvasProfilerWindow
  const store =
    target.__felixoCanvasProfiler ??
    (target.__felixoCanvasProfiler = { commits: [] })
  store.commits.push({
    id,
    phase,
    actualDuration,
    baseDuration,
    startTime,
    commitTime,
  })
}

export function readCanvasProfilerCommits(): CanvasProfilerCommit[] {
  if (typeof window === 'undefined') return []
  return [...((window as CanvasProfilerWindow).__felixoCanvasProfiler?.commits ?? [])]
}

export function clearCanvasProfilerCommits(): void {
  if (typeof window === 'undefined') return
  delete (window as CanvasProfilerWindow).__felixoCanvasProfiler
}

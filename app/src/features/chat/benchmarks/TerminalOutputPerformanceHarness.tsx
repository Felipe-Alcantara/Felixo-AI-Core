import {
  Profiler,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ProfilerOnRenderCallback,
} from 'react'
import { flushSync } from 'react-dom'
import { TerminalPanel } from '../components/TerminalPanel'
import {
  appendTerminalOutputPerformanceEvents,
  createEmptyTerminalOutputPerformanceState,
  createTerminalOutputPerformanceFixture,
  TERMINAL_OUTPUT_PERFORMANCE_MODES,
  TERMINAL_OUTPUT_PERFORMANCE_SCENARIOS,
  type TerminalOutputPerformanceMode,
  type TerminalOutputPerformanceScenario,
  type TerminalOutputPerformanceState,
} from './terminal-output-performance'
import { TERMINAL_OUTPUT_VISUAL_POLICY } from '../hooks/terminal-output-store'
import {
  applyPerformanceModeBenchmarkMode,
  PERFORMANCE_MODE_BENCHMARK_MODES,
  type PerformanceModeBenchmarkMode,
} from '../../shared/performance/performance-mode-benchmark'

const PROFILER_ID = 'TerminalOutputHistory'
const DEFAULT_ITERATIONS = 3
const DEFAULT_TIMEOUT_MS = 120_000
const MODE_BATCH_SIZE: Record<TerminalOutputPerformanceMode, number> = {
  baseline: 1,
  atual: 1,
}

type MemoryInfo = {
  usedJSHeapSize: number
  totalJSHeapSize: number
  jsHeapSizeLimit: number
}

type HeapSnapshot = {
  supported: boolean
  usedBytes: number | null
  totalBytes: number | null
  limitBytes: number | null
}

type ProfileCommit = {
  phase: 'mount' | 'update'
  actualDurationMs: number
  baseDurationMs: number
  commitTime: number
}

type PerformanceSample = {
  inputEvents: number
  logicalChunks: number
  retainedChunks: number
  droppedChunks: number
  visibleChars: number
  updateCommits: number
  maxDomNodes: number
  heapBeforeBytes: number | null
  heapAfterBytes: number | null
  heapDeltaBytes: number | null
  gcAvailable: boolean
  updateDurationsMs: number[]
  updateLatenciesMs: number[]
  performanceModeApplied: PerformanceModeBenchmarkMode
  panelVisible: boolean
  panelTransitionDurationMs: number | null
  prefersReducedMotion: boolean
}

type Summary = {
  count: number
  p50: number | null
  p95: number | null
  max: number | null
}

type TerminalOutputPerformanceResult = {
  scenario: TerminalOutputPerformanceScenario
  mode: TerminalOutputPerformanceMode
  performanceMode: PerformanceModeBenchmarkMode
  iterations: number
  inputEvents: number
  batchSize: number
  profiler: Summary
  updateLatency: Summary
  heap: {
    supported: boolean
    gcAvailable: boolean
    beforeBytes: Summary
    afterBytes: Summary
    deltaBytes: Summary
  }
  retainedChunks: Summary
  droppedChunks: Summary
  visibleChars: Summary
  maxDomNodes: Summary
  samples: PerformanceSample[]
}

type TerminalOutputPerformanceComparison = {
  scenario: TerminalOutputPerformanceScenario
  performanceMode: PerformanceModeBenchmarkMode
  baselineProfilerP95Ms: number | null
  currentProfilerP95Ms: number | null
  profilerP95ImprovementPercent: number | null
  baselineUpdateLatencyP95Ms: number | null
  currentUpdateLatencyP95Ms: number | null
  baselineHeapDeltaP95Bytes: number | null
  currentHeapDeltaP95Bytes: number | null
  baselineMaxDomNodes: number | null
  currentMaxDomNodes: number | null
}

type PerformanceModeComparison = {
  scenario: TerminalOutputPerformanceScenario
  mode: TerminalOutputPerformanceMode
  normalProfilerP95Ms: number | null
  performanceProfilerP95Ms: number | null
  performanceProfilerImprovementPercent: number | null
}

type ModeSwitchCoverage = {
  testedWhileLogsVisible: boolean
  logsPreserved: boolean
  panelRemainedVisible: boolean
  performanceTransitionDisabled: boolean
}

export type TerminalOutputPerformanceReport = {
  schemaVersion: 2
  kind: 'terminal-output-react-profiler'
  startedAt: string
  finishedAt: string
  durationMs: number
  renderer: {
    userAgent: string
    viewport: { width: number; height: number }
    devicePixelRatio: number
  }
  method: {
    profilerMetric: 'actualDuration'
    updateLatencyMetric: 'Profiler commitTime - flush start'
    heapMetric: 'performance.memory.usedJSHeapSize'
    gc: 'window.gc quando exposto pelo Electron'
    iterations: number
    warmupPasses: 1
    modes: TerminalOutputPerformanceMode[]
    performanceModes: PerformanceModeBenchmarkMode[]
    scenarios: TerminalOutputPerformanceScenario[]
    batchSize: Record<TerminalOutputPerformanceMode, number>
    productionBatching: 'requestAnimationFrame com fila por frame'
    visualPolicy: typeof TERMINAL_OUTPUT_VISUAL_POLICY
  }
  results: TerminalOutputPerformanceResult[]
  comparisons: TerminalOutputPerformanceComparison[]
  performanceModeComparisons: PerformanceModeComparison[]
  modeSwitchCoverage: ModeSwitchCoverage
}

type BenchmarkOptions = {
  iterations: number
  timeoutMs: number
  modes: TerminalOutputPerformanceMode[]
  performanceModes: PerformanceModeBenchmarkMode[]
  scenarios: TerminalOutputPerformanceScenario[]
}

type Surface = {
  key: string
  sessions: Record<string, TerminalOutputPerformanceState['sessions'][string]>
  mode: TerminalOutputPerformanceMode
  performanceMode: PerformanceModeBenchmarkMode
}

type BenchmarkApi = {
  run: (options?: Partial<BenchmarkOptions>) => Promise<TerminalOutputPerformanceReport>
  collectGarbage: () => boolean
  heapSnapshot: () => HeapSnapshot
}

type BenchmarkWindow = Window & {
  gc?: () => void
  felixoTerminalOutputBenchmark?: BenchmarkApi
}

declare global {
  interface Window {
    felixoTerminalOutputBenchmark?: BenchmarkApi
  }
}

function percentile(values: number[], percentage: number): number | null {
  const clean = values.filter(Number.isFinite).sort((left, right) => left - right)
  if (clean.length === 0) return null

  const index = (clean.length - 1) * percentage
  const lower = Math.floor(index)
  const upper = Math.ceil(index)
  const value =
    lower === upper
      ? clean[lower]
      : clean[lower] + (clean[upper] - clean[lower]) * (index - lower)
  return Number(value.toFixed(3))
}

function summarize(values: number[]): Summary {
  const clean = values.filter(Number.isFinite)
  return {
    count: clean.length,
    p50: percentile(clean, 0.5),
    p95: percentile(clean, 0.95),
    max: clean.length > 0 ? Number(Math.max(...clean).toFixed(3)) : null,
  }
}

function readHeapSnapshot(): HeapSnapshot {
  const memory = (performance as Performance & { memory?: MemoryInfo }).memory
  if (!memory || !Number.isFinite(memory.usedJSHeapSize)) {
    return {
      supported: false,
      usedBytes: null,
      totalBytes: null,
      limitBytes: null,
    }
  }

  return {
    supported: true,
    usedBytes: memory.usedJSHeapSize,
    totalBytes: memory.totalJSHeapSize,
    limitBytes: memory.jsHeapSizeLimit,
  }
}

function collectGarbage(): boolean {
  const garbageCollector = (window as BenchmarkWindow).gc
  if (typeof garbageCollector !== 'function') return false
  garbageCollector()
  return true
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    let finished = false
    const finish = () => {
      if (finished) return
      finished = true
      resolve()
    }

    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(finish)
    }
    window.setTimeout(finish, 16)
  })
}

async function settleRenderer() {
  await nextFrame()
  await nextFrame()
}

async function waitForProfileCommit(
  commits: ProfileCommit[],
  startIndex: number,
  phase: ProfileCommit['phase'],
  timeoutMs: number,
) {
  const deadline = performance.now() + timeoutMs

  while (performance.now() < deadline) {
    const commit = commits
      .slice(startIndex)
      .find((item) => item.phase === phase)
    if (commit) return commit
    await nextFrame()
  }

  throw new Error(`timeout esperando commit ${phase} dos logs da CLI`)
}

function readVisibleChunkCount() {
  return document.querySelectorAll('[data-terminal-output-chunk]').length
}

function normalizeOptions(partial?: Partial<BenchmarkOptions>): BenchmarkOptions {
  const iterations = partial?.iterations ?? DEFAULT_ITERATIONS
  const timeoutMs = partial?.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const modes = partial?.modes ?? [...TERMINAL_OUTPUT_PERFORMANCE_MODES]
  const performanceModes = partial?.performanceModes ?? [...PERFORMANCE_MODE_BENCHMARK_MODES]
  const scenarios = partial?.scenarios ?? [...TERMINAL_OUTPUT_PERFORMANCE_SCENARIOS]

  if (!Number.isInteger(iterations) || iterations < 2 || iterations > 10) {
    throw new Error('iterations deve estar entre 2 e 10')
  }
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 600_000) {
    throw new Error('timeoutMs deve estar entre 1000 e 600000')
  }
  if (
    modes.length === 0 ||
    modes.some((mode) => !TERMINAL_OUTPUT_PERFORMANCE_MODES.includes(mode))
  ) {
    throw new Error('modes contém um modo desconhecido')
  }
  if (
    scenarios.length === 0 ||
    scenarios.some((scenario) => !TERMINAL_OUTPUT_PERFORMANCE_SCENARIOS.includes(scenario))
  ) {
    throw new Error('scenarios contém um cenário desconhecido')
  }
  if (
    performanceModes.length === 0 ||
    performanceModes.some((mode) => !PERFORMANCE_MODE_BENCHMARK_MODES.includes(mode))
  ) {
    throw new Error('performanceModes contém um modo desconhecido')
  }

  return {
    iterations,
    timeoutMs,
    modes: [...new Set(modes)],
    performanceModes: [...new Set(performanceModes)],
    scenarios: [...new Set(scenarios)],
  }
}

function summarizeState(state: TerminalOutputPerformanceState) {
  const sessions = Object.values(state.sessions)
  return {
    logicalChunks: sessions.reduce((total, session) => total + session.totalChunkCount, 0),
    retainedChunks: sessions.reduce((total, session) => total + session.chunks.length, 0),
    droppedChunks: sessions.reduce((total, session) => total + session.droppedChunkCount, 0),
    visibleChars: sessions.reduce((total, session) => total + session.visibleChars, 0),
  }
}

function createComparison(
  results: TerminalOutputPerformanceResult[],
  scenario: TerminalOutputPerformanceScenario,
  performanceMode: PerformanceModeBenchmarkMode,
): TerminalOutputPerformanceComparison {
  const baseline = results.find(
    (result) => result.scenario === scenario && result.mode === 'baseline' && result.performanceMode === performanceMode,
  )
  const current = results.find(
    (result) => result.scenario === scenario && result.mode === 'atual' && result.performanceMode === performanceMode,
  )
  const baselineP95 = baseline?.profiler.p95 ?? null
  const currentP95 = current?.profiler.p95 ?? null

  return {
    scenario,
    performanceMode,
    baselineProfilerP95Ms: baselineP95,
    currentProfilerP95Ms: currentP95,
    profilerP95ImprovementPercent:
      baselineP95 !== null && baselineP95 > 0 && currentP95 !== null
        ? Number((((baselineP95 - currentP95) / baselineP95) * 100).toFixed(2))
        : null,
    baselineUpdateLatencyP95Ms: baseline?.updateLatency.p95 ?? null,
    currentUpdateLatencyP95Ms: current?.updateLatency.p95 ?? null,
    baselineHeapDeltaP95Bytes: baseline?.heap.deltaBytes.p95 ?? null,
    currentHeapDeltaP95Bytes: current?.heap.deltaBytes.p95 ?? null,
    baselineMaxDomNodes: baseline?.maxDomNodes.max ?? null,
    currentMaxDomNodes: current?.maxDomNodes.max ?? null,
  }
}

async function runSample(
  events: ReturnType<typeof createTerminalOutputPerformanceFixture>,
  mode: TerminalOutputPerformanceMode,
  performanceMode: PerformanceModeBenchmarkMode,
  iteration: number,
  timeoutMs: number,
  setSurface: (surface: Surface | null) => void,
  commits: ProfileCommit[],
): Promise<PerformanceSample> {
  applyPerformanceModeBenchmarkMode(performanceMode)
  const key = `${performanceMode}-${mode}-${iteration}-${performance.now()}`
  const mountStartIndex = commits.length
  flushSync(() => setSurface({ key, sessions: {}, mode, performanceMode }))
  // O Profiler permanece montado com a tela de espera; a primeira superfície
  // do cenário, portanto, aparece como `update`, não como um novo mount do
  // próprio Profiler.
  await waitForProfileCommit(commits, mountStartIndex, 'update', timeoutMs)
  await settleRenderer()
  collectGarbage()
  await settleRenderer()
  const heapBefore = readHeapSnapshot()
  const batchSize = MODE_BATCH_SIZE[mode]
  let state = createEmptyTerminalOutputPerformanceState()
  const updateDurationsMs: number[] = []
  const updateLatenciesMs: number[] = []
  let maxDomNodes = readVisibleChunkCount()

  for (let index = 0; index < events.length; index += batchSize) {
    const batch = events.slice(index, index + batchSize)
    state = appendTerminalOutputPerformanceEvents(
      state,
      batch,
      mode,
      new Date().toISOString(),
    )
    const startIndex = commits.length
    const updateStartedAt = performance.now()
    flushSync(() => setSurface({ key, sessions: state.sessions, mode, performanceMode }))
    const commit = await waitForProfileCommit(
      commits,
      startIndex,
      'update',
      timeoutMs,
    )
    updateDurationsMs.push(commit.actualDurationMs)
    updateLatenciesMs.push(Math.max(0, commit.commitTime - updateStartedAt))
    maxDomNodes = Math.max(maxDomNodes, readVisibleChunkCount())
  }

  await settleRenderer()
  const gcAvailable = collectGarbage()
  await settleRenderer()
  const heapAfter = readHeapSnapshot()
  const stateSummary = summarizeState(state)
  const panel = readTerminalPanelVisualState()
  if (panel.performanceModeApplied !== performanceMode) {
    throw new Error(`Modo Performance ${performanceMode} não foi aplicado ao painel Terminal`)
  }
  if (!panel.panelVisible) {
    throw new Error('painel de atividade desapareceu durante a medição')
  }
  if (performanceMode === 'performance' && panel.panelTransitionDurationMs !== 0) {
    throw new Error('transição de largura do painel Terminal continua ativa no Modo Performance')
  }

  flushSync(() => setSurface(null))
  await settleRenderer()

  return {
    inputEvents: events.length,
    ...stateSummary,
    updateCommits: updateDurationsMs.length,
    maxDomNodes,
    heapBeforeBytes: heapBefore.usedBytes,
    heapAfterBytes: heapAfter.usedBytes,
    heapDeltaBytes:
      heapBefore.usedBytes !== null && heapAfter.usedBytes !== null
        ? heapAfter.usedBytes - heapBefore.usedBytes
        : null,
    gcAvailable,
    updateDurationsMs,
    updateLatenciesMs,
    ...panel,
  }
}

function readTerminalPanelVisualState() {
  const panel = document.querySelector<HTMLElement>('.felixo-terminal-panel')
  const transitionDurationMs = panel
    ? window.getComputedStyle(panel).transitionDuration
        .split(',')
        .map((part) => {
          const duration = Number.parseFloat(part)
          if (!Number.isFinite(duration)) return 0
          return part.trim().endsWith('ms') ? duration : duration * 1_000
        })
        .reduce((maximum, duration) => Math.max(maximum, duration), 0)
    : null

  return {
    performanceModeApplied:
      document.documentElement.getAttribute('data-performance-mode') === 'on'
        ? 'performance' as const
        : 'normal' as const,
    panelVisible: Boolean(panel && window.getComputedStyle(panel).display !== 'none'),
    panelTransitionDurationMs: transitionDurationMs,
    prefersReducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  }
}

async function verifyActiveLogPanelModeSwitch(
  timeoutMs: number,
  setSurface: (surface: Surface | null) => void,
  commits: ProfileCommit[],
): Promise<ModeSwitchCoverage> {
  const events = createTerminalOutputPerformanceFixture('curta').slice(0, 2)
  const state = appendTerminalOutputPerformanceEvents(
    createEmptyTerminalOutputPerformanceState(),
    events,
    'atual',
    new Date().toISOString(),
  )
  const key = `mode-switch-${performance.now()}`
  applyPerformanceModeBenchmarkMode('normal')
  const startIndex = commits.length
  flushSync(() => setSurface({
    key,
    sessions: state.sessions,
    mode: 'atual',
    performanceMode: 'normal',
  }))
  await waitForProfileCommit(commits, startIndex, 'update', timeoutMs)
  await settleRenderer()
  const panelBefore = readTerminalPanelVisualState()
  const chunksBefore = readVisibleChunkCount()

  applyPerformanceModeBenchmarkMode('performance')
  await settleRenderer()
  const panelAfter = readTerminalPanelVisualState()
  const chunksAfter = readVisibleChunkCount()
  const coverage = {
    testedWhileLogsVisible: chunksBefore > 0,
    logsPreserved: chunksBefore > 0 && chunksAfter === chunksBefore,
    panelRemainedVisible: panelBefore.panelVisible && panelAfter.panelVisible,
    performanceTransitionDisabled: panelAfter.panelTransitionDurationMs === 0,
  }

  flushSync(() => setSurface(null))
  await settleRenderer()
  return coverage
}

async function runBenchmark(
  partial: Partial<BenchmarkOptions> | undefined,
  setSurface: (surface: Surface | null) => void,
  setStatus: (status: string) => void,
  commits: ProfileCommit[],
): Promise<TerminalOutputPerformanceReport> {
  const options = normalizeOptions(partial)
  const startedAt = new Date().toISOString()
  const benchmarkStartedAt = performance.now()
  const results: TerminalOutputPerformanceResult[] = []
  const initialPerformanceMode = document.documentElement.getAttribute('data-performance-mode')
  let modeSwitchCoverage: ModeSwitchCoverage

  try {
    modeSwitchCoverage = await verifyActiveLogPanelModeSwitch(
      options.timeoutMs,
      setSurface,
      commits,
    )

    for (const scenario of options.scenarios) {
      const events = createTerminalOutputPerformanceFixture(scenario)

      for (const performanceMode of options.performanceModes) {
        for (const mode of options.modes) {
          const samples: PerformanceSample[] = []
          setStatus(`${performanceMode} · ${mode} · ${scenario}`)

          for (let iteration = 1; iteration <= options.iterations; iteration += 1) {
            samples.push(
              await runSample(
                events,
                mode,
                performanceMode,
                iteration,
                options.timeoutMs,
                setSurface,
                commits,
              ),
            )
          }

          results.push({
            scenario,
            mode,
            performanceMode,
            iterations: samples.length,
            inputEvents: events.length,
            batchSize: MODE_BATCH_SIZE[mode],
            profiler: summarize(samples.flatMap((sample) => sample.updateDurationsMs)),
            updateLatency: summarize(samples.flatMap((sample) => sample.updateLatenciesMs)),
            heap: {
              supported: samples.every((sample) => sample.heapDeltaBytes !== null),
              gcAvailable: samples.every((sample) => sample.gcAvailable),
              beforeBytes: summarize(
                samples.flatMap((sample) =>
                  sample.heapBeforeBytes === null ? [] : [sample.heapBeforeBytes],
                ),
              ),
              afterBytes: summarize(
                samples.flatMap((sample) =>
                  sample.heapAfterBytes === null ? [] : [sample.heapAfterBytes],
                ),
              ),
              deltaBytes: summarize(
                samples.flatMap((sample) =>
                  sample.heapDeltaBytes === null ? [] : [sample.heapDeltaBytes],
                ),
              ),
            },
            retainedChunks: summarize(samples.map((sample) => sample.retainedChunks)),
            droppedChunks: summarize(samples.map((sample) => sample.droppedChunks)),
            visibleChars: summarize(samples.map((sample) => sample.visibleChars)),
            maxDomNodes: summarize(samples.map((sample) => sample.maxDomNodes)),
            samples,
          })
        }
      }
    }
  } finally {
    flushSync(() => setSurface(null))
    if (initialPerformanceMode === null) {
      document.documentElement.removeAttribute('data-performance-mode')
    } else {
      document.documentElement.setAttribute('data-performance-mode', initialPerformanceMode)
    }
    setStatus('Pronto')
  }

  const finishedAt = new Date().toISOString()
  return {
    schemaVersion: 2,
    kind: 'terminal-output-react-profiler',
    startedAt,
    finishedAt,
    durationMs: Number((performance.now() - benchmarkStartedAt).toFixed(3)),
    renderer: {
      userAgent: navigator.userAgent,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      devicePixelRatio: window.devicePixelRatio,
    },
    method: {
      profilerMetric: 'actualDuration',
      updateLatencyMetric: 'Profiler commitTime - flush start',
      heapMetric: 'performance.memory.usedJSHeapSize',
      gc: 'window.gc quando exposto pelo Electron',
      iterations: options.iterations,
      warmupPasses: 1,
      modes: options.modes,
      performanceModes: options.performanceModes,
      scenarios: options.scenarios,
      batchSize: MODE_BATCH_SIZE,
      productionBatching: 'requestAnimationFrame com fila por frame',
      visualPolicy: TERMINAL_OUTPUT_VISUAL_POLICY,
    },
    results,
    comparisons:
      options.modes.includes('baseline') && options.modes.includes('atual')
        ? options.scenarios.flatMap((scenario) =>
            options.performanceModes.map((performanceMode) =>
              createComparison(results, scenario, performanceMode),
            ),
          )
        : [],
    performanceModeComparisons:
      options.performanceModes.includes('normal') &&
      options.performanceModes.includes('performance')
        ? options.scenarios.flatMap((scenario) =>
            options.modes.map((mode) => {
              const normal = results.find((result) => result.scenario === scenario && result.mode === mode && result.performanceMode === 'normal')
              const performance = results.find((result) => result.scenario === scenario && result.mode === mode && result.performanceMode === 'performance')
              const normalP95 = normal?.profiler.p95 ?? null
              const performanceP95 = performance?.profiler.p95 ?? null
              return {
                scenario,
                mode,
                normalProfilerP95Ms: normalP95,
                performanceProfilerP95Ms: performanceP95,
                performanceProfilerImprovementPercent:
                  normalP95 !== null && normalP95 > 0 && performanceP95 !== null
                    ? Number((((normalP95 - performanceP95) / normalP95) * 100).toFixed(2))
                    : null,
              }
            }),
          )
        : [],
    modeSwitchCoverage,
  }
}

export function TerminalOutputPerformanceHarness() {
  const [surface, setSurfaceState] = useState<Surface | null>(null)
  const [status, setStatus] = useState('Aguardando o runner do benchmark…')
  const commitsRef = useRef<ProfileCommit[]>([])
  const setSurface = useCallback((nextSurface: Surface | null) => {
    setSurfaceState(nextSurface)
  }, [])

  const onRender = useCallback<ProfilerOnRenderCallback>(
    (_id, phase, actualDuration, baseDuration, _startTime, commitTime) => {
      if (phase !== 'mount' && phase !== 'update') return
      commitsRef.current.push({
        phase,
        actualDurationMs: Number(actualDuration.toFixed(3)),
        baseDurationMs: Number(baseDuration.toFixed(3)),
        commitTime,
      })
    },
    [],
  )

  useEffect(() => {
    const api: BenchmarkApi = {
      run: (options) =>
        runBenchmark(
          options,
          setSurface,
          setStatus,
          commitsRef.current,
        ),
      collectGarbage,
      heapSnapshot: readHeapSnapshot,
    }
    window.felixoTerminalOutputBenchmark = api
    return () => {
      if (window.felixoTerminalOutputBenchmark === api) {
        delete window.felixoTerminalOutputBenchmark
      }
    }
  }, [setSurface])

  return (
    <div className="h-screen w-screen bg-zinc-950 text-zinc-100">
      <div className="pointer-events-none fixed left-3 top-3 z-10 rounded-sm border border-white/10 bg-zinc-950/80 px-3 py-2 text-xs">
        <div className="font-semibold text-(--f-core-white)">CLI log benchmark</div>
        <div className="text-zinc-400">{status}</div>
      </div>
      <Profiler id={PROFILER_ID} onRender={onRender}>
        {surface ? (
          <TerminalPanel
            key={surface.key}
            sessions={Object.values(surface.sessions)}
            isOpen
            initialViewMode="orchestrator"
            orchestratorWindowSize={
              surface.mode === 'baseline'
                ? Number.MAX_SAFE_INTEGER
                : TERMINAL_OUTPUT_VISUAL_POLICY.maxOrchestratorChunks
            }
            onToggleOpen={() => undefined}
            onClear={() => undefined}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-zinc-500">
            Aguardando o runner do benchmark…
          </div>
        )}
      </Profiler>
    </div>
  )
}

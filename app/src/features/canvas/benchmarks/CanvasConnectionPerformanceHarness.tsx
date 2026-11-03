import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ProfilerOnRenderCallback,
  type SetStateAction,
} from 'react'
import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  type NodeProps,
  type NodeTypes,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import {
  CanvasProfilerBoundary,
} from '../services/canvas-performance-profiler.tsx'
import type { CanvasProfilerCommit } from '../services/canvas-performance-profiler.ts'
import {
  CANVAS_CONNECTION_PERFORMANCE_MODES,
  CANVAS_CONNECTION_PERFORMANCE_SCENARIOS,
  CANVAS_CONNECTION_PERFORMANCE_SIZES,
  connectionPerformanceProjection,
  countNamedCanvasConnections,
  createCanvasConnectionPerformanceFixture,
  createCanvasConnectionPerformanceScenarios,
  deriveCanvasConnectionPerformanceNodes,
  type CanvasConnectionPerformanceData,
  type CanvasConnectionPerformanceFixture,
  type CanvasConnectionPerformanceMode,
  type CanvasConnectionPerformanceScenario,
} from '../services/canvas-connection-performance'
import { createCanvasConnectionIndex } from '../services/canvas-connection-index'
import {
  applyPerformanceModeBenchmarkMode,
  PERFORMANCE_MODE_BENCHMARK_MODES,
  type PerformanceModeBenchmarkMode,
} from '../../shared/performance/performance-mode-benchmark'

const PROFILER_ID = 'CanvasConnectionIndex'
const DEFAULT_ITERATIONS = 5
const DEFAULT_TIMEOUT_MS = 120_000

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

type PerformanceSample = {
  actualDurationMs: number
  baseDurationMs: number
  heapBeforeBytes: number | null
  heapAfterBytes: number | null
  heapDeltaBytes: number | null
  gcAvailable: boolean
  domNodeCount: number
  performanceModeApplied: PerformanceModeBenchmarkMode
  minimapVisible: boolean
}

type Summary = {
  count: number
  p50: number | null
  p95: number | null
  max: number | null
}

type CanvasConnectionPerformanceResult = {
  size: number
  scenario: CanvasConnectionPerformanceScenario
  mode: CanvasConnectionPerformanceMode
  performanceMode: PerformanceModeBenchmarkMode
  nodes: number
  edges: number
  namedConnections: number
  repetitions: number
  profiler: Summary
  heap: {
    supported: boolean
    gcAvailable: boolean
    beforeBytes: Summary
    afterBytes: Summary
    deltaBytes: Summary
  }
  samples: PerformanceSample[]
}

type CanvasConnectionPerformanceComparison = {
  size: number
  scenario: CanvasConnectionPerformanceScenario
  performanceMode: PerformanceModeBenchmarkMode
  baselineProfilerP95Ms: number | null
  indexedProfilerP95Ms: number | null
  profilerP95ImprovementPercent: number | null
  baselineHeapDeltaP95Bytes: number | null
  indexedHeapDeltaP95Bytes: number | null
  indexedHeapDeltaOverBaselineBytes: number | null
}

type CanvasPerformanceModeComparison = {
  size: number
  scenario: CanvasConnectionPerformanceScenario
  mode: CanvasConnectionPerformanceMode
  normalProfilerP95Ms: number | null
  performanceProfilerP95Ms: number | null
  performanceProfilerImprovementPercent: number | null
}

export type CanvasConnectionPerformanceReport = {
  schemaVersion: 2
  kind: 'canvas-connection-react-profiler'
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
    heapMetric: 'performance.memory.usedJSHeapSize'
    gc: 'window.gc quando exposto pelo Electron'
    iterations: number
    warmupPasses: 1
    modeOrder: 'alternado por cenário e estado visual'
    sizes: number[]
    scenarios: CanvasConnectionPerformanceScenario[]
    modes: CanvasConnectionPerformanceMode[]
    performanceModes: PerformanceModeBenchmarkMode[]
  }
  results: CanvasConnectionPerformanceResult[]
  comparisons: CanvasConnectionPerformanceComparison[]
  performanceModeComparisons: CanvasPerformanceModeComparison[]
}

type BenchmarkOptions = {
  sizes: number[]
  scenarios: CanvasConnectionPerformanceScenario[]
  modes: CanvasConnectionPerformanceMode[]
  performanceModes: PerformanceModeBenchmarkMode[]
  iterations: number
  timeoutMs: number
}

type Surface = {
  key: string
  mode: CanvasConnectionPerformanceMode
  performanceMode: PerformanceModeBenchmarkMode
  fixture: CanvasConnectionPerformanceFixture
}

type BenchmarkApi = {
  run: (options?: Partial<BenchmarkOptions>) => Promise<CanvasConnectionPerformanceReport>
  collectGarbage: () => boolean
  heapSnapshot: () => HeapSnapshot
  reset: () => void
}

type BenchmarkWindow = Window & {
  gc?: () => void
  felixoCanvasConnectionBenchmark?: BenchmarkApi
}

declare global {
  interface Window {
    felixoCanvasConnectionBenchmark?: BenchmarkApi
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
    return { supported: false, usedBytes: null, totalBytes: null, limitBytes: null }
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
    // O Electron pode não entregar RAF para uma janela movida para fora da
    // área visível, mesmo com o throttling desligado. O fallback mantém a
    // espera observável e ainda deixa o RAF vencer quando ele está disponível.
    window.setTimeout(finish, 16)
  })
}

async function settleRenderer(): Promise<void> {
  await nextFrame()
  await nextFrame()
}

async function waitForProfileCommit(
  commits: CanvasProfilerCommit[],
  startIndex: number,
  phase: CanvasProfilerCommit['phase'],
  timeoutMs: number,
): Promise<CanvasProfilerCommit> {
  const deadline = performance.now() + timeoutMs
  while (performance.now() < deadline) {
    const commit = commits
      .slice(startIndex)
      .find((item) => item.id === PROFILER_ID && item.phase === phase)
    if (commit) return commit
    await nextFrame()
  }

  throw new Error(`timeout esperando commit ${phase} do Profiler do canvas`)
}

function readPerformanceNodeCount(): number {
  return document.querySelectorAll('[data-canvas-performance-node]').length
}

function createComparison(
  results: CanvasConnectionPerformanceResult[],
  size: number,
  scenario: CanvasConnectionPerformanceScenario,
  performanceMode: PerformanceModeBenchmarkMode,
): CanvasConnectionPerformanceComparison {
  const baseline = results.find(
    (result) =>
      result.size === size && result.scenario === scenario && result.mode === 'baseline' &&
      result.performanceMode === performanceMode,
  )
  const indexed = results.find(
    (result) =>
      result.size === size && result.scenario === scenario && result.mode === 'indexado' &&
      result.performanceMode === performanceMode,
  )
  const baselineP95 = baseline?.profiler.p95 ?? null
  const indexedP95 = indexed?.profiler.p95 ?? null
  const improvement =
    baselineP95 !== null && baselineP95 > 0 && indexedP95 !== null
      ? Number((((baselineP95 - indexedP95) / baselineP95) * 100).toFixed(2))
      : null
  const baselineHeapP95 = baseline?.heap.deltaBytes.p95 ?? null
  const indexedHeapP95 = indexed?.heap.deltaBytes.p95 ?? null

  return {
    size,
    scenario,
    performanceMode,
    baselineProfilerP95Ms: baselineP95,
    indexedProfilerP95Ms: indexedP95,
    profilerP95ImprovementPercent: improvement,
    baselineHeapDeltaP95Bytes: baselineHeapP95,
    indexedHeapDeltaP95Bytes: indexedHeapP95,
    indexedHeapDeltaOverBaselineBytes:
      baselineHeapP95 !== null && indexedHeapP95 !== null
        ? indexedHeapP95 - baselineHeapP95
        : null,
  }
}

function createPerformanceModeComparison(
  results: CanvasConnectionPerformanceResult[],
  size: number,
  scenario: CanvasConnectionPerformanceScenario,
  mode: CanvasConnectionPerformanceMode,
): CanvasPerformanceModeComparison {
  const normal = results.find(
    (result) =>
      result.size === size && result.scenario === scenario &&
      result.mode === mode && result.performanceMode === 'normal',
  )
  const performance = results.find(
    (result) =>
      result.size === size && result.scenario === scenario &&
      result.mode === mode && result.performanceMode === 'performance',
  )
  const normalP95 = normal?.profiler.p95 ?? null
  const performanceP95 = performance?.profiler.p95 ?? null

  return {
    size,
    scenario,
    mode,
    normalProfilerP95Ms: normalP95,
    performanceProfilerP95Ms: performanceP95,
    performanceProfilerImprovementPercent:
      normalP95 !== null && normalP95 > 0 && performanceP95 !== null
        ? Number((((normalP95 - performanceP95) / normalP95) * 100).toFixed(2))
        : null,
  }
}

function normalizeOptions(partial?: Partial<BenchmarkOptions>): BenchmarkOptions {
  const sizes = partial?.sizes ?? [...CANVAS_CONNECTION_PERFORMANCE_SIZES]
  const scenarios = partial?.scenarios ?? [...CANVAS_CONNECTION_PERFORMANCE_SCENARIOS]
  const modes = partial?.modes ?? [...CANVAS_CONNECTION_PERFORMANCE_MODES]
  const performanceModes = partial?.performanceModes ?? [...PERFORMANCE_MODE_BENCHMARK_MODES]
  const iterations = partial?.iterations ?? DEFAULT_ITERATIONS
  const timeoutMs = partial?.timeoutMs ?? DEFAULT_TIMEOUT_MS

  if (sizes.length === 0 || scenarios.length === 0 || modes.length === 0 || performanceModes.length === 0) {
    throw new Error('a bancada precisa de ao menos um tamanho, cenário, modo de dados e modo visual')
  }
  if (!Number.isInteger(iterations) || iterations < 2 || iterations > 20) {
    throw new Error('iterations deve estar entre 2 e 20')
  }
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 600_000) {
    throw new Error('timeoutMs deve estar entre 1000 e 600000')
  }
  if (sizes.some((size) => !CANVAS_CONNECTION_PERFORMANCE_SIZES.includes(size as never))) {
    throw new Error('sizes precisa usar somente 100, 500 ou 1000')
  }
  if (scenarios.some((scenario) => !CANVAS_CONNECTION_PERFORMANCE_SCENARIOS.includes(scenario))) {
    throw new Error('scenarios contém um cenário desconhecido')
  }
  if (modes.some((mode) => !CANVAS_CONNECTION_PERFORMANCE_MODES.includes(mode))) {
    throw new Error('modes contém um modo desconhecido')
  }
  if (performanceModes.some((mode) => !PERFORMANCE_MODE_BENCHMARK_MODES.includes(mode))) {
    throw new Error('performanceModes contém um modo desconhecido')
  }

  return {
    sizes: [...new Set(sizes)],
    scenarios: [...new Set(scenarios)],
    modes: [...new Set(modes)],
    performanceModes: [...new Set(performanceModes)],
    iterations,
    timeoutMs,
  }
}

function validateProjection(fixture: CanvasConnectionPerformanceFixture): void {
  const baseline = deriveCanvasConnectionPerformanceNodes(fixture, 'baseline')
  const index = createCanvasConnectionIndex(fixture.nodes, fixture.edges)
  const indexed = deriveCanvasConnectionPerformanceNodes(fixture, 'indexado', index)
  const baselineProjection = connectionPerformanceProjection(baseline)
  const indexedProjection = connectionPerformanceProjection(indexed)
  if (JSON.stringify(baselineProjection) !== JSON.stringify(indexedProjection)) {
    throw new Error('baseline e índice produziram projeções diferentes')
  }
}

async function runBenchmark(
  partial: Partial<BenchmarkOptions> | undefined,
  setSurface: Dispatch<SetStateAction<Surface | null>>,
  setStatus: Dispatch<SetStateAction<string>>,
  commits: CanvasProfilerCommit[],
): Promise<CanvasConnectionPerformanceReport> {
  const options = normalizeOptions(partial)
  const startedAt = new Date().toISOString()
  const benchmarkStartedAt = performance.now()
  const results: CanvasConnectionPerformanceResult[] = []
  const initialPerformanceMode = document.documentElement.getAttribute('data-performance-mode')

  const clearSurface = async () => {
    setSurface(null)
    await settleRenderer()
  }

  const warmupSurface = async (
    baseFixture: CanvasConnectionPerformanceFixture,
    mode: CanvasConnectionPerformanceMode,
    performanceMode: PerformanceModeBenchmarkMode,
    size: number,
    scenarioName: CanvasConnectionPerformanceScenario,
  ) => {
    await clearSurface()
    const warmupStartIndex = commits.length
    setSurface({
      key: `warmup-${mode}-${size}-${scenarioName}`,
      mode,
      performanceMode,
      fixture: baseFixture,
    })
    await waitForProfileCommit(commits, warmupStartIndex, 'mount', options.timeoutMs)
    await settleRenderer()
    await clearSurface()
    collectGarbage()
    await settleRenderer()
  }

  try {
    for (const size of options.sizes) {
      const baseFixture = createCanvasConnectionPerformanceFixture(size)
      validateProjection(baseFixture)
      const scenarios = createCanvasConnectionPerformanceScenarios(baseFixture)

      for (const [scenarioIndex, scenarioName] of options.scenarios.entries()) {
        const performanceModes = scenarioIndex % 2 === 0
          ? options.performanceModes
          : [...options.performanceModes].reverse()
        for (const [performanceModeIndex, performanceMode] of performanceModes.entries()) {
          // Alternar primeiro o estado visual e depois a estratégia de dados
          // reduz o viés de aquecimento em cada cenário.
          const orderIndex = scenarioIndex + performanceModeIndex
          const modes = orderIndex % 2 === 0 ? options.modes : [...options.modes].reverse()
          applyPerformanceModeBenchmarkMode(performanceMode)
          for (const mode of modes) {
            const scenario = scenarios.find(({ nome }) => nome === scenarioName)
            if (!scenario) throw new Error(`cenário não encontrado: ${scenarioName}`)

            const samples: PerformanceSample[] = []
            setStatus(`aquecendo ${performanceMode} · ${mode} · ${size} nós · ${scenarioName}`)
            await warmupSurface(baseFixture, mode, performanceMode, size, scenarioName)
            setStatus(`${performanceMode} · ${mode} · ${size} nós · ${scenarioName}`)

            for (let iteration = 0; iteration < options.iterations; iteration += 1) {
              await clearSurface()
              const gcBefore = collectGarbage()
              await settleRenderer()
              const heapBefore = readHeapSnapshot()
              const key = `${performanceMode}-${mode}-${size}-${scenarioName}-${iteration}`
              const mountStartIndex = commits.length

              setSurface({ key, mode, performanceMode, fixture: baseFixture })
              const mountCommit = await waitForProfileCommit(
                commits,
                mountStartIndex,
                'mount',
                options.timeoutMs,
              )
              await settleRenderer()

              let measuredCommit = mountCommit
              if (scenarioName !== 'render-inicial') {
                const updateStartIndex = commits.length
                setSurface({ key, mode, performanceMode, fixture: scenario.fixture })
                measuredCommit = await waitForProfileCommit(
                  commits,
                  updateStartIndex,
                  'update',
                  options.timeoutMs,
                )
                await settleRenderer()
              }

              const gcAfter = collectGarbage()
              await settleRenderer()
              const heapAfter = readHeapSnapshot()
              const appliedMode = document.documentElement.getAttribute('data-performance-mode')
              const minimapVisible = document.querySelector('.felixo-canvas-minimap') !== null
              if (appliedMode !== (performanceMode === 'performance' ? 'on' : 'off')) {
                throw new Error(`Modo Performance ${performanceMode} não foi aplicado ao documento`)
              }
              if (minimapVisible !== (performanceMode === 'normal')) {
                throw new Error(`visibilidade do minimapa incorreta no modo ${performanceMode}`)
              }
              const heapDelta =
                heapBefore.usedBytes !== null && heapAfter.usedBytes !== null
                  ? heapAfter.usedBytes - heapBefore.usedBytes
                  : null

              samples.push({
                actualDurationMs: Number(measuredCommit.actualDuration.toFixed(3)),
                baseDurationMs: Number(measuredCommit.baseDuration.toFixed(3)),
                heapBeforeBytes: heapBefore.usedBytes,
                heapAfterBytes: heapAfter.usedBytes,
                heapDeltaBytes: heapDelta,
                gcAvailable: gcBefore && gcAfter,
                domNodeCount: readPerformanceNodeCount(),
                performanceModeApplied: performanceMode,
                minimapVisible,
              })
            }

            const profilerValues = samples.map((sample) => sample.actualDurationMs)
            const heapBeforeValues = samples.flatMap((sample) =>
              sample.heapBeforeBytes === null ? [] : [sample.heapBeforeBytes],
            )
            const heapAfterValues = samples.flatMap((sample) =>
              sample.heapAfterBytes === null ? [] : [sample.heapAfterBytes],
            )
            const heapDeltaValues = samples.flatMap((sample) =>
              sample.heapDeltaBytes === null ? [] : [sample.heapDeltaBytes],
            )

            results.push({
              size,
              scenario: scenarioName,
              mode,
              performanceMode,
              nodes: baseFixture.nodes.length,
              edges: baseFixture.edges.length,
              namedConnections: countNamedCanvasConnections(baseFixture),
              repetitions: samples.length,
              profiler: summarize(profilerValues),
              heap: {
                supported: heapDeltaValues.length === samples.length,
                gcAvailable: samples.every((sample) => sample.gcAvailable),
                beforeBytes: summarize(heapBeforeValues),
                afterBytes: summarize(heapAfterValues),
                deltaBytes: summarize(heapDeltaValues),
              },
              samples,
            })
          }
        }
      }
    }
  } finally {
    await clearSurface()
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
    kind: 'canvas-connection-react-profiler',
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
      heapMetric: 'performance.memory.usedJSHeapSize',
      gc: 'window.gc quando exposto pelo Electron',
      iterations: options.iterations,
      warmupPasses: 1,
      modeOrder: 'alternado por cenário e estado visual',
      sizes: options.sizes,
      scenarios: options.scenarios,
      modes: options.modes,
      performanceModes: options.performanceModes,
    },
    results,
    comparisons: options.modes.includes('baseline') && options.modes.includes('indexado')
      ? options.sizes.flatMap((size) =>
          options.scenarios.flatMap((scenario) =>
            options.performanceModes.map((performanceMode) =>
              createComparison(results, size, scenario, performanceMode),
            ),
          ),
        )
      : [],
    performanceModeComparisons:
      options.performanceModes.includes('normal') && options.performanceModes.includes('performance')
        ? options.sizes.flatMap((size) =>
            options.scenarios.flatMap((scenario) =>
              options.modes.map((mode) =>
                createPerformanceModeComparison(results, size, scenario, mode),
              ),
            ),
          )
        : [],
  }
}

function PerformanceNode({ id, data, selected }: NodeProps) {
  const nodeData = data as Partial<CanvasConnectionPerformanceData> & {
    label?: unknown
    fileName?: unknown
  }
  const label =
    typeof nodeData.label === 'string'
      ? nodeData.label
      : typeof nodeData.fileName === 'string'
        ? nodeData.fileName
        : nodeData.performanceKind ?? 'bloco'
  const connections =
    (nodeData.connectedAgentIds?.length ?? 0) +
    (nodeData.connectedFileNames?.length ?? 0)

  return (
    <div
      data-canvas-performance-node="true"
      data-canvas-performance-node-id={id}
      className={`felixo-canvas-performance-node relative flex h-full w-full flex-col justify-between rounded-lg border px-2 py-1 text-[10px] text-zinc-100 shadow-lg ${
        selected ? 'border-white/10 bg-white/4' : 'border-white/15 bg-zinc-900/90'
      }`}
    >
      <Handle type="target" position={Position.Left} />
      <div className="felixo-node-header canvas-node-drag">
        <span className="felixo-node-grip" aria-hidden="true">⋮</span>
        <span className="truncate font-semibold">{label}</span>
        <div className="felixo-node-actions" />
      </div>
      <span className="text-zinc-400">conexões: {connections}</span>
      <Handle type="source" position={Position.Right} />
    </div>
  )
}

const PerformanceNodeMemo = memo(PerformanceNode)

function PerformanceFlow({
  fixture,
  mode,
  performanceMode,
}: {
  fixture: CanvasConnectionPerformanceFixture
  mode: CanvasConnectionPerformanceMode
  performanceMode: PerformanceModeBenchmarkMode
}) {
  const index = useMemo(
    () => (mode === 'indexado' ? createCanvasConnectionIndex(fixture.nodes, fixture.edges) : undefined),
    [fixture, mode],
  )
  const renderedNodes = useMemo(
    () => deriveCanvasConnectionPerformanceNodes(fixture, mode, index),
    [fixture, index, mode],
  )
  const orderedNodes = useMemo(() => {
    const groups = renderedNodes.filter((node) => node.type === 'group')
    const rest = renderedNodes.filter((node) => node.type !== 'group')
    return [...groups, ...rest]
  }, [renderedNodes])
  const nodeTypes = useMemo<NodeTypes>(
    () => ({
      terminal: PerformanceNodeMemo,
      file: PerformanceNodeMemo,
      group: PerformanceNodeMemo,
      note: PerformanceNodeMemo,
    }),
    [],
  )

  return (
    <ReactFlow
      nodes={orderedNodes}
      edges={fixture.edges}
      nodeTypes={nodeTypes}
      fitView
      onlyRenderVisibleElements
      nodesConnectable={false}
      proOptions={{ hideAttribution: true }}
    >
      <Background gap={20} color="#1e293b" />
      <Controls position="bottom-left" />
      {performanceMode === 'normal' && (
        <MiniMap
          position="top-right"
          pannable
          zoomable
          className="felixo-canvas-minimap"
        />
      )}
    </ReactFlow>
  )
}

function PerformanceSurface({
  fixture,
  mode,
  performanceMode,
  onRender,
}: Surface & { onRender: ProfilerOnRenderCallback }) {
  return (
    <CanvasProfilerBoundary id={PROFILER_ID} enabled onRender={onRender}>
      <PerformanceFlow fixture={fixture} mode={mode} performanceMode={performanceMode} />
    </CanvasProfilerBoundary>
  )
}

export function CanvasConnectionPerformanceHarness() {
  const [surface, setSurface] = useState<Surface | null>(null)
  const [status, setStatus] = useState('Pronto')
  const commitsRef = useRef<CanvasProfilerCommit[]>([])
  const onRender = useCallback<ProfilerOnRenderCallback>(
    (id, phase, actualDuration, baseDuration, startTime, commitTime) => {
      if (id !== PROFILER_ID) return
      commitsRef.current.push({
        id,
        phase,
        actualDuration,
        baseDuration,
        startTime,
        commitTime,
      })
    },
    [],
  )

  useEffect(() => {
    const api: BenchmarkApi = {
      run: (options) =>
        runBenchmark(options, setSurface, setStatus, commitsRef.current),
      collectGarbage,
      heapSnapshot: readHeapSnapshot,
      reset: () => {
        commitsRef.current = []
        setSurface(null)
        setStatus('Pronto')
      },
    }
    window.felixoCanvasConnectionBenchmark = api
    return () => {
      if (window.felixoCanvasConnectionBenchmark === api) {
        delete window.felixoCanvasConnectionBenchmark
      }
    }
  }, [])

  return (
    <div className="h-screen w-screen bg-zinc-950 text-zinc-100">
      <div className="pointer-events-none fixed left-3 top-3 z-10 rounded-sm border border-white/10 bg-zinc-950/80 px-3 py-2 text-xs">
        <div className="font-semibold text-(--f-core-white)">Canvas connection benchmark</div>
        <div className="text-zinc-400">{status}</div>
      </div>
      {surface ? (
        <PerformanceSurface
          key={surface.key}
          mode={surface.mode}
          performanceMode={surface.performanceMode}
          fixture={surface.fixture}
          onRender={onRender}
        />
      ) : (
        <div className="flex h-full items-center justify-center text-sm text-zinc-500">
          Aguardando o runner do benchmark…
        </div>
      )}
    </div>
  )
}

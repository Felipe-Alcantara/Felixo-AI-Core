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
  baselineProfilerP95Ms: number | null
  indexedProfilerP95Ms: number | null
  profilerP95ImprovementPercent: number | null
  baselineHeapDeltaP95Bytes: number | null
  indexedHeapDeltaP95Bytes: number | null
  indexedHeapDeltaOverBaselineBytes: number | null
}

export type CanvasConnectionPerformanceReport = {
  schemaVersion: 1
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
    modeOrder: 'alternado por cenário'
    sizes: number[]
    scenarios: CanvasConnectionPerformanceScenario[]
    modes: CanvasConnectionPerformanceMode[]
  }
  results: CanvasConnectionPerformanceResult[]
  comparisons: CanvasConnectionPerformanceComparison[]
}

type BenchmarkOptions = {
  sizes: number[]
  scenarios: CanvasConnectionPerformanceScenario[]
  modes: CanvasConnectionPerformanceMode[]
  iterations: number
  timeoutMs: number
}

type Surface = {
  key: string
  mode: CanvasConnectionPerformanceMode
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
): CanvasConnectionPerformanceComparison {
  const baseline = results.find(
    (result) =>
      result.size === size && result.scenario === scenario && result.mode === 'baseline',
  )
  const indexed = results.find(
    (result) =>
      result.size === size && result.scenario === scenario && result.mode === 'indexado',
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

function normalizeOptions(partial?: Partial<BenchmarkOptions>): BenchmarkOptions {
  const sizes = partial?.sizes ?? [...CANVAS_CONNECTION_PERFORMANCE_SIZES]
  const scenarios = partial?.scenarios ?? [...CANVAS_CONNECTION_PERFORMANCE_SCENARIOS]
  const modes = partial?.modes ?? [...CANVAS_CONNECTION_PERFORMANCE_MODES]
  const iterations = partial?.iterations ?? DEFAULT_ITERATIONS
  const timeoutMs = partial?.timeoutMs ?? DEFAULT_TIMEOUT_MS

  if (sizes.length === 0 || scenarios.length === 0 || modes.length === 0) {
    throw new Error('a bancada precisa de ao menos um tamanho, cenário e modo')
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

  return {
    sizes: [...new Set(sizes)],
    scenarios: [...new Set(scenarios)],
    modes: [...new Set(modes)],
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

  const clearSurface = async () => {
    setSurface(null)
    await settleRenderer()
  }

  const warmupSurface = async (
    baseFixture: CanvasConnectionPerformanceFixture,
    mode: CanvasConnectionPerformanceMode,
    size: number,
    scenarioName: CanvasConnectionPerformanceScenario,
  ) => {
    await clearSurface()
    const warmupStartIndex = commits.length
    setSurface({
      key: `warmup-${mode}-${size}-${scenarioName}`,
      mode,
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
        // Alternar a ordem evita que um modo receba sempre o custo de ser
        // medido depois do outro, especialmente no primeiro mount de 1.000 nós.
        const modes = scenarioIndex % 2 === 0 ? options.modes : [...options.modes].reverse()
        for (const mode of modes) {
          const scenario = scenarios.find(({ nome }) => nome === scenarioName)
          if (!scenario) throw new Error(`cenário não encontrado: ${scenarioName}`)

          const samples: PerformanceSample[] = []
          setStatus(`aquecendo ${mode} · ${size} nós · ${scenarioName}`)
          await warmupSurface(baseFixture, mode, size, scenarioName)
          setStatus(`${mode} · ${size} nós · ${scenarioName}`)

          for (let iteration = 0; iteration < options.iterations; iteration += 1) {
            await clearSurface()
            const gcBefore = collectGarbage()
            await settleRenderer()
            const heapBefore = readHeapSnapshot()
            const key = `${mode}-${size}-${scenarioName}-${iteration}`
            const mountStartIndex = commits.length

            setSurface({ key, mode, fixture: baseFixture })
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
              setSurface({ key, mode, fixture: scenario.fixture })
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
  } finally {
    await clearSurface()
    setStatus('Pronto')
  }

  const finishedAt = new Date().toISOString()
  return {
    schemaVersion: 1,
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
      modeOrder: 'alternado por cenário',
      sizes: options.sizes,
      scenarios: options.scenarios,
      modes: options.modes,
    },
    results,
    comparisons: options.modes.includes('baseline') && options.modes.includes('indexado')
      ? options.sizes.flatMap((size) =>
          options.scenarios.map((scenario) => createComparison(results, size, scenario)),
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
      className={`relative flex h-full w-full flex-col justify-between rounded-lg border px-2 py-1 text-[10px] text-zinc-100 shadow-lg ${
        selected ? 'border-fuchsia-300 bg-fuchsia-950/80' : 'border-white/15 bg-zinc-900/90'
      }`}
    >
      <Handle type="target" position={Position.Left} className="!h-1.5 !w-1.5 !bg-fuchsia-300" />
      <span className="truncate font-semibold">{label}</span>
      <span className="text-zinc-400">conexões: {connections}</span>
      <Handle type="source" position={Position.Right} className="!h-1.5 !w-1.5 !bg-fuchsia-300" />
    </div>
  )
}

const PerformanceNodeMemo = memo(PerformanceNode)

function PerformanceFlow({
  fixture,
  mode,
}: {
  fixture: CanvasConnectionPerformanceFixture
  mode: CanvasConnectionPerformanceMode
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
      <MiniMap position="top-right" pannable zoomable />
    </ReactFlow>
  )
}

function PerformanceSurface({
  fixture,
  mode,
  onRender,
}: Surface & { onRender: ProfilerOnRenderCallback }) {
  return (
    <CanvasProfilerBoundary id={PROFILER_ID} enabled onRender={onRender}>
      <PerformanceFlow fixture={fixture} mode={mode} />
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
      <div className="pointer-events-none fixed left-3 top-3 z-10 rounded border border-fuchsia-400/30 bg-zinc-950/80 px-3 py-2 text-xs">
        <div className="font-semibold text-fuchsia-200">Canvas connection benchmark</div>
        <div className="text-zinc-400">{status}</div>
      </div>
      {surface ? (
        <PerformanceSurface
          key={surface.key}
          mode={surface.mode}
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

// A bancada é opt-in para não tornar o gate frontend dependente de relógio e
// carga da máquina. O wrapper mantém a medição executável pelo Vitest:
// `$env:FELIXO_CANVAS_DRAG_BENCHMARK='1'; npx vitest run src/features/canvas/services/canvas-drag-frame-benchmark.test.ts`.
import './canvas-drag-frame-benchmark'

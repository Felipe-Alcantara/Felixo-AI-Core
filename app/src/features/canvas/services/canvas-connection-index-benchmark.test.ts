// O benchmark é opt-in para não tornar o gate frontend dependente de relógio e
// carga da máquina. O wrapper mantém a medição executável pelo Vitest:
// `$env:FELIXO_CONNECTION_BENCHMARK='1'; npx vitest run src/features/canvas/services/canvas-connection-index-benchmark.test.ts`.
import './canvas-connection-index-benchmark'

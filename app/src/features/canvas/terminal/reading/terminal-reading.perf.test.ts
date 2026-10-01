import { it } from 'vitest'

import { createHeadlessTerminal, writeTo } from '../__fixtures__/terminal-output/replay-fixture'
import { createTerminalLineReader } from './reading-lines'
import { READING_PROFILES } from './reading-profiles'
import { buildTerminalReading, createReadingTurnCache } from './terminal-reading'
import { splitReadingTurns } from './reading-blocks'
import { renderMarkdown } from './reading-test-helpers'

function turn(i: number): string {
  return [
    `› Pergunta número ${i} sobre o projeto`,
    '',
    `• \x1b[1m## Seção ${i}\x1b[0m`,
    '',
    `  Este é um parágrafo com \x1b[1mnegrito\x1b[0m e \x1b[3mitálico\x1b[0m, longo o bastante para parecer uma resposta`,
    '  de verdade, com uma segunda linha quebrada pela largura do terminal.',
    '',
    ...Array.from({ length: 5 }, (_, k) => `  - item ${k} da lista ${i}`),
    '',
    `  \x1b[38;2;203;166;247mdef\x1b[0m \x1b[38;2;137;180;250mfuncao_${i}\x1b[0m(a, b):`,
    `      \x1b[38;2;203;166;247mreturn\x1b[0m a + b`,
    '',
    `  > Uma citação curta ${i}.`,
    '',
  ].join('\r\n')
}

/**
 * Medição de custo da Leitura num histórico cheio (2000+ linhas no estilo do
 * Codex). Não é portão de CI — número de máquina compartilhada oscila. Rode
 * com `FELIXO_READING_PERF=1 npx vitest run src/features/canvas/terminal/reading/terminal-reading.perf.test.ts`
 * e leia o relatório na saída.
 */
it.skipIf(!process.env.FELIXO_READING_PERF)('custo da Leitura num histórico cheio', async () => {
  const terminal = await createHeadlessTerminal(100, 50)
  for (let i = 0; i < 120; i += 1) await writeTo(terminal, turn(i) + '\r\n')
  const reader = createTerminalLineReader()
  const cache = createReadingTurnCache()
  const out: string[] = [`linhas no buffer: ${terminal.buffer.active.length}`]
  let t = performance.now()
  const first = reader.read(terminal.buffer.active, terminal.cols)
  out.push(`leitura inicial: ${(performance.now() - t).toFixed(1)} ms (${first.lines.length} linhas guardadas, ${first.droppedLines} fora)`)
  t = performance.now()
  const reading = buildTerminalReading(first.lines, READING_PROFILES.codex, first.droppedLines, cache)
  out.push(`montagem das falas: ${(performance.now() - t).toFixed(1)} ms (${reading.turns.length} falas, ${reading.turns.filter((x) => x.raw).length} em texto puro)`)
  const samples: number[] = []
  const parts = { read: [] as number[], split: [] as number[], build: [] as number[] }
  for (let i = 0; i < 40; i += 1) {
    await writeTo(terminal, `  linha nova ${i}\r\n`)
    t = performance.now()
    const step = reader.read(terminal.buffer.active, terminal.cols)
    const t1 = performance.now()
    splitReadingTurns(step.lines, READING_PROFILES.codex)
    const t2 = performance.now()
    buildTerminalReading(step.lines, READING_PROFILES.codex, step.droppedLines, cache)
    const t3 = performance.now()
    parts.read.push(t1 - t); parts.split.push(t2 - t1); parts.build.push(t3 - t2)
    samples.push(t1 - t + (t3 - t2))
  }
  const med = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)].toFixed(1)
  samples.sort((a, b) => a - b)
  out.push(`a cada redesenho (releitura incremental + montagem): mediana ${samples[20].toFixed(1)} ms, p95 ${samples[37].toFixed(1)} ms`)
  out.push(`  partes (mediana): leitura ${med(parts.read)} ms, divisão em falas ${med(parts.split)} ms, montagem com cache ${med(parts.build)} ms`)
  const renders: number[] = []
  for (let i = 0; i < 15; i += 1) {
    t = performance.now()
    renderMarkdown(reading.turns.at(-1)!.markdown + ` ${i}`)
    renders.push(performance.now() - t)
  }
  out.push(`render da última fala (MarkdownContent, servidor): 1ª ${renders[0].toFixed(1)} ms, mediana ${med(renders)} ms`)
  const md = reading.turns.map((x) => x.markdown).join('\n')
  out.push(`markdown total: ${(md.length / 1024).toFixed(0)} KB; heap do processo de teste: ${(process.memoryUsage().heapUsed / 1048576).toFixed(0)} MB`)
  process.stdout.write(`\n${out.join('\n')}\n`)
})

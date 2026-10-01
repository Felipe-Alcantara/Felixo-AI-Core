/**
 * Reproduz uma gravação de `scripts/record-terminal-fixture.cjs` num xterm de
 * verdade, sem DOM: os testes leem a tela exatamente como o app a desenharia.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { Terminal } from '@xterm/xterm'

export type TerminalFixture = {
  provider: string
  version: string
  scenario: string
  cols: number
  rows: number
  platform: string
  recordedAt: string
  anonymized: boolean
  marks: { t: number; label: string }[]
  chunks: { t: number; data: string }[]
}

export const FIXTURE_NAMES = [
  'claude-resposta',
  'claude-telacheia',
  'claude-cancelamento',
  'claude-erro',
  'claude-retomada',
  'codex-resposta',
  'codex-cancelamento',
  'codex-erro',
  'codex-retomada',
  'gemini-erro',
  'openia-lista',
  'openia-ajuda',
  'openia-erro',
] as const

export type FixtureName = (typeof FIXTURE_NAMES)[number]

export function loadFixture(name: FixtureName): TerminalFixture {
  return JSON.parse(readFileSync(join(__dirname, `${name}.json`), 'utf8')) as TerminalFixture
}

let TerminalClass: typeof Terminal | null = null

/** O xterm consulta `window` e `navigator` ao carregar; o Node 21+ só tem o `navigator`. */
async function loadTerminal(): Promise<typeof Terminal> {
  if (TerminalClass) return TerminalClass
  const globals = globalThis as { window?: unknown; navigator?: unknown }
  if (!globals.navigator) globals.navigator = { platform: process.platform, userAgent: 'node' }
  if (!globals.window) globals.window = { navigator: globals.navigator }
  TerminalClass = (await import('@xterm/xterm')).Terminal
  return TerminalClass
}

export async function createHeadlessTerminal(cols: number, rows: number): Promise<Terminal> {
  const TerminalCtor = await loadTerminal()
  return new TerminalCtor({ cols, rows, allowProposedApi: true, scrollback: 5000 })
}

export function writeTo(terminal: Terminal, data: string): Promise<void> {
  return new Promise((resolve) => terminal.write(data, resolve))
}

/**
 * A gravação num terminal novo, até o pedaço `upTo` (exclusivo). Com
 * `onChunk`, chama depois de cada pedaço — para ler a tela no meio do stream.
 */
export async function replayFixture(
  fixture: TerminalFixture,
  options: { upTo?: number; onChunk?: (terminal: Terminal, index: number) => void } = {},
): Promise<Terminal> {
  const terminal = await createHeadlessTerminal(fixture.cols, fixture.rows)
  const end = Math.min(options.upTo ?? fixture.chunks.length, fixture.chunks.length)
  for (let index = 0; index < end; index += 1) {
    await writeTo(terminal, fixture.chunks[index].data)
    options.onChunk?.(terminal, index)
  }
  return terminal
}

import type { Terminal } from '@xterm/xterm'
import { describe, expect, it } from 'vitest'

import {
  createHeadlessTerminal,
  FIXTURE_NAMES,
  loadFixture,
  replayFixture,
  writeTo,
} from '../__fixtures__/terminal-output/replay-fixture'
import { createTerminalLineReader, type ReadingBuffer } from './reading-lines'
import { READING_PROFILES, readingProfileFor } from './reading-profiles'
import { buildTerminalReading, createReadingTurnCache } from './terminal-reading'
import { comparableText, expectInertHtml, renderMarkdown, renderedText, seededRandom } from './reading-test-helpers'

function bufferOf(terminal: Terminal): ReadingBuffer {
  return terminal.buffer.active
}

/**
 * O stream parcial converge: lendo a cada pedaço com o MESMO leitor
 * incremental, o resultado em cada ponto é igual ao de um leitor novo, e o do
 * fim é igual ao da gravação inteira lida de uma vez.
 */
describe('Leitura durante o stream', { timeout: 120_000 }, () => {
  it.each(FIXTURE_NAMES)('%s: o leitor incremental nunca diverge do leitor novo', async (name) => {
    const fixture = loadFixture(name)
    const profile = readingProfileFor(fixture.provider, undefined)
    const incremental = createTerminalLineReader()
    let last = ''

    await replayFixture(fixture, {
      onChunk: (terminal) => {
        const fresh = createTerminalLineReader().read(bufferOf(terminal), terminal.cols)
        const step = incremental.read(bufferOf(terminal), terminal.cols)
        expect(step).toEqual(fresh)
        last = JSON.stringify(buildTerminalReading(step.lines, profile, step.droppedLines))
      },
    })

    const whole = await replayFixture(fixture)
    const once = createTerminalLineReader().read(bufferOf(whole), whole.cols)
    expect(last).toBe(JSON.stringify(buildTerminalReading(once.lines, profile, once.droppedLines)))
  })

  it.each(['claude-resposta', 'codex-resposta', 'claude-cancelamento', 'codex-cancelamento'] as const)(
    '%s: em todo ponto do stream, o HTML tem o texto da tela',
    async (name) => {
      const fixture = loadFixture(name)
      const profile = readingProfileFor(fixture.provider, undefined)
      const reader = createTerminalLineReader()

      await replayFixture(fixture, {
        onChunk: (terminal) => {
          const { lines } = reader.read(bufferOf(terminal), terminal.cols)
          for (const turn of buildTerminalReading(lines, profile).turns) {
            expect(comparableText(renderedText(renderMarkdown(turn.markdown)))).toBe(comparableText(turn.text))
          }
        },
      })
    },
  )
})

describe('cache das falas', () => {
  it('reaproveita as falas que não mudaram e remonta só a que mudou', async () => {
    const terminal = await createHeadlessTerminal(60, 10)
    await writeTo(terminal, '› primeira\r\n• resposta um\r\n› segunda\r\n• resposta dois\r\n')
    const reader = createTerminalLineReader()
    const cache = createReadingTurnCache()
    const before = buildTerminalReading(reader.read(bufferOf(terminal), terminal.cols).lines, READING_PROFILES.codex, 0, cache)

    await writeTo(terminal, '  e mais um pedaço\r\n')
    const after = buildTerminalReading(reader.read(bufferOf(terminal), terminal.cols).lines, READING_PROFILES.codex, 0, cache)

    expect(after.turns.slice(0, 3)).toEqual(before.turns.slice(0, 3))
    after.turns.slice(0, 3).forEach((turn, index) => expect(turn).toBe(before.turns[index]))
    expect(after.turns[3]).not.toBe(before.turns[3])
    expect(after.turns[3].text).toContain('e mais um pedaço')
    // Só as falas da última leitura ficam guardadas.
    expect(cache.size).toBe(after.turns.length)
  })

  it('estilo novo sem texto novo também remonta (o código colorido no fim do stream)', async () => {
    const terminal = await createHeadlessTerminal(60, 10)
    await writeTo(terminal, '› pedido\r\n• def soma(a, b):\r\n')
    const reader = createTerminalLineReader()
    const cache = createReadingTurnCache()
    buildTerminalReading(reader.read(bufferOf(terminal), terminal.cols).lines, READING_PROFILES.codex, 0, cache)

    await writeTo(terminal, '\u001b[2;3H\u001b[38;5;5mdef\u001b[0m \u001b[38;5;4msoma\u001b[0m')
    const colored = buildTerminalReading(reader.read(bufferOf(terminal), terminal.cols).lines, READING_PROFILES.codex, 0, cache)

    expect(colored.turns.at(-1)!.markdown).toContain('```')
  })
})

describe('leitor de linhas', () => {
  it('junta as linhas que o terminal quebrou por largura e mantém o estilo', async () => {
    const terminal = await createHeadlessTerminal(10, 4)
    await writeTo(terminal, '\u001b[1mnegrito\u001b[0m e texto longo\r\nfim')

    const { lines } = createTerminalLineReader().read(bufferOf(terminal), terminal.cols)

    expect(lines.map((line) => line.text)).toEqual(['negrito e texto longo', 'fim'])
    expect(lines[0].segments[0]).toMatchObject({ text: 'negrito', bold: true })
    expect(lines[0].segments.slice(1).every((segment) => !segment.bold)).toBe(true)
  })

  it('caractere largo (CJK, emoji) entra uma vez só', async () => {
    const terminal = await createHeadlessTerminal(20, 3)
    await writeTo(terminal, '日本 🙂 ok')

    const { lines } = createTerminalLineReader().read(bufferOf(terminal), terminal.cols)

    expect(lines[0].text).toBe('日本 🙂 ok')
  })

  it('guarda no máximo o limite de linhas e conta as que ficaram de fora', async () => {
    const terminal = await createHeadlessTerminal(20, 5)
    await writeTo(terminal, Array.from({ length: 300 }, (_, index) => `linha ${index}`).join('\r\n'))

    const { lines, droppedLines } = createTerminalLineReader(50).read(bufferOf(terminal), terminal.cols)

    expect(lines).toHaveLength(50)
    expect(lines.at(-1)!.text).toBe('linha 299')
    expect(droppedLines).toBe(250)
  })

  it('descarta o cache quando o histórico cheio desloca as linhas, limpa ou muda de largura', async () => {
    const terminal = await createHeadlessTerminal(20, 5)
    const reader = createTerminalLineReader()
    const check = () =>
      expect(reader.read(bufferOf(terminal), terminal.cols)).toEqual(
        createTerminalLineReader().read(bufferOf(terminal), terminal.cols),
      )

    // Mais linhas que o histórico (5000): o xterm descarta as do topo.
    for (let batch = 0; batch < 6; batch += 1) {
      await writeTo(terminal, Array.from({ length: 1000 }, (_, index) => `b${batch} ${index}`).join('\r\n') + '\r\n')
      check()
    }
    await writeTo(terminal, '\u001b[3J\u001b[2J\u001b[Hlimpo')
    check()
    terminal.resize(12, 5)
    check()
  })
})

const FUZZ_PIECES = [
  '\r\n', '\n', '\r', '\b', '\t', ' ', '\u0000', '\u0007', '\u007f', '\u001b', '\u001b[', '\u001b[1m', '\u001b[3m',
  '\u001b[0m', '\u001b[38;5;33m', '\u001b[38;2;10;20;30m', '\u001b[2J', '\u001b[H', '\u001b[5;3H', '\u001b[K',
  '\u001b7', '\u001b8', '\u001b]8;;https://example.com\u001b\\', '\u001b]8;;\u001b\\', '\u001b]0;título\u0007',
  '\u001b[?1049h', '\u001b[?1049l', '● ', '❯ ', '• ', '› ', '■ ', '⎿ ', '- item', '1. passo', '## título',
  '> citação', '┌──┬──┐', '│ a │ b │', '└──┴──┘', '━━━  ━━━', '<script>alert(1)</script>', '[x](javascript:x)',
  '**', '`', '|', '&amp;', 'https://example.com/a?b=c', 'https://exa​mple.com', '日本', '🙂', 'é', '‮',
  '\ud800', 'texto ', 'def soma(a, b):', ' ',
]

describe('fuzz: bytes quaisquer do terminal', { timeout: 120_000 }, () => {
  it('nunca lança, nunca gera HTML ativo e nunca perde texto da tela', async () => {
    const random = seededRandom(0x1e17_0001)
    for (let round = 0; round < 60; round += 1) {
      const terminal = await createHeadlessTerminal(16 + Math.floor(random() * 60), 4 + Math.floor(random() * 20))
      let input = ''
      for (let piece = 0; piece < 120; piece += 1) {
        input += random() < 0.85
          ? FUZZ_PIECES[Math.floor(random() * FUZZ_PIECES.length)]
          : String.fromCharCode(Math.floor(random() * 0x3000))
      }
      // Corte no meio de um escape, como um pedaço de stream partido.
      await writeTo(terminal, input.slice(0, Math.floor(random() * input.length)))

      const { lines } = createTerminalLineReader().read(bufferOf(terminal), terminal.cols)
      for (const profile of Object.values(READING_PROFILES)) {
        for (const turn of buildTerminalReading(lines, profile).turns) {
          const html = renderMarkdown(turn.markdown)
          expectInertHtml(html)
          expect(comparableText(renderedText(html)), JSON.stringify(input)).toBe(comparableText(turn.text))
        }
      }
    }
  })
})

import { describe, expect, it } from 'vitest'

import { FIXTURE_NAMES, loadFixture, replayFixture } from '../__fixtures__/terminal-output/replay-fixture'
import { comparableText, expectInertHtml, readFixture, renderMarkdown, renderedText } from './reading-test-helpers'

/**
 * A Leitura de cada gravação real (`scripts/record-terminal-fixture.cjs`):
 * Claude Code e Codex em resposta, cancelamento, erro e retomada; o Gemini só
 * no erro de login (a conta pessoal foi recusada na gravação); o Openia em
 * lista, ajuda e erro. Os snapshots guardam o Markdown e o HTML de cada fala.
 */
describe('Leitura das gravações reais', () => {
  it.each(FIXTURE_NAMES)('%s: snapshot do Markdown e do HTML', async (name) => {
    const reading = await readFixture(name)

    expect(
      reading.turns.map((turn) => ({ role: turn.role, raw: turn.raw, markdown: turn.markdown })),
    ).toMatchSnapshot('markdown')
    expect(reading.turns.map((turn) => renderMarkdown(turn.markdown))).toMatchSnapshot('html')
  })

  it.each(FIXTURE_NAMES)('%s: nenhum texto da fala se perde nem sobra no HTML', async (name) => {
    const reading = await readFixture(name)

    for (const turn of reading.turns) {
      expect(comparableText(renderedText(renderMarkdown(turn.markdown))), turn.text).toBe(comparableText(turn.text))
    }
  })

  it.each(FIXTURE_NAMES)('%s: o HTML não executa nada e só liga para http(s)', async (name) => {
    const reading = await readFixture(name)

    for (const turn of reading.turns) {
      const html = renderMarkdown(turn.markdown)
      expectInertHtml(html)
      for (const [, href] of html.matchAll(/\shref="([^"]*)"/g)) expect(href).toMatch(/^https:\/\//)
    }
  })

  it.each(['claude-resposta', 'claude-telacheia', 'codex-resposta', 'claude-retomada', 'codex-retomada'] as const)(
    '%s: título, listas, código, tabela, citação e link viram estrutura',
    async (name) => {
      const reading = await readFixture(name)
      const agent = reading.turns.find((turn) => turn.role === 'agente')!
      const html = renderMarkdown(agent.markdown)

      // A retomada na tela clássica traz também o `/exit` da sessão anterior, como fala da pessoa.
      expect(reading.turns.map((turn) => turn.role).slice(0, 2)).toEqual(['pessoa', 'agente'])
      expect(agent.raw).toBe(false)
      expect(html).toMatch(/<h[23][^>]*>Resumo<\/h[23]>/)
      expect(html).toMatch(/<strong[^>]*>\p{L}+<\/strong>/u)
      expect(html).toMatch(/<em[^>]*>\p{L}+<\/em>/u)
      expect(html).toMatch(/<ul[ >]/)
      expect(html).toMatch(/<ol[ >]/)
      expect(html).toMatch(/<code[^>]*>[\s\S]*def[\s\S]*soma[\s\S]*<\/code>/)
      expect(html).toMatch(/<th[^>]*>Nome<\/th>[\s\S]*<th[^>]*>Valor<\/th>/)
      expect(html).toMatch(/<blockquote[ >]/)
      expect(html).toContain('href="https://example.com/docs"')
      // O logotipo, as dicas, o status e a caixa de digitação não são conversa.
      expect(html).not.toMatch(/tokens|auto mode|Ask Codex|Tip:|Claude Code v|OpenAI Codex/)
    },
  )

  it('cancelamento: a resposta parcial e o aviso de interrupção ficam', async () => {
    const claude = await readFixture('claude-cancelamento')
    const codex = await readFixture('codex-cancelamento')

    expect(renderMarkdown(claude.turns.at(-1)!.markdown)).toContain('Interrupted')
    // A resposta foi cortada no quinto item, que fica pela metade.
    expect(claude.turns.at(-1)!.markdown).toMatch(/^5\. \S/m)
    expect(codex.turns.map((turn) => turn.role)).toEqual(['pessoa', 'agente', 'aviso'])
    expect(codex.turns.at(-1)!.text).toContain('Conversation interrupted')
  })

  it('erro: a mensagem da CLI chega como texto, sem virar código', async () => {
    const claude = await readFixture('claude-erro')
    const codex = await readFixture('codex-erro')

    expect(claude.turns.at(-1)!.markdown).not.toContain('```')
    expect(renderedText(renderMarkdown(claude.turns.at(-1)!.markdown))).toContain("There's an issue with the selected model")
    expect(codex.turns.at(-1)).toMatchObject({ role: 'aviso', raw: false })
  })

  it.each(['gemini-erro', 'openia-lista', 'openia-ajuda', 'openia-erro'] as const)(
    '%s: CLI sem perfil de leitura mostra a saída como veio',
    async (name) => {
      const reading = await readFixture(name)

      expect(reading.profile).toBe('texto')
      expect(reading.turns).toHaveLength(1)
      expect(reading.turns[0]).toMatchObject({ role: 'saida', raw: true })
      expect(reading.turns[0].markdown.startsWith('```text\n')).toBe(true)
    },
  )

  it.each(FIXTURE_NAMES)('%s: a gravação está anonimizada, no texto cru e nas duas telas desenhadas', async (name) => {
    const fixture = loadFixture(name)
    const raw = JSON.stringify(fixture)
    const terminal = await replayFixture(fixture)
    // A tela normal também: o Claude escreve nela ao abrir, antes da tela cheia.
    const screens = [terminal.buffer.normal, terminal.buffer.alternate]
      .map((buffer) => Array.from({ length: buffer.length }, (_, row) => buffer.getLine(row)?.translateToString(true) ?? ''))
      .flat()
      .join('\n')

    expect(fixture.anonymized).toBe(true)
    for (const text of [raw, screens]) {
      expect(text).not.toMatch(/sk-[A-Za-z0-9_-]{16,}|AIza[0-9A-Za-z_-]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|eyJ[A-Za-z0-9_-]{16,}\./)
      expect(text).not.toMatch(/\/home\/(?!pessoa\b)[a-z]|\/Users\/(?!pessoa\b)[A-Za-z]|C:\\\\Users\\\\(?!pessoa\b)/)
      expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-(?!000000000000)[0-9a-f]{12}/i)
    }
    // Plano da conta e regras das configurações da pessoa (o aviso de permissão do Claude).
    expect(screens).not.toMatch(/Claude (?:Pro|Max|Team|Enterprise)\b|Permission (?:allow|deny|ask) rule|settings\.json/i)
  })
})

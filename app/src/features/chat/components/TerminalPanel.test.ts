import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { TerminalOutputSession } from '../hooks/useTerminalOutput'
import { TerminalPanel } from './TerminalPanel'

function makeSession(): TerminalOutputSession {
  const firstInsertion = JSON.stringify({
    id: 'manual-1',
    source: 'manual',
    combinedNames: [],
    autoSubmit: false,
    timestamp: '2026-11-03T12:00:00.000Z',
  })
  const latestInsertion = JSON.stringify({
    id: 'catalog-2',
    source: 'catalog',
    name: 'Revisão extensa — 東京 '.repeat(10),
    combinedNames: ['Revisão extensa — 東京', 'Revisão extensa — 東京'],
    autoSubmit: true,
    timestamp: '2026-11-03T13:00:00.000Z',
    content: 'BODY-MUST-NOT-LEAK',
  })
  const chunks: TerminalOutputSession['chunks'] = [
    {
      sessionId: 'thread-a',
      source: 'system',
      chunk: 'primeiro envio',
      kind: 'lifecycle',
      metadata: {
        modelName: 'Codex',
        promptHint: 'prévia manual',
        promptInsertion: firstInsertion,
      },
      id: 1,
      createdAt: '2026-11-03T12:00:00.000Z',
    },
    {
      sessionId: 'thread-a',
      source: 'system',
      chunk: 'segundo envio',
      kind: 'lifecycle',
      metadata: {
        modelName: 'Codex',
        promptHint: 'prévia do catálogo',
        promptInsertion: latestInsertion,
      },
      id: 2,
      createdAt: '2026-11-03T13:00:00.000Z',
    },
  ]

  return {
    sessionId: 'thread-a',
    parentThreadId: 'thread-a',
    chunks,
    status: 'completed',
    startedAt: '2026-11-03T12:00:00.000Z',
    updatedAt: '2026-11-03T13:00:00.000Z',
    outputSize: 24,
    totalChunkCount: chunks.length,
    droppedChunkCount: 0,
    visibleChars: 24,
    historyAvailable: true,
  }
}

describe('TerminalPanel prompt provenance', () => {
  it('shows the latest label and expandable origin details for prior sends', () => {
    const html = renderToStaticMarkup(
      createElement(TerminalPanel, {
        sessions: [makeSession()],
        isOpen: true,
        onToggleOpen: () => {},
        onClear: () => {},
      }),
    )

    expect(html).toContain('Prompt: Revisão extensa — 東京')
    expect(html).toContain('Detalhes dos prompts (2)')
    expect(html).toContain('Texto digitado')
    expect(html).toContain('Catálogo')
    expect(html).toContain('Após ação manual')
    expect(html).toContain('Automático')
    expect(html).toContain('Prévia')
    expect(html).not.toContain('BODY-MUST-NOT-LEAK')
  })
})

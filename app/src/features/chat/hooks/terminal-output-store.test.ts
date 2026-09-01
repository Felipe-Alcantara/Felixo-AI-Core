import { describe, expect, it } from 'vitest'
import type { TerminalOutputEvent } from '../types'
import {
  appendTerminalOutputToSession,
  getVisibleChars,
  trimTerminalOutputChunks,
  type TerminalOutputChunk,
  type TerminalOutputSession,
} from './terminal-output-store'

const HISTORY_AVAILABLE = true

function event(
  sessionId: string,
  chunk: string,
  overrides: Partial<TerminalOutputEvent> = {},
): TerminalOutputEvent {
  return {
    sessionId,
    source: 'stdout',
    chunk,
    ...overrides,
  }
}

function append(
  session: TerminalOutputSession | undefined,
  nextEvent: TerminalOutputEvent,
  id: number,
  sequence: number,
) {
  return appendTerminalOutputToSession(
    session,
    nextEvent,
    id,
    `2026-09-01T12:00:${String(sequence).padStart(2, '0')}.000Z`,
    HISTORY_AVAILABLE,
  )
}

describe('terminal-output-store', () => {
  it('coalesceia somente o stream assistant contíguo e preserva a ordem', () => {
    let session: TerminalOutputSession | undefined

    session = append(
      session,
      event('session-a', 'Olá', {
        kind: 'assistant',
        metadata: { streamItemId: 'answer-1' },
      }),
      1,
      1,
    )
    session = append(
      session,
      event('session-a', ' mundo', {
        kind: 'assistant',
        metadata: { streamItemId: 'answer-1' },
      }),
      2,
      2,
    )
    session = append(
      session,
      event('session-a', 'executando ferramenta', {
        kind: 'tool',
        source: 'system',
        title: 'Ferramenta',
      }),
      2,
      3,
    )
    session = append(
      session,
      event('session-a', 'resultado', {
        kind: 'assistant',
        metadata: { streamItemId: 'answer-2' },
      }),
      3,
      4,
    )

    expect(session.chunks.map(({ kind, chunk }) => ({ kind, chunk }))).toEqual([
      { kind: 'assistant', chunk: 'Olá mundo' },
      { kind: 'tool', chunk: 'executando ferramenta' },
      { kind: 'assistant', chunk: 'resultado' },
    ])
    expect(session.totalChunkCount).toBe(3)
    expect(session.droppedChunkCount).toBe(0)
    expect(session.outputSize).toBe(
      new TextEncoder().encode('Olá mundoexecutando ferramentaresultado').byteLength,
    )
  })

  it('retém uma janela previsível, preserva o sufixo e contabiliza o descartado', () => {
    let session: TerminalOutputSession | undefined
    const chunks = Array.from({ length: 260 }, (_, index) => `evento-${index}-${'x'.repeat(980)}`)

    chunks.forEach((chunk, index) => {
      session = append(
        session,
        event('long-session', chunk, { kind: 'tool', title: 'Saída' }),
        index + 1,
        index % 60,
      )
    })

    if (!session) {
      throw new Error('A sessão deveria ter sido criada')
    }

    expect(session.chunks.length).toBeLessThanOrEqual(240)
    expect(session.visibleChars).toBeLessThanOrEqual(240_000)
    expect(session.totalChunkCount).toBe(260)
    expect(session.droppedChunkCount).toBe(
      session.totalChunkCount - session.chunks.length,
    )
    expect(session.chunks.at(-1)?.chunk).toContain('evento-259-')
    expect(session.outputSize).toBe(
      chunks.reduce((total, chunk) => total + new TextEncoder().encode(chunk).byteLength, 0),
    )
  })

  it('limita um evento individual sem perder seu final', () => {
    const source = 'início '.repeat(10_000)
    const session = append(
      undefined,
      event('large-event', source, { kind: 'assistant' }),
      1,
      1,
    )

    expect(session.chunks).toHaveLength(1)
    expect(session.chunks[0].chunk.length).toBeLessThanOrEqual(32_000)
    expect(session.chunks[0].chunk).toContain('parte anterior fora da janela visual')
    expect(session.chunks[0].chunk).toMatch(/início $/)
    expect(session.chunks[0].isTextTruncated).toBe(true)
    expect(session.outputSize).toBe(new TextEncoder().encode(source).byteLength)
  })

  it('mantém sessões independentes mesmo com eventos intercalados', () => {
    const sessions: Record<string, TerminalOutputSession> = {}

    for (const [index, sessionId] of ['session-a', 'session-b', 'session-a', 'session-b'].entries()) {
      sessions[sessionId] = append(
        sessions[sessionId],
        event(sessionId, `${sessionId}-${index}`, {
          kind: 'assistant',
          metadata: { streamItemId: sessionId },
        }),
        index + 1,
        index + 1,
      )
    }

    const sessionA = sessions['session-a']
    const sessionB = sessions['session-b']
    if (!sessionA || !sessionB) {
      throw new Error('As duas sessões deveriam ter sido criadas')
    }

    expect(sessionA.chunks).toHaveLength(1)
    expect(sessionA.chunks[0].chunk).toBe('session-a-0session-a-2')
    expect(sessionB.chunks).toHaveLength(1)
    expect(sessionB.chunks[0].chunk).toBe('session-b-1session-b-3')
    expect(sessionA.chunks[0].id).toBe(1)
    expect(sessionB.chunks[0].id).toBe(2)
  })

  it('trimTerminalOutputChunks conserva o trecho mais recente no limite de caracteres', () => {
    const chunks: TerminalOutputChunk[] = Array.from({ length: 4 }, (_, index) => ({
      ...event('session-a', String(index).repeat(4), { kind: 'tool' }),
      id: index + 1,
      createdAt: `2026-09-01T12:00:0${index}.000Z`,
    }))

    const retained = trimTerminalOutputChunks(chunks, {
      maxChunks: 3,
      maxChars: 10,
      maxChunkChars: 32_000,
    })

    expect(retained.map((chunk) => chunk.id)).toEqual([3, 4])
    expect(getVisibleChars(retained)).toBe(8)
  })
})

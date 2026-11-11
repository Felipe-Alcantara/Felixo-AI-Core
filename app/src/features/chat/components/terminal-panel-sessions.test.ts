import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TerminalOutputSession } from '../hooks/useTerminalOutput'
import { getVisibleChars, trimTerminalOutputChunks } from '../hooks/terminal-output-store'
import * as panelSessions from './terminal-panel-sessions'
import { TerminalPanel } from './TerminalPanel'

const { createVisibleSessions, selectOrchestratorEntries } = panelSessions

// Referência: a implementação anterior (comparador com `new Date` a cada comparação, sem cache).
function referenceVisibleSessions(sessions: TerminalOutputSession[]) {
  const byId = new Map(sessions.map((session) => [session.sessionId, session]))
  const hidden = new Set<string>()
  const merged = new Map<string, TerminalOutputSession>()
  for (const session of sessions) {
    if (!session.sessionId.includes('orchestrator-turn') || !session.parentThreadId || !byId.has(session.parentThreadId)) {
      continue
    }
    hidden.add(session.sessionId)
    const parent = merged.get(session.parentThreadId) ?? { ...byId.get(session.parentThreadId)!, chunks: [...byId.get(session.parentThreadId)!.chunks] }
    const chunks = trimTerminalOutputChunks(
      [...parent.chunks, ...session.chunks].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() || a.id - b.id,
      ),
    )
    const totalChunkCount = parent.totalChunkCount + session.totalChunkCount
    merged.set(session.parentThreadId, {
      ...parent,
      chunks,
      updatedAt:
        new Date(parent.updatedAt).getTime() >= new Date(session.updatedAt).getTime()
          ? parent.updatedAt
          : session.updatedAt,
      totalChunkCount,
      droppedChunkCount: Math.max(0, totalChunkCount - chunks.length),
      visibleChars: getVisibleChars(chunks),
    })
  }
  return sessions
    .filter((session) => !hidden.has(session.sessionId))
    .map((session) => merged.get(session.sessionId) ?? session)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
}

function referenceOrchestratorEntries(sessions: TerminalOutputSession[], windowSize: number) {
  const all = sessions
    .flatMap((session) => session.chunks.filter((chunk) => chunk.kind !== 'tool').map((chunk) => ({ chunk, sessionId: session.sessionId })))
    .sort((a, b) => new Date(a.chunk.createdAt).getTime() - new Date(b.chunk.createdAt).getTime() || a.chunk.id - b.chunk.id)
  const entries = all.length <= windowSize ? all : all.slice(-windowSize)
  return { entries, dropped: all.length - entries.length }
}

function randomSessions(seed: number, total: number): TerminalOutputSession[] {
  let state = seed
  const random = () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648
    return state / 2_147_483_648
  }
  let id = 1
  const sessions: TerminalOutputSession[] = []
  for (let index = 0; index < total; index += 1) {
    const isTurn = index > 0 && random() < 0.4
    const sessionId = isTurn ? `orchestrator-turn-${index}` : `thread-${index}`
    const parentThreadId = isTurn ? `thread-${Math.floor(random() * index)}` : undefined
    const chunks: TerminalOutputSession['chunks'] = []
    let clock = 1_800_000_000_000 + Math.floor(random() * 50_000)
    const count = Math.floor(random() * 300)
    for (let c = 0; c < count; c += 1) {
      // Saltos de 0 ms forçam empates de horário, decididos pelo id.
      clock += Math.floor(random() * 3) * 500
      chunks.push({
        sessionId,
        source: 'stdout',
        kind: random() < 0.25 ? 'tool' : 'assistant',
        chunk: `pedaço ${c} da ${sessionId}`,
        id: id++,
        createdAt: random() < 0.02 ? 'data inválida' : new Date(clock).toISOString(),
      })
    }
    sessions.push({
      sessionId,
      parentThreadId,
      chunks,
      status: 'running',
      startedAt: new Date(1_800_000_000_000).toISOString(),
      updatedAt: new Date(clock).toISOString(),
      outputSize: 0,
      totalChunkCount: count,
      droppedChunkCount: 0,
      visibleChars: getVisibleChars(chunks),
      historyAvailable: true,
    })
  }
  return sessions
}

function summarize(sessions: TerminalOutputSession[]) {
  return sessions.map((session) => ({
    sessionId: session.sessionId,
    ids: session.chunks.map((chunk) => chunk.id),
    totalChunkCount: session.totalChunkCount,
    droppedChunkCount: session.droppedChunkCount,
    visibleChars: session.visibleChars,
  }))
}

describe('derivações do painel de logs do chat', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('mesclam e ordenam como a implementação anterior em 60 cenários aleatórios', () => {
    for (let seed = 1; seed <= 60; seed += 1) {
      const sessions = randomSessions(seed, 1 + (seed % 25))
      const visible = createVisibleSessions(sessions)
      expect(summarize(visible), `semente ${seed}`).toEqual(summarize(referenceVisibleSessions(sessions)))

      const actual = selectOrchestratorEntries(visible, 120)
      const expected = referenceOrchestratorEntries(visible, 120)
      expect(actual.dropped, `semente ${seed}`).toBe(expected.dropped)
      expect(actual.entries.map((entry) => entry.chunk.id), `semente ${seed}`).toEqual(
        expected.entries.map((entry) => entry.chunk.id),
      )
    }
  })

  it('reaproveitam a mescla de um pai cujos filhos não mudaram e refazem quando um filho muda', () => {
    const sessions = randomSessions(7, 12)
    const parentId = sessions.find((session) => session.parentThreadId)?.parentThreadId
    expect(parentId).toBeTruthy()

    const first = createVisibleSessions(sessions).find((session) => session.sessionId === parentId)
    // Flush de outra sessão: array novo, os objetos do pai e dos filhos são os mesmos.
    const again = createVisibleSessions([...sessions]).find((session) => session.sessionId === parentId)
    expect(again).toBe(first)

    const changed = sessions.map((session) =>
      session.parentThreadId === parentId ? { ...session, chunks: [...session.chunks] } : session,
    )
    const remerged = createVisibleSessions(changed).find((session) => session.sessionId === parentId)
    expect(remerged).not.toBe(first)
    expect(summarize([remerged!])).toEqual(summarize([first!]))
  })

  it('com o painel fechado, nenhuma sessão passa pela mescla nem pela ordenação', () => {
    const spy = vi.spyOn(panelSessions, 'createVisibleSessions')
    const sessions = randomSessions(3, 20)

    const markup = renderToStaticMarkup(
      createElement(TerminalPanel, { sessions, isOpen: false, onToggleOpen: () => {}, onClear: () => {} }),
    )

    expect(markup).toContain('Abrir logs da CLI')
    expect(spy.mock.calls.every(([argument]) => argument.length === 0)).toBe(true)
  })
})

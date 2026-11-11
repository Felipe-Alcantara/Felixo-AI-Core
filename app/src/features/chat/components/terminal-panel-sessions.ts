import type {
  TerminalOutputChunk,
  TerminalOutputSession,
  TerminalSessionStatus,
} from '../hooks/useTerminalOutput'
import {
  getVisibleChars,
  trimTerminalOutputChunks,
} from '../hooks/terminal-output-store'

// Mescla de cada pai com seus turnos do orquestrador, reaproveitada enquanto o pai e os filhos forem
// os mesmos objetos: um flush troca só a sessão que recebeu saída, e as outras mesclas não se refazem.
const mergeCache = new WeakMap<
  TerminalOutputSession,
  { children: TerminalOutputSession[]; merged: TerminalOutputSession }
>()

export function createVisibleSessions(sessions: TerminalOutputSession[]) {
  const sessionsById = new Map(
    sessions.map((session) => [session.sessionId, session]),
  )
  const hiddenSessionIds = new Set<string>()
  const childrenByParent = new Map<string, TerminalOutputSession[]>()

  for (const session of sessions) {
    if (
      !isOrchestratorTurnSession(session) ||
      !session.parentThreadId ||
      !sessionsById.has(session.parentThreadId)
    ) {
      continue
    }

    hiddenSessionIds.add(session.sessionId)
    const children = childrenByParent.get(session.parentThreadId) ?? []
    children.push(session)
    childrenByParent.set(session.parentThreadId, children)
  }

  const mergedSessions = new Map<string, TerminalOutputSession>()
  for (const [parentId, children] of childrenByParent) {
    mergedSessions.set(parentId, mergeChildren(sessionsById.get(parentId)!, children))
  }

  return sessions
    .filter((session) => !hiddenSessionIds.has(session.sessionId))
    .map((session) => mergedSessions.get(session.sessionId) ?? session)
    .sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    )
}

function mergeChildren(
  parent: TerminalOutputSession,
  children: TerminalOutputSession[],
) {
  const cached = mergeCache.get(parent)
  if (
    cached &&
    cached.children.length === children.length &&
    cached.children.every((child, index) => child === children[index])
  ) {
    return cached.merged
  }

  const merged = children.reduce(mergeTerminalSessions, cloneTerminalSession(parent))
  mergeCache.set(parent, { children, merged })
  return merged
}

/**
 * Ordena por horário e, no empate, por id. O horário é lido uma vez por item: o comparador antigo
 * criava dois `Date` a cada comparação, o que dominava o custo do painel com muitas sessões.
 */
function sortByCreatedAt<T>(items: T[], chunkOf: (item: T) => TerminalOutputChunk) {
  return items
    .map((item) => {
      const chunk = chunkOf(item)
      return { item, time: Date.parse(chunk.createdAt), id: chunk.id }
    })
    .sort((a, b) => a.time - b.time || a.id - b.id)
    .map(({ item }) => item)
}

function cloneTerminalSession(
  session: TerminalOutputSession,
): TerminalOutputSession {
  return {
    ...session,
    chunks: [...session.chunks],
    startMetadata: session.startMetadata
      ? { ...session.startMetadata }
      : undefined,
  }
}

function mergeTerminalSessions(
  parentSession: TerminalOutputSession,
  childSession: TerminalOutputSession,
): TerminalOutputSession {
  const chunks = trimTerminalOutputChunks(
    sortByCreatedAt([...parentSession.chunks, ...childSession.chunks], (chunk) => chunk),
  )
  const totalChunkCount =
    parentSession.totalChunkCount + childSession.totalChunkCount
  const startedAt =
    new Date(parentSession.startedAt).getTime() <=
    new Date(childSession.startedAt).getTime()
      ? parentSession.startedAt
      : childSession.startedAt
  const updatedAt =
    new Date(parentSession.updatedAt).getTime() >=
    new Date(childSession.updatedAt).getTime()
      ? parentSession.updatedAt
      : childSession.updatedAt

  return {
    ...parentSession,
    chunks,
    status: mergeSessionStatus(parentSession.status, childSession.status),
    startedAt,
    updatedAt,
    outputSize: parentSession.outputSize + childSession.outputSize,
    totalChunkCount,
    droppedChunkCount: Math.max(0, totalChunkCount - chunks.length),
    visibleChars: getVisibleChars(chunks),
    historyAvailable:
      parentSession.historyAvailable && childSession.historyAvailable,
    startMetadata: parentSession.startMetadata ?? childSession.startMetadata,
  }
}

function mergeSessionStatus(
  parentStatus: TerminalSessionStatus,
  childStatus: TerminalSessionStatus,
): TerminalSessionStatus {
  if (parentStatus === 'error' || childStatus === 'error') {
    return 'error'
  }

  if (parentStatus === 'running' || childStatus === 'running') {
    return 'running'
  }

  if (parentStatus === 'stopped' || childStatus === 'stopped') {
    return 'stopped'
  }

  return 'completed'
}

export function isOrchestratorTurnSession(session: TerminalOutputSession) {
  return session.sessionId.includes('orchestrator-turn')
}
export function selectOrchestratorEntries(
  sessions: TerminalOutputSession[],
  windowSize: number,
) {
  const all = sortByCreatedAt(
    sessions.flatMap((session) =>
      session.chunks
        .filter((chunk) => chunk.kind !== 'tool')
        .map((chunk) => ({
          chunk,
          sessionId: session.sessionId,
        })),
    ),
    (entry) => entry.chunk,
  )
  const entries = all.length <= windowSize ? all : all.slice(-windowSize)
  return { entries, dropped: all.length - entries.length }
}

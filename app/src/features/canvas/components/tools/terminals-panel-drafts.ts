/**
 * Draft messages are keyed by terminal node id (see `TerminalsPanel`'s
 * "enviar em massa" mode). A draft only counts as "pending" once it has real
 * content — an empty or whitespace-only field shouldn't count toward the
 * "Enviar para todos" badge nor get sent when that button fires.
 */
export type TerminalDrafts = Record<string, string>

/** Node ids with a non-empty draft, in insertion order. */
export function pendingDraftNodeIds(drafts: TerminalDrafts): string[] {
  return Object.entries(drafts)
    .filter(([, text]) => text.trim().length > 0)
    .map(([nodeId]) => nodeId)
}

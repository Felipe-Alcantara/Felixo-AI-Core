/**
 * Provenance attached to a prompt as it crosses the canvas/terminal boundary.
 *
 * `content` is the exact instruction body (apart from a terminal submission
 * suffix). It is deliberately kept separate from the human-facing `name`:
 * names help the canvas explain what was inserted, while the agent continues
 * to receive the prompt it would have received before this contract existed.
 */
export type PromptInsertionSource =
  | 'catalog'
  | 'skill'
  | 'manual'
  | 'file'
  | 'system'
  | 'handoff'
  | 'collaboration'
  | 'rename'
  | 'unknown'

/** The insertion record kept with a live terminal session. */
export type PromptInsertion = {
  /** Stable catalog/skill id when one exists; generated for free-form input. */
  id: string
  /** Optional human label. Manual prompts intentionally have no invented name. */
  name?: string
  /** Where the instruction originated, independent of its text. */
  source: PromptInsertionSource | (string & {})
  /** Prompt body, without the trailing CR/LF used to submit it. */
  content: string
  /** Names in the exact selection order; duplicates are meaningful. */
  combinedNames: string[]
  /** Whether the insertion asks the terminal to execute the body. */
  autoSubmit: boolean
  /** ISO timestamp assigned when the insertion enters the delivery pipeline. */
  timestamp: string
}

/** Safe form suitable for node persistence and display telemetry. */
export type PromptInsertionMetadata = Omit<PromptInsertion, 'content'>

export type PromptInsertionInput = {
  id?: string
  name?: string | null
  source?: PromptInsertionSource | (string & {}) | null
  content: string
  combinedNames?: readonly string[] | null
  autoSubmit?: boolean
  timestamp?: string | number | Date | null
}

const TRAILING_SUBMISSION = /(?:\r\n|\r|\n)+$/

/** Removes only terminal submission bytes; prompt whitespace remains intact. */
export function stripPromptSubmission(text: string): string {
  return String(text ?? '').replace(TRAILING_SUBMISSION, '')
}

/** True when a string carries an Enter intended to execute the prompt. */
export function promptRequestsSubmission(text: string): boolean {
  return /(?:\r\n|\r|\n)$/.test(String(text ?? ''))
}

function normalizeTimestamp(value: PromptInsertionInput['timestamp']): string {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value.toISOString()
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value).toISOString()
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = new Date(value)
    if (Number.isFinite(parsed.getTime())) return parsed.toISOString()
  }
  return new Date().toISOString()
}

function stableBodyId(source: string, content: string): string {
  // A small non-cryptographic fingerprint keeps legacy `sendText(text)` calls
  // identifiable without putting the prompt body in logs or persistence.
  let hash = 2166136261
  for (const char of `${source}\u0000${content}`) {
    hash ^= char.codePointAt(0) ?? 0
    hash = Math.imul(hash, 16777619)
  }
  return `${source || 'unknown'}-${(hash >>> 0).toString(16).padStart(8, '0')}`
}

function generatedManualId(timestamp: string): string {
  const uuid = globalThis.crypto?.randomUUID?.()
  const random = uuid?.slice(0, 8) ??
    Math.random().toString(36).slice(2, 10)
  return `manual-${timestamp.replace(/[^0-9]/g, '').slice(0, 17) || Date.now()}-${random}`
}

/**
 * Creates a normalized insertion record. This is the one boundary used by
 * catalog, skill, manual, file and startup deliveries, so file and inline
 * fallback paths retain identical provenance.
 */
export function createPromptInsertion(input: PromptInsertionInput): PromptInsertion {
  const content = stripPromptSubmission(input.content)
  const source = String(input.source ?? 'unknown').trim() || 'unknown'
  const timestamp = normalizeTimestamp(input.timestamp)
  const name = typeof input.name === 'string' && input.name.trim()
    ? input.name.trim()
    : undefined
  const combinedNames: string[] = []
  for (const value of input.combinedNames ?? (name ? [name] : [])) {
    const normalized = String(value ?? '').trim()
    if (normalized) combinedNames.push(normalized)
  }
  const id = String(input.id ?? '').trim() ||
    (source === 'manual' ? generatedManualId(timestamp) : stableBodyId(source, content))

  return {
    id,
    ...(name ? { name } : {}),
    source,
    content,
    combinedNames,
    autoSubmit: input.autoSubmit ?? promptRequestsSubmission(input.content),
    timestamp,
  }
}

export function createCatalogPromptInsertion(
  prompt: { id: string; name: string; prompt: string },
  content = prompt.prompt,
  options: Pick<PromptInsertionInput, 'autoSubmit' | 'timestamp'> = {},
): PromptInsertion {
  return createPromptInsertion({
    id: prompt.id,
    name: prompt.name,
    source: 'catalog',
    content,
    combinedNames: [prompt.name],
    ...options,
  })
}

export function createSkillPromptInsertion(
  skill: { id: string; name: string },
  content: string,
  options: Pick<PromptInsertionInput, 'autoSubmit' | 'timestamp'> = {},
): PromptInsertion {
  return createPromptInsertion({
    id: skill.id,
    name: skill.name,
    source: 'skill',
    content,
    combinedNames: [skill.name],
    ...options,
  })
}

/** Manual text carries its origin but no guessed label. */
export function createManualPromptInsertion(
  content: string,
  options: Pick<PromptInsertionInput, 'autoSubmit' | 'timestamp'> = {},
): PromptInsertion {
  return createPromptInsertion({
    source: 'manual',
    content,
    combinedNames: [],
    ...options,
  })
}

export function createFilePromptInsertion(
  fileName: string,
  content: string,
  options: Pick<PromptInsertionInput, 'autoSubmit' | 'timestamp'> = {},
): PromptInsertion {
  const name = String(fileName ?? '').trim()
  return createPromptInsertion({
    id: `file:${name}`,
    ...(name ? { name } : {}),
    source: 'file',
    content,
    combinedNames: name ? [name] : [],
    ...options,
  })
}

/** Drops the prompt body before a node or event is serialized. */
export function toPromptInsertionMetadata(
  insertion: PromptInsertion,
): PromptInsertionMetadata {
  const metadata = Object.fromEntries(
    Object.entries(insertion).filter(([key]) => key !== 'content'),
  ) as PromptInsertionMetadata
  return {
    ...metadata,
    combinedNames: [...metadata.combinedNames],
  }
}

/** Accepts legacy/string callers while keeping the explicit object contract. */
export function isPromptInsertion(value: unknown): value is PromptInsertion {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<PromptInsertion>
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.source === 'string' &&
    typeof candidate.content === 'string' &&
    Array.isArray(candidate.combinedNames) &&
    typeof candidate.autoSubmit === 'boolean' &&
    typeof candidate.timestamp === 'string'
  )
}

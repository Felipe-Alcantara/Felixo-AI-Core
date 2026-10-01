/**
 * Como cada CLI desenha a conversa no terminal.
 *
 * Só ganha perfil a CLI cuja tela foi gravada e virou fixture
 * (`__fixtures__/terminal-output`): as marcas e o rodapé abaixo vêm dessas
 * gravações, não de suposição. Qualquer outro programa — inclusive o Gemini,
 * que não respondeu na gravação (o Google recusou a conta pessoal no Gemini
 * CLI 0.62.0) — usa o perfil `texto`: a Leitura mostra a saída como veio, sem
 * reconstruir Markdown.
 */
import type { ReadingLine } from './reading-lines'

export type ReadingProfileId = 'claude' | 'codex' | 'texto'

export type ReadingProfile = {
  id: ReadingProfileId
  /** Glifos, na coluna 0, que abrem a fala da pessoa. */
  userMarkers: readonly string[]
  /** Glifos, na coluna 0, que abrem uma fala do agente (texto ou ferramenta). */
  agentMarkers: readonly string[]
  /** Glifos, na coluna 0, de um aviso da CLI (erro, interrupção). */
  noticeMarkers: readonly string[]
  /** Linha de status que a CLI redesenha (spinner, tempo, tokens): não é conversa. */
  isStatusLine(line: ReadingLine): boolean
}

/** Cinzas que Claude e Codex usam no rodapé, no status e nas bordas. */
const MUTED_COLORS = new Set(['#999999', '#888888', '#808080', '#505050', 'p8', 'p242', 'p244', 'p245', 'p246'])

/** A linha só tem texto apagado (cinza ou `dim`), e tem letra ou número. */
export function isMutedTextLine(line: ReadingLine): boolean {
  const visible = line.segments.filter((segment) => segment.text.trim() !== '')
  if (visible.length === 0 || !/[\p{L}\p{N}]/u.test(line.text)) return false
  return visible.every((segment) => segment.dim || (segment.fg !== null && MUTED_COLORS.has(segment.fg)))
}

/**
 * Texto apagado alinhado à direita ("57107 tokens", "Fast mode disabled"): o
 * status do Claude. Linha apagada à esquerda pode ser conversa (o
 * "⎿ Interrupted" de um cancelamento), então fica.
 */
const RIGHT_ALIGNED_INDENT = 16

/** Hora com que o Codex fecha uma resposta ("9:35 AM"). */
const CODEX_TIMESTAMP = /^\s*\d{1,2}:\d{2}(?:\s?[AP]M)?\s*$/

/** Quadro do spinner do Claude seguido do verbo do momento ("✻ Churned for 4s"). */
const CLAUDE_SPINNER = /^[✻✶✳✢✽·*] \S/

/** Contador do Codex enquanto trabalha: "• Working (11s • esc to interrupt)". */
const CODEX_WORKING = /\(\d+[hms][^)]*esc to interrupt\)/

export const READING_PROFILES: Record<ReadingProfileId, ReadingProfile> = {
  claude: {
    id: 'claude',
    userMarkers: ['❯'],
    agentMarkers: ['●'],
    noticeMarkers: [],
    isStatusLine: (line) =>
      CLAUDE_SPINNER.test(line.text) ||
      (line.text.startsWith(' '.repeat(RIGHT_ALIGNED_INDENT)) && isMutedTextLine(line)),
  },
  codex: {
    id: 'codex',
    userMarkers: ['›'],
    agentMarkers: ['•'],
    noticeMarkers: ['■'],
    isStatusLine: (line) => CODEX_WORKING.test(line.text) || (CODEX_TIMESTAMP.test(line.text) && isMutedTextLine(line)),
  },
  texto: {
    id: 'texto',
    userMarkers: [],
    agentMarkers: [],
    noticeMarkers: [],
    isStatusLine: () => false,
  },
}

/**
 * O perfil do bloco pelo provedor ou, sem ele, pelo nome do programa
 * (`/usr/bin/claude`, `codex.cmd`).
 */
export function readingProfileFor(providerId: string | undefined, command: string | undefined): ReadingProfile {
  const program = (providerId || command?.split(/[\\/]/).pop()?.replace(/\.(?:cmd|exe|ps1)$/i, '') || '').toLowerCase()
  if (program === 'claude') return READING_PROFILES.claude
  if (program === 'codex') return READING_PROFILES.codex
  return READING_PROFILES.texto
}

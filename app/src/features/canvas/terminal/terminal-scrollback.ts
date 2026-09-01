/**
 * Política do buffer visual do xterm.
 *
 * O buffer do xterm é diferente do histórico do shell e do replay em memória
 * que o processo principal guarda para uma nova janela do renderer. Os
 * limites ficam deliberadamente centralizados para que a bancada de múltiplos
 * PTYs e os testes possam verificar o contrato sem duplicar literais escondidos
 * no `TerminalSessionStore`.
 */
export const TERMINAL_SCROLLBACK = 20_000
export const TERMINAL_ADAPTIVE_SCROLLBACK = 5_000
export const TERMINAL_ADAPTIVE_THRESHOLD = 10
export const TERMINAL_REPLAY_BUFFER_CHARS = 200_000

export type TerminalScrollbackPolicy = 'adaptive' | 'full'

/**
 * A sessão escolhe o limite uma única vez, na criação.
 *
 * Não redimensionamos terminais já vivos quando o décimo bloco aparece:
 * `xterm.options.scrollback` pode descartar as linhas antigas imediatamente.
 * O CanvasView fornece o total de terminais persistidos, então um canvas que
 * já abre com 10+ sessões aplica a política compacta a todas elas, enquanto
 * uma sessão antiga continua com o contrato que tinha ao nascer.
 */
export function terminalScrollbackForSessionCount(
  sessionCount: number,
  policy: TerminalScrollbackPolicy = 'adaptive',
): number {
  const count = Number.isFinite(sessionCount) ? Math.max(0, Math.floor(sessionCount)) : 0
  return policy === 'adaptive' && count >= TERMINAL_ADAPTIVE_THRESHOLD
    ? TERMINAL_ADAPTIVE_SCROLLBACK
    : TERMINAL_SCROLLBACK
}

export type TerminalScrollbackStatus = {
  /** Visual rows xterm keeps in its active buffer. */
  retainedRows: number
  /** Logical line feeds received by this session. */
  outputLines: number
  /** The configured visual limit for this xterm instance. */
  limit: number
  /** True once older output no longer fits in the visual buffer. */
  historyTruncated: boolean
  /** Replay kept by the main process for a renderer reattach. */
  replayLimitChars: number
}

export function formatTerminalScrollbackLines(value: number): string {
  return Math.max(0, Math.floor(value)).toLocaleString('pt-BR')
}

/**
 * Text shown beside a terminal after its visual history rolls over. It names
 * the actual recovery path and makes the distinction from the live PTY replay
 * explicit: re-open to reapply the process replay; Copy/Handoff only see the
 * visible xterm buffer.
 */
export function terminalScrollbackNotice(
  status: TerminalScrollbackStatus | undefined,
): string | undefined {
  if (!status?.historyTruncated) return undefined

  return `Histórico visual limitado a ${formatTerminalScrollbackLines(status.limit)} linhas. Feche e reabra o terminal para reaplicar o replay vivo (até ${formatTerminalScrollbackLines(status.replayLimitChars)} caracteres); Copiar e Handoff usam o trecho visual atual.`
}

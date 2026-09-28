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
  performanceMode = false,
): number {
  if (performanceMode) {
    return TERMINAL_ADAPTIVE_SCROLLBACK
  }
  const count = Number.isFinite(sessionCount) ? Math.max(0, Math.floor(sessionCount)) : 0
  return policy === 'adaptive' && count >= TERMINAL_ADAPTIVE_THRESHOLD
    ? TERMINAL_ADAPTIVE_SCROLLBACK
    : TERMINAL_SCROLLBACK
}

/**
 * Fração da capacidade do histórico visual a partir da qual o terminal avisa
 * que está perto de descartar linhas — o aviso tem de vir ANTES do descarte,
 * enquanto ainda dá para copiar ou passar a sessão adiante.
 */
export const TERMINAL_SCROLLBACK_WARNING_RATIO = 0.8

export type TerminalScrollbackStatus = {
  /** Linhas visuais (com quebras de largura) no buffer normal do xterm. */
  retainedRows: number
  /** Logical line feeds received by this session. */
  outputLines: number
  /** The configured visual limit for this xterm instance. */
  limit: number
  /**
   * O buffer normal chegou à capacidade (linhas visíveis + scrollback): a
   * partir daqui cada linha nova tira a mais antiga da tela.
   */
  historyTruncated: boolean
  /** Passou de TERMINAL_SCROLLBACK_WARNING_RATIO da capacidade, sem chegar nela. */
  nearLimit: boolean
  /** Replay kept by the main process for a renderer reattach. */
  replayLimitChars: number
}

/**
 * Onde o histórico visual está em relação à capacidade real do xterm.
 *
 * Conta linhas VISUAIS do buffer normal, que é o que o xterm descarta: uma
 * linha lógica de 120 caracteres num terminal de 80 colunas ocupa duas. A
 * contagem anterior (quebras `\n` recebidas) errava nos dois sentidos —
 * linhas quebradas sumiam sem aviso, e a saída de um app na tela alternativa
 * (o Claude Code, por padrão), que nunca entra no histórico, acendia um aviso
 * falso. A capacidade é `rows + limit`: com o scrollback cheio, as linhas da
 * própria tela ainda cabem.
 */
export function describeTerminalScrollbackUsage(input: {
  retainedRows: number
  rows: number
  limit: number
}): { historyTruncated: boolean; nearLimit: boolean } {
  const limit = Math.max(0, Math.floor(Number(input.limit) || 0))
  if (limit === 0) {
    return { historyTruncated: false, nearLimit: false }
  }

  const retainedRows = Math.max(0, Math.floor(Number(input.retainedRows) || 0))
  const capacity = Math.max(0, Math.floor(Number(input.rows) || 0)) + limit
  const historyTruncated = retainedRows >= capacity
  return {
    historyTruncated,
    nearLimit: !historyTruncated && retainedRows >= Math.ceil(capacity * TERMINAL_SCROLLBACK_WARNING_RATIO),
  }
}

export function formatTerminalScrollbackLines(value: number): string {
  return Math.max(0, Math.floor(value)).toLocaleString('pt-BR')
}

/**
 * Texto ao lado do terminal quando o histórico visual está perto do limite ou
 * já chegou nele.
 *
 * Não promete recuperação que não existe: o replay que o processo principal
 * guarda (200.000 caracteres, cerca de 1.700 linhas de 120 colunas) só é
 * reaplicado quando o renderer se reconecta, e é MENOR que o histórico visual —
 * reabrir a gaveta não reaplica nada e fechar o bloco encerra o processo. O
 * que a pessoa pode fazer é agir antes: copiar ou passar a sessão adiante
 * enquanto o começo ainda está na tela.
 */
export function terminalScrollbackNotice(
  status: TerminalScrollbackStatus | undefined,
): string | undefined {
  if (!status) return undefined
  const limit = formatTerminalScrollbackLines(status.limit)

  if (status.historyTruncated) {
    return `Histórico visual no limite de ${limit} linhas: as linhas mais antigas estão saindo da tela e o app não consegue trazê-las de volta. Copiar e Handoff levam só o que ainda está no terminal.`
  }

  if (status.nearLimit) {
    return `Histórico visual perto do limite de ${limit} linhas. Ao chegar nele, as linhas mais antigas saem da tela e o app não consegue trazê-las de volta; se precisar do começo desta sessão, copie ou faça o Handoff antes.`
  }

  return undefined
}

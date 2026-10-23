/**
 * "Rolagem do terminal no Claude Code". O Claude Code entra no alternate screen
 * (`ESC[?1049h`) já no boot, e o xterm.js não guarda scrollback nele — por isso
 * não há barra de rolagem. `CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN=1` (confirmada
 * no binário da CLI: "forces the classic renderer") mantém a saída no buffer
 * normal, com rolagem. Vale para terminais NOVOS; um já aberto não muda.
 *
 * O preço, medido em 23/10/2026 com o Claude Code 2.1.309: na tela clássica ele
 * não liga o mouse tracking (nem `?1049` nem `?1000/1002/1003/1006`), então
 * nenhuma opção da interface dele responde a clique, e a roda do mouse não chega
 * a ele. Sem a variável, ele liga a tela alternativa e o mouse. Por isso o
 * padrão é desligado: a pessoa liga a rolagem sabendo que troca o mouse dentro
 * do Claude por barra de rolagem e histórico na Leitura.
 */

const STORAGE_KEY = 'felixo-ai-core.claude-terminal-scroll'

/**
 * Desligado por padrão: sem escolha salva, os terminais do Claude abrem no modo
 * dele (tela cheia, com mouse). Só um `on` gravado pela pessoa liga a rolagem.
 */
export function parseClaudeTerminalScroll(stored: string | null): boolean {
  return stored === 'on'
}

export function loadClaudeTerminalScroll(): boolean {
  try {
    return parseClaudeTerminalScroll(window.localStorage.getItem(STORAGE_KEY))
  } catch {
    return parseClaudeTerminalScroll(null)
  }
}

export function saveClaudeTerminalScroll(enabled: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off')
  } catch {
    // Sem armazenamento a escolha vale só até fechar o app.
  }
}

/** O comando é o Claude Code? (o interruptor só existe nele) */
export function isClaudeCommand(command: string | undefined): boolean {
  if (!command) return false
  const name = command.replace(/\\/g, '/').split('/').pop() ?? ''
  return /^claude(\.exe|\.cmd)?$/i.test(name)
}

/** Vale pedir a tela clássica para este spawn? */
export function shouldUseClassicScreen(command: string | undefined, enabled: boolean): boolean {
  return enabled && isClaudeCommand(command)
}

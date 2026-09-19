/**
 * "Rolagem do terminal no Claude Code". O Claude Code entra no alternate screen
 * (`ESC[?1049h`) já no boot, e o xterm.js não guarda scrollback nele — por isso
 * não há barra de rolagem. `CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN=1` (confirmada
 * no binário da CLI: "forces the classic renderer") mantém a saída no buffer
 * normal, com rolagem. Vale para terminais NOVOS; um já aberto não muda.
 */

const STORAGE_KEY = 'felixo-ai-core.claude-terminal-scroll'

export function loadClaudeTerminalScroll(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'on'
  } catch {
    return false
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

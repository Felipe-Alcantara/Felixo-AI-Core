/**
 * Política do buffer visual do xterm.
 *
 * O buffer do xterm é diferente do histórico persistido do shell e do replay
 * que o processo principal guarda para uma nova janela do renderer. O valor é
 * deliberadamente centralizado para que a bancada de múltiplos PTYs e os
 * testes possam verificar o contrato sem duplicar um literal escondido no
 * `TerminalSessionStore`.
 */
export const TERMINAL_SCROLLBACK = 20_000

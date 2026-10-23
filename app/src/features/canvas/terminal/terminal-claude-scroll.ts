/**
 * O trilho de rolagem do app para o Claude Code em tela cheia.
 *
 * Em tela cheia o Claude liga a tela alternativa e o mouse (`?1049` e `?1000` a
 * `?1006`). O xterm não guarda histórico na tela alternativa, então não há barra
 * de rolagem do app, e é o próprio Claude que rola a conversa com a roda do
 * mouse e a mantém no fim. Ele também não diz ao terminal onde a rolagem está:
 * só oferece teclas e desenha um aviso na tela quando a conversa está rolada
 * para cima. Este módulo guarda as duas pontas, longe do DOM e do PTY, para
 * poderem ser testadas direto — mesmo molde de `terminal-mouse-selection.ts`.
 *
 * Medido em 23/10/2026 com o Claude Code 2.1.309 e a linha de entrada em foco:
 * PageUp e PageDown rolam meia página (15 linhas numa tela de 36) e Ctrl+End
 * volta ao fim. No modo clássico (`CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN=1`) o
 * Claude ignora até um clique enviado ao PTY; lá o xterm já tem a barra, e o
 * trilho não aparece.
 */

/** As teclas, como o xterm as manda ao PTY. */
export const CLAUDE_SCROLL_KEYS = {
  pageUp: '\u001b[5~',
  pageDown: '\u001b[6~',
  bottom: '\u001b[1;5F',
} as const

export type ClaudeScrollAction = keyof typeof CLAUDE_SCROLL_KEYS

export type ClaudeScrollRailState = {
  /** O trilho existe para esta sessão agora. */
  visible: boolean
  /** A conversa está rolada para cima: o Claude está mostrando o aviso de "ir para o fim". */
  scrolledUp: boolean
}

/** Sem trilho. Sempre o mesmo objeto, para o estado do React não mudar à toa. */
export const HIDDEN_CLAUDE_SCROLL_RAIL: ClaudeScrollRailState = Object.freeze({
  visible: false,
  scrolledUp: false,
})

const SCROLLED_UP_LABEL = '(?:Jump to bottom|\\d+ new messages?)'

/**
 * O aviso que o Claude desenha perto do fim da tela enquanto a conversa está
 * rolada para cima: "Jump to bottom (ctrl+End) ↓", a mesma frase com "(click)",
 * "N new message(s)" quando chegou coisa nova, e "…: fn+↓ to scroll" no macOS.
 * Exige a seta ou o "to scroll": o texto que só cita a expressão não conta.
 *
 * shortcut: uma conversa que escreva o aviso inteiro acende o trilho à toa, e
 * uma versão do Claude que mude a frase deixa o trilho sem acender; trocar a
 * expressão aqui quando isso acontecer (o botão de ir ao fim segue funcionando).
 */
const SCROLLED_UP_NOTICE = new RegExp(
  `${SCROLLED_UP_LABEL}(?:\\s*\\([^)]*\\))?\\s*↓|${SCROLLED_UP_LABEL}:\\s*[^\\n]{1,24}\\s+to scroll`,
)

/** A tela visível (várias linhas num texto só) mostra o aviso de conversa rolada para cima? */
export function isClaudeScrolledUp(viewport: string): boolean {
  return SCROLLED_UP_NOTICE.test(viewport)
}

/**
 * O trilho só faz sentido onde o xterm não tem barra e o Claude é quem rola:
 * Claude vivo na tela alternativa. Em outra CLI as teclas poderiam significar
 * outra coisa.
 */
export function shouldShowClaudeScrollRail(state: {
  isClaude: boolean
  alternateScreen: boolean
  alive: boolean
}): boolean {
  return state.isClaude && state.alternateScreen && state.alive
}

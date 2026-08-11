/**
 * Reconhecimento do que a tela de uma CLI de agente está mostrando: ocupada,
 * esperando uma decisão, pedindo confiança na pasta, pronta para receber texto.
 *
 * São heurísticas sobre texto renderizado — deliberadamente tolerantes, porque
 * cada CLI desenha do seu jeito e o formato muda entre versões. Isolado do
 * store para poder ser testado sem PTY, já que decide se um agente aparece
 * como trabalhando ou parado.
 */

/** Sequências de escape ANSI, que o texto renderizado ainda pode conter. */
// eslint-disable-next-line no-control-regex
const ANSI_ESCAPE = /\x1b\[[0-9;?]*[ -/]*[@-~]/g

/** Cursor de seleção ao lado de uma opção sim/não, ex.: "❯ 1. Yes". */
const APPROVAL_OPTION_LINE =
  /[❯>●]\s*\d*\.?\s*(yes|no|sim|não|allow|deny|approve|aprovar|negar)\b/i

/** Menu numerado, a forma geral que as CLIs usam para decisões. */
const NUMBERED_OPTION_LIST = /^\s*\d\.\s+\S/m

/** Frases que pedem confirmação de uma pessoa. */
const CONFIRMATION_PHRASE =
  /\b(proceed\?|continue\?|approve|aprovar|continuar\?|prosseguir\?|do you want to|would you like to|deseja)\b/i

/**
 * Faixa persistente de "ainda trabalhando", ex.: "Working (7s • esc to
 * interrupt)".
 *
 * Os dígitos são removidos por ELAPSED_TIMER antes da comparação de assinatura
 * usada para decidir ocioso vs. ocupado; sem esta checagem direta contra a
 * tela, uma CLI parada nessa faixa (só o contador correndo, sem linhas novas)
 * seria lida como "nada mudou" e apareceria como ociosa enquanto ainda trabalha.
 */
const BUSY_INDICATOR =
  /\b(working|aguardando|thinking|pensando|running|executando|processing|processando)\b.*(esc to interrupt|interrupt)|esc to interrupt/i

/** Remove ANSI e colapsa espaços, para comparação de texto renderizado. */
export function cleanPrompt(text: string): string {
  return text.replace(ANSI_ESCAPE, '').replace(/\s+/g, ' ').trim()
}

/** Verdadeiro enquanto a CLI mostra sua faixa de "trabalhando". */
export function isBusyScreen(viewport: string): boolean {
  return BUSY_INDICATOR.test(viewport)
}

/**
 * Detecção genérica de uma tela de decisão parada no buffer (aprovação de
 * ferramenta, confirmação de plano, pergunta de esclarecimento).
 *
 * Vale para qualquer CLI, ao contrário de `isCodexTrustPrompt`, que trata um
 * diálogo específico. Essas telas aparecem mesmo sob flags de aprovação
 * automática, já que não são checagens de permissão de ferramenta.
 */
export function looksLikeApprovalPrompt(text: string): boolean {
  return (
    APPROVAL_OPTION_LINE.test(text) ||
    (NUMBERED_OPTION_LIST.test(text) && CONFIRMATION_PHRASE.test(text))
  )
}

/** Composer vazio do Codex: a entrada interativa está pronta. */
export function hasCodexInteractivePrompt(viewport: string): boolean {
  return viewport.split('\n').some((line) => /^\s*›\s*$/.test(line))
}

/** Diálogo do Codex que pergunta se a pasta é confiável. */
export function isCodexTrustPrompt(text: string): boolean {
  const compact = text
    .replace(ANSI_ESCAPE, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')

  return (
    compact.includes('doyoutrustthecontentsofthisdirectory') ||
    (compact.includes('trust') &&
      compact.includes('untrustedcontents') &&
      compact.includes('yescontinue'))
  )
}

/**
 * Diálogo do Claude Code que pergunta se a pasta é confiável — aparece toda
 * vez que `--dangerously-skip-permissions` sobe um processo novo. Tolerante à
 * redação exata (varia entre versões da CLI) do mesmo jeito que
 * `isCodexTrustPrompt`.
 */
export function isClaudeTrustPrompt(text: string): boolean {
  const compact = text
    .replace(ANSI_ESCAPE, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')

  return (
    compact.includes('doyoutrustthefilesinthisfolder') ||
    (compact.includes('trust') &&
      compact.includes('thisfolder') &&
      (compact.includes('yesproceed') || compact.includes('yesiaccept')))
  )
}

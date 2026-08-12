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

/**
 * Só as letras e os números do texto, em minúsculas.
 *
 * É assim que reconhecemos a redação de uma tela sem depender de pontuação,
 * espaçamento ou de onde o TUI quebrou a linha — os três mudam entre versões da
 * CLI e entre larguras de terminal, a frase em si muda muito menos.
 */
function compactWords(text: string): string {
  return text.replace(ANSI_ESCAPE, '').toLowerCase().replace(/[^a-z0-9]+/g, '')
}

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

/**
 * Linha de entrada de uma CLI de tela cheia: o marcador e o que já está escrito
 * depois dele. O prefixo opcional cobre a borda da caixa que essas CLIs
 * desenham em volta da entrada (`│ ❯ texto`).
 */
const CLAUDE_INPUT_LINE = /^[\s│┃|]*[❯>]\s*(.*)$/
const CODEX_INPUT_LINE = /^[\s│┃|]*›\s*(.*)$/

/** Item de menu numerado (`1. No, exit`): a tela é uma decisão, não a entrada. */
const MENU_ITEM = /^\d+[.)]\s/

/** Sugestão que o Claude desenha quando a entrada está vazia: `Try "..."`. */
const CLAUDE_INPUT_SUGGESTION = /^try\b[^"'“]*["'“]/i

/** Cursor de bloco desenhado ao fim do texto, que não é conteúdo digitado. */
const INPUT_CURSOR = /[█▏▎▍▌▋▊▉]+\s*$/

/** O que está escrito em cada linha de entrada visível na tela. */
function readInputLines(viewport: string, marker: RegExp): string[] {
  return viewport
    .replace(ANSI_ESCAPE, '')
    .split('\n')
    .map((line) => marker.exec(line))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => match[1].replace(INPUT_CURSOR, '').trim())
}

/**
 * O composer do Codex já está de pé — ou seja, é ele que vai receber o que
 * escrevermos.
 *
 * A pergunta é se o composer existe, e não se ele está vazio: o Codex desenha
 * uma sugestão apagada dentro do composer vazio ("Summarize recent commits",
 * "Explain this codebase", …), sorteada de uma lista que muda entre versões.
 * Exigir a linha vazia era exigir uma tela que a CLI nunca mostra — a prontidão
 * nunca era reconhecida e o contexto só saía no fim da espera de emergência,
 * que é o "Codex demora muito pra receber os prompts".
 *
 * Item de menu numerado não conta: a tela de confiança na pasta usa o mesmo
 * marcador (`› 1. Yes, continue`) e é uma decisão, não a entrada.
 */
export function hasCodexInteractivePrompt(viewport: string): boolean {
  return readInputLines(viewport, CODEX_INPUT_LINE).some(
    (content) => !MENU_ITEM.test(content),
  )
}

/**
 * O composer do Codex está literalmente vazio.
 *
 * Com a sugestão apagada na tela não dá para separar, só pelo texto renderizado,
 * a dica da CLI do que alguém digitou — então a resposta é "não está vazio", e
 * quem confere a entrega deixa a linha em paz. Reescrever por cima de texto que
 * pode ser do usuário é pior do que não reescrever.
 */
export function hasEmptyCodexInput(viewport: string): boolean {
  return readInputLines(viewport, CODEX_INPUT_LINE).some((content) => content === '')
}

/**
 * A entrada do Claude Code já existe na tela — ou seja, o REPL subiu e é ele
 * que vai receber o que escrevermos.
 *
 * O equivalente do `hasCodexInteractivePrompt` para o Claude, que não tinha
 * nenhum: sem essa checagem, "processo pronto" era só "a tela está quieta", e a
 * tela fica quieta enquanto a CLI ainda está inicializando ou enquanto mostra o
 * aviso do modo yolo — daí o texto de contexto ser escrito onde ninguém lê.
 *
 * A pergunta aqui é só se o REPL está de pé, e não se a entrada está vazia:
 * quanto menos suposição sobre a redação da tela, menos chance de esperar para
 * sempre por um formato que mudou de versão. Menu numerado não conta, porque aí
 * a tela é um diálogo de decisão, não a entrada.
 */
export function hasClaudeInteractivePrompt(viewport: string): boolean {
  return readInputLines(viewport, CLAUDE_INPUT_LINE).some(
    (content) => !MENU_ITEM.test(content),
  )
}

/**
 * A entrada do Claude Code está vazia: nada foi digitado nela, ou o que aparece
 * é a sugestão que a própria CLI desenha no lugar do texto.
 *
 * Serve para conferir se o texto de contexto chegou. Se a redação da sugestão
 * mudar, a resposta vira "não está vazia" — a conferência deixa de reescrever o
 * contexto, que é o comportamento antigo, em vez de reescrever em cima do que o
 * usuário digitou.
 */
export function hasEmptyClaudeInput(viewport: string): boolean {
  return readInputLines(viewport, CLAUDE_INPUT_LINE).some(
    (content) => content === '' || CLAUDE_INPUT_SUGGESTION.test(content),
  )
}

/**
 * O que a linha de entrada de uma CLI está mostrando agora.
 *
 * - `ready`: aceita texto escrito programaticamente.
 * - `visible`: está na tela, com ou sem texto nela.
 * - `empty`: está na tela e ninguém escreveu nela.
 *
 * As três são perguntas diferentes e cada uma decide uma coisa: quando escrever
 * o texto inicial, se ainda vale esperar, e se o texto chegou.
 */
export type InputLineState = {
  ready: boolean
  visible: boolean
  empty: boolean
}

/**
 * Como cada CLI desenha a própria entrada.
 *
 * Tabela em vez de encadeamento de `if` no store: é aqui que mora o
 * conhecimento sobre telas, e é aqui que uma CLI nova entra — sem espalhar
 * `command === '...'` por quem só quer saber se pode escrever.
 */
const INPUT_LINE_READERS: Record<string, (viewport: string) => InputLineState> = {
  claude: (viewport) => {
    const visible = hasClaudeInteractivePrompt(viewport)

    return { ready: visible, visible, empty: visible && hasEmptyClaudeInput(viewport) }
  },
  codex: (viewport) => {
    // Mesma leitura do Claude: o composer de pé é o sinal de prontidão. A
    // sugestão que o Codex desenha dentro do composer vazio não é texto de
    // ninguém, e esperar a linha vazia era esperar para sempre.
    const visible = hasCodexInteractivePrompt(viewport)

    return { ready: visible, visible, empty: visible && hasEmptyCodexInput(viewport) }
  },
}

/**
 * Lê a linha de entrada da CLI de um comando. `undefined` quando não sabemos
 * reconhecer a entrada dessa CLI — a resposta honesta é "não sei", e não "está
 * pronta", para quem chama decidir o que fazer com a dúvida.
 */
export function readInputLineState(
  command: string | undefined,
  viewport: string,
): InputLineState | undefined {
  return command ? INPUT_LINE_READERS[command]?.(viewport) : undefined
}

/** Diálogo do Codex que pergunta se a pasta é confiável. */
export function isCodexTrustPrompt(text: string): boolean {
  const compact = compactWords(text)

  return (
    compact.includes('doyoutrustthecontentsofthisdirectory') ||
    (compact.includes('trust') &&
      compact.includes('untrustedcontents') &&
      compact.includes('yescontinue'))
  )
}

/**
 * Aviso que o Claude Code mostra em todo processo novo aberto com
 * `--dangerously-skip-permissions`, antes de qualquer coisa:
 *
 *     WARNING: Claude Code running in Bypass Permissions mode
 *     ...
 *     ❯ 1. No, exit
 *       2. Yes, I accept
 *
 * Não é a tela de confiança na pasta ("Do you trust the files in this
 * folder?"): essa o modo yolo pula justamente porque já dispensa aprovação.
 * Confundir as duas foi o que fez o texto de contexto ser digitado dentro deste
 * aviso — a opção selecionada aqui é "No, exit", então quem aceita precisa
 * mover a seleção antes de confirmar.
 */
export function isClaudeBypassPermissionsWarning(text: string): boolean {
  const compact = compactWords(text)

  return compact.includes('bypasspermissionsmode') && compact.includes('yesiaccept')
}

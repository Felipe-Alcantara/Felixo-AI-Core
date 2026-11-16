/**
 * O que o terminal destaca como URL em texto plano: o `urlRegex` do
 * `WebLinksAddon` e o padrão do `terminal-spanning-url-links.ts`, a mesma
 * definição nos dois caminhos.
 *
 * A regex padrão do addon (0.12) cortava `…/Rust_(programming_language)` em
 * `Rust_` e não via `Https://`: o clique levava a um destino diferente do que a
 * pessoa lia. Aqui:
 * - o esquema não diferencia caixa (flag `i`);
 * - `( )` e `[ ]` entram só em par (Wikipedia, IPv6), um nível; o resto de
 *   parênteses, chaves e colchetes de qualquer escrita (`\p{Ps}`/`\p{Pe}`),
 *   aspas ASCII e tipográficas (`\p{Pi}`/`\p{Pf}`), crase, `<>`, `\`, `^` e
 *   `|` encerram a URL;
 * - a pontuação que fecha a frase (`.,:;!?*`, `…` e as de largura cheia) não
 *   fica no fim do link;
 * - uma URL com usuário na autoridade (`https://google.com@evil.example`) ou
 *   com caractere invisível/de controle não é destacada: o portão
 *   (`isAllowedTerminalExternalLink`) a recusaria, e destacar só o pedaço antes
 *   do caractere abriria outro host.
 *
 * Sem backtracking catastrófico: cada caractere entra por um caminho só (o
 * comum não é `(` nem `[`, e o grupo não aceita parêntese dentro), e o fim só
 * devolve a pontuação final. Os dois lookaheads param no primeiro `/ ? # @`
 * ou invisível. Medido numa linha de 10 mil caracteres no teste.
 *
 * O `isUrl` do addon ainda compara o texto com o host em punycode: um host
 * IDN (`https://münchen.de`) não é destacado. Unicode no caminho é.
 *
 * Montada a partir do `.source` de literais (sem escapes `\u`/`\x`, que
 * editores e ferramentas convertem em caractere literal).
 */

/** Caractere comum de URL: tudo, menos o que encerra a URL. */
const PLAIN = /[^\s"'`<>\\^|\p{Ps}\p{Pe}\p{Pi}\p{Pf}\p{Cc}\p{Cf}\p{Default_Ignorable_Code_Point}]/u.source
/** O último caractere: o comum, menos a pontuação que fecha a frase. */
const LAST =
  /[^\s"'`<>\\^|\p{Ps}\p{Pe}\p{Pi}\p{Pf}\p{Cc}\p{Cf}\p{Default_Ignorable_Code_Point}.,:;!?*…。、，！？：；]/u.source
const PAREN_GROUP = String.raw`\(${PLAIN}*\)`
const BRACKET_GROUP = String.raw`\[${PLAIN}*\]`
/** Sem `@` na autoridade (usuário e senha), que vai até o primeiro `/ ? #`. */
const NO_USERINFO = String.raw`(?![^\s/?#@]*@)`
/** Sem controle nem invisível até o próximo espaço. */
const HIDDEN = /[\p{Cc}\p{Cf}\p{Default_Ignorable_Code_Point}]/u.source
const NO_HIDDEN = String.raw`(?![^\s\p{Cc}\p{Cf}\p{Default_Ignorable_Code_Point}]*${HIDDEN})`

/**
 * Sem `g`: o addon acrescenta a flag a uma cópia; quem percorre o texto usa
 * `new RegExp(TERMINAL_URL_REGEX.source, 'giu')`.
 */
export const TERMINAL_URL_REGEX = new RegExp(
  String.raw`https?:\/\/${NO_USERINFO}${NO_HIDDEN}(?:${PLAIN}|${PAREN_GROUP}|${BRACKET_GROUP})*(?:${LAST}|${PAREN_GROUP}|${BRACKET_GROUP})`,
  'iu',
)

/**
 * Caminhos absolutos citados nos textos que o app entrega ao agente.
 *
 * Todo caminho sai entre aspas duplas. Um caminho com espaço ("C:\Users\Ana
 * Maria\…", "/home/ana/Meus projetos/…") colado sem aspas vira dois
 * argumentos quando o agente o copia para um comando, e o fim da frase (um
 * ponto, uma vírgula) passava a parecer parte do nome. As aspas marcam onde o
 * caminho começa e termina em qualquer sistema.
 */

/** O caminho entre aspas duplas; uma aspa dentro dele sai escapada. */
export function quotePromptPath(path: string): string {
  return `"${String(path).replaceAll('"', '\\"')}"`
}

const PATH_PLACEHOLDER = '{{path}}'

/**
 * O marcador já cercado por aspas no modelo: `"{{path}}"`, `'{{path}}'` ou
 * `` `{{path}}` `` (código em Markdown). Um modelo editado pela pessoa pode ter
 * qualquer um dos três.
 */
const QUOTED_PLACEHOLDER = /(["'`])\{\{path\}\}\1/g

/**
 * Troca `{{path}}` de um modelo pelo caminho entre aspas. Onde o modelo já
 * cercou o marcador com aspas, entra só o caminho: aspas duplas em volta de
 * aspas deixariam o texto ambíguo. Dentro de `"{{path}}"`, uma aspa do caminho
 * sai escapada, como em `quotePromptPath`.
 */
export function fillPathPlaceholder(template: string, path: string): string {
  const withQuoted = template.replace(QUOTED_PLACEHOLDER, (_match, quote: string) =>
    quote === '"' ? quotePromptPath(path) : `${quote}${path}${quote}`,
  )
  return withQuoted.replaceAll(PATH_PLACEHOLDER, quotePromptPath(path))
}

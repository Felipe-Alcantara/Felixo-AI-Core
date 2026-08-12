/**
 * O que o modo visualização mostra, por arquivo.
 *
 * Formatar markdown num `.py` não é um preview, é uma leitura errada: `#`
 * viraria título, linhas se juntariam em parágrafo e a indentação — que no
 * Python *é* o programa — sumiria. Então o botão continua existindo em qualquer
 * arquivo, e o que muda é como o conteúdo é lido.
 */

/**
 * Extensões tratadas como markdown. Curta de propósito: qualquer outra coisa
 * cai em texto puro, que nunca engana.
 */
const MARKDOWN_EXTENSIONS = new Set(['md', 'markdown', 'mdx'])

/** Como o conteúdo deve ser exibido fora do modo de edição. */
export type FilePreviewKind = 'markdown' | 'plain'

/**
 * @param fileName - Nome ou caminho do arquivo. Só a extensão importa.
 */
export function resolvePreviewKind(fileName: string | undefined): FilePreviewKind {
  return isMarkdownFileName(fileName) ? 'markdown' : 'plain'
}

/**
 * @param fileName - Nome ou caminho do arquivo.
 */
export function isMarkdownFileName(fileName: string | undefined): boolean {
  const name = typeof fileName === 'string' ? fileName : ''
  // Só o último segmento: uma pasta chamada `docs.md/` não faz de `notas.txt`
  // um markdown.
  const baseName = name.split(/[\\/]/).pop() ?? ''
  const dotIndex = baseName.lastIndexOf('.')

  if (dotIndex <= 0) {
    return false
  }

  return MARKDOWN_EXTENSIONS.has(baseName.slice(dotIndex + 1).toLowerCase())
}

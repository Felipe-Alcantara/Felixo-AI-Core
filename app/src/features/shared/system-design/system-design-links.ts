import type { ResolveMarkdownRelativeLink } from '../components/MarkdownLink'

/**
 * Os guias do Felixo System Design citam uns aos outros por caminho relativo
 * ao próprio arquivo, como no GitHub: de `core/GUIA_MINIMO_QUALIDADE.md`,
 * `DESIGN_SYSTEM_BACKEND.md` é `core/DESIGN_SYSTEM_BACKEND.md` e
 * `../docs/GIT-POLITICA-DE-VERSIONAMENTO.md` é
 * `docs/GIT-POLITICA-DE-VERSIONAMENTO.md`. Um `/` inicial parte da raiz do
 * repositório.
 *
 * Devolve o caminho do guia citado quando ele está no índice sincronizado, e
 * `null` para o resto (pasta, script, arquivo fora do índice, caminho que sai
 * do repositório). O `#fragmento` de `GUIA.md#secao` é ignorado: o guia abre
 * do começo.
 */
export function resolveSystemDesignDocumentLink(
  href: string,
  fromPath: string,
  documentPaths: ReadonlySet<string>,
): string | null {
  const linkPath = decodePath(href.trim().split(/[?#]/, 1)[0])
  if (!linkPath) return null

  const baseSegments = linkPath.startsWith('/') ? [] : fromPath.split('/').slice(0, -1)
  const segments = [...baseSegments]

  for (const segment of linkPath.split('/')) {
    if (segment === '' || segment === '.') continue
    if (segment === '..') {
      if (segments.length === 0) return null
      segments.pop()
      continue
    }
    segments.push(segment)
  }

  const documentPath = segments.join('/')
  return documentPaths.has(documentPath) ? documentPath : null
}

/**
 * Resolvedor de links para a prévia de um guia: um link para outro guia do
 * índice vira a ação de abri-lo ali mesmo.
 */
export function systemDesignDocumentLinkResolver(
  fromPath: string,
  documentPaths: ReadonlySet<string>,
  openDocument: (documentPath: string) => void,
): ResolveMarkdownRelativeLink {
  return (href) => {
    const documentPath = resolveSystemDesignDocumentLink(href, fromPath, documentPaths)
    if (!documentPath) return null

    return {
      description: `Abrir o guia ${documentPath} neste índice`,
      open: () => openDocument(documentPath),
    }
  }
}

function decodePath(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

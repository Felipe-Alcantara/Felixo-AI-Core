import { lazy, Suspense } from 'react'

import type { ResolveMarkdownRelativeLink } from './MarkdownLink'

const MarkdownContent = lazy(() =>
  import('./MarkdownContent').then(({ MarkdownContent: component }) => ({
    default: component,
  })),
)

type DeferredMarkdownContentProps = {
  content: string
  baseDir?: string
  /** Raiz que as imagens relativas não podem deixar (padrão: `baseDir`). */
  imageRoot?: string
  resolveRelativeLink?: ResolveMarkdownRelativeLink
}

/**
 * O parser Markdown e os realçadores de sintaxe só são necessários quando uma
 * prévia realmente aparece. O fallback preserva o espaço do conteúdo enquanto
 * o chunk local é carregado, inclusive no renderer empacotado (`app://felixo`).
 */
export function DeferredMarkdownContent({
  content,
  baseDir,
  imageRoot,
  resolveRelativeLink,
}: DeferredMarkdownContentProps) {
  return (
    <Suspense
      fallback={
        <span className="text-xs text-zinc-500" role="status">
          Carregando prévia…
        </span>
      }
    >
      <MarkdownContent
        content={content}
        baseDir={baseDir}
        imageRoot={imageRoot}
        resolveRelativeLink={resolveRelativeLink}
      />
    </Suspense>
  )
}

import { lazy, Suspense } from 'react'

const MarkdownContent = lazy(() =>
  import('./MarkdownContent').then(({ MarkdownContent: component }) => ({
    default: component,
  })),
)

type DeferredMarkdownContentProps = {
  content: string
  baseDir?: string
}

/**
 * O parser Markdown e os realçadores de sintaxe só são necessários quando uma
 * prévia realmente aparece. O fallback preserva o espaço do conteúdo enquanto
 * o chunk local é carregado, inclusive em um renderer `file://` empacotado.
 */
export function DeferredMarkdownContent({
  content,
  baseDir,
}: DeferredMarkdownContentProps) {
  return (
    <Suspense
      fallback={
        <span className="text-xs text-zinc-500" role="status">
          Carregando prévia…
        </span>
      }
    >
      <MarkdownContent content={content} baseDir={baseDir} />
    </Suspense>
  )
}

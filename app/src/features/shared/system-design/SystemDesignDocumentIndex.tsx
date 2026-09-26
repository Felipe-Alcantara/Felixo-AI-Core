import { memo, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { ChevronDown, ChevronRight } from 'lucide-react'

import { DeferredMarkdownContent } from '../components/DeferredMarkdownContent'
import {
  LOADING_DOCUMENT,
  systemDesignDocumentRevision,
  type SystemDesignDocumentReadState,
} from './system-design-document'
import { systemDesignDocumentLinkResolver } from './system-design-links'
import type { SystemDesignDocumentSummary } from './types'

export type ReadSystemDesignDocument = (
  documentPath: string,
) => Promise<SystemDesignDocumentReadState>

type SystemDesignDocumentIndexProps = {
  documents: SystemDesignDocumentSummary[]
  readDocument: ReadSystemDesignDocument
}

/**
 * Índice dos guias sincronizados, em que cada item abre o próprio conteúdo
 * logo abaixo dele. Um guia aberto por vez: a seção vive dentro de painéis
 * estreitos (Configurações do canvas e do chat), e dois guias longos abertos
 * empurrariam o resto das opções para longe.
 *
 * Um link de um guia para outro do índice abre o citado no lugar do atual.
 */
export function SystemDesignDocumentIndex({
  documents,
  readDocument,
}: SystemDesignDocumentIndexProps) {
  const [openPath, setOpenPath] = useState<string | null>(null)
  const listRef = useRef<HTMLUListElement>(null)
  // Pela lista de caminhos, não pelo array: cada sincronização entrega um
  // array novo com os mesmos guias, e um conjunto novo re-renderizaria o guia
  // aberto (o que o `memo` da prévia existe para evitar).
  const pathsKey = documents.map((doc) => doc.path).join('\n')
  const documentPaths = useMemo<ReadonlySet<string>>(
    () => new Set(pathsKey.split('\n')),
    [pathsKey],
  )

  // O botão do link some junto com o guia de origem; o foco vai para o item
  // do guia aberto, que também sobe para o topo do painel, com o conteúdo
  // logo abaixo.
  const openLinkedDocument = useCallback((documentPath: string) => {
    flushSync(() => setOpenPath(documentPath))
    const toggle = Array.from(
      listRef.current?.querySelectorAll<HTMLButtonElement>('button[data-document-path]') ?? [],
    ).find((button) => button.dataset.documentPath === documentPath)
    toggle?.scrollIntoView({ block: 'start' })
    toggle?.focus({ preventScroll: true })
  }, [])

  return (
    <details className="mt-3 text-[11px] text-zinc-300">
      <summary className="cursor-pointer text-zinc-400 hover:text-zinc-200">
        Ver índice ({documents.length} documento
        {documents.length === 1 ? '' : 's'})
      </summary>
      <ul ref={listRef} className="mt-1 space-y-0.5">
        {documents.map((doc) => (
          <SystemDesignDocumentItem
            key={doc.path}
            doc={doc}
            expanded={openPath === doc.path}
            onToggle={() => setOpenPath((current) => (current === doc.path ? null : doc.path))}
            readDocument={readDocument}
            documentPaths={documentPaths}
            onOpenDocument={openLinkedDocument}
          />
        ))}
      </ul>
    </details>
  )
}

/** Caminhos do índice e como abrir um deles: o destino dos links entre guias. */
type SystemDesignDocumentLinks = {
  documentPaths: ReadonlySet<string>
  onOpenDocument: (documentPath: string) => void
}

type SystemDesignDocumentItemProps = SystemDesignDocumentLinks & {
  doc: SystemDesignDocumentSummary
  expanded: boolean
  onToggle: () => void
  readDocument: ReadSystemDesignDocument
}

export function SystemDesignDocumentItem({
  doc,
  expanded,
  onToggle,
  readDocument,
  documentPaths,
  onOpenDocument,
}: SystemDesignDocumentItemProps) {
  const contentId = useId()
  const hasOwnTitle = Boolean(doc.title) && doc.title !== doc.path

  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={expanded ? contentId : undefined}
        data-document-path={doc.path}
        className="felixo-btn-flat flex w-full items-start gap-1 rounded-md px-1 py-0.5 text-left hover:bg-white/5"
      >
        {expanded ? (
          <ChevronDown size={12} aria-hidden="true" className="mt-0.5 shrink-0 text-zinc-500" />
        ) : (
          <ChevronRight size={12} aria-hidden="true" className="mt-0.5 shrink-0 text-zinc-500" />
        )}
        <span className="min-w-0 break-words">
          <span className="font-mono text-zinc-500">{doc.path}</span>
          {hasOwnTitle ? <span className="text-zinc-300"> — {doc.title}</span> : null}
        </span>
      </button>
      {expanded ? (
        // A chave muda quando uma sincronização traz outro commit: a prévia
        // aberta relê o guia em vez de continuar mostrando o conteúdo antigo.
        <SystemDesignDocumentPreview
          key={systemDesignDocumentRevision(doc)}
          id={contentId}
          documentPath={doc.path}
          readDocument={readDocument}
          documentPaths={documentPaths}
          onOpenDocument={onOpenDocument}
        />
      ) : null}
    </li>
  )
}

type SystemDesignDocumentPreviewProps = SystemDesignDocumentLinks & {
  id: string
  documentPath: string
  readDocument: ReadSystemDesignDocument
}

/**
 * `memo` porque a seção re-renderiza a cada mudança do próprio estado
 * (sincronizando, config nova, índice relido) e o Markdown não é memoizado:
 * sem isto, cada "Sincronizar agora" analisava o guia aberto de novo, três
 * vezes, cada uma bloqueando a thread principal. As props aqui são estáveis.
 */
const SystemDesignDocumentPreview = memo(function SystemDesignDocumentPreview({
  id,
  documentPath,
  readDocument,
  documentPaths,
  onOpenDocument,
}: SystemDesignDocumentPreviewProps) {
  const { state, retry } = useSystemDesignDocument(documentPath, readDocument)

  return (
    <SystemDesignDocumentContent
      id={id}
      documentPath={documentPath}
      documentPaths={documentPaths}
      onOpenDocument={onOpenDocument}
      state={state}
      onRetry={retry}
    />
  )
})

type SystemDesignDocumentContentProps = SystemDesignDocumentLinks & {
  id: string
  documentPath: string
  state: SystemDesignDocumentReadState
  onRetry: () => void
}

/** Moldura com rolagem própria: um guia longo não estica o painel inteiro. */
export function SystemDesignDocumentContent({
  id,
  documentPath,
  documentPaths,
  onOpenDocument,
  state,
  onRetry,
}: SystemDesignDocumentContentProps) {
  const resolveRelativeLink = useMemo(
    () => systemDesignDocumentLinkResolver(documentPath, documentPaths, onOpenDocument),
    [documentPath, documentPaths, onOpenDocument],
  )

  return (
    <div
      id={id}
      role="region"
      aria-label={`Conteúdo de ${documentPath}`}
      // Focável para quem usa teclado conseguir rolar o guia com as setas.
      tabIndex={0}
      className="mb-2 ml-4 mt-1 max-h-72 min-w-0 overflow-auto overscroll-contain rounded-md border border-white/[0.08] bg-black/20 p-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400"
    >
      {state.status === 'loading' ? (
        <p className="text-zinc-500" role="status">
          Carregando documento…
        </p>
      ) : null}
      {state.status === 'ready' ? (
        <DeferredMarkdownContent
          content={state.content}
          resolveRelativeLink={resolveRelativeLink}
        />
      ) : null}
      {state.status === 'empty' ? (
        <p className="text-zinc-500">Este documento está vazio no cache local.</p>
      ) : null}
      {state.status === 'error' ? (
        <div className="flex flex-wrap items-center gap-2 text-[var(--color-warning)]" role="alert">
          <span>{state.message}</span>
          <button
            type="button"
            onClick={onRetry}
            className="felixo-btn text-[var(--f-core-white-soft)] underline hover:text-[var(--f-core-white)]"
          >
            Tentar novamente
          </button>
        </div>
      ) : null}
    </div>
  )
}

/**
 * Lê o guia ao montar e a cada nova tentativa. O resultado guarda a tentativa
 * que o produziu: uma resposta antiga nunca aparece como a atual, e "tentar de
 * novo" volta a mostrar "carregando" até a nova leitura terminar.
 */
function useSystemDesignDocument(documentPath: string, readDocument: ReadSystemDesignDocument) {
  const [attempt, setAttempt] = useState(0)
  const [settled, setSettled] = useState<{
    attempt: number
    state: SystemDesignDocumentReadState
  } | null>(null)

  useEffect(() => {
    let active = true
    void readDocument(documentPath).then((state) => {
      if (active) setSettled({ attempt, state })
    })
    return () => {
      active = false
    }
  }, [attempt, documentPath, readDocument])

  return {
    state: settled?.attempt === attempt ? settled.state : LOADING_DOCUMENT,
    retry: () => setAttempt((current) => current + 1),
  }
}

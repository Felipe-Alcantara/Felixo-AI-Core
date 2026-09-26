import { useEffect, useId, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

import { DeferredMarkdownContent } from '../components/DeferredMarkdownContent'
import {
  LOADING_DOCUMENT,
  type SystemDesignDocumentReadState,
} from './system-design-document'
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
 */
export function SystemDesignDocumentIndex({
  documents,
  readDocument,
}: SystemDesignDocumentIndexProps) {
  const [openPath, setOpenPath] = useState<string | null>(null)

  return (
    <details className="mt-3 text-[11px] text-zinc-300">
      <summary className="cursor-pointer text-zinc-400 hover:text-zinc-200">
        Ver índice ({documents.length} documento
        {documents.length === 1 ? '' : 's'})
      </summary>
      <ul className="mt-1 space-y-0.5">
        {documents.map((doc) => (
          <SystemDesignDocumentItem
            key={doc.path}
            doc={doc}
            expanded={openPath === doc.path}
            onToggle={() => setOpenPath((current) => (current === doc.path ? null : doc.path))}
            readDocument={readDocument}
          />
        ))}
      </ul>
    </details>
  )
}

type SystemDesignDocumentItemProps = {
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
        // A chave inclui `updatedAt`: uma nova sincronização regrava o guia, e
        // a prévia aberta relê o conteúdo em vez de continuar com o antigo.
        <SystemDesignDocumentPreview
          key={`${doc.path}@${doc.updatedAt}`}
          id={contentId}
          documentPath={doc.path}
          readDocument={readDocument}
        />
      ) : null}
    </li>
  )
}

type SystemDesignDocumentPreviewProps = {
  id: string
  documentPath: string
  readDocument: ReadSystemDesignDocument
}

function SystemDesignDocumentPreview({
  id,
  documentPath,
  readDocument,
}: SystemDesignDocumentPreviewProps) {
  const { state, retry } = useSystemDesignDocument(documentPath, readDocument)

  return (
    <SystemDesignDocumentContent
      id={id}
      documentPath={documentPath}
      state={state}
      onRetry={retry}
    />
  )
}

type SystemDesignDocumentContentProps = {
  id: string
  documentPath: string
  state: SystemDesignDocumentReadState
  onRetry: () => void
}

/** Moldura com rolagem própria: um guia longo não estica o painel inteiro. */
export function SystemDesignDocumentContent({
  id,
  documentPath,
  state,
  onRetry,
}: SystemDesignDocumentContentProps) {
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
      {state.status === 'ready' ? <DeferredMarkdownContent content={state.content} /> : null}
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

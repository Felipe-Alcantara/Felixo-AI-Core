import { memo, useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { NodeResizer, useReactFlow, type NodeProps } from '@xyflow/react'
import { KeyRound, Loader2, Send, ShieldAlert, Square, Wrench } from 'lucide-react'
import { NODE_MIN_SIZE } from '../services/node-geometry'
import { claudeApiConversations } from '../services/claude-api-conversation-store'
import { formatUsd, type ClaudeApiItem } from '../services/claude-api-conversation'
import type { ClaudeApiNodeData } from '../types'
import { DeferredMarkdownContent } from '../../shared/components/DeferredMarkdownContent'
import { NodeHeader } from './NodeHeader'

type ClaudeApiNodeDataWithHandlers = ClaudeApiNodeData & {
  onDataChange?: (nodeId: string, patch: Partial<ClaudeApiNodeData>) => void
}

const BUTTON =
  'felixo-btn inline-flex items-center gap-1 rounded-sm px-2 py-1 text-[11px] disabled:opacity-50'

function ItemView({ item }: { item: ClaudeApiItem }) {
  if (item.role === 'user') {
    if (item.context) {
      return (
        <details className="rounded border border-(--f-core-border) px-2 py-1 text-[11px] text-(--f-core-secondary)">
          <summary className="cursor-pointer">Contexto do canvas entregue ao Claude</summary>
          <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap">{item.text}</pre>
        </details>
      )
    }
    return (
      <div className="ml-8 self-end rounded-lg bg-(--f-core-surface-2,rgba(127,127,127,0.15)) px-3 py-2 whitespace-pre-wrap">
        {item.text}
      </div>
    )
  }
  if (item.role === 'assistant') {
    return (
      <div className="felixo-markdown text-xs">
        <DeferredMarkdownContent content={item.text} />
      </div>
    )
  }
  if (item.role === 'tool') {
    const tone = item.denied ? 'text-(--f-core-secondary) line-through' : item.isError ? 'text-theme-error' : ''
    return (
      <details className="rounded border border-(--f-core-border) px-2 py-1 text-[11px]">
        <summary className={`flex cursor-pointer items-center gap-1 ${tone}`}>
          <Wrench size={11} aria-hidden />
          <span className="font-medium">{item.name}</span>
          <span className="truncate font-mono text-(--f-core-secondary)">{item.summary}</span>
          {item.denied && <span className="ml-auto">negado</span>}
          {!item.denied && item.result === undefined && (
            <Loader2 size={11} className="ml-auto motion-safe:animate-spin" aria-label="em andamento" />
          )}
        </summary>
        {item.result !== undefined && (
          <pre className="mt-1 max-h-48 overflow-auto font-mono whitespace-pre-wrap">{item.result || '(sem saída)'}</pre>
        )}
      </details>
    )
  }
  return (
    <p
      role={item.tone === 'error' ? 'alert' : undefined}
      className={`text-[11px] whitespace-pre-wrap ${item.tone === 'error' ? 'text-theme-error' : 'text-(--f-core-secondary)'}`}
    >
      {item.text}
    </p>
  )
}

/**
 * Bloco de conversa do Claude por chave de API.
 *
 * Roda o Claude Code sem tela (o motor do Agent SDK) em vez da interface do
 * terminal: com chave de API, esse modo também usa o crédito promocional do
 * Agent SDK. A conversa vive em `claudeApiConversations`, fora do React,
 * porque o canvas desmonta blocos fora da tela enquanto o processo segue.
 */
function ClaudeApiNodeComponent({ id, data, selected }: NodeProps) {
  const { deleteElements } = useReactFlow()
  const nodeData = data as ClaudeApiNodeDataWithHandlers
  const [draft, setDraft] = useState('')
  const listRef = useRef<HTMLDivElement | null>(null)
  const stickToBottom = useRef(true)

  // Hidrata antes do primeiro render que lê a conversa.
  if (!claudeApiConversations.has(id)) {
    claudeApiConversations.hydrate(id, nodeData.apiConversation)
  }
  const conversation = useSyncExternalStore(
    claudeApiConversations.subscribe,
    () => claudeApiConversations.get(id),
  )

  const change = useCallback(
    (patch: Partial<ClaudeApiNodeData>) => nodeData.onDataChange?.(id, patch),
    [id, nodeData],
  )

  const startParams = useCallback(
    () => ({
      accountId: nodeData.apiAccountId ?? '',
      cwd: nodeData.apiCwd ?? '',
      model: nodeData.apiModel,
      effort: nodeData.apiEffort,
      yolo: nodeData.apiYolo === true,
    }),
    [nodeData.apiAccountId, nodeData.apiCwd, nodeData.apiModel, nodeData.apiEffort, nodeData.apiYolo],
  )

  // Contexto do canvas: vai uma vez, como primeira mensagem, igual ao que o
  // terminal digita ao abrir.
  const contextSending = useRef(false)
  useEffect(() => {
    if (contextSending.current || nodeData.apiContextSent || !nodeData.apiInitialText?.trim()) return
    contextSending.current = true
    change({ apiContextSent: true })
    void claudeApiConversations.send(id, nodeData.apiInitialText, startParams(), { context: true })
  }, [change, id, nodeData.apiContextSent, nodeData.apiInitialText, startParams])

  // Gruda no fim enquanto a pessoa não rolou para cima. Um ResizeObserver no
  // conteúdo, e não só um efeito por mensagem: o Markdown carrega depois
  // (Suspense) e cresce sem mudar a lista, o que deixava a rolagem parada
  // no meio da conversa ao abrir o bloco.
  const contentRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const list = listRef.current
    const content = contentRef.current
    if (!list || !content) return
    const stick = () => {
      if (stickToBottom.current) list.scrollTop = list.scrollHeight
    }
    stick()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(stick)
    observer.observe(content)
    return () => observer.disconnect()
  }, [])

  const busy = conversation.status !== 'idle'
  const canSend = draft.trim() !== '' && !busy && Boolean(nodeData.apiAccountId) && Boolean(nodeData.apiCwd)

  const submit = () => {
    if (!canSend) return
    const text = draft
    setDraft('')
    stickToBottom.current = true
    void claudeApiConversations.send(id, text, startParams())
  }

  const projectName = nodeData.apiCwd?.split(/[\\/]/).filter(Boolean).pop()

  return (
    <div className="felixo-canvas-card flex h-full w-full flex-col overflow-hidden rounded-lg border shadow-xl">
      <NodeResizer
        isVisible={selected}
        minWidth={NODE_MIN_SIZE['claude-api'].width}
        minHeight={NODE_MIN_SIZE['claude-api'].height}
      />
      <NodeHeader
        icon={<KeyRound size={13} aria-hidden />}
        editableValue={nodeData.label ?? ''}
        placeholder="Claude (chave de API)"
        onTitleChange={(label) => change({ label })}
        onRemove={() => void deleteElements({ nodes: [{ id }] })}
      />

      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 border-b border-(--f-core-border) px-3 py-1 text-[10px] text-(--f-core-secondary)">
        <span title="Conta">{nodeData.apiAccountLabel ?? 'Conta por chave de API'}</span>
        {projectName && <span title={nodeData.apiCwd}>· {projectName}</span>}
        {nodeData.apiModel && <span>· {nodeData.apiModel}</span>}
        {nodeData.apiEffort && <span>· esforço {nodeData.apiEffort}</span>}
        <span>· {nodeData.apiYolo ? 'Yolo' : 'pede permissão'}</span>
        <span className="ml-auto" title="Gasto desta conversa, informado pelo Claude Code a cada resposta">
          {formatUsd(conversation.totalCostUsd)}
        </span>
      </div>

      <div
        ref={listRef}
        onWheel={() => {
          // Rolar com a roda é intenção da pessoa: decide pela posição depois do gesto.
          window.requestAnimationFrame(() => {
            const el = listRef.current
            if (el) stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
          })
        }}
        onScroll={(event) => {
          const el = event.currentTarget
          stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
        }}
        className="felixo-sidebar-scroll nodrag nowheel nopan min-h-0 flex-1 select-text overflow-y-auto overflow-x-hidden overscroll-contain text-xs"
        aria-live="polite"
      >
        <div ref={contentRef} className="flex min-w-0 flex-col gap-2 p-3">
        {conversation.items.length === 0 && !conversation.streamingText && (
          <p className="text-[11px] text-(--f-core-secondary)">
            Claude Code pela chave de API, sem a tela do terminal. Ele lê e edita os arquivos do projeto e roda
            comandos{nodeData.apiYolo ? ' sem pedir permissão (Yolo)' : '; cada ação pede sua permissão aqui'}.
          </p>
        )}
        {conversation.items.map((item) => (
          <ItemView key={item.id} item={item} />
        ))}
        {conversation.streamingText && (
          <div className="text-xs whitespace-pre-wrap">
            {conversation.streamingText}
            <span className="motion-safe:animate-pulse">▍</span>
          </div>
        )}
        {busy && !conversation.streamingText && conversation.permissions.length === 0 && (
          <div role="status" className="flex items-center gap-1 text-[11px] text-(--f-core-secondary)">
            <Loader2 size={12} className="motion-safe:animate-spin" aria-hidden /> Trabalhando…
          </div>
        )}
        {conversation.permissions.map((permission) => (
          <div
            key={permission.requestId}
            role="group"
            aria-label={`Permissão para ${permission.toolName}`}
            className="rounded border border-amber-500/60 p-2"
          >
            <p className="mb-1 flex items-center gap-1 font-medium">
              <ShieldAlert size={12} aria-hidden /> O Claude quer usar {permission.toolName}
            </p>
            {(permission.summary || permission.description) && (
              <pre className="mb-2 max-h-32 overflow-auto font-mono text-[11px] whitespace-pre-wrap">
                {permission.summary || permission.description}
              </pre>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                className={`${BUTTON} felixo-primary-action`}
                onClick={() => void claudeApiConversations.answerPermission(id, permission.requestId, true)}
              >
                Permitir
              </button>
              <button
                type="button"
                className={`${BUTTON} felixo-secondary-action`}
                onClick={() => void claudeApiConversations.answerPermission(id, permission.requestId, false)}
              >
                Negar
              </button>
            </div>
          </div>
        ))}
        </div>
      </div>

      <div className="nodrag nowheel nopan flex items-end gap-2 border-t border-(--f-core-border) p-2">
        <textarea
          aria-label="Mensagem para o Claude"
          value={draft}
          rows={2}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault()
              submit()
            }
          }}
          placeholder={busy ? 'Aguarde a resposta…' : 'Mensagem (Enter envia, Shift+Enter quebra linha)'}
          className="felixo-control min-h-0 flex-1 resize-none text-xs"
        />
        {busy ? (
          <button
            type="button"
            className={`${BUTTON} felixo-secondary-action`}
            onClick={() => void claudeApiConversations.interrupt(id)}
            title="Interromper"
          >
            <Square size={12} aria-hidden /> Parar
          </button>
        ) : (
          <button
            type="button"
            className={`${BUTTON} felixo-primary-action`}
            disabled={!canSend}
            onClick={submit}
            title={!nodeData.apiAccountId ? 'Este bloco não tem conta: crie outro pelo menu Agentes.' : 'Enviar'}
          >
            <Send size={12} aria-hidden /> Enviar
          </button>
        )}
      </div>
    </div>
  )
}

export const ClaudeApiNode = memo(ClaudeApiNodeComponent)

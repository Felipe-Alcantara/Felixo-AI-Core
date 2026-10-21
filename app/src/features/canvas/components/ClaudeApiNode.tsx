import { memo, useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { NodeResizer, useReactFlow, type NodeProps } from '@xyflow/react'
import { KeyRound, Loader2, Send, ShieldAlert, Square, Wrench, X } from 'lucide-react'
import { NODE_MIN_SIZE } from '../services/node-geometry'
import { claudeApiConversations } from '../services/claude-api-conversation-store'
import {
  CLAUDE_API_MODEL_ALIASES,
  formatUsd,
  parseClaudeApiSlashCommand,
  type ClaudeApiItem,
} from '../services/claude-api-conversation'
import {
  acceptAttachmentCount,
  imageFilesFromTransfer,
  prepareClaudeApiAttachment,
  type ClaudeApiAttachment,
} from '../services/claude-api-images'
import type { ClaudeApiNodeData } from '../types'
import { DeferredMarkdownContent } from '../../shared/components/DeferredMarkdownContent'
import { NodeHeader } from './NodeHeader'

type ClaudeApiNodeDataWithHandlers = ClaudeApiNodeData & {
  onDataChange?: (nodeId: string, patch: Partial<ClaudeApiNodeData>) => void
}

const BUTTON =
  'felixo-btn inline-flex items-center gap-1 rounded-sm px-2 py-1 text-[11px] disabled:opacity-50'

// Memo: cada letra digitada e cada pedaço de resposta re-renderizam o bloco;
// sem isso, todas as mensagens em Markdown eram redesenhadas junto e o bloco
// travava em conversas longas. O item só muda de identidade quando muda.
const ItemView = memo(function ItemView({ item }: { item: ClaudeApiItem }) {
  if (item.role === 'user') {
    if (item.context) {
      return (
        <details className="rounded border border-(--f-core-border) px-2 py-1 text-[11px] text-(--f-core-secondary)">
          <summary className="cursor-pointer">Contexto do canvas entregue ao Claude</summary>
          <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap">{item.text}</pre>
        </details>
      )
    }
    const count = item.images?.length ?? item.imageCount ?? 0
    return (
      <div className="ml-8 self-end rounded-lg bg-(--f-core-surface-2,rgba(127,127,127,0.15)) px-3 py-2 whitespace-pre-wrap">
        {item.images && (
          <div className={`flex flex-wrap justify-end gap-1 ${item.text ? 'mb-1.5' : ''}`}>
            {item.images.map((src, index) => (
              <img
                key={index}
                src={src}
                alt={`Imagem ${index + 1} de ${count} enviada ao Claude`}
                className="h-16 max-w-28 rounded-sm object-cover"
                draggable={false}
              />
            ))}
          </div>
        )}
        {!item.images && count > 0 && (
          <span className={`block text-[11px] text-(--f-core-secondary) ${item.text ? 'mb-1' : ''}`}>
            {count === 1 ? '1 imagem' : `${count} imagens`} nesta mensagem
          </span>
        )}
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
})

/**
 * Campo de mensagem com o próprio rascunho: digitar re-renderiza só ele, não
 * a conversa inteira (medido: 60 teclas numa conversa de 240 itens passavam de
 * ~66 s para ~5 s só com o memo dos itens; separar o campo tira o resto).
 */
const Composer = memo(function Composer({
  busy,
  ready,
  hasAccount,
  onSubmit,
  onInterrupt,
}: {
  busy: boolean
  ready: boolean
  hasAccount: boolean
  onSubmit: { current: (text: string, images: ClaudeApiAttachment[]) => void }
  onInterrupt: { current: () => void }
}) {
  const [draft, setDraft] = useState('')
  const [attachments, setAttachments] = useState<ClaudeApiAttachment[]>([])
  const [preparing, setPreparing] = useState(0)
  const [imageError, setImageError] = useState<string | null>(null)
  const trimmed = draft.trim()
  const hasContent = trimmed !== '' || attachments.length > 0
  const canSend = hasContent && !busy && preparing === 0 && (ready || /^\/model\b/i.test(trimmed))
  const submit = () => {
    if (!canSend) return
    const text = draft
    const images = attachments
    setDraft('')
    setAttachments([])
    setImageError(null)
    onSubmit.current(text, images)
  }

  // Colar e soltar caem aqui. Cada imagem é lida (e reduzida, quando a API
  // recusaria como está) antes de aparecer no campo.
  const addFiles = (files: File[]) => {
    const { accept, message } = acceptAttachmentCount(attachments.length + preparing, files.length)
    setImageError(message)
    const chosen = files.slice(0, accept)
    if (chosen.length === 0) return
    setPreparing((value) => value + chosen.length)
    void Promise.allSettled(chosen.map((file) => prepareClaudeApiAttachment(file))).then((results) => {
      setPreparing((value) => value - chosen.length)
      const prepared = results.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []))
      // Cada arquivo que falhou diz o próprio motivo (não abriu, grande demais).
      const failures = results.flatMap((result) =>
        result.status === 'rejected'
          ? [result.reason instanceof Error ? result.reason.message : 'Não foi possível ler a imagem.']
          : [],
      )
      if (prepared.length > 0) setAttachments((current) => [...current, ...prepared])
      if (failures.length > 0) setImageError([message, ...failures].filter(Boolean).join(' '))
    })
  }

  return (
    <div
      className="nodrag nowheel nopan flex flex-col gap-1.5 border-t border-(--f-core-border) p-2"
      onDragOver={(event) => {
        if (!Array.from(event.dataTransfer.types).includes('Files')) return
        event.preventDefault()
        event.stopPropagation()
        event.dataTransfer.dropEffect = 'copy'
      }}
      onDrop={(event) => {
        const files = imageFilesFromTransfer(event.dataTransfer)
        if (files.length === 0) return
        event.preventDefault()
        event.stopPropagation()
        addFiles(files)
      }}
    >
      {(attachments.length > 0 || preparing > 0) && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Imagens que vão com a mensagem">
          {attachments.map((attachment, index) => (
            <li key={attachment.id} className="relative">
              <img
                src={attachment.thumb}
                alt={`Imagem ${index + 1}: ${attachment.name} (${attachment.width}×${attachment.height})`}
                title={`${attachment.name} · ${attachment.width}×${attachment.height}`}
                className="h-12 w-12 rounded-sm border border-(--f-core-border) object-cover"
                draggable={false}
              />
              <button
                type="button"
                className="felixo-btn-icon absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-(--f-core-black-deep) text-(--f-core-white-soft) ring-1 ring-(--f-core-border)"
                aria-label={`Remover imagem ${index + 1}`}
                onClick={() => {
                  setAttachments((current) => current.filter((item) => item.id !== attachment.id))
                  setImageError(null)
                }}
              >
                <X size={10} aria-hidden />
              </button>
            </li>
          ))}
          {preparing > 0 && (
            <li role="status" className="flex h-12 items-center gap-1 px-1 text-[11px] text-(--f-core-secondary)">
              <Loader2 size={12} className="motion-safe:animate-spin" aria-hidden /> Lendo imagem…
            </li>
          )}
        </ul>
      )}
      {imageError && (
        <p role="alert" className="text-[11px] text-theme-error">
          {imageError}
        </p>
      )}
      <div className="flex items-end gap-2">
      <textarea
        aria-label="Mensagem para o Claude"
        value={draft}
        rows={2}
        onChange={(event) => setDraft(event.target.value)}
        onPaste={(event) => {
          const files = imageFilesFromTransfer(event.clipboardData)
          if (files.length === 0) return
          // Imagem pura não cola nada no texto; com texto junto, o texto cola normal.
          if (!event.clipboardData.getData('text/plain')) event.preventDefault()
          addFiles(files)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault()
            submit()
          }
        }}
        placeholder={
          busy ? 'Aguarde a resposta…' : 'Mensagem (Enter envia, Shift+Enter quebra linha; Ctrl+V cola imagem)'
        }
        className="felixo-control min-h-0 flex-1 resize-none text-xs"
      />
      {busy ? (
        <button
          type="button"
          className={`${BUTTON} felixo-secondary-action`}
          onClick={() => onInterrupt.current()}
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
          title={!hasAccount ? 'Este bloco não tem conta: crie outro pelo menu Agentes.' : 'Enviar'}
        >
          <Send size={12} aria-hidden /> Enviar
        </button>
      )}
      </div>
    </div>
  )
})

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
      // Contexto do canvas como instrução de sistema (--append-system-prompt-file).
      // Antes ia como primeira mensagem e gastava um turno inteiro antes de a
      // pessoa conseguir conversar. Blocos antigos que já mandaram o contexto
      // como mensagem (`apiContextSent`) não recebem de novo.
      systemContext: nodeData.apiContextSent ? undefined : nodeData.apiInitialText || undefined,
    }),
    [
      nodeData.apiAccountId,
      nodeData.apiCwd,
      nodeData.apiModel,
      nodeData.apiEffort,
      nodeData.apiYolo,
      nodeData.apiContextSent,
      nodeData.apiInitialText,
    ],
  )

  // Abre o Claude Code assim que o bloco aparece: a primeira mensagem não
  // espera os ~3 s de abertura. Abrir não chama a API.
  useEffect(() => {
    if (!nodeData.apiAccountId || !nodeData.apiCwd) return
    void claudeApiConversations.warm(id, startParams())
  }, [id, nodeData.apiAccountId, nodeData.apiCwd, startParams])

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
  const ready = Boolean(nodeData.apiAccountId) && Boolean(nodeData.apiCwd)

  const submit = (text: string, images: ClaudeApiAttachment[] = []) => {
    stickToBottom.current = true
    const command = parseClaudeApiSlashCommand(text)
    if (command && images.length > 0) {
      claudeApiConversations.notice(
        id,
        `${images.length === 1 ? 'A imagem não foi' : 'As imagens não foram'} junto: /model e /resume não levam imagem.`,
      )
    }
    if (command?.kind === 'resume-list' || command?.kind === 'resume-pick') {
      const account = { accountId: nodeData.apiAccountId ?? '', cwd: nodeData.apiCwd ?? '' }
      if (!account.accountId || !account.cwd) {
        claudeApiConversations.notice(id, 'Este bloco não tem conta ou projeto para procurar conversas.', 'error')
        return
      }
      void (command.kind === 'resume-list'
        ? claudeApiConversations.listSessions(id, account)
        : claudeApiConversations.resumeSession(id, command.target, account))
      return
    }
    if (command?.kind === 'model-show') {
      claudeApiConversations.notice(
        id,
        `Modelo atual: ${nodeData.apiModel || 'padrão da conta'}. Para trocar: /model ${CLAUDE_API_MODEL_ALIASES.join(' | ')} | <nome completo, ex.: claude-sonnet-5-5> | default.`,
      )
      return
    }
    if (command?.kind === 'model-invalid') {
      claudeApiConversations.notice(id, `"${command.value}" não é um nome de modelo válido.`, 'error')
      return
    }
    if (command?.kind === 'model-set') {
      change({ apiModel: command.model ?? undefined })
      claudeApiConversations.notice(
        id,
        `Modelo trocado para ${command.model ?? 'o padrão da conta'}. Vale a partir da próxima mensagem; a conversa continua.`,
      )
      return
    }
    void claudeApiConversations.send(id, text, startParams(), { images })
  }

  // Refs estáveis para o Composer: ele não re-renderiza a cada mudança da conversa.
  const submitRef = useRef(submit)
  useEffect(() => {
    submitRef.current = submit
  })
  const interruptRef = useRef(() => void claudeApiConversations.interrupt(id))

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
        {nodeData.apiInitialText && !nodeData.apiContextSent && (
          <details className="rounded border border-(--f-core-border) px-2 py-1 text-[11px] text-(--f-core-secondary)">
            <summary className="cursor-pointer">Contexto do canvas entregue ao Claude (instrução de sistema)</summary>
            <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap">{nodeData.apiInitialText}</pre>
          </details>
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

      <Composer
        busy={busy}
        ready={ready}
        hasAccount={Boolean(nodeData.apiAccountId)}
        onSubmit={submitRef}
        onInterrupt={interruptRef}
      />
    </div>
  )
}

export const ClaudeApiNode = memo(ClaudeApiNodeComponent)

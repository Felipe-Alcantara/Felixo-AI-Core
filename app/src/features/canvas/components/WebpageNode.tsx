import { memo, useCallback, useEffect, useRef, useState } from 'react'
import {
  Handle,
  Position,
  NodeResizer,
  useReactFlow,
  type NodeProps,
} from '@xyflow/react'
import {
  ArrowLeft,
  ArrowRight,
  Globe,
  RotateCw,
} from 'lucide-react'
import type { WebviewTag } from 'electron'
import { NodeHeader } from './NodeHeader'
import { normalizeUrlInput } from '../services/url-utils'
import {
  resolveGuestSrc,
  shouldCreateGuest,
  shouldRemoveOnDetach,
  staleGuests,
} from '../services/webview-mount'
import type { WebpageNodeData } from '../types'

/**
 * Data carried by a webpage node. `onDataChange` is injected by CanvasView so
 * navigation (current URL) flows back into canvas state and storage.
 */
type WebpageNodeDataWithHandler = WebpageNodeData & {
  onDataChange?: (nodeId: string, patch: Partial<WebpageNodeData>) => void
}

/** All partitions share one session, so logging in on one block carries over
 *  to any other — the point of a mini-browser docked in the canvas. */
const SHARED_WEBVIEW_PARTITION = 'persist:felixo-webview'

/**
 * A mini-browser docked in the canvas: an embedded <webview> with an address
 * bar and back/forward/reload, no URL restriction. Only the current URL is
 * persisted — back/forward history lives in the webview's own session and is
 * never serialized.
 */
function WebpageNodeComponent({ id, data, selected }: NodeProps) {
  const nodeData = (data ?? {}) as WebpageNodeDataWithHandler
  const webviewRef = useRef<WebviewTag | null>(null)
  // Mirrors `webviewRef` as state so the listener effect re-runs when the
  // element is (re)created. The ref stays for the imperative callers
  // (back/forward/reload/loadURL) that must not re-render on every read.
  const [webview, setWebview] = useState<WebviewTag | null>(null)
  // Seeded once from the persisted URL — later navigation updates state/data,
  // never this prop, so the webview is never force-reloaded from underneath
  // the user by a re-render.
  // useState com inicializador (e não useRef lido no render): o valor é
  // calculado uma única vez, na montagem, e ler `.current` de um ref durante o
  // render é justamente o que o React não garante em modo concorrente.
  const [initialUrl] = useState(() => nodeData.url || 'https://www.google.com')
  const [addressInput, setAddressInput] = useState(initialUrl)
  // Tracks where the page actually is, so a remount recreates the webview on
  // the current URL instead of rewinding it to `initialUrl`.
  const currentUrlRef = useRef(initialUrl)
  const [canGoBack, setCanGoBack] = useState(false)
  const [canGoForward, setCanGoForward] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isResizing, setIsResizing] = useState(false)
  // The page's own title wins once, then a manual rename "locks" the label so
  // page-title-updated never overwrites a name the user chose on purpose.
  const labelCustomizedRef = useRef(Boolean(nodeData.label))
  const { deleteElements } = useReactFlow()

  // CanvasView recreates `data` (and this handler) whenever the node's own
  // data changes — e.g. every time this effect calls onDataChange itself —
  // so reading it through a ref (rather than listing it as a dependency)
  // keeps the listeners bound for the node's whole lifetime instead of being
  // torn down and rebound on every navigation.
  const onDataChangeRef = useRef(nodeData.onDataChange)
  useEffect(() => {
    // Num effect, e não durante o render: escrever em ref no corpo do
    // componente quebra a garantia do React de que o render é puro.
    onDataChangeRef.current = nodeData.onDataChange
  }, [nodeData.onDataChange])

  // O <webview> é montado à mão em vez de declarado em JSX porque
  // `allowpopups` precisa estar no elemento ANTES de ele entrar no DOM: o
  // Chromium decide se o guest aceita popups no momento em que o anexa, e
  // setar o atributo depois não reverte (nem re-setar `src` força um novo
  // attach — ambos verificados no app real). Pelo JSX isso é impossível: o
  // React insere o elemento antes de qualquer ref rodar, e ainda por cima
  // @types/react declara `allowpopups` como boolean, que ele não serializa
  // para atributo em elemento desconhecido.
  //
  // Sem isso, `window.open` dentro da página devolve null e os logins OAuth
  // (Google/Apple/Microsoft…) exibem "seu navegador está bloqueando pop-ups".
  const mountWebview = useCallback((container: HTMLDivElement | null) => {
    if (!container) {
      // Dropping the ref is not enough: the <webview> stays in the DOM as a
      // live guest, still loading and still PLAYING AUDIO. StrictMode (and any
      // remount) then runs this callback again with a null ref, the
      // already-mounted check below passes, and a second guest is prepended
      // over the first — two pages loaded, doubled audio. Removing the element
      // ends the guest with it.
      if (shouldRemoveOnDetach(webviewRef.current)) {
        webviewRef.current?.remove()
      }
      webviewRef.current = null
      setWebview(null)
      return
    }
    if (!shouldCreateGuest(webviewRef.current)) {
      return
    }
    // A previous mount may have left a guest behind (e.g. a remount whose
    // cleanup never ran). Clearing them keeps exactly one webview per node.
    staleGuests(
      { existingGuests: () => Array.from(container.querySelectorAll('webview')) },
      webviewRef.current,
    ).forEach((stale) => stale.remove())

    const element = document.createElement('webview') as WebviewTag
    element.className = 'nodrag nowheel nopan h-full w-full'
    element.setAttribute('allowpopups', '')
    element.setAttribute('partition', SHARED_WEBVIEW_PARTITION)
    element.setAttribute(
      'webpreferences',
      'contextIsolation=yes,nodeIntegration=no,sandbox=yes',
    )
    // The URL the node is actually on, not the one it opened with: a remount
    // after the user navigated away must not silently rewind the page to
    // wherever the block started.
    element.setAttribute('src', resolveGuestSrc(currentUrlRef.current, initialUrl))

    container.prepend(element)
    webviewRef.current = element
    setWebview(element)
    // `initialUrl` is frozen at mount, so this identity is stable for the
    // node's lifetime — the callback is never torn down mid-session.
  }, [initialUrl])

  // Depends on the mounted element, not just `id`: ref callbacks run before
  // effects, so on a remount the effect below would read an already-cleared
  // ref, bail out, and leave the new webview with no listeners at all —
  // no title, no URL persistence, no back/forward.
  useEffect(() => {
    if (!webview) return

    const syncHistoryState = () => {
      setCanGoBack(webview.canGoBack())
      setCanGoForward(webview.canGoForward())
    }

    const onDomReady = () => syncHistoryState()

    const onNavigate = () => {
      setLoadError(null)
      const url = webview.getURL()
      currentUrlRef.current = url
      setAddressInput(url)
      syncHistoryState()
      onDataChangeRef.current?.(id, { url })
    }

    const onTitleUpdated = (event: { title: string }) => {
      if (!labelCustomizedRef.current) {
        onDataChangeRef.current?.(id, { label: event.title })
      }
    }

    const onFailLoad = (event: { errorCode: number; errorDescription: string }) => {
      // -3 is ABORTED — Chromium fires it for redirects/cancelled navigations
      // that aren't real failures, so it would just flash a false error.
      if (event.errorCode === -3) return
      setLoadError(event.errorDescription || 'Não foi possível carregar a página.')
    }

    webview.addEventListener('dom-ready', onDomReady)
    webview.addEventListener('did-navigate', onNavigate)
    webview.addEventListener('did-navigate-in-page', onNavigate)
    webview.addEventListener('page-title-updated', onTitleUpdated)
    webview.addEventListener('did-fail-load', onFailLoad)

    return () => {
      webview.removeEventListener('dom-ready', onDomReady)
      webview.removeEventListener('did-navigate', onNavigate)
      webview.removeEventListener('did-navigate-in-page', onNavigate)
      webview.removeEventListener('page-title-updated', onTitleUpdated)
      webview.removeEventListener('did-fail-load', onFailLoad)
    }
  }, [id, webview])

  const navigateTo = (raw: string) => {
    const normalized = normalizeUrlInput(raw)
    if (!normalized) return
    setAddressInput(normalized)
    currentUrlRef.current = normalized
    webviewRef.current?.loadURL(normalized)
  }

  const handleLabelChange = (label: string) => {
    labelCustomizedRef.current = true
    nodeData.onDataChange?.(id, { label })
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-lg border border-emerald-300/20 bg-[#0d1712] text-zinc-200 shadow-xl">
      <NodeResizer
        isVisible={selected}
        minWidth={360}
        minHeight={280}
        lineClassName="!border-emerald-500/40"
        handleClassName="!h-2.5 !w-2.5 !rounded-sm !bg-emerald-500"
        onResizeStart={() => setIsResizing(true)}
        onResizeEnd={() => setIsResizing(false)}
      />
      <Handle type="target" position={Position.Left} className="!bg-emerald-500" />
      <NodeHeader
        icon={<Globe size={13} />}
        editableValue={nodeData.label ?? ''}
        placeholder="Página Web"
        onTitleChange={handleLabelChange}
        className="bg-emerald-950/60 text-emerald-100"
        onRemove={() => void deleteElements({ nodes: [{ id }] })}
      />

      <div className="nodrag nowheel nopan flex items-center gap-1 border-b border-emerald-300/10 bg-emerald-950/30 px-2 py-1">
        <button
          type="button"
          onClick={() => webviewRef.current?.goBack()}
          disabled={!canGoBack}
          className="felixo-btn-icon rounded p-1 text-emerald-200/70 hover:bg-white/10 hover:text-emerald-100 disabled:cursor-not-allowed disabled:opacity-30"
          title="Voltar"
          aria-label="Voltar"
        >
          <ArrowLeft size={13} />
        </button>
        <button
          type="button"
          onClick={() => webviewRef.current?.goForward()}
          disabled={!canGoForward}
          className="felixo-btn-icon rounded p-1 text-emerald-200/70 hover:bg-white/10 hover:text-emerald-100 disabled:cursor-not-allowed disabled:opacity-30"
          title="Avançar"
          aria-label="Avançar"
        >
          <ArrowRight size={13} />
        </button>
        <button
          type="button"
          onClick={() => webviewRef.current?.reload()}
          className="felixo-btn-icon rounded p-1 text-emerald-200/70 hover:bg-white/10 hover:text-emerald-100"
          title="Recarregar"
          aria-label="Recarregar"
        >
          <RotateCw size={13} />
        </button>
        <input
          value={addressInput}
          onChange={(event) => setAddressInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              navigateTo(addressInput)
              event.currentTarget.blur()
            }
          }}
          placeholder="URL (ex: google.com)"
          className="min-w-0 flex-1 rounded bg-emerald-900/40 px-2 py-1 text-xs text-emerald-50 outline-none ring-1 ring-white/10 placeholder:text-emerald-300/40 focus:ring-emerald-500/50"
        />
      </div>

      {loadError && (
        <div className="nodrag border-b border-emerald-300/10 bg-red-950/40 px-2 py-1 text-[11px] text-red-300">
          {loadError}
        </div>
      )}

      {/* O <webview> é criado imperativamente por `mountWebview`, não em JSX —
          ver o comentário lá para o porquê. */}
      <div ref={mountWebview} className="relative min-h-0 flex-1">
        {/* <webview> composites above regular DOM content and can swallow the
            mousedown that starts a resize drag on the handles overlapping its
            edges — this stays inert except while actively resizing, so it
            never blocks clicks/scroll/typing inside the page itself. */}
        <div
          className={`absolute inset-0 ${
            selected && isResizing ? 'pointer-events-auto' : 'pointer-events-none'
          }`}
        />
      </div>

      <Handle type="source" position={Position.Right} className="!bg-emerald-500" />
    </div>
  )
}

export const WebpageNode = memo(WebpageNodeComponent)

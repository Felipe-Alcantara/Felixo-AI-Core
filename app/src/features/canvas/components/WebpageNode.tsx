import { memo, useEffect, useRef, useState } from 'react'
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
  const webviewRef = useRef<WebviewTag>(null)
  // Seeded once from the persisted URL — later navigation updates state/data,
  // never this prop, so the webview is never force-reloaded from underneath
  // the user by a re-render.
  const initialUrlRef = useRef(nodeData.url || 'https://www.google.com')
  const [addressInput, setAddressInput] = useState(initialUrlRef.current)
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
  onDataChangeRef.current = nodeData.onDataChange

  useEffect(() => {
    const webview = webviewRef.current
    if (!webview) return

    const syncHistoryState = () => {
      setCanGoBack(webview.canGoBack())
      setCanGoForward(webview.canGoForward())
    }

    const onDomReady = () => syncHistoryState()

    const onNavigate = () => {
      setLoadError(null)
      const url = webview.getURL()
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
  }, [id])

  const navigateTo = (raw: string) => {
    const normalized = normalizeUrlInput(raw)
    if (!normalized) return
    setAddressInput(normalized)
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

      <div className="relative min-h-0 flex-1">
        <webview
          ref={webviewRef}
          src={initialUrlRef.current}
          className="nodrag nowheel nopan h-full w-full"
          partition={SHARED_WEBVIEW_PARTITION}
          // OAuth logins (Google/Apple/Microsoft…) rely on a real popup window
          // that posts a message back to this page — denying window.open
          // breaks that handshake, so popups must be allowed here. The main
          // process (webview-lifecycle.cjs) still keeps plain target=_blank
          // links navigating in-place instead of opening a window.
          allowpopups
          webpreferences="contextIsolation=yes,nodeIntegration=no,sandbox=yes"
        />
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

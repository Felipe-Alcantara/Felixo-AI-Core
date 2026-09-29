import { memo, useCallback, useEffect, useId, useRef, useState } from 'react'
import { NODE_MIN_SIZE } from '../services/node-geometry'
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
  ExternalLink,
  Globe,
  RotateCw,
} from 'lucide-react'
import type { WebviewTag } from 'electron'
import { NodeHeader } from './NodeHeader'
import { explainUrlInput, persistableNavigationUrl } from '../services/url-utils'
import { openLinkChooser } from '../../shared/links/link-chooser-store'
import { runLinkChoice } from '../../shared/links/link-destination'
import {
  resolveGuestSrc,
  shouldCreateGuest,
  shouldRemoveOnDetach,
  staleGuests,
} from '../services/webview-mount'
import { WebviewProfileMenu } from './WebviewProfileMenu'
import { partitionForWebviewProfile } from '../services/webview-profile'
import { webviewLinkMenu, type WebviewContextMenuParams } from '../services/webview-context-menu'
import type { WebpageNodeData } from '../types'

/**
 * Data carried by a webpage node. `onDataChange` is injected by CanvasView so
 * navigation (current URL) flows back into canvas state and storage.
 */
type WebpageNodeDataWithHandler = WebpageNodeData & {
  onDataChange?: (nodeId: string, patch: Partial<WebpageNodeData>) => void
}

/**
 * A mini-browser docked in the canvas: an embedded <webview> with an address
 * bar and back/forward/reload, no URL restriction. Only the current URL is
 * persisted — back/forward history lives in the webview's own session and is
 * never serialized.
 *
 * "Sem restrição" quer dizer sem lista de domínios, não sem política: a barra
 * e a URL gravada seguem a política única de URL web, porque o processo
 * principal recusa qualquer outro `src` no attach do webview.
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
  // Blocos do mesmo perfil compartilham a sessão (logar num vale para os
  // outros); perfis diferentes têm partições diferentes. A partição sai direto
  // do id gravado no bloco, nunca da lista de perfis (que carrega depois): assim
  // um bloco de outro perfil nunca abre, nem por um instante, na sessão Padrão.
  const partition = partitionForWebviewProfile(nodeData.profileId)
  const [initialUrl] = useState(() => nodeData.url || 'https://www.google.com')
  const [addressInput, setAddressInput] = useState(initialUrl)
  // Tracks where the page actually is, so a remount recreates the webview on
  // the current URL instead of rewinding it to `initialUrl`.
  const currentUrlRef = useRef(initialUrl)
  const [canGoBack, setCanGoBack] = useState(false)
  const [canGoForward, setCanGoForward] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  // Endereço que a barra recusou, com o motivo. Antes, Enter num `file:///…`
  // simplesmente não fazia nada.
  const [addressError, setAddressError] = useState<string | null>(null)
  const addressErrorId = useId()
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
    element.setAttribute('partition', partition)
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
    // A identidade só muda quando o perfil (partição) muda: o React chama o
    // callback antigo com null (remove o guest) e o novo com o container, que
    // recria o webview na MESMA página (`currentUrlRef`) com a outra sessão.
  }, [initialUrl, partition])

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
      // A barra mostra onde a página está de fato, mesmo que seja um endereço
      // que o bloco não grava.
      setAddressInput(url)
      syncHistoryState()
      // Só vira `src` de remount (e dado salvo) o que o processo principal
      // aceita anexar. Um hash acima do limite, credenciais ou o about:blank
      // de um popup ficam só na página aberta; o bloco guarda a última URL
      // boa em vez de reabrir em branco depois.
      const persistable = persistableNavigationUrl(url)
      if (!persistable) return
      currentUrlRef.current = persistable
      onDataChangeRef.current?.(id, { url: persistable })
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

    // Clique direito (ou toque longo, ou a tecla de menu) num link da página:
    // o mesmo menu do terminal e do Markdown. O clique simples continua sendo
    // da página, que navega dentro do bloco. Longe de um link, nada muda.
    const onContextMenu = (event: { params: WebviewContextMenuParams }) => {
      // O ponto já vem no espaço da janela; falta só o zoom dela (ver
      // `webviewLinkMenu`). Lido a cada gesto: Ctrl+=/− não remonta o bloco.
      const link = webviewLinkMenu(event.params, window.felixo?.windowZoom?.getFactor?.() ?? 1)
      if (!link) return
      openLinkChooser({
        url: link.url,
        origin: 'pagina-web',
        anchor: link.anchor,
        sourceNodeId: id,
        returnFocus: webview,
      })
    }

    webview.addEventListener('dom-ready', onDomReady)
    webview.addEventListener('did-navigate', onNavigate)
    webview.addEventListener('did-navigate-in-page', onNavigate)
    webview.addEventListener('page-title-updated', onTitleUpdated)
    webview.addEventListener('did-fail-load', onFailLoad)
    webview.addEventListener('context-menu', onContextMenu)

    return () => {
      webview.removeEventListener('dom-ready', onDomReady)
      webview.removeEventListener('did-navigate', onNavigate)
      webview.removeEventListener('did-navigate-in-page', onNavigate)
      webview.removeEventListener('page-title-updated', onTitleUpdated)
      webview.removeEventListener('did-fail-load', onFailLoad)
      webview.removeEventListener('context-menu', onContextMenu)
    }
  }, [id, webview])

  const navigateTo = (raw: string) => {
    const result = explainUrlInput(raw)
    if (!result.ok) {
      // O texto fica na barra, para a pessoa corrigir em vez de redigitar.
      setAddressError(`Endereço não aberto: ${result.reason}.`)
      return
    }
    const normalized = result.url
    setAddressError(null)
    setAddressInput(normalized)
    currentUrlRef.current = normalized
    // A falha já aparece no bloco pelo `did-fail-load`. Sem o `catch`, a
    // rejeição ("ERR_… loading 'https://…?token=…'") viraria unhandledrejection
    // e iria inteira para o log de QA em disco, token de query incluído.
    // O `try` cobre o outro caminho: um webview que ainda não emitiu dom-ready
    // (a página inicial carregando, ou o guest que a troca de perfil acabou de
    // recriar) lança síncrono em vez de rejeitar. Nenhum dos dois registra
    // nada: a mensagem do Electron carrega a URL inteira.
    try {
      webviewRef.current?.loadURL(normalized).catch(() => {})
    } catch {
      // Sem guest pronto não há navegação a fazer agora. Um remount já nasce
      // no endereço novo (`currentUrlRef`); senão, o `did-navigate` da página
      // que estava carregando devolve a barra para onde ela está de fato.
    }
  }

  /**
   * Leva a página em que o bloco está para o navegador do sistema. O botão diz
   * o destino, então não pergunta; a política vale de novo aqui e no processo
   * principal.
   */
  const openInExternalBrowser = () => {
    let current = currentUrlRef.current
    try {
      // O guest que ainda não emitiu dom-ready lança em vez de responder.
      current = persistableNavigationUrl(webviewRef.current?.getURL()) ?? current
    } catch {
      // Fica a última URL boa que o bloco conhece.
    }
    runLinkChoice('abrir-no-navegador', current, 'pagina-web', {
      openExternal: (url) => {
        window.open(url, '_blank')
      },
      copy: () => {},
    })
  }

  const handleLabelChange = (label: string) => {
    labelCustomizedRef.current = true
    nodeData.onDataChange?.(id, { label })
  }

  return (
    <div className="felixo-canvas-card felixo-canvas-card-web flex h-full w-full flex-col overflow-hidden rounded-lg border border-white/10 bg-(--f-core-graphite) text-zinc-200 shadow-xl">
      <NodeResizer
        isVisible={selected}
        minWidth={NODE_MIN_SIZE.webpage.width}
        minHeight={NODE_MIN_SIZE.webpage.height}
        onResizeStart={() => setIsResizing(true)}
        onResizeEnd={() => setIsResizing(false)}
      />
      <Handle type="target" position={Position.Left} />
      <NodeHeader
        icon={<Globe size={13} />}
        editableValue={nodeData.label ?? ''}
        placeholder="Página Web"
        onTitleChange={handleLabelChange}
        className="bg-white/4 text-(--f-core-white)"
        onRemove={() => void deleteElements({ nodes: [{ id }] })}
      >
        <WebviewProfileMenu
          profileId={nodeData.profileId}
          onChange={(profileId) => nodeData.onDataChange?.(id, { profileId })}
        />
      </NodeHeader>

      <div className="nodrag nowheel nopan flex items-center gap-1 border-b border-white/10 bg-white/4 px-2 py-1">
        <button
          type="button"
          onClick={() => webviewRef.current?.goBack()}
          disabled={!canGoBack}
          className="felixo-btn-icon rounded-sm p-1 text-(--f-core-white-soft) hover:bg-white/10 hover:text-(--f-core-white) disabled:cursor-not-allowed disabled:opacity-30"
          title="Voltar"
          aria-label="Voltar"
        >
          <ArrowLeft size={13} />
        </button>
        <button
          type="button"
          onClick={() => webviewRef.current?.goForward()}
          disabled={!canGoForward}
          className="felixo-btn-icon rounded-sm p-1 text-(--f-core-white-soft) hover:bg-white/10 hover:text-(--f-core-white) disabled:cursor-not-allowed disabled:opacity-30"
          title="Avançar"
          aria-label="Avançar"
        >
          <ArrowRight size={13} />
        </button>
        <button
          type="button"
          onClick={() => webviewRef.current?.reload()}
          className="felixo-btn-icon rounded-sm p-1 text-(--f-core-white-soft) hover:bg-white/10 hover:text-(--f-core-white)"
          title="Recarregar"
          aria-label="Recarregar"
        >
          <RotateCw size={13} />
        </button>
        <input
          value={addressInput}
          onChange={(event) => {
            setAddressInput(event.target.value)
            setAddressError(null)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              navigateTo(addressInput)
              event.currentTarget.blur()
            }
          }}
          placeholder="URL (ex: google.com)"
          aria-label="Endereço da página"
          aria-invalid={addressError ? true : undefined}
          aria-describedby={addressError ? addressErrorId : undefined}
          className="min-w-0 flex-1 rounded-sm bg-white/4 px-2 py-1 text-xs text-(--f-core-white) outline-hidden ring-1 ring-white/10 placeholder:text-(--f-core-secondary) focus:ring-white/25"
        />
        <button
          type="button"
          onClick={openInExternalBrowser}
          className="felixo-btn-icon rounded-sm p-1 text-(--f-core-white-soft) hover:bg-white/10 hover:text-(--f-core-white)"
          title="Abrir esta página no navegador"
          aria-label="Abrir esta página no navegador"
        >
          <ExternalLink size={13} />
        </button>
      </div>

      {addressError && (
        <div
          id={addressErrorId}
          role="alert"
          className="nodrag border-b border-white/10 bg-[color-mix(in_srgb,var(--color-warning)_14%,transparent)] px-2 py-1 text-[11px] text-(--color-warning)"
        >
          {addressError}
        </div>
      )}

      {loadError && (
        <div className="nodrag border-b border-white/10 bg-[color-mix(in_srgb,var(--color-error)_14%,transparent)] px-2 py-1 text-[11px] text-theme-error">
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

      <Handle type="source" position={Position.Right} />
    </div>
  )
}

export const WebpageNode = memo(WebpageNodeComponent)

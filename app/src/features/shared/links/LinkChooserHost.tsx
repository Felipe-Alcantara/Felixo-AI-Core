import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { Copy, ExternalLink, Globe, Mail, ShieldAlert } from 'lucide-react'

import {
  describeLinkDestination,
  linkChoiceEntries,
  runLinkChoice,
  type LinkChoice,
  type LinkDestination,
} from './link-destination'
import {
  focusLeavesLinkChooser,
  afterCamera,
  focusWhenReady,
  linkChooserKeyAction,
  placeLinkChooser,
  restoresFocusOnDismiss,
  type LinkChooserDismissCause,
} from './link-chooser-menu'
import {
  closeLinkChooser,
  getLinkChooserState,
  getWebpageOpener,
  subscribeLinkChooser,
  type FocusReturn,
  type LinkChooserRequest,
  type OpenedWebpage,
} from './link-chooser-store'

/** O texto de um endereço gigante (até 8.192 caracteres) não precisa ir inteiro para a tela. */
const MAX_SHOWN_CHARS = 600
const COPIED_NOTICE_MS = 1400

type Point = { left: number; top: number }

/**
 * O menu "para onde abrir este link", o mesmo para o terminal, o Markdown e o
 * bloco Página Web. Montado uma vez no `App`, desenha o pedido que estiver no
 * `link-chooser-store`. Ao lado, uma região `status` anuncia "Link copiado",
 * porque o menu fecha no mesmo clique e nada mais mostraria que deu certo.
 */
export function LinkChooserHost() {
  const { request, version } = useSyncExternalStore(subscribeLinkChooser, getLinkChooserState)
  const [copiedAt, setCopiedAt] = useState<Point | null>(null)
  // Uma segunda cópia dentro do aviso não muda o texto da região `status`, e
  // o leitor de tela não anuncia de novo. A contagem troca o nó do aviso a
  // cada cópia, e nó novo é anunciado.
  const [copies, setCopies] = useState(0)
  const onCopied = useCallback((at: Point) => {
    setCopiedAt(at)
    setCopies((count) => count + 1)
  }, [])

  useEffect(() => {
    if (!copiedAt) return
    const timer = window.setTimeout(() => setCopiedAt(null), COPIED_NOTICE_MS)
    return () => window.clearTimeout(timer)
  }, [copiedAt])

  return (
    <>
      {request &&
        createPortal(
          <LinkChooserMenu key={version} request={request} onCopied={onCopied} />,
          document.body,
        )}
      {copiedAt &&
        createPortal(
          <div
            aria-hidden
            className="pointer-events-none fixed z-70 rounded-md border border-white/10 bg-(--f-surface-panel) px-2 py-1 text-xs text-(--f-core-white-soft) shadow-xl"
            style={copiedAt}
          >
            Link copiado
          </div>,
          document.body,
        )}
      <div role="status" aria-live="polite" className="sr-only">
        {copiedAt && <span key={copies}>Link copiado</span>}
      </div>
    </>
  )
}

type MenuProps = {
  request: LinkChooserRequest
  onCopied: (at: Point) => void
}

function LinkChooserMenu({ request, onCopied }: MenuProps) {
  const destination = useMemo(
    () => describeLinkDestination(request.url, request.origin),
    [request.url, request.origin],
  )
  // Lido ao abrir: sem canvas montado (tela do chat), não há onde criar o bloco.
  const [webpageOpener] = useState(getWebpageOpener)
  const entries = useMemo(
    () => linkChoiceEntries(destination, { canOpenWebpage: webpageOpener !== null }),
    [destination, webpageOpener],
  )
  const containerRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([])
  const [active, setActive] = useState(0)
  const [position, setPosition] = useState<Point | null>(null)
  const descriptionId = useId()

  // Mede o menu já desenhado (fora da tela) e só então o põe no lugar: a
  // altura depende do destino, que pode ocupar de uma a várias linhas.
  useLayoutEffect(() => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    setPosition(
      placeLinkChooser(
        request.anchor,
        { width: rect.width, height: rect.height },
        { width: window.innerWidth, height: window.innerHeight },
      ),
    )
  }, [request.anchor])

  useEffect(() => {
    // Ao abrir, um quadro depois: o gesto que abriu o menu (o `mouseup` do
    // xterm, o clique no link) ainda pode devolver o foco a quem foi clicado.
    const frame = window.requestAnimationFrame(() => itemRefs.current[0]?.focus())
    return () => window.cancelAnimationFrame(frame)
  }, [])

  /** Setas, Home e End: o foco anda na hora da tecla, sem esperar um quadro. */
  const moveTo = (index: number) => {
    setActive(index)
    itemRefs.current[index]?.focus()
  }

  const returnFocus = request.returnFocus
  /** Fecha sem escolha; `restoresFocusOnDismiss` diz quando o foco volta a quem abriu. */
  const dismiss = useCallback(
    (cause: LinkChooserDismissCause) => {
      const focusWasInMenu = Boolean(containerRef.current?.contains(document.activeElement))
      closeLinkChooser()
      if (restoresFocusOnDismiss(cause, focusWasInMenu)) restoreFocus(returnFocus)
    },
    [returnFocus],
  )

  useEffect(() => {
    const isOutside = (target: EventTarget | null) =>
      !(target instanceof Node && containerRef.current?.contains(target))
    const onPointerDown = (event: PointerEvent) => {
      if (isOutside(event.target)) dismiss('pointer-outside')
    }
    // O canvas se move com a roda: o menu ficaria preso a um ponto que já não
    // é o link.
    const onWheel = (event: WheelEvent) => {
      if (isOutside(event.target)) dismiss('wheel')
    }
    const onResize = () => dismiss('resize')
    // Clicar dentro de uma Página Web não chega a este documento: o foco sai
    // da janela para a página, e é isso que fecha o menu.
    const onBlur = () => dismiss('window-blur')
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('wheel', onWheel, { capture: true, passive: true })
    window.addEventListener('resize', onResize)
    window.addEventListener('blur', onBlur)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('wheel', onWheel, { capture: true })
      window.removeEventListener('resize', onResize)
      window.removeEventListener('blur', onBlur)
    }
  }, [dismiss])

  const choose = (choice: LinkChoice) => {
    let opened: OpenedWebpage | undefined
    runLinkChoice(choice, request.url, request.origin, {
      openExternal: (url) => {
        // O processo principal recebe o pedido de janela, aplica a política de
        // novo e entrega ao sistema; nenhuma janela nova nasce no app.
        window.open(url, '_blank')
      },
      openWebpage: webpageOpener
        ? (url) => {
            opened = webpageOpener(url, request.sourceNodeId)
          }
        : undefined,
      copy: (text) => {
        const at = position ?? { left: request.anchor.x, top: request.anchor.y }
        void globalThis.navigator?.clipboard?.writeText(text).then(
          () => onCopied(at),
          () => undefined,
        )
      },
    })
    closeLinkChooser()
    // O foco volta já para quem abriu: com o menu desmontado, ele cairia no
    // `body` durante o voo da câmera até o bloco novo.
    restoreFocus(request.returnFocus)
    if (opened) focusCanvasNodeAfterCamera(opened, request.returnFocus)
  }

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    // Nenhuma tecla dentro do menu chega aos atalhos do canvas (Backspace
    // apagaria o bloco selecionado atrás do menu).
    event.stopPropagation()
    const action = linkChooserKeyAction(event.key, active, entries.length, event.repeat)
    if (!action) return
    // No `ignore`, é o `preventDefault` que segura o clique do item.
    event.preventDefault()
    if (action.type === 'ignore') return
    if (action.type === 'move') {
      moveTo(action.index)
      return
    }
    closeLinkChooser()
    restoreFocus(request.returnFocus)
  }

  return (
    <div
      ref={containerRef}
      // Focável só por clique: clicar no resumo ou na margem levaria o foco
      // para o `body`, e daí Esc e setas paravam de funcionar, o Esc chegava
      // aos ouvintes do documento (um modal por trás fechava) e, no canvas,
      // Backspace/Delete apagavam o bloco selecionado. Sem anel: quem está no
      // teclado continua nos itens.
      tabIndex={-1}
      // Nunca mais alto que a janela: com o resumo comprido (um e-mail com
      // muitos destinatários), o menu rola, e o foco num item o traz à vista.
      className="fixed z-70 max-h-[calc(100vh-16px)] w-72 max-w-[calc(100vw-16px)] overflow-y-auto rounded-lg border border-white/10 bg-(--f-surface-panel) p-1.5 text-xs text-(--f-core-white-soft) shadow-2xl outline-hidden"
      style={
        position
          ? { left: position.left, top: position.top }
          : { left: 0, top: 0, visibility: 'hidden' }
      }
      data-felixo-link-chooser
      // Clicar no menu não é "clicar fora" para a gaveta do terminal de onde
      // o link veio (ver `FLOATING_LAYER_SELECTOR`).
      data-felixo-floating-layer
      onKeyDown={onKeyDown}
      onBlur={(event) => {
        if (focusLeavesLinkChooser(containerRef.current, event.relatedTarget)) dismiss('focus-left')
      }}
    >
      <DestinationSummary id={descriptionId} destination={destination} />
      <div
        role="menu"
        aria-label="Abrir link"
        aria-describedby={descriptionId}
        className="mt-1 flex flex-col border-t border-white/10 pt-1"
      >
        {entries.map((entry, index) => (
          <button
            key={entry.choice}
            ref={(element) => {
              itemRefs.current[index] = element
            }}
            type="button"
            role="menuitem"
            tabIndex={index === active ? 0 : -1}
            onClick={() => choose(entry.choice)}
            data-link-choice={entry.choice}
            // `any-pointer`, não `pointer`: num notebook com tela sensível o
            // ponteiro principal é o touchpad, e o dedo ficaria com o alvo fino.
            className="felixo-btn-flat flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left hover:bg-white/10 focus-visible:bg-white/10 any-pointer-coarse:py-2.5"
          >
            <ChoiceIcon choice={entry.choice} destination={destination} />
            {entry.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function DestinationSummary({ id, destination }: { id: string; destination: LinkDestination }) {
  if (!destination.ok) {
    return (
      <div id={id} className="px-2 pb-1 pt-0.5">
        <p className="flex items-center gap-1 font-medium text-(--color-warning)">
          <ShieldAlert size={12} aria-hidden /> Link recusado
        </p>
        <p className="mt-0.5">{capitalize(destination.reason)}.</p>
        {destination.shownText && (
          <p className="mt-1 line-clamp-3 break-all font-mono text-[11px] text-(--f-core-secondary)">
            {shorten(destination.shownText)}
          </p>
        )}
      </div>
    )
  }

  return (
    <div id={id} className="px-2 pb-1 pt-0.5">
      <p className="text-[10px] uppercase tracking-wide text-(--f-core-secondary)">
        {destination.kind === 'email' ? 'E-mail para' : 'Leva a'}
      </p>
      <p className="break-all font-medium text-(--f-core-white)">{destination.headline}</p>
      {/* Fora do corte da URL: um `bcc` para um terceiro não passa sem ser lido. */}
      {destination.kind === 'email' &&
        destination.extraRecipients.map((recipients) => (
          <p key={recipients.label} className="break-all">
            <span className="text-(--f-core-secondary)">{recipients.label}:</span>{' '}
            <span className="font-medium text-(--f-core-white)">{recipients.addresses}</span>
          </p>
        ))}
      <p
        className="mt-0.5 line-clamp-3 break-all font-mono text-[11px] text-(--f-core-secondary)"
        title={destination.url.length > MAX_SHOWN_CHARS ? undefined : destination.url}
      >
        {shorten(destination.url)}
      </p>
    </div>
  )
}

function ChoiceIcon({ choice, destination }: { choice: LinkChoice; destination: LinkDestination }) {
  if (choice === 'copiar-link') return <Copy size={13} aria-hidden />
  if (choice === 'abrir-como-pagina-web') return <Globe size={13} aria-hidden />
  return destination.ok && destination.kind === 'email' ? (
    <Mail size={13} aria-hidden />
  ) : (
    <ExternalLink size={13} aria-hidden />
  )
}

function capitalize(text: string): string {
  return text ? `${text[0].toUpperCase()}${text.slice(1)}` : text
}

function shorten(text: string): string {
  return text.length > MAX_SHOWN_CHARS ? `${text.slice(0, MAX_SHOWN_CHARS - 1)}…` : text
}

function restoreFocus(target: FocusReturn | null | undefined): void {
  if (target?.isConnected) target.focus()
}

/**
 * O bloco novo recebe o foco quando a câmera chega nele, para quem está no
 * teclado continuar dali. Antes disso não adianta: o bloco nascido fora da
 * tela entra no DOM na hora, sai quando o React Flow o mede fora do container
 * e só volta com a câmera (ver `OpenedWebpage`). Enquanto isso o foco fica em
 * quem abriu o menu; se a pessoa levar o foco a outro lugar no meio, ele fica
 * lá. `preventScroll`: focar um nó não pode rolar o container do React Flow.
 */
function focusCanvasNodeAfterCamera(opened: OpenedWebpage, origin: FocusReturn | null | undefined): void {
  void afterCamera(opened.cameraSettled).then(() =>
    focusWhenReady({
      find: () => {
        const node = document.querySelector<HTMLElement>(
          `.react-flow__node[data-id="${CSS.escape(opened.id)}"]`,
        )
        return node ? { focus: () => node.focus({ preventScroll: true }) } : null
      },
      isFocusFree: () => {
        const active = document.activeElement
        return !active || active === document.body || active === (origin as unknown as Element | null)
      },
      // O foco já está em quem abriu o menu.
      giveUp: () => undefined,
      requestFrame: (callback) => window.requestAnimationFrame(callback),
    }),
  )
}

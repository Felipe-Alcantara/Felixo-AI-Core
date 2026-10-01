import type { MouseEvent, ReactNode } from 'react'
import { CircleHelp } from 'lucide-react'

import { chooserAnchorFor, canvasNodeIdOf } from '../links/link-anchor'
import { openLinkChooser } from '../links/link-chooser-store'
import { describeLinkDestination } from '../links/link-destination'
import { scrollToMarkdownAnchor } from './markdown-heading-anchor'
import { isRelativeMarkdownLink } from './markdown-image-src'

/** Destino, dentro do app, de um link relativo que o documento conhece. */
export type MarkdownRelativeLink = {
  /** Dica do botão, dizendo o que o clique abre. */
  description: string
  open: () => void
}

/**
 * Diz para onde um link relativo (`OUTRO.md`, `../docs/GUIA.md`) leva dentro
 * da tela que mostra o documento, ou `null` quando o destino não existe ali.
 */
export type ResolveMarkdownRelativeLink = (href: string) => MarkdownRelativeLink | null

type MarkdownLinkProps = {
  /** Já passado por `urlTransform`: seguro, relativo (se houver resolvedor) ou vazio. */
  href?: string
  /**
   * O destino como o documento o escreveu, antes do `rehype-sanitize` e da
   * política. Só vira link pela forma que a política serializa; recusado, só
   * é mostrado e copiado pelo menu, nunca abre nada.
   */
  writtenHref?: string
  children?: ReactNode
  resolveRelativeLink?: ResolveMarkdownRelativeLink
}

const LINK_CLASS_NAME =
  'font-medium text-(--f-core-white) underline decoration-white/30 underline-offset-4 hover:text-(--f-core-white)'

// Tracejado: parece link (tem para onde ir, e a dica diz para onde), mas
// avisa que não é um link que abre. É só texto; o botão ao lado abre o menu.
const REFUSED_LINK_CLASS_NAME =
  'font-medium text-(--f-core-white-soft) underline decoration-dashed decoration-white/30 underline-offset-4'

const REFUSED_LINK_BUTTON_CLASS_NAME =
  'felixo-btn-icon ml-0.5 inline-flex rounded-xs p-0.5 align-middle text-(--f-core-white-soft) hover:text-(--f-core-white)'

const REFUSED_LINK_BUTTON_LABEL = 'Por que este link não abre'

const LINK_HINT = 'Clique para escolher onde abrir'

/**
 * Controles que podem ficar DENTRO de um link do Markdown: o "copiar" de um
 * bloco de código que um `<a>` de HTML cru embrulha, a caixa de tarefa do
 * GFM, o `summary` de um `details`.
 */
const INNER_CONTROL_SELECTOR = 'button, input, textarea, select, summary, [role="button"]'

// A dica é para ler o destino, não para guardar um `data:` de 100 KB: o
// endereço inteiro vai pelo "Copiar link" do menu.
const REFUSED_TITLE_MAX_CHARS = 200

/**
 * Link do Markdown. Só o que a política única de URL externa aprova
 * (`external-url-policy`: `http(s)` e `mailto`) pode sair do app, e nunca
 * direto: o clique (ou Enter, ou o clique direito) abre o menu que mostra o
 * destino e pergunta navegador, Página Web ou copiar. Quem abre é o processo
 * principal, que revalida. Todo o resto fica na tela.
 *
 * - `#âncora` rola até o título do mesmo conteúdo;
 * - link relativo que o documento conhece vira botão que abre o destino;
 * - link recusado vira texto com o motivo na dica e, ao lado, um botão que
 *   abre o mesmo menu, com o motivo e só "Copiar";
 * - link sem destino nenhum vira texto.
 */
export function MarkdownLink({
  href = '',
  writtenHref,
  children,
  resolveRelativeLink,
}: MarkdownLinkProps) {
  if (href.startsWith('#')) {
    return (
      <a
        className={LINK_CLASS_NAME}
        href={href}
        onClick={(event) => followAnchor(event, href)}
        // Clique do meio abriria o fragmento numa janela nova, isto é, no
        // navegador do sistema.
        onAuxClick={(event) => event.preventDefault()}
      >
        {children}
      </a>
    )
  }

  if (isRelativeMarkdownLink(href)) {
    const link = resolveRelativeLink?.(href)

    // Botão, não `<a href>`: um href relativo levaria a janela do app (ou uma
    // janela nova) para um caminho que só existe no documento.
    return link ? (
      <button
        type="button"
        className={`felixo-btn-flat inline rounded-xs text-left ${LINK_CLASS_NAME}`}
        title={link.description}
        onClick={() => link.open()}
      >
        {children}
      </button>
    ) : (
      <span>{children}</span>
    )
  }

  if (!href) {
    const written = refusedDestination(writtenHref)
    if (!written) return <span>{children}</span>

    const destination = describeLinkDestination(written, 'markdown')
    // O sanitize do Markdown compara o esquema com caixa e apaga um
    // `HTTPS://…` que a política aceita. O link volta pela forma que a
    // política serializou — a mesma que o processo principal revalida.
    if (destination.ok) return <ExternalMarkdownLink href={destination.url}>{children}</ExternalMarkdownLink>

    // Recusar tira o abrir, não o endereço: um
    // `https://usuario@git.empresa.com/repo.git` que a pessoa queria de fato
    // continua visível e copiável, e o menu diz por que não abre. Nada aqui
    // navega, e o texto não vira `<a>`.
    //
    // O rótulo não é o botão: um `<a>` de HTML cru pode embrulhar um bloco de
    // código, e um botão em volta dele punha o "copiar" do bloco dentro de
    // outro botão, e o clique em "copiar" abria o menu junto. O botão de
    // ícone ao lado não embrulha nada.
    return (
      <>
        <span
          className={REFUSED_LINK_CLASS_NAME}
          title={`Link recusado: ${destination.reason}\n${shortenForTitle(destination.shownText)}`}
          data-refused-link="true"
        >
          {children}
        </span>
        <button
          type="button"
          className={REFUSED_LINK_BUTTON_CLASS_NAME}
          title={REFUSED_LINK_BUTTON_LABEL}
          aria-label={REFUSED_LINK_BUTTON_LABEL}
          onClick={(event) => askWhereToOpen(event, written)}
          onContextMenu={(event) => askWhereToOpen(event, written)}
        >
          <CircleHelp size={12} />
        </button>
      </>
    )
  }

  return <ExternalMarkdownLink href={href}>{children}</ExternalMarkdownLink>
}

/**
 * `<a>` de verdade (leitor de tela anuncia "link", Tab chega nele), mas o
 * navegador nunca segue o `href`: clique, Enter e clique direito pedem o menu,
 * e o clique do meio não faz nada. O `title` traz o destino porque o Electron
 * não tem barra de status, e o texto do link pode dizer outra coisa
 * (`[banco.com](https://outro)`).
 */
function ExternalMarkdownLink({ href, children }: { href: string; children?: ReactNode }) {
  return (
    <a
      className={LINK_CLASS_NAME}
      href={href}
      rel="noreferrer"
      title={`${href}\n${LINK_HINT}`}
      onClick={(event) => askWhereToOpen(event, href)}
      onContextMenu={(event) => askWhereToOpen(event, href)}
      // Clique do meio abriria o link numa janela nova, isto é, no navegador
      // do sistema, sem perguntar.
      onAuxClick={(event) => event.preventDefault()}
    >
      {children}
    </a>
  )
}

function askWhereToOpen(event: MouseEvent<HTMLElement>, url: string) {
  // Sempre, até quando o clique é de um controle de dentro do link: o
  // navegador nunca segue o `href`.
  event.preventDefault()
  // O "copiar" de um bloco de código dentro do link faz a ação dele, e só
  // ela: o clique sobe até o `<a>`, mas não é um pedido para abrir o link.
  if (isFromInnerControl(event)) return
  // O clique direito num link não é o do bloco: sem isto, o menu do nó do
  // canvas abriria junto.
  event.stopPropagation()
  const element = event.currentTarget
  openLinkChooser({
    url,
    origin: 'markdown',
    anchor: chooserAnchorFor(event, element),
    sourceNodeId: canvasNodeIdOf(element),
    returnFocus: element,
  })
}

/**
 * O gesto foi num controle que fica dentro do elemento que ouve o evento, e
 * não nele mesmo? O botão de ícone do link recusado é ele mesmo um `button`:
 * o clique no ícone dele conta como clique no botão.
 */
function isFromInnerControl(event: MouseEvent<HTMLElement>): boolean {
  const link = event.currentTarget
  // O alvo de um evento de mouse é um elemento; sem `closest`, não é controle.
  const target = event.target as Partial<Pick<Element, 'closest'>> | null
  const control = target?.closest?.(INNER_CONTROL_SELECTOR)
  return control != null && control !== link && link.contains(control)
}

/**
 * O destino escrito que vale mostrar (e, se a política aprovar, abrir), ou
 * `null`.
 *
 * Âncora e link relativo ficam de fora: não são recusa, só não têm para onde
 * ir sem um resolvedor. Destino com invisível ou controle entra, como recusa:
 * a política nunca o aprova, e a dica e o menu mostram o texto com cada
 * invisível à mostra (`exa⟨U+200B⟩mple.com`) — o disfarce não funciona na
 * tela, e a pessoa vê por que o link não abre.
 */
function refusedDestination(writtenHref: string | undefined): string | null {
  const value = writtenHref?.trim()

  if (!value) return null
  if (value.startsWith('#') || isRelativeMarkdownLink(value)) return null

  return value
}

function shortenForTitle(value: string): string {
  return value.length > REFUSED_TITLE_MAX_CHARS
    ? `${value.slice(0, REFUSED_TITLE_MAX_CHARS - 1)}…`
    : value
}

function followAnchor(event: MouseEvent<HTMLAnchorElement>, href: string) {
  // Sempre: mesmo sem título correspondente, o fragmento não pode trocar o
  // endereço da janela do app.
  event.preventDefault()
  scrollToMarkdownAnchor(event.currentTarget, href)
}

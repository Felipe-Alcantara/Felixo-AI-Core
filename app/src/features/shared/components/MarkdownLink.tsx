import type { MouseEvent, ReactNode } from 'react'
import { Copy } from 'lucide-react'

import { hasHiddenUrlCharacters } from '../external-url-policy'
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
   * política. Só serve para mostrar e copiar um link recusado: nunca vira
   * `href`, nem abre nada.
   */
  writtenHref?: string
  children?: ReactNode
  resolveRelativeLink?: ResolveMarkdownRelativeLink
}

const LINK_CLASS_NAME =
  'font-medium text-(--f-core-white) underline decoration-white/30 underline-offset-4 hover:text-(--f-core-white)'

const REFUSED_COPY_BUTTON_CLASS_NAME =
  'felixo-btn-flat ml-0.5 inline-flex items-center rounded-xs p-0.5 align-middle text-zinc-500 hover:bg-white/6 hover:text-zinc-300'

// A dica é para ler o destino, não para guardar um `data:` de 100 KB: o
// endereço inteiro vai pelo botão de copiar.
const REFUSED_TITLE_MAX_CHARS = 200

/**
 * Link do Markdown. Só o que a política única de URL externa aprova
 * (`external-url-policy`: `http(s)` e `mailto`) sai do app, numa janela nova
 * que o processo principal revalida e manda para o navegador ou o cliente de
 * e-mail do sistema. Todo o resto fica
 * na tela: sem isto, um `<a target="_blank">` sem destino seguro abria o
 * navegador na raiz do próprio renderer.
 *
 * - `#âncora` rola até o título do mesmo conteúdo;
 * - link relativo que o documento conhece vira botão que abre o destino;
 * - link recusado vira texto com o destino na dica e um botão que só copia;
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
    const refused = refusedDestination(writtenHref)
    if (!refused) return <span>{children}</span>

    // Recusar tira o clique, não o endereço: antes, o destino sumia junto com
    // o link, e um `https://usuario@git.empresa.com/repo.git` que a pessoa
    // queria de fato não dava para ver nem copiar. Copiar é inofensivo mesmo
    // para `javascript:`; o botão não navega, e o texto não vira `<a>`.
    return (
      <>
        <span title={`Link recusado por segurança: ${shortenForTitle(refused)}`}>
          {children}
        </span>
        <button
          type="button"
          aria-label="Copiar endereço recusado"
          className={REFUSED_COPY_BUTTON_CLASS_NAME}
          title="Copiar endereço recusado"
          onClick={() => copyRefusedDestination(refused)}
        >
          <Copy size={11} />
        </button>
      </>
    )
  }

  // `title` com o destino: o Electron não tem a barra de status do navegador,
  // e o texto do link pode dizer outra coisa (`[banco.com](https://outro)`).
  return (
    <a className={LINK_CLASS_NAME} href={href} rel="noreferrer" target="_blank" title={href}>
      {children}
    </a>
  )
}

/**
 * O destino escrito que vale mostrar como recusado, ou `null`.
 *
 * Âncora e link relativo ficam de fora: não são recusa, só não têm para onde
 * ir sem um resolvedor. Destino com invisível ou controle também: a dica
 * mostraria um texto e a cópia levaria outro (U+202E inverte o que se lê), e
 * é a mesma escolha que `remarkRefuseHiddenUrlCharacters` já faz para a
 * sintaxe de link do Markdown.
 */
function refusedDestination(writtenHref: string | undefined): string | null {
  const value = writtenHref?.trim()

  if (!value) return null
  if (value.startsWith('#') || isRelativeMarkdownLink(value)) return null
  if (hasHiddenUrlCharacters(value)) return null

  return value
}

function shortenForTitle(value: string): string {
  return value.length > REFUSED_TITLE_MAX_CHARS
    ? `${value.slice(0, REFUSED_TITLE_MAX_CHARS - 1)}…`
    : value
}

function copyRefusedDestination(value: string) {
  // Só a área de transferência, nunca uma navegação. Sem permissão de
  // clipboard (ou fora do navegador), o clique simplesmente não faz nada.
  void globalThis.navigator?.clipboard?.writeText(value).catch(() => undefined)
}

function followAnchor(event: MouseEvent<HTMLAnchorElement>, href: string) {
  // Sempre: mesmo sem título correspondente, o fragmento não pode trocar o
  // endereço da janela do app.
  event.preventDefault()
  scrollToMarkdownAnchor(event.currentTarget, href)
}

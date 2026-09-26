import type { MouseEvent, ReactNode } from 'react'

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
  children?: ReactNode
  resolveRelativeLink?: ResolveMarkdownRelativeLink
}

const LINK_CLASS_NAME =
  'font-medium text-[var(--f-core-white)] underline decoration-white/30 underline-offset-4 hover:text-[var(--f-core-white)]'

/**
 * Link do Markdown. Só `http(s)` e `mailto` saem do app, numa janela nova que
 * o processo principal manda para o navegador do sistema. Todo o resto fica
 * na tela: sem isto, um `<a target="_blank">` sem destino seguro abria o
 * navegador na raiz do próprio renderer.
 *
 * - `#âncora` rola até o título do mesmo conteúdo;
 * - link relativo que o documento conhece vira botão que abre o destino;
 * - link sem destino seguro vira texto.
 */
export function MarkdownLink({ href = '', children, resolveRelativeLink }: MarkdownLinkProps) {
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
        className={`felixo-btn-flat inline rounded-sm text-left ${LINK_CLASS_NAME}`}
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
    return <span>{children}</span>
  }

  return (
    <a className={LINK_CLASS_NAME} href={href} rel="noreferrer" target="_blank">
      {children}
    </a>
  )
}

function followAnchor(event: MouseEvent<HTMLAnchorElement>, href: string) {
  // Sempre: mesmo sem título correspondente, o fragmento não pode trocar o
  // endereço da janela do app.
  event.preventDefault()
  scrollToMarkdownAnchor(event.currentTarget, href)
}

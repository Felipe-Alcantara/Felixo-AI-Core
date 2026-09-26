/**
 * Âncoras de título do Markdown renderizado: `[Como usar](#como-usar)` leva
 * ao título "Como usar" do mesmo conteúdo, como no GitHub, sem mudar o
 * endereço da janela nem abrir o navegador do sistema.
 *
 * O título não ganha `id`: o mesmo slug se repetiria em cada mensagem do chat
 * e poderia colidir com um `id` da própria interface. A âncora vai em
 * `data-markdown-anchor` e é procurada só dentro do conteúdo do link.
 */

export const MARKDOWN_ANCHOR_ATTRIBUTE = 'data-markdown-anchor'

const MARKDOWN_ROOT_SELECTOR = '.markdown-content'

// Seletores de variação (U+FE00–U+FE0F) acompanham emoji como "✍️": o slug do
// GitHub às vezes os mantém e quem escreve o link à mão quase nunca.
const VARIATION_SELECTORS = /[︀-️]/g

// Mesma regra do slug de título do GitHub: fica letra, marca, número, `_`,
// espaço e hífen; o resto (pontuação, emoji, símbolos) sai.
const NON_SLUG_CHARACTERS = /[^\p{L}\p{M}\p{N}\p{Pc} -]/gu

export function markdownHeadingSlug(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(VARIATION_SELECTORS, '')
    .replace(NON_SLUG_CHARACTERS, '')
    .replace(/ /g, '-')
}

/** Slug que um link `#fragmento` procura, ou `null` se não for um. */
export function markdownFragmentSlug(href: string): string | null {
  if (!href.startsWith('#')) return null

  const slug = decodeFragment(href.slice(1))
    .toLowerCase()
    .replace(VARIATION_SELECTORS, '')

  return slug || null
}

/**
 * Rola o contêiner rolável mais próximo até o título que a âncora aponta,
 * procurando só no conteúdo Markdown que contém o link. Só esse contêiner se
 * move: `scrollIntoView` também arrastaria o painel inteiro.
 */
export function scrollToMarkdownAnchor(link: Element, href: string): boolean {
  const slug = markdownFragmentSlug(href)
  const root = link.closest(MARKDOWN_ROOT_SELECTOR)
  if (!slug || !root) return false

  const heading = Array.from(
    root.querySelectorAll<HTMLElement>(`[${MARKDOWN_ANCHOR_ATTRIBUTE}]`),
  ).find((element) => element.getAttribute(MARKDOWN_ANCHOR_ATTRIBUTE) === slug)
  if (!heading) return false

  const scroller = closestScrollContainer(heading)
  if (!scroller) {
    heading.scrollIntoView({ block: 'start' })
    return true
  }

  const offset = heading.getBoundingClientRect().top - scroller.getBoundingClientRect().top
  scroller.scrollTo({ top: scroller.scrollTop + offset })
  return true
}

function closestScrollContainer(element: HTMLElement): HTMLElement | null {
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    const { overflowY } = getComputedStyle(parent)
    if (/(auto|scroll|overlay)/.test(overflowY) && parent.scrollHeight > parent.clientHeight) {
      return parent
    }
  }

  return null
}

function decodeFragment(fragment: string): string {
  try {
    return decodeURIComponent(fragment)
  } catch {
    return fragment
  }
}

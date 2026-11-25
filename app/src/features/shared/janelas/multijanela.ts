/**
 * Primitivas multijanela do renderer. O app tem UM renderer (o da janela
 * principal) e desenha nas janelas auxiliares por portal: o `window` e o
 * `document` globais são sempre os da principal. Todo código que roda DENTRO de
 * um elemento que pode ser movido de janela (terminal, menu, popover) precisa
 * perguntar "em que janela este elemento está?" em vez de usar o global.
 *
 * Armadilha conhecida: cada janela tem as suas classes (`Element`, `Node`...),
 * então `x instanceof Element` falha para um nó de outra janela. Use `nodeType`.
 */

/** Prefixo do nome de quadro que o processo principal aceita (`electron/windows/aux-windows.cjs`). */
export const AUX_FRAME_PREFIX = 'felixo-aux-'

/** O documento onde o nó está (ou o global, se ele ainda não está em nenhum). */
export function documentoDe(no: Node | null | undefined): Document {
  if (!no) return document
  return no.nodeType === 9 ? (no as Document) : (no.ownerDocument ?? document)
}

/** A janela onde o nó está: dela vêm `addEventListener` de teclado/resize, `devicePixelRatio` e `getComputedStyle`. */
export function janelaDe(no: Node | null | undefined): Window {
  return documentoDe(no).defaultView ?? window
}

/** O nó pertence a uma janela que não é a principal? */
export function estaEmJanelaAuxiliar(no: Node | null | undefined): boolean {
  return janelaDe(no) !== window
}

/**
 * Abre (ou reaproveita, pelo mesmo nome) a janela auxiliar `id`. O processo
 * principal só aceita este formato exato; devolve null se o navegador negou.
 */
export function abrirJanelaAuxiliar(id: string): Window | null {
  return window.open('about:blank', `${AUX_FRAME_PREFIX}${id}`)
}

/**
 * Copia para a auxiliar os estilos da principal (Tailwind/Vite em dev e no
 * build) e acompanha as mudanças (HMR, tema) com um `MutationObserver`.
 * Devolve a função que para de acompanhar.
 */
export function clonarEstilos(origem: Document, destino: Document): () => void {
  const copias = new Map<Node, Node>()

  const eEstilo = (no: Node): no is HTMLElement =>
    no.nodeType === 1 &&
    ((no as HTMLElement).tagName === 'STYLE' ||
      ((no as HTMLElement).tagName === 'LINK' && (no as HTMLLinkElement).rel === 'stylesheet'))

  const copiar = (no: Node) => {
    if (copias.has(no) || !eEstilo(no)) return
    const copia = destino.importNode(no, true)
    copias.set(no, copia)
    destino.head.appendChild(copia)
  }
  const sincronizar = () => {
    origem.head.childNodes.forEach(copiar)
    for (const [no, copia] of copias) {
      if (!origem.head.contains(no)) {
        copia.parentNode?.removeChild(copia)
        copias.delete(no)
      } else if (no.nodeName === 'STYLE' && copia.textContent !== no.textContent) {
        copia.textContent = no.textContent
      }
    }
  }

  sincronizar()
  // Classe do tema (`dark`) e fundo: a auxiliar espelha o <html> da principal.
  destino.documentElement.className = origem.documentElement.className
  const observador = new MutationObserver(() => {
    sincronizar()
    destino.documentElement.className = origem.documentElement.className
  })
  observador.observe(origem.head, { childList: true, subtree: true, characterData: true })
  observador.observe(origem.documentElement, { attributes: true, attributeFilter: ['class'] })
  return () => observador.disconnect()
}

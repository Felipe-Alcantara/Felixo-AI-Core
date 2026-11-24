import { isValidElement, type ReactElement, type ReactNode } from 'react'

/** Props de um elemento de teste: o que a árvore carrega é qualquer coisa, e o teste confere. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type TestElement = ReactElement<any>

/**
 * Todos os elementos da árvore que `predicado` aceita, em ordem. O repositório testa em Node, sem DOM: um componente de
 * apresentação é chamado como função e a árvore que ele devolve é percorrida aqui para achar o botão e disparar o
 * `onClick` que a tela ligaria. Componentes aninhados (`<Icone />`) não são expandidos: contam como folha.
 */
export function acharTodos(no: ReactNode, predicado: (elemento: TestElement) => boolean): TestElement[] {
  const achados: TestElement[] = []
  const visitar = (atual: ReactNode) => {
    if (Array.isArray(atual)) {
      atual.forEach(visitar)
      return
    }
    if (!isValidElement(atual)) return
    const elemento = atual as TestElement
    if (predicado(elemento)) achados.push(elemento)
    visitar(elemento.props.children)
  }
  visitar(no)
  return achados
}

/** Texto visível de um nó (o que um leitor de tela leria, sem os atributos). */
export function textoDe(no: ReactNode): string {
  if (no === null || no === undefined || typeof no === 'boolean') return ''
  if (typeof no === 'string' || typeof no === 'number') return String(no)
  if (Array.isArray(no)) return no.map(textoDe).join('')
  if (isValidElement(no)) return textoDe((no as TestElement).props.children)
  return ''
}

/** Botões `<button>` da árvore. */
export const botoes = (no: ReactNode) => acharTodos(no, (e) => e.type === 'button')

/** O botão cujo texto ou `aria-label` casa com `padrao`; falha de forma legível quando não há. */
export function botaoPor(no: ReactNode, padrao: RegExp): TestElement {
  const achado = botoes(no).find((b) => padrao.test(b.props['aria-label'] ?? '') || padrao.test(textoDe(b).trim()))
  if (!achado) {
    throw new Error(`botão não encontrado: ${padrao}. Botões: ${botoes(no).map((b) => b.props['aria-label'] ?? textoDe(b)).join(' | ')}`)
  }
  return achado
}

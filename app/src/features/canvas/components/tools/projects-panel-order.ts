/**
 * Ordem de exibição da lista de projetos do canvas.
 *
 * O backend devolve os projetos por `updated_at DESC` — útil para um seletor,
 * em que o projeto usado por último costuma ser o próximo. Já numa lista que
 * existe para *encontrar* uma pasta, essa ordem muda a cada uso e obriga a
 * varrer tudo de novo; ordem alfabética deixa cada projeto sempre no mesmo
 * lugar.
 */

/**
 * Um comparador só para a aplicação inteira: criar um `Intl.Collator` por
 * comparação é caro, e é justamente o que um `localeCompare` solto dentro do
 * `sort` faria.
 *
 * - `numeric` põe `projeto2` antes de `projeto10`, em vez da ordem de texto.
 * - `sensitivity: 'base'` ignora acento e caixa, então `Álbum` fica junto de
 *   `alfa` em vez de ir para o fim da lista — o que aconteceria numa ordenação
 *   por código de caractere, já que `Á` vem depois de `z`.
 *
 * Sem locale fixo de propósito: quem usa o app decide, pela configuração do
 * próprio sistema.
 */
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

type Orderable = { name: string; path: string }

/**
 * Devolve uma nova lista ordenada por nome. O caminho desempata: sem ele, dois
 * projetos de nomes equivalentes para o collator (`Api` e `API`) ficariam em
 * ordem indefinida, e a lista poderia trocar de ordem sozinha entre recargas.
 *
 * @param projects - Lista de origem, preservada intacta.
 */
export function sortProjectsByName<T extends Orderable>(projects: readonly T[]): T[] {
  return [...projects].sort(
    (a, b) => collator.compare(a.name, b.name) || collator.compare(a.path, b.path),
  )
}

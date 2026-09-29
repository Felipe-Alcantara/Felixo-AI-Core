/**
 * Devolver o foco ao elemento certo quando a janela volta.
 *
 * Quando o Electron perde o foco no nível do sistema, o Chromium apaga o foco
 * do documento. Ao voltar, ele restaura o foco só até o `<body>` — o elemento
 * que estava focado antes não é reancorado. No terminal esse elemento é o
 * `<textarea>` interno do xterm, que é quem recebe as teclas: o cursor continua
 * piscando no card, mas nada do que é digitado chega no PTY. Minimizar e
 * restaurar resolvia porque o Windows dispara um ciclo completo de foco.
 *
 * A saída é lembrar quem tinha o foco antes de perdê-lo e devolvê-lo depois.
 * As duas decisões que isso exige — o que vale a pena lembrar e se ainda vale
 * restaurar — moram aqui, longe do DOM, para poderem ser testadas direto.
 */

/** Elemento que sabemos como focar de volta. */
export type Focusable = Pick<HTMLElement, 'isConnected' | 'focus' | 'blur'>

/**
 * Camada flutuante: o menu de destino de um link, desenhado num portal. O
 * mesmo atributo diz à gaveta do terminal que clicar nele não é clicar fora
 * (`FLOATING_LAYER_SELECTOR`, em `terminal-drawer-pin.ts`).
 */
const CAMADA_FLUTUANTE = '[data-felixo-floating-layer]'

/**
 * Se um elemento merece ser lembrado como "quem tinha o foco".
 *
 * O `<body>` é o que o Chromium deixa focado quando não há mais nada, então
 * lembrá-lo seria lembrar justamente o estado quebrado que queremos desfazer.
 * O mesmo vale para um elemento já fora do documento.
 *
 * Nem um elemento de camada flutuante: o menu de link fecha quando a janela
 * perde o foco, e quando ela volta o item lembrado já saiu do documento — o
 * foco ficaria no `<body>`, com o terminal surdo e Backspace/Delete chegando
 * ao canvas. Quem abriu o menu foi lembrado quando o foco entrou nele, e é a
 * esse elemento (a entrada do xterm, o link) que o foco volta.
 */
export function deveLembrarFoco(
  elemento: Element | null,
  documento: Pick<Document, 'body'>,
): boolean {
  if (!elemento || elemento === documento.body) {
    return false
  }

  if (estaEmCamadaFlutuante(elemento)) {
    return false
  }

  return true
}

function estaEmCamadaFlutuante(elemento: Element): boolean {
  // A instalação é testada com um DOM de mentira (`useFocusRestore.test.ts`),
  // de objetos sem `closest`: esses contam como fora de qualquer camada.
  return typeof elemento.closest === 'function' && elemento.closest(CAMADA_FLUTUANTE) !== null
}

/**
 * Se ainda faz sentido devolver o foco ao elemento lembrado.
 *
 * Duas recusas, ambas para não brigar com quem já gerencia foco por conta
 * própria:
 *
 * - O elemento saiu do documento (o modal fechou, o nó foi removido). Focar um
 *   nó órfão não faz nada e ainda deixaria o `<body>` focado.
 * - Alguma outra coisa, DIFERENTE do lembrado, já assumiu o foco enquanto a
 *   janela voltava — um modal que abriu, um campo que se autofocou. Quem
 *   chegou por último manda; roubar o foco dele seria o mesmo bug, invertido.
 *
 * O terceiro caso — `ativo` já é o próprio `lembrado` — conta como "sim,
 * restaura": em alguns disparos (notificação do SO por cima da janela,
 * troca de app sem minimizar, e em geral fora do Windows) o Chromium não
 * limpa `activeElement` para `null`/`body` como no minimizar; ele continua
 * apontando pro mesmo elemento, mas o roteamento nativo de teclado já
 * quebrou do mesmo jeito. Reancorar mesmo assim é o que reproduz o ciclo
 * completo de blur+focus que o minimizar/restaurar do Windows disparava de
 * graça — ver `instalarRestauracaoDeFoco`, que faz `blur()` antes do
 * `focus()` bem por isso.
 */
export function devePedirFoco(
  lembrado: Focusable | null,
  ativo: Element | null,
  documento: Pick<Document, 'body'>,
): boolean {
  if (!lembrado || !lembrado.isConnected) {
    return false
  }

  // `null` acontece quando o documento inteiro está sem foco — o caso
  // original que este módulo existe para consertar.
  if (ativo && ativo !== documento.body && (ativo as unknown as Focusable) !== lembrado) {
    return false
  }

  return true
}

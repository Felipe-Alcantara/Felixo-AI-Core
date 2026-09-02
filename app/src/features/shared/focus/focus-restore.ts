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
 * Se um elemento merece ser lembrado como "quem tinha o foco".
 *
 * O `<body>` é o que o Chromium deixa focado quando não há mais nada, então
 * lembrá-lo seria lembrar justamente o estado quebrado que queremos desfazer.
 * O mesmo vale para um elemento já fora do documento.
 */
export function deveLembrarFoco(
  elemento: Element | null,
  documento: Pick<Document, 'body'>,
): boolean {
  if (!elemento || elemento === documento.body) {
    return false
  }

  return true
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

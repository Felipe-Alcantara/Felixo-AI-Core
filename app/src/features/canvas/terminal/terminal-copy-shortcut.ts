/**
 * Quem manda no Ctrl+C dentro do terminal.
 *
 * No xterm, `Ctrl+C` é o caractere `0x03`: vira `SIGINT` e a CLI do agente
 * decide o resto — o Claude Code interrompe o turno e, na segunda vez seguida,
 * encerra a sessão. Por isso selecionar um texto e apertar Ctrl+C nunca copiava:
 * a tecla ia inteira para o processo.
 *
 * A regra que resolve isso sem trocar um problema por outro depende de uma coisa
 * só, a seleção: com texto selecionado a intenção é copiar; sem seleção, Ctrl+C
 * continua sendo o gesto padrão de terminal para interromper, e quem usa terminal
 * conta com ele.
 *
 * A decisão mora aqui, longe do DOM e do PTY, para poder ser testada direto.
 */

/**
 * O que fazer com uma tecla que talvez seja o atalho de copiar.
 *
 * - `copy` — copiar a seleção e engolir a tecla (o PTY não vê o `0x03`).
 * - `passthrough` — deixar seguir: é o Ctrl+C que interrompe o agente.
 * - `null` — não é atalho de cópia; o handler continua o que estava fazendo.
 */
export type CopyShortcutDecision = 'copy' | 'passthrough'

/**
 * Decide o destino de um `keydown` a partir da tecla e da seleção atual.
 *
 * `Ctrl+Shift+C` é a convenção de terminal e não tem ambiguidade — mas sem
 * seleção não há o que copiar, e a tecla segue como sempre seguiu.
 *
 * No macOS o gesto é `Cmd+C`, a mesma distinção entre `metaKey` e `ctrlKey` que
 * `isImagePasteShortcut` já faz para a colagem.
 */
export function decideCopyShortcut(event: KeyboardEvent, hasSelection: boolean): CopyShortcutDecision | null {
  if (event.type !== 'keydown' || event.altKey) {
    return null
  }

  // No macOS o atalho é Cmd+C; em Windows e Linux, Ctrl+C (ou Ctrl+Shift+C).
  const usesCommandKey = event.metaKey && !event.ctrlKey
  const usesControlKey = event.ctrlKey && !event.metaKey

  if (!usesCommandKey && !usesControlKey) {
    return null
  }

  if (event.key.toLowerCase() !== 'c') {
    return null
  }

  return hasSelection ? 'copy' : 'passthrough'
}

/**
 * Rótulo do botão Ajuda no rail. Fica fora de `onboarding-messages.ts` porque
 * o botão existe antes de qualquer tour: entra no chunk do canvas, sem puxar o
 * catálogo de textos do chunk preguiçoso. O pt-BR daqui é a fonte;
 * `onboarding-messages.ts` reusa as mesmas constantes (sem texto duplicado).
 *
 * O rail inteiro é pt-BR, então o botão também é: o idioma do tour vale para o
 * card, o aviso e o menu, que são do tutorial.
 */

export const HELP_BUTTON_LABEL = 'Ajuda'

export const HELP_BUTTON_LABEL_WITH_NEWS = Object.freeze({
  one: 'Ajuda ({n} novidade)',
  other: 'Ajuda ({n} novidades)',
})

/** "Ajuda", ou "Ajuda (1 novidade)" / "Ajuda (2 novidades)" com o plural do pt-BR. */
export function helpButtonLabel(novidades: number): string {
  if (!Number.isInteger(novidades) || novidades <= 0) return HELP_BUTTON_LABEL
  const form = new Intl.PluralRules('pt-BR').select(novidades) === 'one' ? 'one' : 'other'
  return HELP_BUTTON_LABEL_WITH_NEWS[form].replace('{n}', String(novidades))
}

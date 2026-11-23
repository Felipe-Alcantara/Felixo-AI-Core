/**
 * Quem manda no rótulo de um bloco Página Web.
 *
 * Sem nome manual, o rótulo acompanha o título da página. Mas o título também
 * é gravado em `label`, e ao reabrir o app um rótulo gravado parecia sempre
 * "escolhido pela pessoa": o rótulo travava no último título. `labelFromPage`
 * marca o rótulo que veio da página; só um `label` sem essa marca (nome manual,
 * ou bloco antigo, que não distinguia) fica travado.
 */
export function labelIsCustomized(data: { label?: string; labelFromPage?: boolean }): boolean {
  return Boolean(data.label) && data.labelFromPage !== true
}

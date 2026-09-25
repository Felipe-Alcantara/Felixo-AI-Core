'use strict'

/**
 * Seleção de gerenciadores das bancadas de gerenciador de pacotes.
 *
 * `package-manager-operational-performance.cjs` e
 * `package-manager-alternatives-performance.cjs` aceitam
 * `--managers=<id>,<id>` para medir só uma parte da matriz — por exemplo, só o
 * `npm-runtime` nos SOs em que a comparação com pnpm/Yarn/Corepack roda em
 * outro job. Cada bancada passa os ids que sabe medir; a regra de validação e
 * a marcação do que ficou de fora são as mesmas nas duas.
 */

/** Valor gravado no relatório para um gerenciador que ficou fora de `--managers`. */
const NOT_SELECTED = 'not-selected'

/**
 * @param {string} rawValue valor depois de `--managers=`.
 * @param {readonly string[]} knownIds ids que a bancada sabe medir.
 * @returns {string[]} ids pedidos, na ordem em que foram escritos.
 */
function parseManagerSelection(rawValue, knownIds) {
  const ids = String(rawValue ?? '').split(',').map((id) => id.trim())
  if (ids.some((id) => !id)) {
    throw new Error(`--managers precisa listar ids separados por vírgula. Válidos: ${knownIds.join(', ')}.`)
  }
  if (new Set(ids).size !== ids.length) throw new Error('--managers deve conter ids únicos.')
  const unknown = ids.filter((id) => !knownIds.includes(id))
  if (unknown.length > 0) {
    throw new Error(`Gerenciador desconhecido em --managers: ${unknown.join(', ')}. Válidos: ${knownIds.join(', ')}.`)
  }
  return ids
}

module.exports = {
  NOT_SELECTED,
  parseManagerSelection,
}

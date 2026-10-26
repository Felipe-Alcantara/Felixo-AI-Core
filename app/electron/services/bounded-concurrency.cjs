'use strict'

/**
 * @module bounded-concurrency
 * `Promise.all(itens.map(worker))` com teto de itens em andamento.
 *
 * Existe para trabalho que abre um processo por item (uma CLI, um PTY): abrir
 * todos de uma vez, quando a lista cresce, só empilha memória e CPU sem terminar
 * mais cedo.
 */

/**
 * Roda `worker` sobre `items` com no máximo `limit` em andamento e devolve os
 * resultados na ordem dos itens. Uma rejeição do `worker` rejeita o conjunto
 * (como o `Promise.all`) e impede que novos itens comecem; quem precisa isolar
 * falhas por item captura dentro do `worker`.
 *
 * @template T, R
 * @param {readonly T[]} items
 * @param {number} limit Inteiro positivo; sem teto não é uma opção.
 * @param {(item: T, index: number) => Promise<R> | R} worker
 * @returns {Promise<R[]>}
 */
async function mapWithConcurrency(items, limit, worker) {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new TypeError('limit precisa ser um inteiro positivo.')
  }

  const results = new Array(items.length)
  let next = 0
  let failed = false

  async function lane() {
    while (!failed && next < items.length) {
      const index = next
      next += 1
      try {
        results[index] = await worker(items[index], index)
      } catch (error) {
        failed = true
        throw error
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane))
  return results
}

module.exports = { mapWithConcurrency }

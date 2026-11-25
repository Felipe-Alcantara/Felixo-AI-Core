'use strict'

/**
 * @module devtools-fake-openia
 * Openia roteirizado do smoke do popover "Gerar imagem". Só entra pela guarda
 * `core/devtools-fake-openia-guard.cjs` (instância de automação com
 * `FELIXO_DEVTOOLS_FAKE_OPENIA=1`); nunca fala com a rede nem com o Openia real.
 *
 * O desfecho vem de uma marca no texto da descrição:
 * - `[lento]`: não termina sozinho; só acaba quando o app aborta (Cancelar);
 * - `[antigo]`: Openia anterior à 0.2.0 (saída 2 sem envelope) até a "atualização";
 * - `[saldo]`: falta de créditos (envelope `account_limit`, saída 5);
 * - qualquer outra: gera um PNG de 1 pixel.
 * A primeira consulta ao catálogo falha (prova "Tentar de novo"); as seguintes funcionam.
 */

const fs = require('node:fs')
const path = require('node:path')

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

const FAKE_MODEL = Object.freeze({
  id: 'smoke/imagem-roteirizada',
  vendor: 'smoke',
  name: 'Modelo roteirizado',
  inputModalities: ['text'],
  outputModalities: ['image'],
})

function createFakeOpenia() {
  let catalogCalls = 0
  let updated = false

  const fetchCatalog = async () => {
    catalogCalls += 1
    if (catalogCalls === 1) throw new Error('catálogo roteirizado indisponível')
    return [FAKE_MODEL]
  }

  const fetchPricing = async () => ({ unit: 'image', minUsd: 0.04, maxUsd: 0.04 })

  const runImage = async ({ args, signal }) => {
    const prompt = args.find((arg) => arg.startsWith('--prompt='))?.slice('--prompt='.length) ?? ''
    const outputDir = args[args.indexOf('--output-dir') + 1]
    if (prompt.includes('[lento]')) {
      await new Promise((resolve) => {
        if (signal.aborted) resolve()
        else signal.addEventListener('abort', resolve, { once: true })
      })
      return { started: true, ok: false, exitCode: 130, stdout: '' }
    }
    if (prompt.includes('[antigo]') && !updated) return { started: true, ok: false, exitCode: 2, stdout: '' }
    if (prompt.includes('[saldo]')) {
      // Demora o bastante para o smoke fechar o popover antes da falha (prova o alerta no gatilho).
      await new Promise((resolve) => setTimeout(resolve, 800))
      const error = { code: 'account_limit', message: 'Insufficient credits' }
      return { started: true, ok: false, exitCode: 5, stdout: JSON.stringify({ version: 1, ok: false, error }) }
    }
    const file = path.join(outputDir, 'imagem-roteirizada.png')
    fs.writeFileSync(file, PNG_1X1)
    return { started: true, ok: true, exitCode: 0, stdout: JSON.stringify({ version: 1, ok: true, outputs: [{ path: file }] }) }
  }

  const readVersion = async () => (updated ? '0.2.0' : '0.1.0')

  const installOfficial = async (id) => {
    if (id !== 'openia') return { ok: false, message: 'CLI oficial desconhecida.' }
    updated = true
    return { ok: true, message: 'Openia atualizado (roteirizado).' }
  }

  return { fetchCatalog, fetchPricing, runImage, readVersion, installOfficial }
}

module.exports = { createFakeOpenia, FAKE_MODEL }

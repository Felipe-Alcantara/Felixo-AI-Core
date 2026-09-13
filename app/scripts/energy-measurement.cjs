'use strict'

/**
 * @module energy-measurement
 * Fatia 3/4 de "Performance — correlacionar instalação do gerenciador com
 * responsividade e energia no artefato".
 *
 * Energia é dependente de hardware/driver/permissão — este módulo tenta uma
 * fonte real por SO e cai para CPU time (tempo de parede de CPU consumido,
 * um proxy documentado, nunca um watt-hora inventado) quando a fonte real
 * não existir ou não puder ser lida. As duas coisas nunca são apresentadas
 * como equivalentes: o método usado sempre acompanha o número.
 *
 * Medido ao vivo nesta máquina Linux: RAPL (`/sys/class/powercap/intel-rapl`)
 * existe, mas `energy_uj` nega permissão pro usuário comum — exatamente o
 * cenário que esta task pede pra tratar, não hipotético.
 */

const fs = require('node:fs')
const { performance } = require('node:perf_hooks')

const RAPL_PACKAGE_PATH = '/sys/class/powercap/intel-rapl:0/energy_uj'
/** RAPL é um contador de 32/64 bits que reinicia; acima disto, um delta negativo é reinício, não erro de leitura. */
const RAPL_MAX_MICROJOULES = 2 ** 32

/**
 * @param {typeof fs} [fileSystem]
 * @returns {number | null} microjoules, ou null se a fonte não existe/não pode ser lida.
 */
function readRaplEnergyMicrojoules(fileSystem = fs) {
  try {
    return Number(fileSystem.readFileSync(RAPL_PACKAGE_PATH, 'utf8').trim())
  } catch {
    return null
  }
}

/**
 * Roda `operation` medindo energia real via RAPL quando disponível no
 * Linux; em qualquer outro caso (SO sem leitor implementado, RAPL ausente
 * ou sem permissão), mede tempo de parede como proxy explícito — nunca
 * lança por causa da medição de energia em si, só a `operation` pode
 * lançar.
 *
 * @template T
 * @param {() => Promise<T>} operation
 * @param {object} [options]
 * @param {string} [options.platformName]
 * @param {typeof fs} [options.fileSystem] - Injetável nos testes.
 * @returns {Promise<{ result: T, energy: object }>}
 */
async function measureEnergyDuringOperation(operation, { platformName = process.platform, fileSystem = fs } = {}) {
  const before = platformName === 'linux' ? readRaplEnergyMicrojoules(fileSystem) : null
  const wallStart = performance.now()

  const result = await operation()

  const wallMs = performance.now() - wallStart
  const after = platformName === 'linux' ? readRaplEnergyMicrojoules(fileSystem) : null

  if (before !== null && after !== null) {
    const deltaMicrojoules = after >= before ? after - before : after + RAPL_MAX_MICROJOULES - before
    return {
      result,
      energy: {
        method: 'rapl-linux',
        disponivel: true,
        joules: Number((deltaMicrojoules / 1_000_000).toFixed(3)),
        wallMs: Number(wallMs.toFixed(3)),
      },
    }
  }

  return {
    result,
    energy: {
      method: 'cpu-time-proxy',
      disponivel: false,
      motivo: platformName === 'linux'
        ? 'RAPL ausente ou sem permissão de leitura (energy_uj) — usando tempo de parede como proxy.'
        : `Sem leitor de energia real implementado para ${platformName} — usando tempo de parede como proxy.`,
      wallMs: Number(wallMs.toFixed(3)),
    },
  }
}

module.exports = {
  RAPL_PACKAGE_PATH,
  measureEnergyDuringOperation,
  readRaplEnergyMicrojoules,
}

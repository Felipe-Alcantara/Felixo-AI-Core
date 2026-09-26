'use strict'

/**
 * @module hardware-profile
 * Quantas CPUs lógicas a máquina tem, e o que o app deriva disso.
 *
 * Limiar de "poucas CPUs": 4 lógicas. É a máquina de referência do projeto
 * (i5-6200U, 2 núcleos/4 threads), onde o Modo Performance deu +16% a +23%
 * de FPS com 48 blocos (`docs/projeto/POLITICA-PERFORMANCE.md`, "Ganho
 * medido", 26/09/2026). Acima disso não há medição, então o app não sugere.
 */

const os = require('node:os')

const LOW_CPU_THRESHOLD = 4
/** Padrão histórico do Fetch All, mantido em máquinas com 4 CPUs ou mais. */
const MAX_DEFAULT_ANALYZE_WORKERS = 8
const MIN_DEFAULT_ANALYZE_WORKERS = 2

/**
 * `os.availableParallelism()` respeita afinidade e cgroup (o que o processo
 * pode usar de fato); `os.cpus().length` fica de reserva.
 */
function logicalCpuCount(osModule = os) {
  let count = null
  try {
    count = typeof osModule.availableParallelism === 'function' ? osModule.availableParallelism() : osModule.cpus().length
  } catch {
    count = null
  }
  return Number.isInteger(count) && count > 0 ? count : null
}

function isLowCpuMachine(count, threshold = LOW_CPU_THRESHOLD) {
  return Number.isInteger(count) && count > 0 && count <= threshold
}

/**
 * Análises simultâneas do Fetch All. Cada análise roda `git fetch` (rede) e
 * `git status` (CPU e disco) num processo próprio: duas por CPU lógica, até o
 * padrão de 8 de antes. Numa máquina com 4 CPUs ou mais nada muda; com 1 a 3,
 * a varredura para de disputar a CPU com a interface.
 */
function defaultAnalyzeWorkers(count) {
  if (!Number.isInteger(count) || count <= 0) return MAX_DEFAULT_ANALYZE_WORKERS
  return Math.min(MAX_DEFAULT_ANALYZE_WORKERS, Math.max(MIN_DEFAULT_ANALYZE_WORKERS, count * 2))
}

/**
 * O que a interface precisa para sugerir o Modo Performance.
 *
 * @param {object} [options]
 * @param {typeof os} [options.osModule]
 * @param {boolean} [options.automation] - Instância de automação (`felixo
 *   devtools`, smoke e matriz visual): os runners de CI têm 4 vCPUs, e a
 *   sugestão cobriria botões e entraria nas capturas. Ela só aparece ali
 *   com pedido explícito.
 */
function describeHardwareProfile({ osModule = os, automation = false } = {}) {
  const count = logicalCpuCount(osModule)
  const lowCpu = isLowCpuMachine(count)
  return {
    logicalCpuCount: count,
    lowCpu,
    lowCpuThreshold: LOW_CPU_THRESHOLD,
    suggestPerformanceMode: lowCpu && !automation,
  }
}

module.exports = {
  LOW_CPU_THRESHOLD,
  MAX_DEFAULT_ANALYZE_WORKERS,
  defaultAnalyzeWorkers,
  describeHardwareProfile,
  isLowCpuMachine,
  logicalCpuCount,
}

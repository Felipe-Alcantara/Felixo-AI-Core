/**
 * @module managed-cli-cache-maintenance
 * Expurgo do cache offline do npm usado pela instalação automática de CLIs.
 *
 * Fatia 2/5 de "Arquitetura — cache offline por perfil": o cache do npm
 * (`getNpmRegistryCacheDir`) cresce sozinho a cada instalação/atualização —
 * sem um teto, ele nunca encolhe. `npm cache verify` já remove entradas
 * órfãs/inválidas (mantém o cache saudável), mas não tem noção de "orçamento
 * de disco". Este módulo mede o tamanho real da pasta e só aciona `npm cache
 * clean --force` (que zera o cache inteiro — o próximo install simplesmente
 * baixa de novo) quando o orçamento estoura, em vez de tentar um LRU parcial
 * por entrada: o cache é pequeno (CLIs oficiais, não pacotes do ecossistema
 * inteiro), então "zerar e deixar repopular" é mais simples e mais barato de
 * manter do que um LRU sob medida, para um ganho marginal que não compensa.
 */

const fs = require('node:fs')
const path = require('node:path')
const spawnChildProcess = require('cross-spawn')

/** Teto do cache offline do npm — CLIs oficiais são pequenas; isto dá espaço para várias versões de várias CLIs sem crescer sem limite. */
const DEFAULT_CACHE_BUDGET_BYTES = 200 * 1024 * 1024

/**
 * Soma recursiva do tamanho de todos os arquivos sob `dir`. Devolve 0 se a
 * pasta não existir ainda (cache nunca usado) — não é erro, é o estado
 * inicial esperado.
 *
 * @param {string} dir
 * @param {typeof fs} [fileSystem]
 * @returns {number}
 */
function measureDirectorySize(dir, fileSystem = fs) {
  let total = 0
  let entries
  try {
    entries = fileSystem.readdirSync(dir, { withFileTypes: true })
  } catch {
    return 0
  }

  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      total += measureDirectorySize(entryPath, fileSystem)
    } else if (entry.isFile()) {
      try {
        total += fileSystem.statSync(entryPath).size
      } catch {
        // Arquivo pode ter sido removido entre o readdir e o stat (o npm
        // mexe no cache concorrentemente) — não é motivo pra falhar a medição.
      }
    }
  }

  return total
}

/**
 * Limpa o cache inteiro quando ele passa do orçamento.
 *
 * @param {object} options
 * @param {string} options.cacheDir
 * @param {string} options.npmCliPath
 * @param {string} options.nodeExecutable
 * @param {Record<string, string>} options.env
 * @param {number} [options.maxBytes]
 * @param {typeof fs} [options.fileSystem]
 * @param {Function} [options.spawn] - Injetável nos testes.
 * @returns {Promise<{ pruned: boolean, sizeBytes: number, message: string }>}
 */
async function pruneNpmCacheIfOverBudget({
  cacheDir,
  npmCliPath,
  nodeExecutable,
  env,
  maxBytes = DEFAULT_CACHE_BUDGET_BYTES,
  fileSystem = fs,
  spawn = spawnChildProcess,
}) {
  const sizeBytes = measureDirectorySize(cacheDir, fileSystem)

  if (sizeBytes <= maxBytes) {
    return { pruned: false, sizeBytes, message: `Cache offline em ${sizeBytes} bytes, dentro do orçamento.` }
  }

  const result = await new Promise((resolve) => {
    const child = spawn(
      nodeExecutable,
      [npmCliPath, 'cache', 'clean', '--force', '--cache', cacheDir, '--loglevel=error'],
      { env },
    )
    let stderr = ''
    child.stderr?.on('data', (chunk) => {
      stderr += String(chunk)
    })
    child.on('error', (error) => resolve({ ok: false, stderr: error.message }))
    child.on('close', (code) => resolve({ ok: code === 0, stderr }))
  })

  if (!result.ok) {
    return {
      pruned: false,
      sizeBytes,
      message: `Cache offline em ${sizeBytes} bytes, passou do orçamento de ${maxBytes} bytes, mas a limpeza falhou: ${result.stderr.trim()}`,
    }
  }

  return {
    pruned: true,
    sizeBytes,
    message: `Cache offline em ${sizeBytes} bytes passou do orçamento de ${maxBytes} bytes — limpo (próximo install repopula sozinho).`,
  }
}

module.exports = {
  DEFAULT_CACHE_BUDGET_BYTES,
  measureDirectorySize,
  pruneNpmCacheIfOverBudget,
}

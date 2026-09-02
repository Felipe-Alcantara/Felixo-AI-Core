'use strict'

/**
 * Valida os artefatos produzidos pelo job de política de dependências.
 *
 * O audit completo é evidência da árvore que participa do build e do
 * npm-runtime; o gate de vulnerabilidades de execução é o comparativo com
 * `--omit=dev`. Assim advisories de ferramentas de desenvolvimento continuam
 * visíveis e acionáveis sem serem confundidos com vulnerabilidades do app em
 * produção. Qualquer advisory crítico, ou qualquer falha no comparativo de
 * produção, bloqueia o CI.
 */

const fs = require('node:fs')
const path = require('node:path')

function parseArgs(argv = []) {
  const options = {
    full: null,
    fullExit: null,
    inventory: null,
    npmSbom: null,
    production: null,
    productionExit: null,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    const option = {
      '--full': 'full',
      '--full-exit': 'fullExit',
      '--inventory': 'inventory',
      '--npm-sbom': 'npmSbom',
      '--production': 'production',
      '--production-exit': 'productionExit',
    }[argument]

    if (option) {
      const value = argv[index + 1]
      if (!value || value.startsWith('--')) throw new Error(`${argument} precisa receber um caminho.`)
      options[option] = path.resolve(value)
      index += 1
      continue
    }

    const equalsOption = Object.keys({
      '--full': 'full',
      '--full-exit': 'fullExit',
      '--inventory': 'inventory',
      '--npm-sbom': 'npmSbom',
      '--production': 'production',
      '--production-exit': 'productionExit',
    }).find((name) => argument.startsWith(`${name}=`))
    if (equalsOption) {
      const value = argument.slice(equalsOption.length + 1).trim()
      if (!value) throw new Error(`${equalsOption} precisa apontar para um caminho.`)
      options[{
        '--full': 'full',
        '--full-exit': 'fullExit',
        '--inventory': 'inventory',
        '--npm-sbom': 'npmSbom',
        '--production': 'production',
        '--production-exit': 'productionExit',
      }[equalsOption]] = path.resolve(value)
      continue
    }

    throw new Error(`Argumento desconhecido: ${argument}`)
  }

  const required = ['full', 'production', 'npmSbom', 'inventory']
  for (const name of required) {
    if (!options[name]) throw new Error(`A opção --${name === 'npmSbom' ? 'npm-sbom' : name} é obrigatória.`)
  }
  return options
}

function readJson(filePath, description) {
  let content
  try {
    content = fs.readFileSync(filePath, 'utf8')
  } catch (error) {
    throw new Error(`Não foi possível ler ${description}: ${error.message}`)
  }

  try {
    return JSON.parse(content)
  } catch (error) {
    throw new Error(`JSON inválido em ${description}: ${error.message}`)
  }
}

function readExitCode(filePath, description) {
  if (!filePath) return null
  const raw = fs.readFileSync(filePath, 'utf8').trim()
  const value = Number(raw)
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`Código de saída inválido em ${description}: ${raw}`)
  }
  return value
}

function vulnerabilityCounts(report) {
  const counts = report?.metadata?.vulnerabilities
  if (counts && typeof counts === 'object') {
    const result = {
      info: Number(counts.info) || 0,
      low: Number(counts.low) || 0,
      moderate: Number(counts.moderate) || 0,
      high: Number(counts.high) || 0,
      critical: Number(counts.critical) || 0,
    }
    result.total = Number.isFinite(Number(counts.total))
      ? Number(counts.total)
      : Object.values(result).reduce((total, value) => total + value, 0)
    return result
  }

  const result = { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 }
  for (const vulnerability of Object.values(report?.vulnerabilities ?? {})) {
    const severity = vulnerability?.severity
    if (Object.prototype.hasOwnProperty.call(result, severity)) result[severity] += 1
  }
  result.total = result.info + result.low + result.moderate + result.high + result.critical
  return result
}

function validateAuditReport(report, label) {
  if (!report || typeof report !== 'object' || Array.isArray(report)) {
    throw new Error(`Relatório ${label} não contém um objeto.`)
  }
  if (!Number.isInteger(report.auditReportVersion)) {
    throw new Error(`Relatório ${label} não parece ser uma saída de npm audit.`)
  }
  return vulnerabilityCounts(report)
}

function validateCycloneDx(report, label) {
  if (!report || typeof report !== 'object' || Array.isArray(report)) {
    throw new Error(`Relatório ${label} não contém um objeto.`)
  }
  if (String(report.bomFormat).toLowerCase() !== 'cyclonedx') {
    throw new Error(`Relatório ${label} não está no formato CycloneDX.`)
  }
  if (!Array.isArray(report.components) || report.components.length === 0) {
    throw new Error(`Relatório ${label} não contém componentes.`)
  }
}

function validateInventory(report) {
  if (!report || typeof report !== 'object' || Array.isArray(report)) {
    throw new Error('Inventário de pacote não contém um objeto.')
  }
  if (report.schemaVersion !== 1) {
    throw new Error(`Versão de inventário não suportada: ${report.schemaVersion}`)
  }
  if (!Array.isArray(report.artifacts)) {
    throw new Error('Inventário não contém a lista de artefatos do release.')
  }
  if (!Array.isArray(report.unpackedApps) || report.unpackedApps.length === 0) {
    throw new Error('Inventário não encontrou nenhum app unpacked.')
  }

  for (const app of report.unpackedApps) {
    if (!app || typeof app !== 'object') throw new Error('Inventário contém um app inválido.')
    if (!app.appAsar || app.appAsar.bytes <= 0 || !app.appAsar.sha256) {
      throw new Error(`Inventário sem app.asar íntegro: ${app.path ?? '(sem caminho)'}`)
    }
    const runtime = app.npmRuntime
    if (!runtime || !String(runtime.path).toLowerCase().includes('npm-runtime')) {
      throw new Error(`Inventário sem npm-runtime: ${app.path ?? '(sem caminho)'}`)
    }
    if (!Number.isInteger(runtime.files) || runtime.files <= 0 || !Number.isInteger(runtime.bytes) || runtime.bytes <= 0) {
      throw new Error(`npm-runtime vazio: ${app.path ?? '(sem caminho)'}`)
    }
    if (!runtime.package || runtime.package.name !== 'npm' || !runtime.package.version) {
      throw new Error(`Manifesto do npm-runtime inválido: ${app.path ?? '(sem caminho)'}`)
    }
  }
}

function formatCounts(counts) {
  return `total=${counts.total}, critical=${counts.critical}, high=${counts.high}, `
    + `moderate=${counts.moderate}, low=${counts.low}, info=${counts.info}`
}

function validateDependencyPolicy({ full, production, npmSbom, inventory, fullExit = null, productionExit = null }) {
  const fullCounts = validateAuditReport(full, 'npm audit completo')
  const productionCounts = validateAuditReport(production, 'npm audit --omit=dev')
  validateCycloneDx(npmSbom, 'SBOM npm')
  validateInventory(inventory)

  if (fullExit !== null && fullExit > 1) {
    throw new Error(`npm audit completo falhou com erro de execução (código ${fullExit}).`)
  }
  if (fullExit === 1 && fullCounts.total === 0) {
    throw new Error('npm audit completo retornou código 1 sem registrar advisories.')
  }
  if (fullCounts.critical > 0) {
    throw new Error(`npm audit completo encontrou vulnerabilidade(s) crítica(s): ${formatCounts(fullCounts)}.`)
  }

  if (productionExit !== null && productionExit !== 0) {
    throw new Error(`npm audit --omit=dev falhou (código ${productionExit}): ${formatCounts(productionCounts)}.`)
  }
  if (productionCounts.total > 0) {
    throw new Error(`A árvore de produção tem vulnerabilidade(s): ${formatCounts(productionCounts)}.`)
  }

  return {
    full: fullCounts,
    production: productionCounts,
    sbomComponents: npmSbom.components.length,
    packagedApps: inventory.unpackedApps.length,
  }
}

function printSummary(summary) {
  console.log(`npm audit completo: ${formatCounts(summary.full)} (advisories não críticos ficam registrados).`)
  if (summary.full.total > 0) {
    console.warn('::warning::A árvore completa possui advisories não críticos; revisar e atualizar em trilhas separadas do Dependabot.')
  }
  console.log(`npm audit --omit=dev: ${formatCounts(summary.production)} (gate obrigatório).`)
  console.log(`SBOM npm: ${summary.sbomComponents} componente(s); apps empacotados inventariados: ${summary.packagedApps}.`)
  console.log('Política de dependências aprovada.')
}

function formatHelp() {
  return [
    'Uso: node scripts/verify-dependency-policy.cjs [opções]',
    '',
    'Obrigatórias:',
    '  --full <caminho>          Saída JSON do npm audit completo.',
    '  --production <caminho>    Saída JSON do npm audit --omit=dev.',
    '  --npm-sbom <caminho>      SBOM npm em CycloneDX JSON.',
    '  --inventory <caminho>     Inventário do app empacotado.',
    '',
    'Opcionais:',
    '  --full-exit <caminho>     Código de saída capturado do audit completo.',
    '  --production-exit <caminho> Código de saída capturado do audit de produção.',
  ].join('\n')
}

function main(argv = process.argv.slice(2)) {
  if (argv.includes('--help')) {
    console.log(formatHelp())
    return
  }

  const options = parseArgs(argv)
  const summary = validateDependencyPolicy({
    full: readJson(options.full, 'npm audit completo'),
    fullExit: readExitCode(options.fullExit, 'código do audit completo'),
    inventory: readJson(options.inventory, 'inventário do pacote'),
    npmSbom: readJson(options.npmSbom, 'SBOM npm'),
    production: readJson(options.production, 'npm audit --omit=dev'),
    productionExit: readExitCode(options.productionExit, 'código do audit de produção'),
  })
  printSummary(summary)
}

if (require.main === module) {
  try {
    main()
  } catch (error) {
    console.error(`[verify-dependency-policy] ${error.message}`)
    process.exitCode = 1
  }
}

module.exports = {
  formatCounts,
  parseArgs,
  validateDependencyPolicy,
  validateInventory,
  validateAuditReport,
  validateCycloneDx,
  vulnerabilityCounts,
}

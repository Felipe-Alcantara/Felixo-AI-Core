'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')

const {
  parseArgs,
  validateAuditReport,
  validateDependencyPolicy,
} = require('./verify-dependency-policy.cjs')

function auditReport(counts) {
  return {
    auditReportVersion: 2,
    metadata: {
      vulnerabilities: {
        info: counts.info ?? 0,
        low: counts.low ?? 0,
        moderate: counts.moderate ?? 0,
        high: counts.high ?? 0,
        critical: counts.critical ?? 0,
        total: counts.total ?? Object.values(counts).reduce((total, value) => total + value, 0),
      },
    },
  }
}

function inventoryReport(overrides = {}) {
  return {
    schemaVersion: 1,
    artifacts: [],
    unpackedApps: [{
      path: 'linux-unpacked',
      appAsar: { bytes: 100, sha256: 'a'.repeat(64) },
      npmRuntime: {
        path: 'linux-unpacked/resources/npm-runtime',
        files: 20,
        bytes: 2_000,
        package: { name: 'npm', version: '11.19.1' },
      },
    }],
    ...overrides,
  }
}

function validPolicy({ fullCounts = {}, productionCounts = {} } = {}) {
  return {
    full: auditReport(fullCounts),
    production: auditReport(productionCounts),
    npmSbom: {
      bomFormat: 'CycloneDX',
      specVersion: '1.5',
      components: [{ type: 'library', name: 'fixture', version: '1.0.0' }],
    },
    inventory: inventoryReport(),
    fullExit: fullCounts.total ? 1 : 0,
    productionExit: 0,
  }
}

test('parseArgs exige os quatro relatórios da política', () => {
  const options = parseArgs([
    '--full', 'full.json',
    '--production=production.json',
    '--npm-sbom', 'npm-sbom.json',
    '--inventory=inventory.json',
    '--full-exit', 'full.exit',
    '--production-exit=production.exit',
  ])

  assert.equal(options.full, require('node:path').resolve('full.json'))
  assert.equal(options.productionExit, require('node:path').resolve('production.exit'))
})

test('aceita advisories não críticos na árvore completa quando produção está limpa', () => {
  const summary = validateDependencyPolicy(validPolicy({
    fullCounts: { high: 1, moderate: 2, low: 1, total: 4 },
  }))

  assert.equal(summary.full.total, 4)
  assert.equal(summary.full.critical, 0)
  assert.equal(summary.production.total, 0)
})

test('rejeita vulnerabilidade crítica na árvore completa', () => {
  assert.throws(
    () => validateDependencyPolicy(validPolicy({
      fullCounts: { critical: 1, total: 1 },
    })),
    /crítica/,
  )
})

test('rejeita vulnerabilidade na árvore de produção', () => {
  assert.throws(
    () => validateDependencyPolicy(validPolicy({
      productionCounts: { high: 1, total: 1 },
    })),
    /árvore de produção|código 1/,
  )
})

test('rejeita inventário sem npm-runtime', () => {
  assert.throws(
    () => validateDependencyPolicy({
      ...validPolicy(),
      inventory: inventoryReport({ unpackedApps: [{
        path: 'linux-unpacked',
        appAsar: { bytes: 100, sha256: 'a'.repeat(64) },
      }] }),
    }),
    /npm-runtime/,
  )
})

test('rejeita SBOM que não é CycloneDX', () => {
  assert.throws(
    () => validateDependencyPolicy({
      ...validPolicy(),
      npmSbom: { bomFormat: 'SPDX', components: [{ name: 'fixture' }] },
    }),
    /CycloneDX/,
  )
})

test('erro do registro do npm (400/503) falha fechado, mas diz que não é vulnerabilidade', () => {
  const erro = { error: { code: 'EAUDIT', summary: '503 Service Unavailable - maintenance' } }
  assert.throws(
    () => validateAuditReport(erro, 'npm audit completo'),
    (e) => /não obteve resposta do registro/.test(e.message) && /503 Service Unavailable/.test(e.message) && /NÃO indica vulnerabilidade/.test(e.message),
  )
})

test('lixo sem erro do npm continua com a mensagem antiga (e falhando)', () => {
  assert.throws(() => validateAuditReport({ foo: 1 }, 'x'), /não parece ser uma saída de npm audit/)
  assert.throws(() => validateAuditReport(null, 'x'), /não contém um objeto/)
})

test('relatório válido continua passando', () => {
  assert.equal(validateAuditReport(auditReport({ low: 2 }), 'x').low, 2)
})

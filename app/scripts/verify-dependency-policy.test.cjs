'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')

const {
  parseArgs,
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

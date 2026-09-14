'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { redactValue } = require('./qa-log-disk-store.cjs')

/**
 * Monta o pacote do botão "Reportar problema" (task "Observabilidade" —
 * item 4): versão do app, SO, as últimas N entradas do QA Logger e o estado
 * de instalação/login das CLIs — o bastante pra anexar numa task sem pedir
 * pra reproduzir o problema de novo.
 *
 * As entradas do QA Logger já chegam redigidas (gravadas via
 * `qa-log-disk-store.cjs`, que aplica `redactValue` antes de persistir), mas
 * o relatório passa TUDO por `redactValue` de novo antes de devolver — é
 * defesa em profundidade: se um dia uma fonte nova entrar aqui sem passar
 * pelo QA Logger primeiro (ex.: um campo novo de `cliDetectionResults`), o
 * pacote ainda sai seguro sem depender de quem chamou lembrar de redigir.
 *
 * @param {{
 *   appVersion: string,
 *   platformName: string,
 *   arch: string,
 *   qaEntries: unknown[],
 *   cliDetectionResults: unknown[],
 *   generatedAt?: string,
 *   maxEntries?: number,
 * }} options
 */
function buildProblemReport(options = {}) {
  const {
    appVersion,
    platformName,
    arch,
    qaEntries = [],
    cliDetectionResults = [],
    generatedAt,
    maxEntries = 100,
  } = options

  const report = {
    version: 1,
    generatedAt: generatedAt ?? new Date().toISOString(),
    app: {
      version: String(appVersion ?? 'desconhecida'),
      platform: String(platformName ?? process.platform),
      arch: String(arch ?? process.arch),
    },
    cliStatus: cliDetectionResults.map(summarizeCliStatus),
    recentLogEntries: qaEntries.slice(-maxEntries),
  }

  return redactValue(report)
}

function summarizeCliStatus(result) {
  if (!result || typeof result !== 'object') return { name: 'desconhecido', detected: false }
  return {
    name: result.name ?? 'desconhecido',
    detected: Boolean(result.detected),
    version: result.version ?? null,
    error: result.error ?? null,
  }
}

/**
 * Grava o pacote como JSON legível na pasta de relatórios do app
 * (`appPaths.reports`, já existente) e devolve o caminho — o "anexar numa
 * task" do critério de aceite é literal: o arquivo fica pronto pra arrastar.
 *
 * @param {ReturnType<typeof buildProblemReport>} report
 * @param {{ directory: string, fs?: typeof import('node:fs') }} options
 */
function writeProblemReportFile(report, options = {}) {
  const directory = options.directory
  if (typeof directory !== 'string' || !directory.trim()) {
    throw new Error('Diretório de relatórios não informado.')
  }
  const fileSystem = options.fs ?? fs

  fileSystem.mkdirSync(directory, { recursive: true })
  const fileName = `problema-${report.generatedAt.replace(/[:.]/g, '-')}.json`
  const filePath = path.join(directory, fileName)
  fileSystem.writeFileSync(filePath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')

  return filePath
}

module.exports = { buildProblemReport, writeProblemReportFile }

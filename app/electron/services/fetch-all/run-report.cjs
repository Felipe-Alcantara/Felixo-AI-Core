/**
 * @module fetch-all/run-report
 * Relatório em Markdown de cada passada de sincronização.
 *
 * Cada execução gera um arquivo com o que foi feito, o que não foi feito, o
 * que subiu para o remoto e o que ficou pendente. O relatório fica na pasta
 * de relatórios do app porque contém caminhos locais da máquina.
 */

const fsp = require('node:fs/promises')
const path = require('node:path')
const { REPO_STATE_LABELS } = require('./repo-analyzer.cjs')
const { redactSensitiveText } = require('./secret-redaction.cjs')

const REPORTS_SUBDIR = 'fetch-all'

/**
 * Achata texto externo numa linha só, para ele não injetar Markdown.
 *
 * @param {unknown} value
 * @returns {string}
 */
function singleLine(value) {
  return redactSensitiveText(value).split(/\r?\n/).join(' ').trim()
}

/**
 * Formata texto local como código, mesmo quando ele já contém crases.
 *
 * @param {string} value
 * @returns {string}
 */
function inlineCode(value) {
  const clean = singleLine(value)
  const longestRun = Math.max(
    0,
    ...[...clean.matchAll(/`+/g)].map((match) => match[0].length),
  )
  const fence = '`'.repeat(longestRun + 1)

  return `${fence} ${clean} ${fence}`
}

/**
 * Uma linha de repositório na lista do relatório.
 *
 * @param {object} status
 * @param {string} [extra]
 * @returns {string}
 */
function repoLine(status, extra = '') {
  const branch = status.branch ? ` (${inlineCode(status.branch)})` : ''
  const suffix = extra ? ` — ${singleLine(extra)}` : ''

  return `- ${inlineCode(status.path)}${branch}${suffix}`
}

/**
 * Monta o conteúdo Markdown do relatório de uma passada.
 *
 * @param {object} params
 * @param {object} params.plan - Plano revisado.
 * @param {object[]} params.results - Resultados das ações executadas.
 * @param {boolean} params.executed - Se a execução chegou a ser confirmada.
 * @param {string} params.scanMode - Como os repositórios foram encontrados.
 * @param {Date} params.when
 * @returns {string}
 */
function buildRunReport({ plan, results, executed, scanMode, when }) {
  const succeeded = results.filter((result) => result.ok)
  const failed = results.filter((result) => !result.ok)
  const lines = [
    `# Passada de ${formatTimestamp(when)}`,
    '',
    `- **Varredura:** ${singleLine(scanMode)}`,
    `- **Repositórios encontrados:** ${plan.total}`,
    `- **Atualizados:** ${plan.upToDate.length} · ` +
      `**para pull:** ${plan.toPull.length} · ` +
      `**para push:** ${plan.toPush.length} · ` +
      `**com problema:** ${plan.problems.length}`,
    '',
    '## O que foi feito',
    '',
  ]

  if (succeeded.length) {
    lines.push(
      ...succeeded.map((result) => repoLine(result.status, `${result.action} concluído`)),
    )
  } else if (executed) {
    lines.push('- Nenhuma ação foi concluída com sucesso.')
  } else {
    lines.push('- Nada foi executado (sem ações seguras ou execução não confirmada).')
  }

  lines.push('', '## O que não foi feito', '')

  const notDone = []

  if (!executed && (plan.toPull.length || plan.toPush.length)) {
    notDone.push(
      ...plan.toPull.map((status) => repoLine(status, 'pull planejado, não executado')),
      ...plan.toPush.map((status) => repoLine(status, 'push planejado, não executado')),
    )
  }

  notDone.push(
    ...failed.map((result) =>
      repoLine(
        result.status,
        `${result.action} FALHOU: ${result.message.trim() || 'sem mensagem'}`,
      ),
    ),
  )

  // Problemas resolvidos nesta passada (commit automático bem-sucedido) não
  // contam como "não feito".
  const resolvedPaths = new Set(
    succeeded.filter((result) => result.action === 'commit').map((r) => r.status.path),
  )
  const unresolved = plan.problems.filter((status) => !resolvedPaths.has(status.path))

  notDone.push(
    ...unresolved.map((status) => {
      const label = REPO_STATE_LABELS[status.state] ?? status.state
      return repoLine(status, status.detail ? `${label} — ${status.detail}` : label)
    }),
  )

  lines.push(
    ...(notDone.length
      ? notDone
      : ['- Nada ficou de fora: todas as ações planejadas foram executadas.']),
  )

  const pushed = succeeded.filter((result) => result.action === 'push')

  lines.push('', '## O que foi salvo no remoto', '')
  lines.push(
    ...(pushed.length
      ? pushed.map((result) => repoLine(result.status, 'push enviado ao remoto'))
      : ['- Nenhum push nesta passada.']),
  )

  const pending =
    unresolved.length +
    failed.length +
    (executed ? 0 : plan.toPull.length + plan.toPush.length)

  lines.push('', '## Pendências', '')
  lines.push(
    pending
      ? `- ${pending} item(ns) exigem atenção manual (listados em "O que não foi ` +
          'feito"). Resolva e rode a sincronização de novo.'
      : '- Nenhuma pendência: tudo sincronizado.',
  )
  lines.push('')

  return lines.join('\n')
}

/**
 * Data e hora legíveis no cabeçalho do relatório.
 *
 * @param {Date} when
 * @returns {string}
 */
function formatTimestamp(when) {
  const pad = (value) => String(value).padStart(2, '0')

  return (
    `${pad(when.getDate())}/${pad(when.getMonth() + 1)}/${when.getFullYear()} ` +
    `${pad(when.getHours())}:${pad(when.getMinutes())}:${pad(when.getSeconds())}`
  )
}

/**
 * Nome de arquivo ordenável por data, sem caracteres proibidos no Windows.
 *
 * @param {Date} when
 * @returns {string}
 */
function buildReportFileName(when) {
  const pad = (value) => String(value).padStart(2, '0')

  return (
    `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}` +
    `_${pad(when.getHours())}-${pad(when.getMinutes())}-${pad(when.getSeconds())}.md`
  )
}

/**
 * Grava o relatório da passada e devolve o caminho gerado.
 *
 * @param {object} params - Os mesmos de `buildRunReport`, mais o diretório.
 * @param {string} params.reportsDir
 * @returns {Promise<string>}
 */
async function writeRunReport({ reportsDir, plan, results, executed, scanMode, when }) {
  const targetDir = path.join(reportsDir, REPORTS_SUBDIR)
  const filePath = path.join(targetDir, buildReportFileName(when))

  await fsp.mkdir(targetDir, { recursive: true })
  await fsp.writeFile(
    filePath,
    buildRunReport({ plan, results, executed, scanMode, when }),
    'utf8',
  )

  return filePath
}

module.exports = {
  REPORTS_SUBDIR,
  buildReportFileName,
  buildRunReport,
  writeRunReport,
}

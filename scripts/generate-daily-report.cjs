#!/usr/bin/env node

const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const REPORTS_DIR = path.join(process.cwd(), 'docs', 'relatorios')
const RECORD_SEPARATOR = '\x1e'
const FIELD_SEPARATOR = '\x1f'

const args = parseArgs(process.argv.slice(2))
const date = args.date ?? getToday()
const shouldWrite = Boolean(args.write)

if (!isValidDate(date)) {
  console.error('Use --date no formato YYYY-MM-DD.')
  process.exit(1)
}

const commits = readCommitsForDate(date)
const markdown = renderReport(date, commits)

if (shouldWrite) {
  fs.mkdirSync(REPORTS_DIR, { recursive: true })
  const reportPath = path.join(REPORTS_DIR, `${date}.md`)
  fs.writeFileSync(reportPath, markdown)
  updateIndex()
  console.log(`Relatório escrito em ${path.relative(process.cwd(), reportPath)}`)
} else {
  process.stdout.write(markdown)
}

function parseArgs(rawArgs) {
  return rawArgs.reduce((parsed, arg, index) => {
    if (arg === '--write') {
      parsed.write = true
      return parsed
    }

    if (arg === '--date') {
      parsed.date = rawArgs[index + 1]
      return parsed
    }

    if (arg.startsWith('--date=')) {
      parsed.date = arg.slice('--date='.length)
    }

    return parsed
  }, {})
}

function getToday() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function isValidDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ''))
}

function readCommitsForDate(reportDate) {
  const nextDate = addDays(reportDate, 1)
  const output = git([
    'log',
    '--all',
    `--since=${reportDate} 00:00:00`,
    `--until=${nextDate} 00:00:00`,
    '--date=iso-local',
    `--pretty=format:${RECORD_SEPARATOR}%H${FIELD_SEPARATOR}%h${FIELD_SEPARATOR}%ad${FIELD_SEPARATOR}%s`,
    '--name-only',
  ])

  return output
    .split(RECORD_SEPARATOR)
    .map((record) => parseCommitRecord(record))
    .filter(Boolean)
}

function parseCommitRecord(record) {
  const lines = record
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  if (lines.length === 0) {
    return null
  }

  const [hash, shortHash, dateText, subject] = lines[0].split(FIELD_SEPARATOR)

  if (!hash || !shortHash || !dateText || !subject) {
    return null
  }

  return {
    hash,
    shortHash,
    dateText,
    time: extractTime(dateText),
    subject,
    type: classifyCommit(subject),
    files: Array.from(new Set(lines.slice(1))).sort(),
  }
}

function addDays(reportDate, days) {
  const [year, month, day] = reportDate.split('-').map(Number)
  const dateValue = new Date(year, month - 1, day + days)
  return [
    dateValue.getFullYear(),
    String(dateValue.getMonth() + 1).padStart(2, '0'),
    String(dateValue.getDate()).padStart(2, '0'),
  ].join('-')
}

function extractTime(dateText) {
  const match = String(dateText).match(/\s(\d{2}:\d{2}):\d{2}/)
  return match ? match[1] : '--:--'
}

function classifyCommit(subject) {
  const normalized = subject.toLowerCase()
  const match = normalized.match(/^([a-z]+)(\([^)]+\))?:/)
  const type = match?.[1] ?? ''

  const labels = {
    feat: 'feature',
    fix: 'correção',
    docs: 'documentação',
    test: 'testes',
    chore: 'manutenção',
    refactor: 'refactor',
    build: 'build',
    ci: 'ci',
    perf: 'performance',
    style: 'estilo',
  }

  return labels[type] ?? 'outro'
}

function renderReport(reportDate, commits) {
  const sourceCommand = `git log --all --since='${reportDate} 00:00:00' --until='${addDays(
    reportDate,
    1,
  )} 00:00:00'`
  const typeCounts = countBy(commits, (commit) => commit.type)
  const fileCounts = countChangedFiles(commits)

  return [
    `# Relatório: ${reportDate}`,
    '',
    'Status: concluido.',
    '',
    '## Resumo',
    '',
    renderSummary(reportDate, commits, typeCounts),
    '',
    `Fonte: commits de ${reportDate} no Git local.`,
    '',
    'Escopo usado:',
    '',
    '```bash',
    sourceCommand,
    '```',
    '',
    `Total: ${commits.length} commits.`,
    '',
    '## Commits do dia',
    '',
    'Ordem: mais recente para mais antigo.',
    '',
    '| Hora | Commit | Tipo | Descrição | Arquivos |',
    '|------|--------|------|-----------|----------|',
    ...renderCommitRows(commits),
    '',
    '## Categorias',
    '',
    ...renderCountList(typeCounts, 'Nenhum commit encontrado.'),
    '',
    '## Arquivos mais alterados',
    '',
    ...renderCountList(fileCounts.slice(0, 20), 'Nenhum arquivo alterado registrado.'),
    '',
    '## Observações',
    '',
    '- Relatório gerado automaticamente a partir de metadados do Git local.',
    '- O resumo evita inferir objetivos que não estejam nas mensagens de commit.',
    '- Mudanças não commitadas não entram neste relatório.',
    '',
  ].join('\n')
}

function renderSummary(reportDate, commits, typeCounts) {
  if (commits.length === 0) {
    return `Nao ha commits locais registrados para ${reportDate}.`
  }

  const topTypes = typeCounts
    .slice(0, 3)
    .map(([type, count]) => `${type}: ${count}`)
    .join('; ')

  return `Dia com ${commits.length} commits locais. Categorias principais: ${topTypes}.`
}

function renderCommitRows(commits) {
  if (commits.length === 0) {
    return ['| - | - | - | Nenhum commit encontrado | - |']
  }

  return commits.map((commit) => {
    const files = commit.files.length > 0 ? commit.files.length : '-'
    return `| ${commit.time} | \`${commit.shortHash}\` | ${escapeCell(commit.type)} | ${escapeCell(
      commit.subject,
    )} | ${files} |`
  })
}

function renderCountList(items, fallback) {
  if (items.length === 0) {
    return [`- ${fallback}`]
  }

  return items.map(([label, count]) => `- ${label}: ${count}`)
}

function countBy(items, getKey) {
  const counts = new Map()

  for (const item of items) {
    const key = getKey(item)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
}

function countChangedFiles(commits) {
  const counts = new Map()

  for (const commit of commits) {
    for (const file of commit.files) {
      counts.set(file, (counts.get(file) ?? 0) + 1)
    }
  }

  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
}

function updateIndex() {
  const rows = fs
    .readdirSync(REPORTS_DIR)
    .filter((fileName) => /^\d{4}-\d{2}-\d{2}\.md$/.test(fileName))
    .sort()
    .map((fileName) => {
      const reportDate = fileName.replace(/\.md$/, '')
      const commitCount = countReportCommits(path.join(REPORTS_DIR, fileName))
      return `| ${reportDate} | [${fileName}](${fileName}) | ${commitCount} |`
    })

  const readme = [
    '# Relatórios Diários',
    '',
    'Status: concluido.',
    '',
    'Esta pasta registra o que foi feito em cada dia com atividade no histórico Git.',
    '',
    'Fonte usada para separar os dias:',
    '',
    '```bash',
    "git log --date=short --pretty=format:'%ad %h %s' --reverse",
    '```',
    '',
    '## Índice',
    '',
    '| Data | Relatório | Commits |',
    '|------|-----------|---------|',
    ...rows,
    '',
  ].join('\n')

  fs.writeFileSync(path.join(REPORTS_DIR, 'README.md'), readme)
}

function countReportCommits(reportPath) {
  const content = fs.readFileSync(reportPath, 'utf8')
  const match = content.match(/^Total: (\d+) commits\./m)
  if (match) {
    return Number(match[1])
  }

  const commitHashes = content.match(/`[0-9a-f]{7,40}`/g)
  return commitHashes ? commitHashes.length : 0
}

function escapeCell(value) {
  return String(value).replace(/\|/g, '\\|').replace(/\n/g, ' ')
}

function git(args) {
  return execFileSync('git', args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

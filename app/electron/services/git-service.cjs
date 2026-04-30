const fs = require('fs')
const path = require('path')
const { execFile } = require('child_process')
const { promisify } = require('util')

const execFileAsync = promisify(execFile)
const GIT_COMMAND_TIMEOUT_MS = 10000
const GIT_COMMAND_MAX_BUFFER = 1024 * 1024

async function getGitProjectSummary(projectPath) {
  const cwd = normalizeGitProjectPath(projectPath)
  const [statusOutput, diffStatOutput, commitsOutput, branchOutput] =
    await Promise.all([
      runGit(cwd, ['status', '--short', '--branch']),
      runGit(cwd, ['diff', '--stat']),
      runGit(cwd, ['log', '-5', '--oneline', '--decorate=short']),
      runGit(cwd, ['branch', '--show-current']),
    ])
  const statusLines = parseGitStatusLines(statusOutput)
  const branch = parseGitBranch(statusLines, branchOutput)
  const recentCommits = commitsOutput
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  return {
    projectPath: cwd,
    branch,
    statusLines: statusLines.filter((line) => !line.startsWith('## ')),
    diffStat: diffStatOutput.trim(),
    recentCommits,
    isClean: statusLines.filter((line) => !line.startsWith('## ')).length === 0,
  }
}

async function runGit(cwd, args) {
  assertAllowedGitArgs(args)

  const { stdout } = await execFileAsync('git', args, {
    cwd,
    timeout: GIT_COMMAND_TIMEOUT_MS,
    maxBuffer: GIT_COMMAND_MAX_BUFFER,
  })

  return stdout
}

function normalizeGitProjectPath(projectPath) {
  if (!projectPath || typeof projectPath !== 'string') {
    throw new Error('Caminho do projeto Git invalido.')
  }

  const resolvedPath = path.resolve(projectPath)
  const stat = fs.statSync(resolvedPath)

  if (!stat.isDirectory()) {
    throw new Error('O caminho selecionado nao e uma pasta.')
  }

  const gitPath = path.join(resolvedPath, '.git')

  if (!fs.existsSync(gitPath)) {
    throw new Error('A pasta selecionada nao contem um repositorio Git.')
  }

  return resolvedPath
}

function assertAllowedGitArgs(args) {
  const key = args.join('\0')
  const allowed = new Set([
    ['status', '--short', '--branch'].join('\0'),
    ['diff', '--stat'].join('\0'),
    ['log', '-5', '--oneline', '--decorate=short'].join('\0'),
    ['branch', '--show-current'].join('\0'),
  ])

  if (!allowed.has(key)) {
    throw new Error('Comando Git nao permitido.')
  }
}

function parseGitStatusLines(output) {
  return String(output ?? '')
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
}

function parseGitBranch(statusLines, fallbackOutput = '') {
  const branchLine = statusLines.find((line) => line.startsWith('## '))
  const fallback = String(fallbackOutput ?? '').trim()

  if (!branchLine) {
    return fallback || null
  }

  const normalizedLine = branchLine.replace(/^##\s+/, '')
  const branch = normalizedLine.split('...')[0]?.trim()

  return branch || fallback || null
}

module.exports = {
  assertAllowedGitArgs,
  getGitProjectSummary,
  normalizeGitProjectPath,
  parseGitBranch,
  parseGitStatusLines,
}

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

async function stageAllChanges(projectPath) {
  const cwd = normalizeGitProjectPath(projectPath)
  await runGit(cwd, ['add', '--all'])
  return getGitProjectSummary(cwd)
}

async function unstageAllChanges(projectPath) {
  const cwd = normalizeGitProjectPath(projectPath)
  await runGit(cwd, ['restore', '--staged', '--', '.'])
  return getGitProjectSummary(cwd)
}

async function commitStagedChanges(projectPath, message) {
  const cwd = normalizeGitProjectPath(projectPath)
  const commitMessage = normalizeCommitMessage(message)
  const output = await runGit(cwd, ['commit', '-m', commitMessage])
  const summary = await getGitProjectSummary(cwd)

  return {
    output: output.trim(),
    summary,
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
  if (!Array.isArray(args)) {
    throw new Error('Comando Git nao permitido.')
  }

  const key = args.join('\0')
  const allowed = new Set([
    ['status', '--short', '--branch'].join('\0'),
    ['diff', '--stat'].join('\0'),
    ['log', '-5', '--oneline', '--decorate=short'].join('\0'),
    ['branch', '--show-current'].join('\0'),
    ['add', '--all'].join('\0'),
    ['restore', '--staged', '--', '.'].join('\0'),
  ])

  if (allowed.has(key)) {
    return
  }

  if (isAllowedCommitArgs(args)) {
    return
  }

  throw new Error('Comando Git nao permitido.')
}

function isAllowedCommitArgs(args) {
  return (
    args.length === 3 &&
    args[0] === 'commit' &&
    args[1] === '-m' &&
    typeof args[2] === 'string' &&
    normalizeCommitMessage(args[2]) === args[2]
  )
}

function normalizeCommitMessage(message) {
  if (typeof message !== 'string') {
    throw new Error('Mensagem de commit invalida.')
  }

  const normalizedMessage = message.replace(/\s+/g, ' ').trim()

  if (!normalizedMessage) {
    throw new Error('Informe uma mensagem de commit.')
  }

  if (normalizedMessage.length > 200) {
    throw new Error('Mensagem de commit deve ter ate 200 caracteres.')
  }

  if (/[\r\n]/.test(message)) {
    throw new Error('Mensagem de commit deve ter apenas uma linha.')
  }

  return normalizedMessage
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
  commitStagedChanges,
  getGitProjectSummary,
  normalizeGitProjectPath,
  normalizeCommitMessage,
  parseGitBranch,
  parseGitStatusLines,
  stageAllChanges,
  unstageAllChanges,
}

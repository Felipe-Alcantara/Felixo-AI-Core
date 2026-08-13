/**
 * @module fetch-all/repo-analyzer
 * Inspeção e ações git conservadoras sobre um repositório.
 *
 * Toda escrita é conservadora: pull apenas fast-forward e push apenas quando o
 * branch local está estritamente à frente do remoto. Estados problemáticos são
 * classificados e devolvidos a quem chamou — este módulo nunca tenta resolver
 * nada sozinho.
 *
 * Como em `git-service.cjs`, os argumentos passam por uma lista de permissão:
 * a interface escolhe *qual* ação rodar, nunca monta uma linha de comando.
 */

const fs = require('node:fs')
const path = require('node:path')
const { execFile } = require('node:child_process')
const { redactSensitiveText } = require('./secret-redaction.cjs')

const GIT_TIMEOUT_MS = 120_000
const GIT_MAX_BUFFER = 4 * 1024 * 1024
const MAX_COMMIT_MESSAGE_LENGTH = 200

/** Estado de sincronização de um repositório depois do fetch. */
const REPO_STATES = Object.freeze({
  UP_TO_DATE: 'UP_TO_DATE',
  NEEDS_PULL: 'NEEDS_PULL',
  NEEDS_PUSH: 'NEEDS_PUSH',
  DIVERGED: 'DIVERGED',
  DIRTY: 'DIRTY',
  CONFLICT: 'CONFLICT',
  NO_REMOTE: 'NO_REMOTE',
  NO_UPSTREAM: 'NO_UPSTREAM',
  DETACHED: 'DETACHED',
  FETCH_ERROR: 'FETCH_ERROR',
  GIT_ERROR: 'GIT_ERROR',
})

/** Rótulo legível de cada estado, usado na interface e no relatório. */
const REPO_STATE_LABELS = Object.freeze({
  UP_TO_DATE: 'Atualizado',
  NEEDS_PULL: 'Precisa de pull',
  NEEDS_PUSH: 'Precisa de push',
  DIVERGED: 'Divergiu do remoto',
  DIRTY: 'Mudanças não commitadas',
  CONFLICT: 'Merge/rebase em andamento',
  NO_REMOTE: 'Sem remoto configurado',
  NO_UPSTREAM: 'Branch sem upstream',
  DETACHED: 'HEAD desanexado',
  FETCH_ERROR: 'Erro no fetch',
  GIT_ERROR: 'Erro do git',
})

/** Estados que a sincronização resolve sozinha com segurança. */
const SAFE_STATES = Object.freeze([REPO_STATES.NEEDS_PULL, REPO_STATES.NEEDS_PUSH])

/** Estados que exigem intervenção manual e são apenas reportados. */
const PROBLEM_STATES = Object.freeze([
  REPO_STATES.DIVERGED,
  REPO_STATES.DIRTY,
  REPO_STATES.CONFLICT,
  REPO_STATES.NO_REMOTE,
  REPO_STATES.NO_UPSTREAM,
  REPO_STATES.DETACHED,
  REPO_STATES.FETCH_ERROR,
  REPO_STATES.GIT_ERROR,
])

// Marcadores dentro de `.git` que indicam operação interrompida pela metade.
const CONFLICT_MARKERS = [
  'MERGE_HEAD',
  'REBASE_HEAD',
  'CHERRY_PICK_HEAD',
  'REVERT_HEAD',
  'rebase-apply',
  'rebase-merge',
]

const ALLOWED_GIT_COMMANDS = new Set(
  [
    ['rev-parse', '--git-dir'],
    ['symbolic-ref', '--short', '-q', 'HEAD'],
    ['remote'],
    ['fetch', '--all', '--prune'],
    ['status', '--porcelain'],
    ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'],
    ['rev-list', '--left-right', '--count', '@{u}...HEAD'],
    ['pull', '--ff-only'],
    ['push'],
    ['add', '-A'],
  ].map((args) => args.join('\0')),
)

/**
 * Rejeita qualquer comando git fora da lista de permissão.
 *
 * @param {string[]} args
 * @throws {Error} Quando o comando não é um dos previstos por este módulo.
 */
function assertAllowedGitArgs(args) {
  if (!Array.isArray(args)) {
    throw new Error('Comando Git não permitido.')
  }

  if (ALLOWED_GIT_COMMANDS.has(args.join('\0'))) return

  const isCommit =
    args.length === 3 &&
    args[0] === 'commit' &&
    args[1] === '-m' &&
    typeof args[2] === 'string' &&
    normalizeCommitMessage(args[2]) === args[2]

  if (isCommit) return

  throw new Error('Comando Git não permitido.')
}

/**
 * Normaliza a mensagem de commit para uma única linha dentro do limite.
 *
 * @param {unknown} message
 * @returns {string}
 */
function normalizeCommitMessage(message) {
  if (typeof message !== 'string') {
    throw new Error('Mensagem de commit inválida.')
  }

  const normalized = message.replace(/\s+/g, ' ').trim()

  if (!normalized) {
    throw new Error('Informe uma mensagem de commit.')
  }

  if (normalized.length > MAX_COMMIT_MESSAGE_LENGTH) {
    throw new Error(
      `Mensagem de commit deve ter até ${MAX_COMMIT_MESSAGE_LENGTH} caracteres.`,
    )
  }

  return normalized
}

/**
 * Ambiente que impede o git de abrir prompt de credencial.
 *
 * Sem isso, um repositório sem credenciais travaria a varredura esperando uma
 * senha que ninguém vai digitar; com isso ele falha como `FETCH_ERROR`.
 *
 * @returns {NodeJS.ProcessEnv}
 */
function nonInteractiveEnv() {
  return { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_ASKPASS: '' }
}

/**
 * Executa um comando git no repositório sem lançar em caso de erro do git.
 *
 * @param {string} repoPath
 * @param {string[]} args
 * @returns {Promise<{ code: number, stdout: string, stderr: string }>}
 */
function runGit(repoPath, args) {
  assertAllowedGitArgs(args)

  return new Promise((resolve) => {
    execFile(
      'git',
      args,
      {
        cwd: repoPath,
        timeout: GIT_TIMEOUT_MS,
        maxBuffer: GIT_MAX_BUFFER,
        env: nonInteractiveEnv(),
        encoding: 'utf8',
      },
      (error, stdout, stderr) => {
        resolve({
          code: error ? (error.code ?? 1) : 0,
          stdout: String(stdout ?? ''),
          stderr: String(stderr ?? error?.message ?? ''),
        })
      },
    )
  })
}

/**
 * Monta o resultado da análise de um repositório.
 *
 * @param {string} repoPath
 * @param {string} state
 * @param {object} [extra]
 * @returns {{
 *   path: string, name: string, state: string, stateLabel: string,
 *   branch: string, ahead: number, behind: number, detail: string,
 *   dirtyFiles: string[],
 * }}
 */
function buildStatus(repoPath, state, extra = {}) {
  return {
    path: repoPath,
    name: path.basename(repoPath),
    state,
    stateLabel: REPO_STATE_LABELS[state] ?? state,
    branch: extra.branch ?? '',
    ahead: extra.ahead ?? 0,
    behind: extra.behind ?? 0,
    detail: extra.detail ?? '',
    dirtyFiles: extra.dirtyFiles ?? [],
  }
}

/**
 * Faz fetch (opcional) e classifica o estado do repositório.
 *
 * @param {string} repoPath
 * @param {object} [options]
 * @param {boolean} [options.doFetch] - Atualiza as referências remotas antes de classificar.
 * @returns {Promise<ReturnType<typeof buildStatus>>}
 */
async function analyzeRepo(repoPath, { doFetch = true } = {}) {
  try {
    return await analyze(repoPath, doFetch)
  } catch (error) {
    return buildStatus(repoPath, REPO_STATES.GIT_ERROR, {
      detail: redactSensitiveText(error?.message ?? 'falha ao executar o git'),
    })
  }
}

/**
 * @param {string} repoPath
 * @param {boolean} doFetch
 * @returns {Promise<ReturnType<typeof buildStatus>>}
 */
async function analyze(repoPath, doFetch) {
  // Merge/rebase/cherry-pick inacabado tem prioridade sobre qualquer outra
  // classificação: agir num repositório nesse estado é perder trabalho.
  const gitDirResult = await runGit(repoPath, ['rev-parse', '--git-dir'])

  if (gitDirResult.code !== 0) {
    return buildStatus(repoPath, REPO_STATES.GIT_ERROR, {
      detail: redactSensitiveText(gitDirResult.stderr.trim()),
    })
  }

  const gitDir = path.resolve(repoPath, gitDirResult.stdout.trim())
  const marker = CONFLICT_MARKERS.find((name) =>
    fs.existsSync(path.join(gitDir, name)),
  )

  if (marker) {
    return buildStatus(repoPath, REPO_STATES.CONFLICT, {
      detail: `${marker} presente`,
    })
  }

  const branchResult = await runGit(repoPath, ['symbolic-ref', '--short', '-q', 'HEAD'])

  if (branchResult.code !== 0) {
    return buildStatus(repoPath, REPO_STATES.DETACHED)
  }

  const branch = branchResult.stdout.trim()
  const remoteResult = await runGit(repoPath, ['remote'])

  if (remoteResult.code !== 0) {
    return buildStatus(repoPath, REPO_STATES.GIT_ERROR, {
      branch,
      detail: redactSensitiveText(remoteResult.stderr.trim()),
    })
  }

  if (!remoteResult.stdout.trim()) {
    return buildStatus(repoPath, REPO_STATES.NO_REMOTE, { branch })
  }

  if (doFetch) {
    const fetchResult = await runGit(repoPath, ['fetch', '--all', '--prune'])

    if (fetchResult.code !== 0) {
      const lines = redactSensitiveText(fetchResult.stderr.trim()).split(/\r?\n/)

      return buildStatus(repoPath, REPO_STATES.FETCH_ERROR, {
        branch,
        detail: lines.at(-1) ?? '',
      })
    }
  }

  const statusResult = await runGit(repoPath, ['status', '--porcelain'])

  if (statusResult.code !== 0) {
    return buildStatus(repoPath, REPO_STATES.GIT_ERROR, {
      branch,
      detail: redactSensitiveText(statusResult.stderr.trim()),
    })
  }

  const dirtyFiles = statusResult.stdout
    .split(/\r?\n/)
    .filter((line) => line.trim())

  const upstreamResult = await runGit(repoPath, [
    'rev-parse',
    '--abbrev-ref',
    '--symbolic-full-name',
    '@{u}',
  ])

  if (upstreamResult.code !== 0) {
    const suffix = dirtyFiles.length
      ? `; ${dirtyFiles.length} arquivo(s) modificados/não rastreados`
      : ''

    return buildStatus(repoPath, REPO_STATES.NO_UPSTREAM, {
      branch,
      dirtyFiles,
      detail: `branch '${branch}' não rastreia nenhum branch remoto${suffix}`,
    })
  }

  const countsResult = await runGit(repoPath, [
    'rev-list',
    '--left-right',
    '--count',
    '@{u}...HEAD',
  ])

  if (countsResult.code !== 0) {
    return buildStatus(repoPath, REPO_STATES.GIT_ERROR, {
      branch,
      detail: redactSensitiveText(countsResult.stderr.trim()),
    })
  }

  const counts = countsResult.stdout.trim().split(/\s+/).map(Number)

  if (counts.length !== 2 || counts.some((value) => !Number.isInteger(value))) {
    return buildStatus(repoPath, REPO_STATES.GIT_ERROR, {
      branch,
      detail: 'git retornou contadores de commits inválidos',
    })
  }

  const [behind, ahead] = counts

  if (dirtyFiles.length) {
    return buildStatus(repoPath, REPO_STATES.DIRTY, {
      branch,
      ahead,
      behind,
      dirtyFiles,
      detail: `${dirtyFiles.length} arquivo(s) modificados/não rastreados`,
    })
  }

  if (ahead && behind) {
    return buildStatus(repoPath, REPO_STATES.DIVERGED, {
      branch,
      ahead,
      behind,
      detail: 'local e remoto têm commits diferentes; resolva manualmente',
    })
  }

  if (behind) {
    return buildStatus(repoPath, REPO_STATES.NEEDS_PULL, { branch, behind })
  }

  if (ahead) {
    return buildStatus(repoPath, REPO_STATES.NEEDS_PUSH, { branch, ahead })
  }

  return buildStatus(repoPath, REPO_STATES.UP_TO_DATE, { branch })
}

/**
 * Pull fast-forward; nunca cria merge nem toca em repositório sujo.
 *
 * @param {string} repoPath
 * @returns {Promise<{ ok: boolean, message: string }>}
 */
async function pullFastForward(repoPath) {
  const result = await runGit(repoPath, ['pull', '--ff-only'])
  const ok = result.code === 0

  return {
    ok,
    message: redactSensitiveText(ok ? result.stdout : result.stderr).trim(),
  }
}

/**
 * Push simples do branch atual para o upstream já configurado.
 *
 * @param {string} repoPath
 * @returns {Promise<{ ok: boolean, message: string }>}
 */
async function pushCurrentBranch(repoPath) {
  const result = await runGit(repoPath, ['push'])

  return {
    ok: result.code === 0,
    message: redactSensitiveText(result.stdout + result.stderr).trim(),
  }
}

/**
 * Adiciona tudo (`git add -A`) e cria um commit com a mensagem dada.
 *
 * Usado só no fluxo de commit automático, com confirmação explícita, e nunca
 * sem o repositório estar em estado `DIRTY`.
 *
 * @param {string} repoPath
 * @param {string} message
 * @returns {Promise<{ ok: boolean, message: string }>}
 */
async function commitAllChanges(repoPath, message) {
  const commitMessage = normalizeCommitMessage(message)
  const addResult = await runGit(repoPath, ['add', '-A'])

  if (addResult.code !== 0) {
    return { ok: false, message: redactSensitiveText(addResult.stderr).trim() }
  }

  const commitResult = await runGit(repoPath, ['commit', '-m', commitMessage])

  return {
    ok: commitResult.code === 0,
    message: redactSensitiveText(commitResult.stdout + commitResult.stderr).trim(),
  }
}

module.exports = {
  PROBLEM_STATES,
  REPO_STATES,
  REPO_STATE_LABELS,
  SAFE_STATES,
  analyzeRepo,
  assertAllowedGitArgs,
  buildStatus,
  commitAllChanges,
  normalizeCommitMessage,
  pullFastForward,
  pushCurrentBranch,
}

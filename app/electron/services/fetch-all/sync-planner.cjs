/**
 * @module fetch-all/sync-planner
 * Orquestra a análise em lote e a execução conservadora do plano.
 *
 * O fluxo tem duas fases para nada acontecer sem aviso prévio:
 *
 * 1. `analyzeRepos` — faz fetch e classifica cada repositório. Atualiza
 *    metadados dentro de `.git`, mas não mexe no worktree nem cria commits.
 * 2. `executePlan` / `executeAutoCommits` — recebe apenas os repositórios em
 *    estado seguro e escreve. Só deve ser chamado depois de a pessoa revisar
 *    o plano e confirmar; o estado é revalidado imediatamente antes de cada
 *    escrita, porque o disco pode ter mudado durante a revisão.
 */

const {
  PROBLEM_STATES,
  REPO_STATES,
  REPO_STATE_LABELS,
  analyzeRepo,
  commitAllChanges,
  pullFastForward,
  pushCurrentBranch,
} = require('./repo-analyzer.cjs')

const WEEKDAYS_PT = [
  'domingo',
  'segunda-feira',
  'terça-feira',
  'quarta-feira',
  'quinta-feira',
  'sexta-feira',
  'sábado',
]

/**
 * Classifica os estados analisados nos baldes do plano.
 *
 * @param {Array<import('./repo-analyzer.cjs').RepoStatus>} statuses
 * @returns {{ upToDate: object[], toPull: object[], toPush: object[], problems: object[], total: number }}
 */
function buildSyncPlan(statuses) {
  const plan = { upToDate: [], toPull: [], toPush: [], problems: [] }

  for (const status of statuses) {
    if (status.state === REPO_STATES.UP_TO_DATE) plan.upToDate.push(status)
    else if (status.state === REPO_STATES.NEEDS_PULL) plan.toPull.push(status)
    else if (status.state === REPO_STATES.NEEDS_PUSH) plan.toPush.push(status)
    else if (PROBLEM_STATES.includes(status.state)) plan.problems.push(status)
  }

  for (const bucket of [plan.upToDate, plan.toPull, plan.toPush, plan.problems]) {
    bucket.sort((left, right) =>
      left.path.toLowerCase().localeCompare(right.path.toLowerCase()),
    )
  }

  return { ...plan, total: statuses.length }
}

/**
 * Repositórios em que a única pendência é commitar as mudanças.
 *
 * Só entram os `DIRTY` que não estão atrás do remoto: commitar um repositório
 * atrás do remoto criaria divergência, então esses continuam só reportados.
 *
 * @param {{ problems: object[] }} plan
 * @returns {object[]}
 */
function autoCommitCandidates(plan) {
  return plan.problems.filter(
    (status) => status.state === REPO_STATES.DIRTY && status.behind === 0,
  )
}

/**
 * Indica se o plano tem alguma ação segura a executar.
 *
 * @param {{ toPull: object[], toPush: object[] }} plan
 * @returns {boolean}
 */
function planHasActions(plan) {
  return Boolean(plan.toPull.length || plan.toPush.length)
}

/**
 * Analisa uma lista de repositórios em paralelo, reportando o progresso.
 *
 * @param {string[]} repoPaths
 * @param {object} [options]
 * @param {number} [options.concurrency] - Análises simultâneas (o fetch é I/O de rede).
 * @param {AbortSignal} [options.signal]
 * @param {(progress: { analyzed: number, total: number, status: object }) => void} [options.onProgress]
 * @returns {Promise<object[]>}
 */
async function analyzeRepos(repoPaths, { concurrency = 8, signal, onProgress } = {}) {
  const statuses = []
  const queue = [...repoPaths]
  let analyzed = 0

  async function worker() {
    while (queue.length) {
      if (signal?.aborted) return

      const repoPath = queue.shift()

      if (repoPath === undefined) return

      const status = await analyzeRepo(repoPath)

      statuses.push(status)
      analyzed += 1
      onProgress?.({ analyzed, total: repoPaths.length, status })
    }
  }

  const workerCount = Math.max(1, Math.min(Number(concurrency) || 1, 32))
  await Promise.all(Array.from({ length: workerCount }, () => worker()))

  return statuses
}

/**
 * Mensagem genérica e padronizada do commit automático.
 *
 * @param {Date} [when]
 * @returns {string} Ex.: `chore: commit automático do Fetch All — sábado, 05/07/2026 14:30`.
 */
function buildAutoCommitMessage(when = new Date()) {
  const pad = (value) => String(value).padStart(2, '0')
  const date = `${pad(when.getDate())}/${pad(when.getMonth() + 1)}/${when.getFullYear()}`
  const time = `${pad(when.getHours())}:${pad(when.getMinutes())}`

  return `chore: commit automático do Fetch All — ${WEEKDAYS_PT[when.getDay()]}, ${date} ${time}`
}

/**
 * Registra uma ação recusada porque o estado mudou depois da revisão.
 *
 * @param {object} planned - Estado mostrado no plano revisado.
 * @param {object} current - Estado relido agora, antes da escrita.
 * @param {string} action
 * @returns {{ status: object, action: string, ok: false, message: string }}
 */
function changedStateResult(planned, current, action) {
  const detail = current.detail ? ` (${current.detail})` : ''
  const from = REPO_STATE_LABELS[planned.state] ?? planned.state
  const to = REPO_STATE_LABELS[current.state] ?? current.state

  return {
    status: current,
    action,
    ok: false,
    message:
      `estado mudou desde a revisão do plano: ${from} → ${to}${detail}; ` +
      'nenhuma ação executada',
  }
}

/**
 * Roda uma ação de escrita só se o repositório ainda estiver no estado esperado.
 *
 * @param {object} planned
 * @param {string} expectedState
 * @param {string} action
 * @param {(repoPath: string) => Promise<{ ok: boolean, message: string }>} run
 * @param {(status: object) => boolean} [isStillEligible] - Condição extra sobre o estado relido.
 * @returns {Promise<{ status: object, action: string, ok: boolean, message: string }>}
 */
async function runRevalidatedAction(planned, expectedState, action, run, isStillEligible) {
  const fresh = await analyzeRepo(planned.path)

  if (fresh.state !== expectedState || isStillEligible?.(fresh) === false) {
    return changedStateResult(planned, fresh, action)
  }

  const { ok, message } = await run(fresh.path)

  return { status: fresh, action, ok, message }
}

/**
 * Executa os pulls e pushes do plano. Não toca nos repositórios com problema.
 *
 * @param {{ toPull: object[], toPush: object[] }} plan
 * @param {object} [options]
 * @param {AbortSignal} [options.signal]
 * @param {(progress: { done: number, total: number, result: object }) => void} [options.onProgress]
 * @returns {Promise<object[]>}
 */
async function executePlan(plan, { signal, onProgress } = {}) {
  const steps = [
    ...plan.toPull.map((status) => ({
      status,
      action: 'pull',
      expected: REPO_STATES.NEEDS_PULL,
      run: pullFastForward,
    })),
    ...plan.toPush.map((status) => ({
      status,
      action: 'push',
      expected: REPO_STATES.NEEDS_PUSH,
      run: pushCurrentBranch,
    })),
  ]

  const results = []

  for (const step of steps) {
    if (signal?.aborted) break

    const result = await runRevalidatedAction(
      step.status,
      step.expected,
      step.action,
      step.run,
    )

    results.push(result)
    onProgress?.({ done: results.length, total: steps.length, result })
  }

  return results
}

/**
 * Commita os candidatos e sincroniza cada um em seguida (pull ff-only + push).
 *
 * Deve receber apenas `autoCommitCandidates(plan)` já confirmados. Se o commit
 * falhar, o repositório não é sincronizado.
 *
 * @param {object[]} candidates
 * @param {string} message
 * @param {object} [options]
 * @param {AbortSignal} [options.signal]
 * @param {(progress: { done: number, total: number, result: object }) => void} [options.onProgress]
 * @returns {Promise<object[]>}
 */
async function executeAutoCommits(candidates, message, { signal, onProgress } = {}) {
  const results = []
  const report = (result) => {
    results.push(result)
    onProgress?.({ done: results.length, total: candidates.length, result })
  }

  for (const candidate of candidates) {
    if (signal?.aborted) break

    // Commitar um repositório que ficou atrás do remoto durante a revisão
    // criaria divergência, então a releitura precisa continuar com `behind` 0.
    const committed = await runRevalidatedAction(
      candidate,
      REPO_STATES.DIRTY,
      'commit',
      (repoPath) => commitAllChanges(repoPath, message),
      (status) => status.behind === 0,
    )

    report(committed)

    if (!committed.ok) continue

    // Depois do commit o repositório fica à frente do remoto; o pull
    // fast-forward só é possível se nada novo tiver chegado, então o push é
    // a ação natural. Ambos revalidam o estado antes de escrever.
    const pushed = await runRevalidatedAction(
      committed.status,
      REPO_STATES.NEEDS_PUSH,
      'push',
      pushCurrentBranch,
    )

    report(pushed)
  }

  return results
}

module.exports = {
  analyzeRepos,
  autoCommitCandidates,
  buildAutoCommitMessage,
  buildSyncPlan,
  changedStateResult,
  executeAutoCommits,
  executePlan,
  planHasActions,
}

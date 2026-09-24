/**
 * @module process-tree
 * Mata um processo filho E os descendentes dele (netos), nas duas
 * plataformas — não só o processo imediato.
 *
 * Existe porque essa mesma classe de bug já apareceu isolada em pelo menos
 * dois lugares do app (`openia-image-service.cjs`, e o instalador gerenciado
 * antes desta extração): um `child.kill('SIGKILL')` avulso só derruba o
 * processo que o Node conhece diretamente. Quando esse processo é o `npm`
 * rodando um script de pós-instalação, o script (e o que ele spawnar) não
 * está na lista — no POSIX porque `child.kill()` sem grupo de processo não
 * alcança os netos; no Windows porque lá não existe kill de grupo por sinal
 * nenhum, `taskkill /T` é o único jeito de descer a árvore.
 *
 * Pré-requisito no POSIX: quem cria o processo precisa passar
 * `detached: true` no `spawn` — isso o torna líder de um novo grupo, e é
 * esse grupo (PID negativo) que `process.kill(-pid, sinal)` alcança por
 * inteiro. Sem `detached`, o filho herda o grupo do próprio app, e matar
 * o grupo mataria o app junto — por isso `killProcessTree` nunca tenta o
 * grupo sem essa garantia do chamador.
 */

const { spawn } = require('node:child_process')

const DEFAULT_GRACE_MS = 2000

/**
 * @param {object} options
 * @param {number} options.pid - PID do processo raiz da árvore a matar.
 * @param {string} [options.platformName]
 * @param {number} [options.graceMs] - Espera entre SIGTERM e SIGKILL no POSIX.
 * @param {(pid: number, signal: NodeJS.Signals) => void} [options.killGroup] - Injetável nos testes.
 * @param {typeof spawn} [options.spawnTaskkill] - Injetável nos testes.
 * @param {(ms: number) => Promise<void>} [options.sleep] - Injetável nos testes.
 * @param {(error: unknown) => void} [options.onError] - Chamado (nunca lançado) para
 *   QUALQUER erro do kill em si, incluindo os que não são "processo já morto" — quem
 *   chama pode logar; o padrão descarta. Este utilitário é "melhor esforço": os dois
 *   lugares que o chamam fazem isso dentro de um `setTimeout`/callback de abort, sem
 *   `await` nem `.catch()` (fire-and-forget) — uma promise rejeitada ali vira exceção
 *   não tratada e derruba o processo principal, o que seria pior que o processo órfão
 *   que este módulo existe para evitar. Por isso a promise NUNCA rejeita.
 * @returns {Promise<void>} Resolve depois que a tentativa de matar a árvore foi disparada
 *   (no POSIX, depois do SIGKILL de escalada; no Windows, depois que `taskkill` termina).
 *   Não garante que cada neto já morreu — processos que ignoram SIGKILL não existem no
 *   POSIX, mas um `taskkill` que falhe (processo já morto, por exemplo) é ignorado.
 */
async function killProcessTree({
  pid,
  platformName = process.platform,
  graceMs = DEFAULT_GRACE_MS,
  killGroup = defaultKillGroup,
  spawnTaskkill = spawn,
  sleep = defaultSleep,
  onError = () => {},
} = {}) {
  if (!Number.isInteger(pid) || pid <= 0) return

  if (platformName === 'win32') {
    await runTaskkill(spawnTaskkill, pid)
    return
  }

  callKillGroup(killGroup, pid, 'SIGTERM', onError)
  await sleep(graceMs)
  callKillGroup(killGroup, pid, 'SIGKILL', onError)
}

/**
 * Chama `killGroup` sem NUNCA deixar o erro subir — nem ESRCH (processo já
 * morto, o caso comum) nem qualquer outro (EPERM, por exemplo, o caso raro que
 * vale logar via `onError`). A supressão mora aqui, não dentro de
 * `defaultKillGroup`, para que um `killGroup` injetado (testes, ou uma futura
 * implementação alternativa) tenha a MESMA garantia de nunca rejeitar que a
 * implementação padrão, em vez de precisar reimplementar isso.
 */
function callKillGroup(killGroup, pid, signal, onError) {
  try {
    killGroup(pid, signal)
  } catch (error) {
    if (error?.code !== 'ESRCH') onError(error)
  }
}

/** `process.kill(-pid, sinal)`: PID negativo mata o GRUPO inteiro no POSIX. */
function defaultKillGroup(pid, signal) {
  process.kill(-pid, signal)
}

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function runTaskkill(spawnTaskkill, pid) {
  return new Promise((resolve) => {
    const child = spawnTaskkill('taskkill', ['/pid', String(pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    })
    // Falha aqui é esperada quando o processo já saiu sozinho antes do taskkill chegar
    // (corrida normal entre "o npm terminou" e "nós decidimos matar a árvore").
    child.once('error', () => resolve())
    child.once('close', () => resolve())
  })
}

module.exports = {
  DEFAULT_GRACE_MS,
  killProcessTree,
}

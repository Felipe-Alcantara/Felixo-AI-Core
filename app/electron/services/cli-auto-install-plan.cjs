/**
 * @module cli-auto-install-plan
 * Decide o que a instalação automática vai instalar.
 *
 * Separado de `cli-auto-install` de propósito: a decisão ("o que falta, o que
 * já tentamos, o que a pessoa pediu de novo") é a parte que precisa ser
 * verificável em teste, e ela não deveria depender de processo, disco ou IPC
 * para ser exercitada.
 */

/**
 * A instalação automática vale para o app instalado.
 *
 * Rodando do código-fonte quem desenvolve já tem o próprio ambiente e não
 * quer o app mexendo nele. A variável de ambiente existe para conseguir
 * exercitar o fluxo completo fora do empacotado.
 *
 * @param {boolean} isPackaged
 * @param {Record<string, string>} [env]
 * @returns {boolean}
 */
function isAutoInstallEnabled(isPackaged, env = process.env) {
  if (env.FELIXO_AUTO_INSTALL_CLIS === '0') return false
  if (env.FELIXO_AUTO_INSTALL_CLIS === '1') return true
  return Boolean(isPackaged)
}

/**
 * O catálogo também contém launchers instalados por outro ecossistema (por
 * exemplo, Python). Eles continuam visíveis no gerenciador oficial, mas não
 * podem entrar na rotina silenciosa que usa o npm gerenciado pelo app.
 *
 * @param {Array<{ autoInstall?: boolean }>} catalog
 * @returns {Array<object>}
 */
function getAutoInstallableClis(catalog) {
  return catalog.filter((cli) => cli.autoInstall !== false)
}

/**
 * Monta a fila de instalação e o estado inicial de cada CLI.
 *
 * Três situações não entram na fila:
 * - `present`: já existe na máquina (instalada pela pessoa ou por nós antes);
 * - `skipped`: falhou nesta mesma versão do app numa tentativa automática —
 *   repetir a cada abertura só gastaria rede e tempo de quem já viu o erro;
 * - tudo, quando `reason` é `manual`: aí a pessoa pediu explicitamente, e o
 *   registro de falha anterior deixa de valer.
 *
 * @param {object} options
 * @param {Array<{ id: string, name: string }>} options.catalog
 * @param {Array<{ detected: boolean }>} options.detections - Na ordem do catálogo.
 * @param {Record<string, { version?: string, ok?: boolean }>} [options.previousState]
 * @param {string} options.appVersion
 * @param {'startup' | 'manual'} [options.reason]
 * @returns {{ pending: Array<object>, progress: Array<{ id: string, name: string, state: string, message: string }> }}
 */
function planAutoInstall({
  catalog,
  detections,
  previousState = {},
  appVersion,
  reason = 'startup',
}) {
  const forced = reason === 'manual'
  const pending = []
  const progress = catalog.map((cli, index) => {
    if (detections[index]?.detected) {
      return createCliProgress(cli, 'present')
    }

    if (!forced && hasInstalledForVersion(previousState, cli.id, appVersion)) {
      return createCliProgress(
        cli,
        'skipped',
        previousState[cli.id]?.message ?? 'Instalação concluída; aguardando detecção da CLI.',
      )
    }

    if (!forced && hasFailedForVersion(previousState, cli.id, appVersion)) {
      return createCliProgress(
        cli,
        'skipped',
        previousState[cli.id]?.message ?? '',
      )
    }

    pending.push(cli)
    return createCliProgress(cli, 'pending')
  })

  return { pending, progress }
}

/**
 * @param {Array<{ detected: boolean }>} detections
 * @returns {boolean}
 */
function allDetected(detections) {
  return detections.every((detection) => detection.detected)
}

function hasFailedForVersion(state, id, appVersion) {
  const attempt = state?.[id]
  return Boolean(attempt && attempt.version === appVersion && attempt.ok === false)
}

function hasInstalledForVersion(state, id, appVersion) {
  const attempt = state?.[id]
  return Boolean(attempt && attempt.version === appVersion && attempt.ok === true)
}

function createCliProgress(cli, state, message = '') {
  return { id: cli.id, name: cli.name, state, message }
}

/**
 * Mensagem final da rodada, a partir do progresso de cada CLI.
 *
 * @param {Array<{ name: string, state: string }>} progress
 * @returns {{ state: 'done' | 'error' | 'idle', message: string }}
 */
function summarizeAutoInstall(progress) {
  const failed = progress.filter((item) => item.state === 'failed')
  const installed = progress.filter((item) => item.state === 'installed')

  if (failed.length > 0) {
    return {
      state: 'error',
      message: `Nao foi possivel instalar: ${failed.map((item) => item.name).join(', ')}.`,
    }
  }

  if (installed.length === 0) {
    return { state: 'idle', message: 'Todas as CLIs de IA estao prontas.' }
  }

  return {
    state: 'done',
    message:
      installed.length === 1
        ? `${installed[0].name} foi instalada e ja esta disponivel.`
        : `${installed.length} CLIs de IA foram instaladas e ja estao disponiveis.`,
  }
}

module.exports = {
  allDetected,
  createCliProgress,
  getAutoInstallableClis,
  isAutoInstallEnabled,
  planAutoInstall,
  summarizeAutoInstall,
}

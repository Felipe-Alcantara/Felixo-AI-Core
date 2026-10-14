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
 * A instalação automática roda sempre que o aplicativo abre.
 *
 * A variável de ambiente permite desativá-la em automações que precisam
 * manter o ambiente isolado.
 *
 * @param {Record<string, string>} [env]
 * @returns {boolean}
 */
function isAutoInstallEnabled(env = process.env) {
  if (env.FELIXO_AUTO_INSTALL_CLIS === '0') return false
  return true
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
 * Uma CLI detectada fora do app não entra na fila. A cópia gerenciada entra
 * quando não existe, está incompleta ou tem versão anterior ao `latest` que o
 * registry acabou de devolver. Falhas continuam limitadas ao mesmo alvo e à
 * mesma versão do app para não repetir uma instalação quebrada a cada abertura;
 * um novo `latest` libera uma nova tentativa.
 *
 * @param {object} options
 * @param {Array<{ id: string, name: string }>} options.catalog
 * @param {Array<{ detected: boolean }>} options.detections - Na ordem do catálogo.
 * @param {Array<boolean>} [options.managedPresent] - Na ordem do catálogo.
 * @param {Array<string | null>} [options.managedVersions] - Versões dos pacotes gerenciados.
 * @param {Array<string | null>} [options.latestVersions] - Versões latest resolvidas no registry.
 * @param {Array<boolean>} [options.managedInUse] - Cópia em uso por um processo aberto (Windows trava o executável).
 * @param {Record<string, { version?: string, ok?: boolean }>} [options.previousState]
 * @param {string} options.appVersion
 * @param {'startup' | 'manual'} [options.reason]
 * @returns {{ pending: Array<object>, progress: Array<{ id: string, name: string, state: string, message: string }> }}
 */
function planAutoInstall({
  catalog,
  detections,
  managedPresent = [],
  managedVersions = [],
  latestVersions = [],
  managedInUse = [],
  previousState = {},
  appVersion,
  reason = 'startup',
}) {
  const forced = reason === 'manual'
  const pending = []
  const progress = catalog.map((cli, index) => {
    const latestVersion = latestVersions[index]
    const managedVersion = managedVersions[index]

    if (
      isManagedCliOutdated({
        managedPresent: managedPresent[index],
        managedVersion,
        latestVersion,
      }) &&
      (forced || !hasFailedForVersion(previousState, cli.id, appVersion, latestVersion))
    ) {
      // No Windows o executável aberto por um agente não pode ser substituído:
      // instalar agora falharia ou deixaria a cópia pela metade. A rodada tenta
      // de novo sozinha depois (ver `cli-auto-install`).
      if (managedInUse[index] === true) {
        return createCliProgress(
          cli,
          'deferred',
          `Atualizacao adiada: a ${cli.name} esta em uso por um agente aberto (${managedVersion ?? 'versao desconhecida'} -> ${latestVersion}).`,
        )
      }
      pending.push(cli)
      return createCliProgress(
        cli,
        'pending',
        latestVersion
          ? `Atualizacao disponivel (${managedVersion ?? 'versao desconhecida'} -> ${latestVersion}).`
          : 'A versao gerenciada da CLI nao pode ser confirmada.',
      )
    }

    if (detections[index]?.detected) {
      return createCliProgress(cli, 'present')
    }

    if (!forced && managedPresent[index] === true && hasInstalled(previousState, cli.id)) {
      return createCliProgress(
        cli,
        'skipped',
        previousState[cli.id]?.message ?? 'Instalação concluída; aguardando detecção da CLI.',
      )
    }

    if (!forced && hasFailedForVersion(previousState, cli.id, appVersion, latestVersion)) {
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

function hasFailedForVersion(state, id, appVersion, latestVersion) {
  const attempt = state?.[id]
  if (!attempt || attempt.version !== appVersion || attempt.ok !== false) {
    return false
  }

  // Um novo latest publicado merece uma nova tentativa mesmo dentro da mesma
  // versao do app. Estados antigos, sem targetVersion, continuam bloqueando a
  // repeticao como antes.
  return !attempt.targetVersion || !latestVersion || attempt.targetVersion === latestVersion
}

/**
 * @param {object} options
 * @param {boolean} [options.managedPresent]
 * @param {string | null} [options.managedVersion]
 * @param {string | null} [options.latestVersion]
 * @returns {boolean}
 */
function isManagedCliOutdated({ managedPresent, managedVersion, latestVersion }) {
  if (!managedPresent) {
    return false
  }

  return isTargetNewer(managedVersion, latestVersion)
}

/**
 * Vale trocar a versão instalada pelo alvo?
 *
 * O alvo já é a versão mais nova publicada: a maior versão principal entre os
 * canais e, dentro dela, a publicada por último. Por isso a troca acontece sempre
 * que a instalada é outra, menos quando a versão principal dela é maior que a do
 * alvo, o que seria rebaixar. Dentro da mesma versão principal vale a ordem de
 * publicação, não a do semver: a nightly de hoje vem depois da preview de ontem,
 * embora "preview" ordene acima de "nightly".
 *
 * @param {string | null | undefined} installedVersion
 * @param {string | null | undefined} targetVersion
 * @returns {boolean}
 */
function isTargetNewer(installedVersion, targetVersion) {
  if (!targetVersion) return false
  if (!installedVersion) return true
  if (installedVersion === targetVersion) return false
  const core = compareCliVersions(coreVersion(installedVersion), coreVersion(targetVersion))
  return core === null || core <= 0
}

/** `0.65.0-nightly.20261014` -> `0.65.0`. */
function coreVersion(version) {
  return String(version).replace(/[-+].*$/, '')
}

/**
 * Compara versoes sem depender de outra arvore npm no app empacotado.
 * Retorna null quando algum valor nao e semver basico.
 *
 * @param {string | null | undefined} left
 * @param {string | null | undefined} right
 * @returns {-1 | 0 | 1 | null}
 */
function compareCliVersions(left, right) {
  const leftParts = parseCliVersion(left)
  const rightParts = parseCliVersion(right)
  if (!leftParts || !rightParts) {
    return null
  }

  for (const key of ['major', 'minor', 'patch']) {
    if (leftParts[key] !== rightParts[key]) {
      return leftParts[key] < rightParts[key] ? -1 : 1
    }
  }

  if (!leftParts.prerelease && !rightParts.prerelease) return 0
  if (!leftParts.prerelease) return 1
  if (!rightParts.prerelease) return -1

  const size = Math.max(leftParts.prerelease.length, rightParts.prerelease.length)
  for (let index = 0; index < size; index += 1) {
    const leftIdentifier = leftParts.prerelease[index]
    const rightIdentifier = rightParts.prerelease[index]
    if (leftIdentifier === undefined) return -1
    if (rightIdentifier === undefined) return 1
    if (leftIdentifier === rightIdentifier) continue

    const leftNumber = /^\d+$/.test(leftIdentifier) ? Number(leftIdentifier) : null
    const rightNumber = /^\d+$/.test(rightIdentifier) ? Number(rightIdentifier) : null
    if (leftNumber !== null && rightNumber !== null) {
      return leftNumber < rightNumber ? -1 : 1
    }
    if (leftNumber !== null) return -1
    if (rightNumber !== null) return 1
    return leftIdentifier < rightIdentifier ? -1 : 1
  }

  return 0
}

function parseCliVersion(value) {
  if (typeof value !== 'string') return null
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(value)
  if (!match) return null

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4]?.split('.') ?? null,
  }
}

function hasInstalled(state, id) {
  return state?.[id]?.ok === true
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
    const details = failed
      .map((item) => item.message)
      .filter(Boolean)
      .join(' ')

    return {
      state: 'error',
      message: `Nao foi possivel instalar: ${failed.map((item) => item.name).join(', ')}.${details ? ` ${details}` : ''}`,
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

/**
 * Decide o que fazer com cada CLI que também está instalada pelo npm global do
 * sistema, fora do app. Por decisão da pessoa, essa instalação acompanha a
 * mesma versão-alvo da cópia do app.
 *
 * Só entra quem tem alvo confirmado no registry: o manifesto de fallback pode
 * ser mais velho que o que a pessoa instalou, e atualizar o sistema com ele
 * seria rebaixar. Uma instalação mais nova que o alvo também fica como está.
 *
 * @param {object} options
 * @param {Array<{ id: string, name: string }>} options.catalog
 * @param {Array<{ version: string | null } | null>} options.systemInstalls - Na ordem do catálogo; `null` quando não há instalação pelo npm global.
 * @param {Array<string | null>} options.targetVersions - Alvo confirmado no registry, na ordem do catálogo.
 * @param {Array<boolean>} [options.inUse]
 * @param {Record<string, object>} [options.previousState]
 * @param {string} options.appVersion
 * @param {'startup' | 'manual' | 'retry'} [options.reason]
 * @returns {Array<{ cli: object, action: 'update' | 'deferred' | 'current' | 'skipped', from: string | null, to: string, message?: string }>}
 */
function planSystemUpdates({
  catalog,
  systemInstalls,
  targetVersions,
  inUse = [],
  previousState = {},
  appVersion,
  reason = 'startup',
}) {
  const plan = []
  catalog.forEach((cli, index) => {
    const install = systemInstalls[index]
    const to = targetVersions[index]
    if (!install || !to) return

    const from = install.version ?? null
    if (!isTargetNewer(from, to)) {
      plan.push({ cli, action: 'current', from, to })
      return
    }

    const stateKey = systemStateKey(cli.id)
    if (reason !== 'manual' && hasFailedForVersion(previousState, stateKey, appVersion, to)) {
      plan.push({ cli, action: 'skipped', from, to, message: previousState[stateKey]?.message ?? '' })
      return
    }

    plan.push({ cli, action: inUse[index] === true ? 'deferred' : 'update', from, to })
  })
  return plan
}

/** Chave do registro de tentativas da instalação do sistema, separada da cópia do app. */
function systemStateKey(id) {
  return `sistema:${id}`
}

module.exports = {
  allDetected,
  compareCliVersions,
  createCliProgress,
  getAutoInstallableClis,
  isAutoInstallEnabled,
  isManagedCliOutdated,
  isTargetNewer,
  coreVersion,
  planAutoInstall,
  planSystemUpdates,
  systemStateKey,
  summarizeAutoInstall,
}

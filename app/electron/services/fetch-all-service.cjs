/**
 * @module fetch-all-service
 * Ferramenta Fetch All: varre os discos, classifica cada repositório git e
 * sincroniza com segurança os que dá para resolver sozinho.
 *
 * O serviço guarda o plano da varredura atual porque a execução acontece num
 * segundo passo, depois da revisão: a interface confirma *aquele* plano, e
 * cada escrita revalida o repositório antes de tocar no disco.
 *
 * Uma passada de cada vez. Duas varreduras simultâneas disputariam o mesmo
 * disco sem entregar nada mais rápido, e duas execuções poderiam agir sobre o
 * mesmo repositório com estados diferentes.
 */

const {
  DEFAULT_EXCLUDE_DIRS,
  filterIgnoredRepos,
  findGitRepos,
  isInsidePath,
  listLocalDrives,
  mountSkipPaths,
  resolveScanRoots,
} = require('./fetch-all/repo-scanner.cjs')
const {
  analyzeRepos,
  autoCommitCandidates,
  buildAutoCommitMessage,
  buildSyncPlan,
  executeAutoCommits,
  executePlan,
  planHasActions,
} = require('./fetch-all/sync-planner.cjs')
const { createFetchAllSettingsStore } = require('./fetch-all/fetch-all-settings.cjs')
const {
  cacheMatchesRoots,
  cachedReposStillOnDisk,
  createScanCache,
} = require('./fetch-all/scan-cache.cjs')
const { writeRunReport } = require('./fetch-all/run-report.cjs')

/** Intervalo mínimo entre eventos de progresso enviados à interface. */
const PROGRESS_THROTTLE_MS = 150

/**
 * Cria a ferramenta Fetch All.
 *
 * @param {object} options
 * @param {{ config: string, cache: string, reports: string }} options.appPaths
 * @param {(event: object) => void} [options.sendEvent] - Publica o progresso na interface.
 * @param {object} [options.scanner] - Adapters do scanner, usados pela suíte sem tocar nos discos reais.
 * @returns {object} A API usada pelos handlers de IPC.
 */
function createFetchAllService({ appPaths, sendEvent, scanner = {} }) {
  const {
    findGitReposFn = findGitRepos,
    listLocalDrivesFn = listLocalDrives,
    mountSkipPathsFn = mountSkipPaths,
    resolveScanRootsFn = resolveScanRoots,
  } = scanner
  const settingsStore = createFetchAllSettingsStore({ configDir: appPaths.config })
  const scanCache = createScanCache({ cacheDir: appPaths.cache })

  /** @type {{ phase: string, plan: object|null, scanMode: string, controller: AbortController|null }} */
  const state = {
    phase: 'idle',
    plan: null,
    scanMode: '',
    controller: null,
  }

  let lastProgressAt = 0

  /**
   * Publica progresso, descartando eventos próximos demais.
   *
   * A varredura visita milhares de pastas por segundo; mandar cada uma para o
   * renderer entupiria o IPC e travaria a interface sem informar mais nada.
   *
   * @param {object} payload
   * @param {boolean} [force] - Ignora o intervalo (início, fim, cancelamento).
   */
  function publishProgress(payload, force = false) {
    const now = Date.now()

    if (!force && now - lastProgressAt < PROGRESS_THROTTLE_MS) return

    lastProgressAt = now
    sendEvent?.({ ...payload, phase: state.phase })
  }

  /** @returns {boolean} */
  function isBusy() {
    return state.phase !== 'idle'
  }

  /**
   * Reserva a ferramenta para uma passada e devolve como liberá-la.
   *
   * @param {string} phase
   * @returns {{ signal: AbortSignal, release: () => void }}
   */
  function beginRun(phase) {
    const controller = new AbortController()

    state.phase = phase
    state.controller = controller

    return {
      signal: controller.signal,
      release() {
        state.phase = 'idle'
        state.controller = null
      },
    }
  }

  /**
   * Calcula o escopo que a interface pode mostrar antes de iniciar I/O recursivo.
   *
   * A lista de discos é uma prévia, não uma autorização. Quando a configuração
   * está vazia, `resolved` permanece vazio até a confirmação explícita chegar ao
   * método `scan`.
   *
   * @param {object} settings
   * @returns {Promise<object>}
   */
  async function readScanScope(settings) {
    const configured = [...settings.scanRoots]
    const available = [...((await listLocalDrivesFn()) ?? [])]
    const resolved = await resolveScanRootsFn(configured, {
      allowUnconfigured: false,
      listLocalDrivesFn: async () => available,
    })
    const requiresConfirmation = configured.length === 0

    return {
      configured,
      resolved,
      available,
      requiresConfirmation,
      reason: requiresConfirmation
        ? 'Nenhuma raiz foi configurada; a varredura ampla está bloqueada até confirmação explícita.'
        : 'A varredura usará somente as raízes configuradas explicitamente.',
      expectedCost: describeExpectedCost(configured, resolved, available),
      scopeKey: createScopeKey({ configured, resolved, available }),
    }
  }

  return {
    /** @returns {Promise<object>} */
    getSettings() {
      return settingsStore.load()
    },

    /**
     * @param {unknown} settings
     * @returns {Promise<object>}
     */
    saveSettings(settings) {
      return settingsStore.save(settings)
    },

    /**
     * Raízes que a varredura usaria agora, para a interface mostrar o escopo.
     *
     * @returns {Promise<object>}
     */
    async describeScanScope() {
      const settings = await settingsStore.load()

      return readScanScope(settings)
    },

    /**
     * Passa a ignorar uma pasta: ela some da varredura e do plano atual.
     *
     * Ignorar vale na hora, inclusive para os repositórios já listados — quem
     * clica em "ignorar" está dizendo que aquilo não deveria estar ali, e
     * esperar a próxima varredura completa faria a pasta continuar aparecendo.
     *
     * @param {string} targetPath
     * @returns {Promise<{ settings: object, plan: object|null }>}
     */
    async ignorePath(targetPath) {
      const settings = await settingsStore.load()
      const saved = await settingsStore.save({
        ...settings,
        ignoredPaths: [...settings.ignoredPaths, targetPath],
      })

      if (state.plan) {
        state.plan = dropIgnoredFromPlan(state.plan, saved.ignoredPaths)
      }

      return { settings: saved, plan: state.plan }
    },

    /**
     * Volta a considerar uma pasta ignorada; ela reaparece na próxima varredura.
     *
     * @param {string} targetPath
     * @returns {Promise<object>} A configuração salva.
     */
    async unignorePath(targetPath) {
      const settings = await settingsStore.load()

      return settingsStore.save({
        ...settings,
        ignoredPaths: settings.ignoredPaths.filter(
          (ignored) => !isInsidePath(ignored, targetPath) && ignored !== targetPath,
        ),
      })
    },

    /**
     * Fase 1: encontra os repositórios, faz fetch e classifica cada um.
     *
     * Nada é escrito no worktree nem vira commit; o fetch só atualiza as
     * referências remotas dentro de `.git`.
     *
     * @param {object} [params]
     * @param {boolean} [params.useCache] - Reaproveita a lista da última varredura completa.
     * @param {boolean} [params.confirmUnconfiguredScope] - Confirma a varredura ampla quando não há raízes configuradas.
     * @param {string} [params.scopeKey] - Identidade do escopo mostrado na confirmação.
     * @returns {Promise<{ ok: boolean, message?: string, plan?: object, scanMode?: string, cancelled?: boolean, needsScopeConfirmation?: boolean, scope?: object }>}
     */
    async scan({ useCache = false, confirmUnconfiguredScope = false, scopeKey } = {}) {
      if (isBusy()) {
        return { ok: false, message: 'Já existe uma passada em andamento.' }
      }

      const { signal, release } = beginRun('scanning')

      try {
        const settings = await settingsStore.load()
        const scope = await readScanScope(settings)

        const confirmedScope =
          !scope.requiresConfirmation ||
          (confirmUnconfiguredScope === true &&
            (scopeKey === undefined || scopeKey === scope.scopeKey))

        if (!confirmedScope) {
          return {
            ok: false,
            needsScopeConfirmation: true,
            scope,
            message: describeScopeConfirmation(scope),
          }
        }

        const roots = scope.requiresConfirmation
          ? await resolveScanRootsFn(settings.scanRoots, {
              allowUnconfigured: true,
              listLocalDrivesFn: async () => scope.available,
            })
          : scope.resolved

        if (!roots.length) {
          return {
            ok: false,
            scope,
            message:
              'Nenhuma raiz de varredura está disponível. Configure uma pasta ou conecte um disco local antes de tentar novamente.',
          }
        }

        // Uma nova passada substitui a anterior. Não deixe a interface oferecer
        // ações calculadas sobre um escopo que já está sendo refeito.
        state.plan = null
        state.scanMode = ''

        const skipPaths = [...((await mountSkipPathsFn()) ?? [])]
        const cacheContext = {
          excludeDirs: settings.excludeDirs,
          ignoredPaths: settings.ignoredPaths,
          skipPaths,
          availableRoots: scope.available,
        }
        const cache = useCache ? await scanCache.load() : null
        const useCachedRepos = Boolean(
          cache && cacheMatchesRoots(cache, roots, cacheContext),
        )

        let repoPaths
        let scanMode

        if (useCachedRepos) {
          repoPaths = cachedReposStillOnDisk(cache)
          scanMode = `rápida (cache de ${formatCacheDate(cache.scannedAt)})`
        } else {
          publishProgress(
            { type: 'scan', scannedDirs: 0, foundRepos: 0, currentPath: '' },
            true,
          )

          repoPaths = await findGitReposFn({
            roots,
            excludeDirs: settings.excludeDirs,
            ignoredPaths: settings.ignoredPaths,
            skipPaths,
            signal,
            onProgress: (progress) => publishProgress({ type: 'scan', ...progress }),
          })

          if (signal.aborted) return { ok: true, cancelled: true }

          await scanCache.save(roots, repoPaths, cacheContext)
          scanMode = `completa (${roots.length} raiz(es))`
        }

        repoPaths = filterIgnoredRepos(repoPaths, settings.ignoredPaths)

        state.phase = 'analyzing'
        publishProgress(
          { type: 'analyze', analyzed: 0, total: repoPaths.length },
          true,
        )

        const statuses = await analyzeRepos(repoPaths, {
          concurrency: settings.analyzeWorkers,
          signal,
          onProgress: ({ analyzed, total, status }) =>
            publishProgress({
              type: 'analyze',
              analyzed,
              total,
              repoName: status.name,
              stateLabel: status.stateLabel,
            }),
        })

        if (signal.aborted) return { ok: true, cancelled: true }

        const plan = buildSyncPlan(statuses)

        state.plan = plan
        state.scanMode = scanMode

        return { ok: true, plan, scanMode, scope }
      } catch (error) {
        return { ok: false, message: describeError(error, 'Falha ao varrer os discos.') }
      } finally {
        release()
        publishProgress({ type: 'done' }, true)
      }
    },

    /**
     * Fase 2: executa as ações seguras do plano já revisado.
     *
     * @param {object} [params]
     * @param {boolean} [params.autoCommit] - Também commita os repositórios cuja única pendência é isso.
     * @returns {Promise<{ ok: boolean, message?: string, results?: object[], reportPath?: string, plan?: object }>}
     */
    async execute({ autoCommit = false } = {}) {
      if (isBusy()) {
        return { ok: false, message: 'Já existe uma passada em andamento.' }
      }

      if (!state.plan) {
        return { ok: false, message: 'Faça uma varredura antes de executar.' }
      }

      const plan = state.plan
      const candidates = autoCommit ? autoCommitCandidates(plan) : []

      if (!planHasActions(plan) && !candidates.length) {
        return { ok: false, message: 'O plano revisado não tem nenhuma ação segura.' }
      }

      const { signal, release } = beginRun('executing')

      try {
        const results = await executePlan(plan, {
          signal,
          onProgress: (progress) => publishProgress({ type: 'execute', ...progress }, true),
        })

        if (candidates.length) {
          results.push(
            ...(await executeAutoCommits(candidates, buildAutoCommitMessage(), {
              signal,
              onProgress: (progress) =>
                publishProgress({ type: 'execute', ...progress }, true),
            })),
          )
        }

        const reportPath = await writeRunReport({
          reportsDir: appPaths.reports,
          plan,
          results,
          executed: true,
          scanMode: state.scanMode || 'não informada',
          when: new Date(),
        })

        // O plano executado está velho por definição: os repositórios mudaram
        // de estado agora. Uma nova varredura é o único jeito honesto de saber
        // onde eles ficaram.
        state.plan = null

        return { ok: true, results, reportPath }
      } catch (error) {
        return { ok: false, message: describeError(error, 'Falha ao executar o plano.') }
      } finally {
        release()
        publishProgress({ type: 'done' }, true)
      }
    },

    /**
     * Cancela a passada em andamento.
     *
     * A varredura e a análise param na próxima pasta/repositório. Na execução,
     * a ação git em curso termina — interromper um push pela metade seria pior
     * do que esperá-lo acabar — e nenhuma nova começa.
     *
     * @returns {{ ok: boolean, cancelled: boolean }}
     */
    cancel() {
      const controller = state.controller

      controller?.abort()

      return { ok: true, cancelled: Boolean(controller) }
    },

    /**
     * Estado atual, para a interface se recompor ao reabrir o painel.
     *
     * @returns {{ phase: string, busy: boolean, plan: object|null, scanMode: string }}
     */
    getState() {
      return {
        phase: state.phase,
        busy: isBusy(),
        plan: state.plan,
        scanMode: state.scanMode,
      }
    },
  }
}

/**
 * Remove do plano os repositórios que passaram a ser ignorados.
 *
 * @param {object} plan
 * @param {string[]} ignoredPaths
 * @returns {object}
 */
function dropIgnoredFromPlan(plan, ignoredPaths) {
  const keep = (bucket) =>
    bucket.filter(
      (status) => !ignoredPaths.some((ignored) => isInsidePath(status.path, ignored)),
    )
  const upToDate = keep(plan.upToDate)
  const toPull = keep(plan.toPull)
  const toPush = keep(plan.toPush)
  const problems = keep(plan.problems)

  return {
    upToDate,
    toPull,
    toPush,
    problems,
    total: upToDate.length + toPull.length + toPush.length + problems.length,
  }
}

/**
 * @param {string} isoDate
 * @returns {string}
 */
function formatCacheDate(isoDate) {
  const when = new Date(isoDate)

  return Number.isNaN(when.getTime()) ? 'data desconhecida' : when.toLocaleString('pt-BR')
}

/**
 * Cria uma identidade estável para o escopo que a pessoa confirmou na tela.
 *
 * @param {{ configured: string[], resolved: string[], available: string[] }} scope
 * @returns {string}
 */
function createScopeKey({ configured, resolved, available }) {
  return JSON.stringify({
    configured: [...configured].sort(),
    resolved: [...resolved].sort(),
    available: [...available].sort(),
  })
}

/**
 * Estima o custo antes de qualquer varredura recursiva.
 *
 * É uma classificação conservadora: uma raiz de volume pode conter milhares
 * de pastas, então ela nunca é apresentada como uma operação pequena.
 *
 * @param {string[]} configured
 * @param {string[]} resolved
 * @param {string[]} available
 * @returns {string}
 */
function describeExpectedCost(configured, resolved, available) {
  if (!configured.length) {
    return available.length
      ? 'Alto: pode percorrer todos os discos locais, visitar milhares de pastas e levar minutos.'
      : 'Indisponível: nenhum disco local foi detectado para estimar o custo.'
  }

  const includesVolumeRoot = resolved.some(
    (root) => root === '/' || /^[A-Za-z]:[\\/]?$/.test(root),
  )

  return includesVolumeRoot
    ? 'Alto: a raiz cobre um volume inteiro e pode visitar milhares de pastas.'
    : `Limitado às ${resolved.length} raiz(es) configurada(s); o tempo depende do conteúdo delas.`
}

/**
 * Texto mostrado quando a configuração vazia tenta iniciar sem confirmação.
 *
 * @param {{ available: string[] }} scope
 * @returns {string}
 */
function describeScopeConfirmation(scope) {
  if (!scope.available.length) {
    return (
      'Nenhuma raiz foi configurada e nenhum disco local foi detectado. Configure uma pasta de trabalho antes de iniciar a varredura.'
    )
  }

  const visibleRoots = scope.available.slice(0, 3).join(', ')
  const remaining = scope.available.length - 3
  const suffix = remaining > 0 ? ` e mais ${remaining}` : ''

  return (
    `Nenhuma raiz foi configurada. Confirme explicitamente a varredura ampla no painel para usar ${visibleRoots}${suffix}; ${scope.expectedCost}`
  )
}

/**
 * @param {unknown} error
 * @param {string} fallback
 * @returns {string}
 */
function describeError(error, fallback) {
  return error instanceof Error && error.message ? error.message : fallback
}

module.exports = {
  DEFAULT_EXCLUDE_DIRS,
  createFetchAllService,
  createScopeKey,
  describeExpectedCost,
  describeScopeConfirmation,
  dropIgnoredFromPlan,
}

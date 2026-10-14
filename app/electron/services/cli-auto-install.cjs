/**
 * @module cli-auto-install
 * Deixa as CLIs oficiais prontas sozinho, logo depois que o app abre.
 *
 * O app orquestra CLIs de IA, mas quem chega pelo instalador de release
 * costuma não usar terminal — e sem `claude`, `codex` ou `gemini` instalados
 * o app abre sem nada para orquestrar. Aqui a instalação acontece em segundo
 * plano, na pasta gerenciada do app (ver `managed-cli-paths`), com o Node e o
 * npm que o app carrega consigo (ver `node-runtime`).
 *
 * Uma CLI instalada fora do app é preservada. A cópia gerenciada pelo app é
 * comparada ao `latest` e entra na fila quando ficou antiga. A decisão de o
 * que instalar vive em `cli-auto-install-plan`; aqui ficam o efeito colateral
 * (processo, disco, IPC) e o status para a interface.
 */

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { ipcMain } = require('electron')
const { detectCli } = require('../core/cli-detector.cjs')
const { listOfficialAiClis } = require('../core/official-cli-catalog.cjs')
const { getManagedCliLayout, getNpmRegistryCacheDir } = require('../core/managed-cli-paths.cjs')
const { getManagedCliManifestEntry } = require('../core/managed-cli-manifest.cjs')
const { getNodeExecutable, resolveNpmCliPath } = require('../core/node-runtime.cjs')
const { createCliEnv, describeCliPath } = require('./cli-process-manager.cjs')
const { ensureManagedCliRuntime } = require('./managed-cli-runtime.cjs')
const {
  installManagedPackage,
  resolveLatestManagedPackage,
} = require('./managed-cli-installer.cjs')
const { pruneNpmCacheIfOverBudget } = require('./managed-cli-cache-maintenance.cjs')
const {
  getManagedCliPackageVersion,
  verifyManagedCliInstallation,
} = require('./managed-cli-health.cjs')
const {
  allDetected,
  getAutoInstallableClis,
  isAutoInstallEnabled,
  planAutoInstall,
  planSystemUpdates,
  summarizeAutoInstall,
  systemStateKey,
} = require('./cli-auto-install-plan.cjs')
const {
  installSystemNpmPackage,
  isInstallInUse,
  listRunningExecutables,
  readSystemNpmInstall,
  resolveSystemNpmGlobalRoot,
} = require('./system-cli-update.cjs')
const { logQaEvent } = require('./qa-logger.cjs')
const {
  diagnoseClis,
  formatDiagnosisForSupport,
  minimizeEffectivePath,
  redactDiagnosticText,
} = require('./cli-diagnostics.cjs')

const STATE_FILE_NAME = 'cli-auto-install.json'
const STARTUP_DELAY_MS = 4000
/** Intervalo da nova tentativa enquanto alguma CLI estiver em uso por um agente. */
const DEFERRED_RETRY_MINUTES = 5
/** Saída do npm quando um arquivo da CLI está aberto (no Windows, o executável em uso). */
const BUSY_OUTPUT = /\b(?:EBUSY|EPERM)\b/

/**
 * @param {() => import('electron').BrowserWindow | null} getMainWindow
 * @param {object} options
 * @param {ReturnType<typeof import('../core/app-paths.cjs').getAppPaths>} options.appPaths
 * @param {string} options.appVersion
 * @param {Function} [options.installPackage] - Injetável nos testes.
 * @param {Function} [options.detect] - Injetável nos testes.
 * @param {Function} [options.resolveLatestPackage] - Injetável nos testes.
 * @param {Function} [options.verifyInstallation] - Injetável nos testes.
 * @param {string} [options.platformName]
 * @param {string} [options.arch]
 * @param {typeof fs} [options.fileSystem]
 * @param {(env: Record<string, string>) => Array<{ position: number, origin: string, path: string }>} [options.describePath]
 *   O PATH efetivo das CLIs (`describeCliPath`); injetável nos testes.
 * @param {string} [options.userName] - Conta atual, que some do texto de suporte.
 * @returns {{ getStatus: () => object, run: (reason?: string) => Promise<object>, stop: () => void }}
 */
function registerCliAutoInstallHandlers(getMainWindow, options) {
  const {
    appPaths,
    appVersion,
    installPackage = installManagedPackage,
    detect = detectCli,
    resolveLatestPackage = resolveLatestManagedPackage,
    verifyInstallation = verifyManagedCliInstallation,
    platformName = process.platform,
    arch = process.arch,
    fileSystem = fs,
    describePath = describeCliPath,
    userName = readUserName(),
    listExecutables = listRunningExecutables,
    systemCli = {
      resolveGlobalRoot: resolveSystemNpmGlobalRoot,
      readInstall: readSystemNpmInstall,
      install: installSystemNpmPackage,
    },
  } = options

  const layout = getManagedCliLayout({ userData: appPaths.userData })
  const cacheDir = getNpmRegistryCacheDir(appPaths.userData)
  const stateFilePath = path.join(appPaths.config, STATE_FILE_NAME)
  const enabled = isAutoInstallEnabled()

  let status = createStatus({
    state: enabled ? 'idle' : 'disabled',
    message: enabled
      ? 'Verificando as CLIs de IA.'
      : 'A instalacao automatica das CLIs foi desativada neste ambiente.',
  })
  let running = null
  let startupTimer = null
  let retryTimer = null

  function setStatus(next) {
    status = { ...status, ...next, updatedAt: new Date().toISOString() }
    sendStatus(getMainWindow, status)
    return status
  }

  /**
   * Instala o que faltar.
   *
   * `reason` separa a rodada automática da nova tentativa pedida pela pessoa:
   * só a segunda ignora o registro de falhas desta versão. Chamadas
   * concorrentes compartilham a mesma execução — duas instalações do mesmo
   * pacote no mesmo prefixo se atropelariam.
   */
  function run(reason = 'startup') {
    if (running) {
      return running
    }

    running = installMissingClis(reason)
      .catch((error) =>
        setStatus({
          state: 'error',
          message: getErrorMessage(
            error,
            'Falha na instalacao automatica das CLIs.',
          ),
        }),
      )
      .finally(() => {
        running = null
      })

    return running
  }

  async function installMissingClis(reason) {
    const npmCliPath = resolveNpmCliPath()

    if (!npmCliPath) {
      return setStatus({
        state: 'error',
        message:
          'O instalador de CLIs nao veio junto com esta versao do app. Instale as CLIs pelo gerenciador de modelos.',
        clis: [],
      })
    }

    setStatus({ state: 'checking', message: 'Verificando as CLIs de IA.', clis: [] })

    const catalog = getAutoInstallableClis(listOfficialAiClis())
    const detections = await detectWithSecondChance(catalog, detect)
    ensureManagedCliRuntime({
      layout,
      nodeExecutable: getNodeExecutable(),
      npmCliPath,
      platformName,
      fileSystem,
    })

    const latestPackages = await resolveLatestPackages({
      catalog,
      resolveLatestPackage,
      npmCliPath,
      nodeExecutable: getNodeExecutable(),
      layout,
      platformName,
    })
    // No Windows o executável aberto por um agente não pode ser trocado. A lista
    // é lida uma vez por rodada; fora do Windows ela vem vazia.
    const executables = await listExecutables({ platformName })
    const managedVersions = catalog.map((cli) =>
      getManagedCliPackageVersion({
        providerId: cli.id,
        layout,
        fileSystem,
      }),
    )
    const { pending, progress } = planAutoInstall({
      catalog,
      detections,
      managedPresent: catalog.map((cli) =>
        hasManagedInstallation(layout, cli, {
          verifyInstallation,
          platformName,
          arch,
          fileSystem,
        }),
      ),
      managedVersions,
      latestVersions: catalog.map(
        (cli) => latestPackages.find((item) => item.id === cli.id)?.version ?? null,
      ),
      managedInUse: catalog.map((cli) =>
        isInstallInUse(getManagedPackageDir(layout, cli), executables, platformName),
      ),
      previousState: readState(stateFilePath),
      appVersion,
      reason,
    })

    const attempts = readState(stateFilePath)
    // O que mudou de versão nesta rodada, para o aviso discreto da interface.
    const updates = []

    for (const [index, cli] of pending.entries()) {
      updateCliProgress(progress, cli.id, { state: 'installing' })
      setStatus({
        state: 'installing',
        message: `Instalando ${cli.name} (${index + 1} de ${pending.length}).`,
        clis: progress,
      })

      // O alvo vem do latest resolvido no registry. Se a consulta falhar, ele
      // vem do manifesto de fallback e ainda passa pela conferência de hash.
      const latestPackage = latestPackages.find((item) => item.id === cli.id)
      const npmPackage = latestPackage?.version
        ? `${latestPackage.npmPackage}@${latestPackage.version}`
        : latestPackage?.npmPackage ?? cli.install.npmPackage
      const result = await installAndVerifyManagedCli({
        cli,
        installPackage,
        verifyInstallation,
        platformName,
        arch,
        fileSystem,
        installOptions: {
          expectedIntegrity: latestPackage?.integrity,
          npmPackage,
          npmCliPath,
          nodeExecutable: getNodeExecutable(),
          layout,
          cacheDir,
          // Alvo que acabou de vir do registry: a lista de versões do cache pode
          // ser de antes da publicação dele (ETARGET). O do manifesto só existe
          // quando o registry não respondeu, e aí o cache é o que vale.
          preferOnline: latestPackage?.source === 'registry',
        },
      })

      // O que sai daqui vai para a interface, para o arquivo de estado e para
      // o log de QA — os três podem ser copiados para suporte. A saída do npm
      // pode ecoar URL de registry com credencial ou um `_authToken`, e o
      // caminho traz o nome de usuário; por isso a redação acontece antes de
      // qualquer persistência, não depois.
      const redactOptions = { homeDir: os.homedir() }
      const safeMessage = redactDiagnosticText(result.message, redactOptions)

      // Um agente abriu a CLI entre a lista de processos e a instalação: é
      // passageiro, não uma falha desta versão; a nova tentativa resolve.
      if (!result.ok && BUSY_OUTPUT.test(String(result.output ?? ''))) {
        updateCliProgress(progress, cli.id, {
          state: 'deferred',
          message: `Atualizacao adiada: a ${cli.name} esta em uso por um agente aberto.`,
        })
        continue
      }

      updateCliProgress(progress, cli.id, {
        state: result.ok ? 'installed' : 'failed',
        message: safeMessage,
      })
      attempts[cli.id] = {
        version: appVersion,
        ...(latestPackage?.version ? { targetVersion: latestPackage.version } : {}),
        ok: result.ok,
        message: safeMessage,
        at: new Date().toISOString(),
      }
      if (result.ok && latestPackage?.version) {
        updates.push({
          id: cli.id,
          name: cli.name,
          scope: 'app',
          from: managedVersions[catalog.indexOf(cli)] ?? null,
          to: latestPackage.version,
        })
      }

      logQaEvent({
        level: result.ok ? 'info' : 'warn',
        scope: 'cli:auto-install',
        message: safeMessage,
        details: { id: cli.id, reason, output: redactDiagnosticText(result.output, redactOptions) },
      })
    }

    const systemResults = await updateSystemInstalls({
      catalog,
      latestPackages,
      executables,
      attempts,
      reason,
    })
    for (const item of systemResults) {
      if (item.action === 'updated') {
        updates.push({ id: item.id, name: item.name, scope: 'sistema', from: item.from, to: item.to })
      }
    }

    writeState(stateFilePath, attempts)

    // Expurgo oportunista: só depois de instalar algo de verdade, nunca a
    // cada checagem sem trabalho (a maioria das inicializações não instala
    // nada). Falha de limpeza nunca derruba o resultado da instalação — é
    // manutenção, não o objetivo desta rodada.
    if (pending.length > 0) {
      try {
        await pruneNpmCacheIfOverBudget({
          cacheDir,
          npmCliPath,
          nodeExecutable: getNodeExecutable(),
          env: createCliEnv(),
        })
      } catch (error) {
        logQaEvent({
          level: 'warn',
          scope: 'cli:auto-install',
          message: 'Falha ao verificar o orcamento do cache offline.',
          details: { error: getErrorMessage(error, 'erro desconhecido') },
        })
      }
    }

    const deferred = [
      ...progress.filter((item) => item.state === 'deferred').map((item) => item.name),
      ...systemResults
        .filter((item) => item.action === 'deferred')
        .map((item) => `${item.name} (sistema)`),
    ]
    scheduleDeferredRetry(deferred.length > 0)

    const summary =
      pending.length === 0
        ? {
            state: 'idle',
            message: allDetected(detections)
              ? 'Todas as CLIs de IA estao prontas.'
              : 'Faltam CLIs de IA, e a instalacao automatica ja tentou nesta versao.',
          }
        : summarizeAutoInstall(progress)

    return setStatus({
      ...summary,
      ...(summary.state === 'idle' && updates.length > 0 ? { state: 'done' } : {}),
      message:
        deferred.length > 0
          ? `${summary.message} Em uso por um agente aberto: ${deferred.join(', ')}; nova tentativa em ${DEFERRED_RETRY_MINUTES} min.`
          : summary.message,
      clis: progress,
      updates,
      systemUpdates: systemResults,
    })
  }

  /**
   * Leva a instalação da CLI no npm global do sistema para o mesmo alvo da cópia
   * do app. Só com alvo confirmado no registry; a decisão fica em
   * `planSystemUpdates` e o que pode dar errado vira resultado, nunca exceção.
   */
  async function updateSystemInstalls({ catalog, latestPackages, executables, attempts, reason }) {
    let globalRoot = null
    try {
      globalRoot = await systemCli.resolveGlobalRoot({ managedRoot: layout.root, platformName, fileSystem })
    } catch {
      globalRoot = null
    }
    if (!globalRoot) return []

    const installs = catalog.map((cli) => {
      const entry = getManagedCliManifestEntry(cli.id)
      return entry ? systemCli.readInstall({ globalRoot, npmPackage: entry.npmPackage, fileSystem }) : null
    })
    const plan = planSystemUpdates({
      catalog,
      systemInstalls: installs,
      targetVersions: catalog.map((cli) => {
        const latestPackage = latestPackages.find((item) => item.id === cli.id)
        return latestPackage?.source === 'registry' ? latestPackage.version : null
      }),
      inUse: installs.map((install) => isInstallInUse(install?.packageDir, executables, platformName)),
      previousState: attempts,
      appVersion,
      reason,
    })

    const results = []
    for (const item of plan) {
      const base = { id: item.cli.id, name: item.cli.name, from: item.from, to: item.to }
      if (item.action !== 'update') {
        results.push({ ...base, action: item.action, message: item.message ?? '' })
        continue
      }

      const entry = getManagedCliManifestEntry(item.cli.id)
      let result
      try {
        result = await systemCli.install({
          npmPackage: `${entry.npmPackage}@${item.to}`,
          cwd: os.homedir(),
          platformName,
        })
      } catch (error) {
        result = { ok: false, busy: false, message: getErrorMessage(error, 'Falha ao chamar o npm do sistema.'), output: '' }
      }
      if (!result.ok && result.busy) {
        results.push({ ...base, action: 'deferred', message: 'Em uso por um agente aberto.' })
        continue
      }

      // Sucesso é a versão nova no disco, não só o código de saída do npm.
      const after = systemCli.readInstall({ globalRoot, npmPackage: entry.npmPackage, fileSystem })
      const ok = result.ok && after?.version === item.to
      const redactOptions = { homeDir: os.homedir() }
      const message = redactDiagnosticText(
        ok
          ? `${item.cli.name} do sistema atualizada de ${item.from ?? 'versao desconhecida'} para ${item.to}.`
          : result.ok
            ? `O npm terminou, mas a ${item.cli.name} do sistema continua em ${after?.version ?? 'versao desconhecida'}.`
            : result.message,
        redactOptions,
      )
      attempts[systemStateKey(item.cli.id)] = {
        version: appVersion,
        targetVersion: item.to,
        ok,
        message,
        at: new Date().toISOString(),
      }
      logQaEvent({
        level: ok ? 'info' : 'warn',
        scope: 'cli:auto-install',
        message,
        details: {
          id: item.cli.id,
          scope: 'sistema',
          reason,
          output: redactDiagnosticText(result.output, redactOptions),
        },
      })
      results.push({ ...base, action: ok ? 'updated' : 'failed', message })
    }
    return results
  }

  function scheduleDeferredRetry(needed) {
    clearTimeout(retryTimer)
    retryTimer = null
    if (!needed) return
    retryTimer = setTimeout(() => run('retry'), DEFERRED_RETRY_MINUTES * 60 * 1000)
    // A nova tentativa nunca segura o processo aberto sozinha.
    retryTimer.unref?.()
  }

  ipcMain.handle('clis:get-setup-status', () => ({ ok: true, status }))
  // Verificação read-only: detecta e explica, sem instalar nem tocar em PATH ou
  // configuração. Existe para a interface separar "não instalada" de
  // "instalada mas invisível" antes de sugerir reinstalar.
  ipcMain.handle('clis:diagnose', async () => {
    const homeDir = os.homedir()
    // A lista crua só serve para localizar a pasta de cada CLI aqui dentro;
    // para a tela e o suporte vai a minimizada.
    const effectivePath = describePath(process.env)
    const diagnoses = await diagnoseClis({
      catalog: getAutoInstallableClis(listOfficialAiClis()),
      detect,
      env: createCliEnv(),
      layout,
      verifyInstallation,
      attempts: readState(stateFilePath),
      fileSystem,
      context: { platformName, arch, appVersion, homeDir, userName, effectivePath },
    })
    const visiblePath = minimizeEffectivePath(effectivePath, { homeDir, userName })

    return {
      ok: true,
      diagnoses,
      effectivePath: visiblePath,
      supportText: formatDiagnosisForSupport(diagnoses, { effectivePath: visiblePath }),
    }
  })
  ipcMain.handle('clis:retry-setup', async () => {
    if (!enabled) {
      return { ok: false, message: status.message, status }
    }

    return { ok: true, status: await run('manual') }
  })

  if (enabled) {
    // O atraso deixa a janela desenhar antes: a instalação é longa e não pode
    // disputar com a abertura do app o mesmo instante de CPU.
    startupTimer = setTimeout(() => run('startup'), STARTUP_DELAY_MS)
  }

  return {
    getStatus: () => status,
    run,
    stop: () => {
      clearTimeout(startupTimer)
      clearTimeout(retryTimer)
    },
  }
}

/** Pasta do pacote principal da cópia do app (onde o executável aberto mora). */
function getManagedPackageDir(layout, cli) {
  const entry = getManagedCliManifestEntry(cli.id)
  return entry ? path.join(layout.root, 'node_modules', ...entry.npmPackage.split('/')) : null
}

function updateCliProgress(progress, id, patch) {
  const item = progress.find((candidate) => candidate.id === id)
  if (item) Object.assign(item, patch)
}

function createStatus({ state, message }) {
  return { state, message, clis: [], updatedAt: new Date().toISOString() }
}

async function resolveLatestPackages({
  catalog,
  resolveLatestPackage,
  npmCliPath,
  nodeExecutable,
  layout,
  platformName,
}) {
  return Promise.all(
    catalog.map(async (cli) => {
      const fallback = getManagedCliManifestEntry(cli.id)

      if (!fallback) {
        return {
          id: cli.id,
          npmPackage: cli.install.npmPackage,
          version: null,
          integrity: null,
          source: 'catalog',
        }
      }

      try {
        const latest = await resolveLatestPackage({
          npmPackage: fallback.npmPackage,
          npmCliPath,
          nodeExecutable,
          layout,
          platformName,
        })

        if (latest?.ok && latest.version && latest.integrity) {
          return {
            id: cli.id,
            npmPackage: latest.npmPackage ?? fallback.npmPackage,
            version: latest.version,
            integrity: latest.integrity,
            source: 'registry',
          }
        }

        logLatestFallback(cli.id, latest?.message)
      } catch (error) {
        logLatestFallback(cli.id, getErrorMessage(error, 'erro desconhecido'))
      }

      return {
        id: cli.id,
        npmPackage: fallback.npmPackage,
        version: fallback.version,
        integrity: fallback.integrity,
        source: 'manifest-fallback',
      }
    }),
  )
}

function logLatestFallback(id, reason) {
  logQaEvent({
    level: 'warn',
    scope: 'cli:auto-install',
    message: 'Registry indisponivel; usando o manifesto de fallback da CLI.',
    details: {
      id,
      reason: redactDiagnosticText(reason ?? 'motivo desconhecido', { homeDir: os.homedir() }),
    },
  })
}

/**
 * Detecta, e tenta de novo só o que pareceu faltar.
 *
 * A detecção roda logo depois da abertura, quando a máquina está mais
 * ocupada, e uma CLI lenta pode estourar o tempo limite e passar por
 * ausente — o que faz o app reinstalar algo que já estava lá. A segunda
 * chamada acontece com o app já assentado e custa nada quando tudo foi
 * detectado de primeira.
 */
async function detectWithSecondChance(catalog, detect) {
  const env = createCliEnv()
  const first = await Promise.all(catalog.map((cli) => detect(cli, env)))

  if (first.every((detection) => detection.detected)) {
    return first
  }

  return Promise.all(
    first.map((detection, index) =>
      detection.detected ? detection : detect(catalog[index], env),
    ),
  )
}

/**
 * O executável que instalamos continua no disco?
 *
 * No Windows o nome no disco não é o `command` puro: o catálogo declara em
 * `windowsAliases` as extensões que aquela CLI realmente usa (`.cmd`, `.exe`
 * e, para a Codex/openia, `.ps1`). Ignorar isso faria o app achar que o
 * binário sumiu e reinstalar uma CLI que já está lá.
 */
function hasManagedBinary(layout, cli) {
  if (!cli.command) {
    return false
  }

  const candidatos =
    cli.windowsAliases?.length > 0
      ? [cli.command, ...cli.windowsAliases]
      : [cli.command, `${cli.command}.cmd`, `${cli.command}.exe`]

  return candidatos.some((candidate) =>
    fs.existsSync(path.join(layout.packagesBin, candidate)),
  )
}

/**
 * O executável sozinho não prova que a CLI está pronta: o Codex também
 * depende de um pacote nativo opcional específico da plataforma.
 *
 * @param {import('../core/managed-cli-paths.cjs').ManagedCliLayout} layout
 * @param {{ id: string }} cli
 * @param {object} [options]
 * @returns {boolean}
 */
function hasManagedInstallation(
  layout,
  cli,
  {
    verifyInstallation = verifyManagedCliInstallation,
    platformName = process.platform,
    arch = process.arch,
    fileSystem = fs,
  } = {},
) {
  if (!hasManagedBinary(layout, cli)) {
    return false
  }

  return verifyInstallation({
    providerId: cli.id,
    layout,
    platformName,
    arch,
    fileSystem,
  }).ok
}

/**
 * O npm pode declarar sucesso e ainda deixar uma optionalDependency do Codex
 * ausente. Repetir uma vez corrige a falha transitória; se não corrigir, o
 * erro original continua na mensagem que chega à interface.
 */
async function installAndVerifyManagedCli({
  cli,
  installPackage,
  installOptions,
  verifyInstallation = verifyManagedCliInstallation,
  platformName = process.platform,
  arch = process.arch,
  fileSystem = fs,
}) {
  const install = () => installPackage(installOptions)
  const firstResult = await install()

  if (!firstResult.ok) {
    return firstResult
  }

  const firstVerification = verifyInstallation({
    providerId: cli.id,
    layout: installOptions.layout,
    platformName,
    arch,
    fileSystem,
  })

  if (firstVerification.ok) {
    return firstResult
  }

  const retryResult = await install()

  if (!retryResult.ok) {
    return {
      ...retryResult,
      message: `${firstVerification.message} A reinstalação automática falhou: ${retryResult.message}`,
      output: combineInstallOutput(
        firstResult.output,
        firstVerification.message,
        retryResult.output,
      ),
    }
  }

  const secondVerification = verifyInstallation({
    providerId: cli.id,
    layout: installOptions.layout,
    platformName,
    arch,
    fileSystem,
  })

  if (secondVerification.ok) {
    return {
      ...retryResult,
      message: `${cli.name} instalada após uma reinstalação automática.`,
      output: combineInstallOutput(
        firstResult.output,
        firstVerification.message,
        retryResult.output,
      ),
    }
  }

  return {
    ...retryResult,
    ok: false,
    message: `${secondVerification.message ?? firstVerification.message} A reinstalação automática terminou, mas a instalação continua incompleta.`,
    output: combineInstallOutput(
      firstResult.output,
      firstVerification.message,
      retryResult.output,
      secondVerification.message,
    ),
  }
}

function combineInstallOutput(...parts) {
  return parts
    .filter((part) => String(part ?? '').trim())
    .join('\n')
    .slice(-12000)
}

/**
 * Nome da conta atual, lido do sistema (nunca de variável de ambiente).
 * `os.userInfo` lança quando o uid não tem entrada no passwd (container); sem
 * o nome, o diagnóstico ainda tira `/home/<usuario>` e `C:\Users\<usuario>`.
 */
function readUserName() {
  try {
    return os.userInfo().username
  } catch {
    return undefined
  }
}

function readState(stateFilePath) {
  try {
    return JSON.parse(fs.readFileSync(stateFilePath, 'utf8'))
  } catch {
    return {}
  }
}

function writeState(stateFilePath, state) {
  try {
    fs.mkdirSync(path.dirname(stateFilePath), { recursive: true })
    fs.writeFileSync(stateFilePath, JSON.stringify(state, null, 2), 'utf8')
  } catch (error) {
    logQaEvent({
      level: 'warn',
      scope: 'cli:auto-install',
      message: getErrorMessage(
        error,
        'Nao foi possivel registrar as tentativas de instalacao.',
      ),
    })
  }
}

function sendStatus(getMainWindow, status) {
  const mainWindow =
    typeof getMainWindow === 'function' ? getMainWindow() : getMainWindow

  if (!mainWindow?.webContents || mainWindow.webContents.isDestroyed()) {
    return
  }

  mainWindow.webContents.send('clis:setup-status', status)
}

function getErrorMessage(error, fallback) {
  return error?.message ? String(error.message) : fallback
}

module.exports = {
  registerCliAutoInstallHandlers,
  hasManagedBinary,
  hasManagedInstallation,
  installAndVerifyManagedCli,
}

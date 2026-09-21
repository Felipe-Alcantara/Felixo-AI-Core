/**
 * @module cli-diagnostics
 * Diagnóstico seguro de "por que o app não enxerga esta CLI".
 *
 * O produto precisa separar "não instalada" de "instalada mas invisível ao
 * processo Electron". Quem só tem `detected: false` reduz as duas a "instale",
 * e reinstalar não resolve PATH, permissão, atalho quebrado nem falta de rede.
 *
 * Três regras moldam este módulo:
 *
 * 1. **Só lê.** Nada aqui instala, executa comando vindo do ambiente ou altera
 *    PATH/configuração. A única execução é o `--version` que o detector já
 *    fazia, e o comando vem do catálogo, nunca do usuário.
 * 2. **O resultado é copiável para suporte.** Por isso sai minimizado: o
 *    diretório da pessoa vira `~`, o nome de usuário some e nenhum trecho de
 *    saída crua de CLI entra — só códigos de motivo e textos escritos aqui.
 * 3. **Toda falha tem próxima ação, e nenhuma delas carrega segredo.**
 */

const path = require('node:path')
const { FAILURE_REASONS } = require('../core/cli-detector.cjs')
const { redactSecrets } = require('./official-cli-account-status.cjs')

const REDACTED = '[oculto]'
const MAX_DIAGNOSTIC_TEXT = 2000

/** Causas que a interface explica. Fechado: quem consome faz `switch`. */
const DIAGNOSIS_CAUSES = Object.freeze({
  NOT_INSTALLED: 'not-installed',
  PATH: 'path',
  PERMISSION: 'permission',
  TIMEOUT: 'timeout',
  SHIM: 'shim',
  EXEC_ERROR: 'exec-error',
  PACKAGE: 'package',
  NETWORK: 'network',
})

const NETWORK_FAILURE_PATTERN =
  /(?:ENOTFOUND|EAI_AGAIN|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EHOSTUNREACH|ENETUNREACH|getaddrinfo|self[- ]signed certificate|unable to get local issuer|proxy|network|rede)/i
const PERMISSION_FAILURE_PATTERN = /(?:EACCES|EPERM|permission denied|acesso negado|access is denied)/i

/**
 * Tira de um texto o que não pode ser persistido nem copiado para suporte.
 *
 * Ordem importa: URLs saem antes do mascaramento por rótulo para que um token
 * na query string (`?token=…`) não sobreviva por estar "dentro de uma URL".
 *
 * @param {unknown} text
 * @param {{ homeDir?: string }} [options]
 * @returns {string}
 */
function redactDiagnosticText(text, { homeDir } = {}) {
  let output = String(text ?? '')

  output = output.replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s"'<>)]+/gi, '[url]')
  output = output.replace(/(_auth(?:Token)?|_password)\s*=\s*\S+/gi, `$1=${REDACTED}`)
  output = redactSecrets(output)
  // Sequência longa e sem espaços parece credencial mesmo sem rótulo.
  output = output.replace(/\b[A-Za-z0-9_-]{40,}\b/g, REDACTED)
  output = minimizePaths(output, { homeDir })

  return output.slice(0, MAX_DIAGNOSTIC_TEXT)
}

/**
 * Troca o diretório pessoal por `~` e o nome de usuário por `<usuario>`.
 *
 * Cobre o caso de vários usuários na mesma máquina: um caminho de OUTRA conta
 * (`C:\Users\Ana\…` quando o app roda como `Bia`) também perde o nome, sem
 * depender de saber quem está logado.
 *
 * @param {unknown} text
 * @param {{ homeDir?: string }} [options]
 * @returns {string}
 */
function minimizePaths(text, { homeDir } = {}) {
  let output = String(text ?? '')

  if (homeDir) {
    const separators = homeDir.replace(/[\\/]+$/, '')
    const pattern = new RegExp(
      separators
        .split(/[\\/]/)
        .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('[\\\\/]'),
      'gi',
    )
    output = output.replace(pattern, '~')
  }

  // Nome de usuário pode ter espaço ("Felipe Martins"): para no próximo
  // separador, não no primeiro espaço.
  output = output.replace(/([A-Za-z]:[\\/]+Users[\\/]+)[^\\/\r\n"']+/gi, '$1<usuario>')
  output = output.replace(/(\/(?:home|Users)\/)[^/\r\n"']+/g, '$1<usuario>')

  return output
}

/**
 * Classifica a falha de uma instalação anterior pelo texto que ela registrou.
 *
 * @param {{ ok?: boolean, message?: string } | null | undefined} lastInstall
 * @returns {'network' | 'permission' | null}
 */
function classifyInstallFailure(lastInstall) {
  if (!lastInstall || lastInstall.ok !== false) return null

  const message = String(lastInstall.message ?? '')
  if (NETWORK_FAILURE_PATTERN.test(message)) return DIAGNOSIS_CAUSES.NETWORK
  if (PERMISSION_FAILURE_PATTERN.test(message)) return DIAGNOSIS_CAUSES.PERMISSION
  return null
}

/**
 * O binário que o app instalou continua no disco?
 *
 * Espelha a regra do instalador automático (aliases do Windows incluídos) mas
 * fica aqui para o diagnóstico rodar sem carregar o Electron.
 */
function hasManagedBinary({ layout, cli, fileSystem }) {
  if (!layout?.packagesBin || !cli?.command) return false

  const candidates =
    cli.windowsAliases?.length > 0
      ? [cli.command, ...cli.windowsAliases]
      : [cli.command, `${cli.command}.cmd`, `${cli.command}.exe`]

  return candidates.some((candidate) => {
    try {
      return fileSystem.existsSync(path.join(layout.packagesBin, candidate))
    } catch {
      return false
    }
  })
}

/**
 * Monta o diagnóstico de UMA CLI.
 *
 * @param {object} input
 * @param {{ id: string, name: string, command: string, install?: { label?: string } }} input.cli
 * @param {object} input.detection - Resultado de `detectCli` (com `attempts` e `reason`).
 * @param {boolean} [input.managedPresent] - Há binário instalado pelo app no disco.
 * @param {{ ok: boolean, message?: string } | null} [input.managedHealth]
 * @param {{ ok?: boolean, message?: string } | null} [input.lastInstall]
 * @param {{ platformName?: string, arch?: string, appVersion?: string, homeDir?: string }} [input.context]
 */
function buildCliDiagnosis({
  cli,
  detection,
  managedPresent = false,
  managedHealth = null,
  lastInstall = null,
  context = {},
}) {
  const { platformName = process.platform, arch = process.arch, appVersion = null, homeDir } = context
  const minimize = (value) => (value ? minimizePaths(value, { homeDir }) : null)

  const candidates = (detection.attempts ?? []).map((attempt) => ({
    command: attempt.command,
    resolvedPath: minimize(attempt.resolvedPath),
    viaShell: Boolean(attempt.viaShell),
    outcome: attempt.outcome,
    reason: attempt.reason,
  }))
  const chosen = minimize(detection.path)
  const base = {
    id: cli.id,
    name: cli.name,
    platform: platformName,
    arch,
    appVersion,
    candidates,
    chosen,
    version: detection.version ?? null,
    reason: detection.reason ?? null,
  }

  if (detection.detected) {
    return {
      ...base,
      status: 'ready',
      cause: null,
      // Binário válido encontrado: reinstalar seria ruído, e é exatamente o
      // laço que o usuário do Windows reportou.
      recommendInstall: false,
      nextAction: { kind: 'none', text: 'Nenhuma ação necessária: a CLI respondeu normalmente.' },
    }
  }

  const failed = { ...base, status: 'unavailable' }
  const found = candidates.find((candidate) => candidate.resolvedPath)?.resolvedPath ?? null
  const where = found ? ` (${found})` : ''
  const installLabel = cli.install?.label ? ` (${cli.install.label})` : ''
  const installFailure = classifyInstallFailure(lastInstall)

  // Um pacote incompleto vence qualquer outra leitura: o executável existe e
  // responde, mas falta a peça nativa. Só aqui reinstalar é a ação certa.
  if (managedPresent && managedHealth && managedHealth.ok === false) {
    return {
      ...failed,
      cause: DIAGNOSIS_CAUSES.PACKAGE,
      recommendInstall: true,
      nextAction: {
        kind: 'reinstall',
        text: 'A instalação gerenciada está incompleta (falta um pacote nativo da plataforma). Use "Tentar de novo" para refazê-la.',
      },
    }
  }

  switch (detection.reason) {
    case FAILURE_REASONS.PERMISSION:
      return {
        ...failed,
        cause: DIAGNOSIS_CAUSES.PERMISSION,
        recommendInstall: false,
        nextAction: {
          kind: 'fix-permission',
          text: `O sistema negou a execução do arquivo${where}. Confira as permissões dele e se um antivírus o bloqueou; reinstalar não muda isso.`,
        },
      }
    case FAILURE_REASONS.TIMEOUT:
      return {
        ...failed,
        cause: DIAGNOSIS_CAUSES.TIMEOUT,
        recommendInstall: false,
        nextAction: {
          kind: 'retry-check',
          text: `A CLI existe${where}, mas não respondeu a tempo. Verifique de novo com o computador menos ocupado.`,
        },
      }
    case FAILURE_REASONS.SHIM_BROKEN:
      return {
        ...failed,
        cause: DIAGNOSIS_CAUSES.SHIM,
        recommendInstall: false,
        nextAction: {
          kind: 'repair-shim',
          text: `O atalho da CLI${where} foi encontrado, mas não executou — o Node que ele chama pode ter sido removido ou movido. Abra um terminal e rode a CLI por lá; se falhar também, reinstale o pacote.`,
        },
      }
    case FAILURE_REASONS.EXIT_ERROR:
    case FAILURE_REASONS.UNKNOWN:
      if (found) {
        return {
          ...failed,
          cause: DIAGNOSIS_CAUSES.EXEC_ERROR,
          recommendInstall: false,
          nextAction: {
            kind: 'inspect',
            text: `A CLI foi encontrada${where}, mas terminou com erro ao responder à verificação. Rode-a num terminal para ver a mensagem dela.`,
          },
        }
      }
      break
    default:
      break
  }

  // Chegou aqui = o app não achou nada executável no PATH que ele enxerga.
  if (managedPresent) {
    return {
      ...failed,
      cause: DIAGNOSIS_CAUSES.PATH,
      recommendInstall: false,
      nextAction: {
        kind: 'fix-path',
        text: 'Existe uma instalação gerenciada pelo app no disco, mas a pasta dela não está no PATH que o app enxerga. Reiniciar o Felixo costuma refazer o PATH; reinstalar não resolve.',
      },
    }
  }

  if (installFailure === DIAGNOSIS_CAUSES.NETWORK) {
    return {
      ...failed,
      cause: DIAGNOSIS_CAUSES.NETWORK,
      recommendInstall: false,
      nextAction: {
        kind: 'check-network',
        text: 'A última instalação falhou por rede. Confira a conexão, o proxy ou o certificado e tente de novo — sem rede, reinstalar falha da mesma forma.',
      },
    }
  }

  if (installFailure === DIAGNOSIS_CAUSES.PERMISSION) {
    return {
      ...failed,
      cause: DIAGNOSIS_CAUSES.PERMISSION,
      recommendInstall: false,
      nextAction: {
        kind: 'fix-permission',
        text: 'A última instalação foi negada por permissão na pasta de destino. Libere a escrita nela (ou verifique o antivírus) antes de tentar de novo.',
      },
    }
  }

  return {
    ...failed,
    cause: DIAGNOSIS_CAUSES.NOT_INSTALLED,
    recommendInstall: true,
    nextAction: {
      kind: 'install',
      text: `Não encontrei ${cli.name} no PATH que o app enxerga${installLabel}. Se o comando funciona no seu terminal, ele pode ser um alias ou estar num PATH que só o terminal carrega — nesse caso o app não o vê, e instalar duplicaria a CLI.`,
    },
  }
}

/**
 * Verifica a instalação de várias CLIs SEM instalar nem alterar configuração.
 *
 * @param {object} options
 * @param {Array<object>} options.catalog - CLIs oficiais.
 * @param {Function} options.detect - `detectCli`.
 * @param {Record<string, string>} options.env
 * @param {import('../core/managed-cli-paths.cjs').ManagedCliLayout} [options.layout]
 * @param {Function} [options.verifyInstallation]
 * @param {Record<string, { ok?: boolean, message?: string }>} [options.attempts] - Estado persistido do instalador.
 * @param {{ platformName?: string, arch?: string, appVersion?: string, homeDir?: string }} [options.context]
 * @param {{ existsSync: (candidate: string) => boolean }} [options.fileSystem]
 */
async function diagnoseClis({
  catalog,
  detect,
  env,
  layout = null,
  verifyInstallation = null,
  attempts = {},
  context = {},
  fileSystem = require('node:fs'),
}) {
  return Promise.all(
    catalog.map(async (cli) => {
      const detection = await detect(cli, env)
      const managedPresent = hasManagedBinary({ layout, cli, fileSystem })
      const managedHealth =
        managedPresent && verifyInstallation
          ? verifyInstallation({
              providerId: cli.id,
              layout,
              platformName: context.platformName,
              arch: context.arch,
              fileSystem,
            })
          : null

      return buildCliDiagnosis({
        cli,
        detection,
        managedPresent,
        managedHealth,
        lastInstall: attempts[cli.id] ?? null,
        context,
      })
    }),
  )
}

/**
 * Texto para colar num pedido de suporte. Só usa campos já minimizados.
 *
 * @param {Array<ReturnType<typeof buildCliDiagnosis>>} diagnoses
 * @returns {string}
 */
function formatDiagnosisForSupport(diagnoses) {
  if (diagnoses.length === 0) return 'Nenhuma CLI diagnosticada.'

  const first = diagnoses[0]
  const lines = [
    `Felixo AI Core ${first.appVersion ?? '(versão desconhecida)'} — ${first.platform}/${first.arch}`,
    '',
  ]

  for (const diagnosis of diagnoses) {
    lines.push(`${diagnosis.name}: ${diagnosis.status === 'ready' ? 'pronta' : 'indisponível'}`)
    if (diagnosis.version) lines.push(`  versão: ${diagnosis.version}`)
    if (diagnosis.chosen) lines.push(`  escolhido: ${diagnosis.chosen}`)
    if (diagnosis.cause) lines.push(`  causa: ${diagnosis.cause}`)
    if (diagnosis.reason) lines.push(`  motivo técnico: ${diagnosis.reason}`)
    for (const candidate of diagnosis.candidates) {
      const resolved = candidate.resolvedPath ? ` -> ${candidate.resolvedPath}` : ''
      const shell = candidate.viaShell ? ' [shell]' : ''
      const reason = candidate.reason ? ` (${candidate.reason})` : ''
      lines.push(`  tentativa: ${candidate.command}${resolved}${shell} = ${candidate.outcome}${reason}`)
    }
    lines.push(`  próxima ação: ${diagnosis.nextAction.text}`)
    lines.push('')
  }

  return lines.join('\n').trimEnd()
}

module.exports = {
  DIAGNOSIS_CAUSES,
  buildCliDiagnosis,
  classifyInstallFailure,
  diagnoseClis,
  formatDiagnosisForSupport,
  hasManagedBinary,
  minimizePaths,
  redactDiagnosticText,
}

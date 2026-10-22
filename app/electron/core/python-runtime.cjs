/**
 * @module python-runtime
 * Acha o Python do sistema que sabe instalar pacotes (`python -m pip`).
 *
 * O catálogo instala o Openia com `py` no Windows e `python3` no resto. Isso
 * falha de jeitos que a mensagem crua não explica: o `py` ausente num Python
 * instalado sem o launcher, o `python.exe` da Microsoft Store que é só um
 * atalho para a loja, um Python antigo demais para o pacote, um Debian sem o
 * pip. Em vez de deixar o instalador esbarrar nisso e devolver "spawn py
 * ENOENT", cada candidato é perguntado antes e o resultado diz o que falta.
 *
 * Sem I/O próprio: quem chama entrega `runCommand` (o mesmo executor curto das
 * instalações), então o módulo testa com respostas gravadas e o app usa o
 * processo real.
 */

const PYTHON_DOWNLOAD_URL = 'https://www.python.org/downloads/'
const PROBE_TIMEOUT_MS = 15_000

/** `py` primeiro no Windows: o launcher escolhe o Python 3 mais novo instalado. */
const CANDIDATES = Object.freeze({
  win32: Object.freeze(['py', 'python', 'python3']),
  default: Object.freeze(['python3', 'python']),
})

const REASONS = Object.freeze({
  NOT_FOUND: 'not-found',
  TOO_OLD: 'too-old',
  NO_PIP: 'no-pip',
})

/** `pip 25.3 from C:\...\pip (python 3.14)` */
const PIP_VERSION_PATTERN = /\(python (\d+)\.(\d+)\)/i
/** `Python 3.14.2` (o Python 2 imprime no stderr). */
const PYTHON_VERSION_PATTERN = /^Python (\d+)\.(\d+)/im

/**
 * @param {string} version - `3.10`
 * @returns {[number, number]}
 */
function parseMajorMinor(version) {
  const [major = 0, minor = 0] = String(version).split('.').map((part) => Number.parseInt(part, 10) || 0)
  return [major, minor]
}

/** @returns {boolean} `candidate` é igual ou mais novo que `minimum`. */
function isAtLeast(candidate, minimum) {
  const [major, minor] = candidate
  const [minMajor, minMinor] = parseMajorMinor(minimum)
  return major > minMajor || (major === minMajor && minor >= minMinor)
}

/**
 * @param {object} options
 * @param {string} options.platformName
 * @param {(options: { command: string, args: string[], env?: Record<string, string>, timeoutMs: number, signal?: AbortSignal }) => Promise<{ ok: boolean, stdout?: string, stderr?: string }>} options.runCommand
 * @param {string} [options.minVersion] - `3.10`: o mínimo que o pacote declara.
 * @param {string} [options.label] - Nome para a mensagem (`Openia`).
 * @param {Record<string, string>} [options.env]
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<
 *   | { ok: true, command: string, version: string }
 *   | { ok: false, reason: 'not-found' | 'too-old' | 'no-pip', message: string, found?: { command: string, version: string } }
 * >}
 */
async function resolvePythonRuntime({
  platformName,
  runCommand,
  minVersion = '3.0',
  label = 'o pacote',
  env,
  signal,
}) {
  const candidates = CANDIDATES[platformName] ?? CANDIDATES.default
  /** O melhor Python achado que não serviu, para a mensagem dizer por quê. */
  let rejected = null

  for (const command of candidates) {
    if (signal?.aborted) break

    const pip = await probe(runCommand, { command, args: ['-m', 'pip', '--version'], env, signal })
    const pipVersion = pip.ok ? PIP_VERSION_PATTERN.exec(`${pip.stdout}\n${pip.stderr}`) : null

    if (pipVersion) {
      const version = [Number(pipVersion[1]), Number(pipVersion[2])]
      if (isAtLeast(version, minVersion)) {
        return { ok: true, command, version: version.join('.') }
      }
      rejected = pickMoreInformative(rejected, { command, version: version.join('.'), reason: REASONS.TOO_OLD })
      continue
    }

    // O pip não respondeu: o Python existe sem ele, ou nem existe.
    const python = await probe(runCommand, { command, args: ['--version'], env, signal })
    const pythonVersion = python.ok ? PYTHON_VERSION_PATTERN.exec(`${python.stdout}\n${python.stderr}`) : null
    if (!pythonVersion) continue

    const version = [Number(pythonVersion[1]), Number(pythonVersion[2])]
    rejected = pickMoreInformative(rejected, {
      command,
      version: version.join('.'),
      reason: isAtLeast(version, minVersion) ? REASONS.NO_PIP : REASONS.TOO_OLD,
    })
  }

  return describeFailure(rejected, { minVersion, label, platformName })
}

async function probe(runCommand, { command, args, env, signal }) {
  try {
    const result = await runCommand({ command, args, env, signal, timeoutMs: PROBE_TIMEOUT_MS })
    return { ok: result?.ok === true, stdout: result?.stdout ?? '', stderr: result?.stderr ?? '' }
  } catch {
    return { ok: false, stdout: '', stderr: '' }
  }
}

/**
 * Entre dois Pythons recusados, o que a mensagem deve citar. Um Python novo
 * sem pip explica mais do que um velho: basta instalar o pip. Entre motivos
 * iguais, vale o mais novo.
 */
function pickMoreInformative(current, next) {
  if (!current) return next
  if (current.reason !== next.reason) return next.reason === REASONS.NO_PIP ? next : current
  return isAtLeast(parseMajorMinor(next.version), current.version) ? next : current
}

function describeFailure(rejected, { minVersion, label, platformName }) {
  if (!rejected) {
    const launcher = platformName === 'win32' ? ' (deixe marcada a opção do launcher "py")' : ''
    return {
      ok: false,
      reason: REASONS.NOT_FOUND,
      message: `O Python ${minVersion} ou mais novo não foi encontrado neste computador, e ${label} precisa dele. Instale em ${PYTHON_DOWNLOAD_URL}${launcher} e tente de novo.`,
    }
  }

  const found = { command: rejected.command, version: rejected.version }
  if (rejected.reason === REASONS.NO_PIP) {
    return {
      ok: false,
      reason: REASONS.NO_PIP,
      found,
      message: `O Python ${rejected.version} está instalado, mas sem o pip. No Debian e no Ubuntu, instale com "sudo apt install python3-pip"; no Windows e no macOS, reinstale o Python pelo instalador oficial em ${PYTHON_DOWNLOAD_URL}.`,
    }
  }

  return {
    ok: false,
    reason: REASONS.TOO_OLD,
    found,
    message: `O Python mais novo encontrado é o ${rejected.version}, mas ${label} precisa do ${minVersion} ou mais novo. Instale uma versão atual em ${PYTHON_DOWNLOAD_URL} e tente de novo.`,
  }
}

module.exports = {
  CANDIDATES,
  PYTHON_DOWNLOAD_URL,
  REASONS,
  resolvePythonRuntime,
}

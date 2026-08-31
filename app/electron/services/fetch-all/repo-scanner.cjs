/**
 * @module fetch-all/repo-scanner
 * Varredura dos discos locais em busca de diretórios de trabalho git.
 *
 * Um repositório é qualquer pasta que contenha `.git` (diretório ou arquivo,
 * para cobrir worktrees e submódulos). A varredura não desce dentro de `.git`,
 * nas pastas excluídas por nome, nos caminhos ignorados pela pessoa nem em
 * montagens virtuais/de rede — enumerar essas últimas custa I/O de rede e
 * nunca devolve um projeto local.
 *
 * Portabilidade: no Windows os discos vêm das letras de unidade; no Linux e no
 * macOS a varredura parte de `/` mais cada disco montado, lidos de
 * `/proc/mounts` ou da saída do comando `mount`.
 */

const fs = require('node:fs')
const fsp = require('node:fs/promises')
const path = require('node:path')
const { setTimeout: delay } = require('node:timers/promises')
const { execFile } = require('node:child_process')
const { promisify } = require('node:util')

const execFileAsync = promisify(execFile)

/** Diretórios que nunca guardam repositórios da pessoa ou custam caro varrer. */
const DEFAULT_EXCLUDE_DIRS = [
  // Caches de assistentes de IA e bibliotecas de jogos criam repositórios
  // internos que só entrariam no relatório como ruído.
  '.gemini',
  '.codex',
  '.claude',
  'SteamLibrary',
  'steamapps',
  'node_modules',
  '.venv',
  'venv',
  '__pycache__',
  // Windows: lixeira e pastas de sistema/programas.
  '$RECYCLE.BIN',
  'System Volume Information',
  'Windows',
  'Program Files',
  'Program Files (x86)',
  'ProgramData',
  'AppData',
  // Linux/macOS: lixeiras, caches e pastas de sistema.
  'lost+found',
  '.cache',
  'snap',
  '.Trash',
  '.Trashes',
]

/** Sistemas de arquivos virtuais, em memória ou de rede: nunca são varridos. */
const SKIP_FILESYSTEM_TYPES = new Set([
  'proc',
  'procfs',
  'sysfs',
  'devtmpfs',
  'devpts',
  'devfs',
  'tmpfs',
  'ramfs',
  'squashfs',
  'overlay',
  'autofs',
  'mqueue',
  'hugetlbfs',
  'debugfs',
  'tracefs',
  'securityfs',
  'pstore',
  'efivarfs',
  'bpf',
  'binfmt_misc',
  'configfs',
  'fusectl',
  'rpc_pipefs',
  'selinuxfs',
  'cifs',
  'smbfs',
  'smb3',
  'afs',
  '9p',
  'v9fs',
  'map',
])

// Famílias inteiras a pular. `fuse.` cobre sshfs/gvfs, mas não `fuseblk`
// (ntfs-3g), que é disco local de verdade.
const SKIP_FILESYSTEM_PREFIXES = ['nfs', 'cgroup', 'fuse.']

/** Mínimo seguro para quando a lista de montagens não puder ser lida. */
const FALLBACK_SKIP_PATHS = ['/proc', '/sys', '/dev', '/run']

// macOS: tudo o que interessa já aparece a partir de `/` pelos firmlinks.
// Descer em /System/Volumes varreria o volume de dados uma segunda vez.
const DARWIN_SKIP_PATHS = ['/System/Volumes']

const MOUNT_COMMAND_TIMEOUT_MS = 10_000

/** Espera curta de um worker ocioso enquanto outro ainda pode empilhar pastas. */
const IDLE_WORKER_RETRY_MS = 5

/**
 * Escolhe a semântica de caminhos da plataforma simulada pelos testes.
 *
 * No processo real `path` já corresponde ao sistema operacional atual. Usar
 * `path.win32` quando a plataforma é injetada como Windows permite testar
 * letras de unidade e comparação case-insensitive em qualquer runner.
 *
 * @param {string} platform
 * @param {object} [pathModule]
 * @returns {object}
 */
function pathForPlatform(platform = process.platform, pathModule) {
  return pathModule ?? (platform === 'win32' ? path.win32 : path.posix)
}

/** @returns {Promise<void>} */
function scheduleRetry() {
  return delay(IDLE_WORKER_RETRY_MS)
}

/**
 * Indica se um tipo de sistema de arquivos é virtual ou de rede.
 *
 * @param {string} filesystemType
 * @returns {boolean}
 */
function isSkippedFilesystemType(filesystemType) {
  const normalized = String(filesystemType ?? '').toLowerCase()

  return (
    SKIP_FILESYSTEM_TYPES.has(normalized) ||
    SKIP_FILESYSTEM_PREFIXES.some((prefix) => normalized.startsWith(prefix))
  )
}

/**
 * Extrai `[pontoDeMontagem, tipo]` de linhas do `/proc/mounts`.
 *
 * Formato: `origem ponto tipo opções …`; espaços e tabs no caminho vêm como
 * escapes octais.
 *
 * @param {string[]} lines
 * @returns {Array<{ mountPoint: string, filesystemType: string }>}
 */
function parseLinuxMounts(lines) {
  const mounts = []

  for (const line of lines) {
    const parts = String(line).split(/\s+/).filter(Boolean)

    if (parts.length < 3) continue

    mounts.push({
      mountPoint: parts[1].replaceAll('\\040', ' ').replaceAll('\\011', '\t'),
      filesystemType: parts[2],
    })
  }

  return mounts
}

/**
 * Extrai `[pontoDeMontagem, tipo]` da saída do comando `mount` (macOS/BSD).
 *
 * Formato: `origem on /ponto (tipo, opções…)`.
 *
 * @param {string[]} lines
 * @returns {Array<{ mountPoint: string, filesystemType: string }>}
 */
function parseBsdMounts(lines) {
  const mounts = []

  for (const line of lines) {
    const text = String(line)

    if (!text.includes(' on ') || !text.includes('(')) continue

    const rest = text.slice(text.indexOf(' on ') + 4)
    const separator = rest.lastIndexOf(' (')

    if (separator <= 0) continue

    const mountPoint = rest.slice(0, separator)
    const info = rest.slice(separator + 2)

    mounts.push({
      mountPoint,
      filesystemType: info.split(',')[0].trim().replace(/\)$/, ''),
    })
  }

  return mounts
}

/**
 * Lista todas as montagens do sistema; devolve vazio quando ilegível.
 *
 * @param {object} [options]
 * @param {string} [options.platform]
 * @param {object} [options.fsModule]
 * @param {object} [options.fsPromises]
 * @param {Function} [options.execFileAsync]
 * @returns {Promise<Array<{ mountPoint: string, filesystemType: string }>>}
 */
async function listMounts({
  platform = process.platform,
  fsModule = fs,
  fsPromises = fsp,
  execFileAsync: runCommand = execFileAsync,
  procMountsPath = '/proc/mounts',
  mountCommandTimeoutMs = MOUNT_COMMAND_TIMEOUT_MS,
} = {}) {
  if (platform === 'win32') return []

  try {
    if (fsModule.existsSync(procMountsPath)) {
      const content = await fsPromises.readFile(procMountsPath, 'utf8')
      return parseLinuxMounts(content.split(/\r?\n/))
    }

    const { stdout } = await runCommand('mount', [], {
      timeout: mountCommandTimeoutMs,
    })

    return parseBsdMounts(stdout.split(/\r?\n/))
  } catch {
    return []
  }
}

/**
 * Pastas `Library/CloudStorage` de cada usuário do macOS.
 *
 * Drives de nuvem montados ali buscam metadados na rede a cada listagem —
 * enumerar pode levar horas. A poda é por caminho exato para não excluir, em
 * outro sistema, uma pasta de projeto que por acaso se chame "CloudStorage".
 *
 * @param {string} [usersRoot]
 * @param {object} [options]
 * @param {object} [options.fsModule]
 * @param {object} [options.pathModule]
 * @returns {string[]}
 */
function darwinCloudStoragePaths(usersRoot = '/Users', {
  fsModule = fs,
  pathModule,
} = {}) {
  try {
    const pathApi = pathForPlatform('darwin', pathModule)

    return fsModule
      .readdirSync(usersRoot)
      .map((entry) => pathApi.join(usersRoot, entry, 'Library', 'CloudStorage'))
      .filter((candidate) => fsModule.existsSync(candidate))
  } catch {
    return []
  }
}

/**
 * Pontos de montagem virtuais/de rede que a varredura deve pular.
 *
 * No Windows devolve vazio: a seleção de discos já filtra por tipo de unidade.
 *
 * @param {Array<{ mountPoint: string, filesystemType: string }>} [mounts]
 * @param {object} [options]
 * @param {string} [options.platform]
 * @param {Function} [options.listMountsFn]
 * @param {Function} [options.darwinCloudStoragePathsFn]
 * @returns {Promise<string[]>}
 */
async function mountSkipPaths(mounts, {
  platform = process.platform,
  listMountsFn = listMounts,
  listMountsOptions,
  darwinCloudStoragePathsFn = darwinCloudStoragePaths,
  darwinUsersRoot = '/Users',
  darwinCloudStorageOptions,
} = {}) {
  if (platform === 'win32') return []

  const resolvedMounts =
    mounts ??
    (await listMountsFn({
      ...listMountsOptions,
      platform,
    }))
  const skips = resolvedMounts.length
    ? resolvedMounts
        .filter((mount) => isSkippedFilesystemType(mount.filesystemType))
        .map((mount) => mount.mountPoint)
    : [...FALLBACK_SKIP_PATHS]

  if (platform === 'darwin') {
    skips.push(
      ...DARWIN_SKIP_PATHS,
      ...(await darwinCloudStoragePathsFn(
        darwinUsersRoot,
        darwinCloudStorageOptions,
      )),
    )
  }

  return [...new Set(skips)]
}

/**
 * Raízes de varredura no POSIX: `/` mais cada disco/partição local.
 *
 * Ficam de fora montagens virtuais/de rede, `/boot` (nunca tem repositório da
 * pessoa) e, no macOS, tudo sob `/System` — o volume de dados já é alcançado a
 * partir de `/` pelos firmlinks, e listá-lo de novo duplicaria a varredura.
 *
 * @param {Array<{ mountPoint: string, filesystemType: string }>} mounts
 * @param {object} [options]
 * @param {string} [options.platform]
 * @returns {string[]}
 */
function localMountPoints(mounts, { platform = process.platform } = {}) {
  const isDarwin = platform === 'darwin'
  const points = mounts
    .filter(
      (mount) =>
        !isSkippedFilesystemType(mount.filesystemType) &&
        mount.mountPoint !== '/' &&
        mount.mountPoint !== '/boot' &&
        !mount.mountPoint.startsWith('/boot/') &&
        !(isDarwin && mount.mountPoint.startsWith('/System/')),
    )
    .map((mount) => mount.mountPoint)

  return ['/', ...[...new Set(points)].sort()]
}

/**
 * Raízes de todos os discos locais (fixos e removíveis).
 *
 * @param {object} [options]
 * @param {string} [options.platform]
 * @param {object} [options.fsModule]
 * @param {Function} [options.listMountsFn]
 * @returns {Promise<string[]>}
 */
async function listLocalDrives({
  platform = process.platform,
  fsModule = fs,
  listMountsFn = listMounts,
  listMountsOptions,
} = {}) {
  if (platform !== 'win32') {
    return localMountPoints(
      await listMountsFn({
        ...listMountsOptions,
        platform,
      }),
      { platform },
    )
  }

  // Sem API do Windows disponível no processo principal do Electron sem
  // dependência nativa: testa cada letra de unidade, que é barato e cobre
  // fixas e removíveis. Unidades de rede não respondem como diretório local.
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

  return letters
    .map((letter) => `${letter}:\\`)
    .filter((drive) => {
      try {
        return fsModule.statSync(drive).isDirectory()
      } catch {
        return false
      }
    })
}

/**
 * Caminhos a varrer: os configurados ou, se não houver nenhum, todos os discos.
 *
 * @param {string[]} configuredRoots
 * @param {object} [options]
 * @param {Function} [options.listLocalDrivesFn]
 * @returns {Promise<string[]>}
 */
async function resolveScanRoots(configuredRoots, {
  listLocalDrivesFn = listLocalDrives,
  listLocalDrivesOptions,
} = {}) {
  const roots = (configuredRoots ?? []).filter(
    (root) => typeof root === 'string' && root.trim(),
  )

  return roots.length
    ? roots.map((root) => root.trim())
    : listLocalDrivesFn(listLocalDrivesOptions)
}

/**
 * Normaliza um caminho para comparação de prefixo entre pastas.
 *
 * @param {string} value
 * @param {object} [options]
 * @param {string} [options.platform]
 * @param {object} [options.pathModule]
 * @returns {string}
 */
function normalizeComparablePath(value, {
  platform = process.platform,
  pathModule,
} = {}) {
  const pathApi = pathForPlatform(platform, pathModule)
  const resolved = pathApi.resolve(String(value ?? ''))
  const trimmed =
    resolved.length > 1 ? resolved.replace(/[\\/]+$/, '') : resolved

  return platform === 'win32' ? trimmed.toLowerCase() : trimmed
}

/**
 * Indica se `candidate` é o próprio `ancestor` ou está dentro dele.
 *
 * @param {string} candidate
 * @param {string} ancestor
 * @param {object} [options]
 * @param {string} [options.platform]
 * @param {object} [options.pathModule]
 * @returns {boolean}
 */
function isInsidePath(candidate, ancestor, options = {}) {
  const pathApi = pathForPlatform(options.platform, options.pathModule)
  const normalizedCandidate = normalizeComparablePath(candidate, options)
  const normalizedAncestor = normalizeComparablePath(ancestor, options)

  if (normalizedCandidate === normalizedAncestor) return true

  const prefix = normalizedAncestor.endsWith(pathApi.sep)
    ? normalizedAncestor
    : `${normalizedAncestor}${pathApi.sep}`

  return normalizedCandidate.startsWith(prefix)
}

/**
 * Filtra repositórios que caem dentro de algum caminho ignorado.
 *
 * Aplicado também aos repositórios vindos do cache: ignorar uma pasta precisa
 * valer na hora, sem exigir uma varredura completa nova.
 *
 * @param {string[]} repoPaths
 * @param {string[]} ignoredPaths
 * @param {object} [options]
 * @param {string} [options.platform]
 * @param {object} [options.pathModule]
 * @returns {string[]}
 */
function filterIgnoredRepos(repoPaths, ignoredPaths, options = {}) {
  if (!ignoredPaths?.length) return [...repoPaths]

  return repoPaths.filter(
    (repoPath) =>
      !ignoredPaths.some((ignored) => isInsidePath(repoPath, ignored, options)),
  )
}

/**
 * Varre os caminhos dados e devolve cada diretório de trabalho git encontrado.
 *
 * A varredura é limitada por I/O de disco, então roda várias listagens de
 * diretório ao mesmo tempo a partir de uma pilha compartilhada — as raízes
 * avançam em paralelo sem precisar de uma thread por disco.
 *
 * @param {object} options
 * @param {string[]} options.roots - Raízes já resolvidas.
 * @param {string[]} [options.excludeDirs] - Nomes de pasta podados (sem diferenciar maiúsculas).
 * @param {string[]} [options.ignoredPaths] - Caminhos absolutos que a pessoa mandou ignorar.
 * @param {string[]} [options.skipPaths] - Montagens virtuais/de rede; detectadas quando omitido.
 * @param {string} [options.platform] - Plataforma usada pela varredura e pelos testes.
 * @param {object} [options.pathModule] - Implementação de caminhos para fixtures.
 * @param {object} [options.fsModule] - IO síncrono injetável para testes.
 * @param {object} [options.fsPromises] - IO assíncrono injetável para testes.
 * @param {Function} [options.mountSkipPathsFn] - Resolver de montagens ignoradas.
 * @param {number} [options.concurrency] - Listagens simultâneas de diretório.
 * @param {AbortSignal} [options.signal] - Cancela a varredura em andamento.
 * @param {(progress: { scannedDirs: number, foundRepos: number, currentPath: string }) => void} [options.onProgress]
 * @returns {Promise<string[]>} Caminhos dos repositórios, sem repetição.
 */
async function findGitRepos({
  roots,
  excludeDirs = DEFAULT_EXCLUDE_DIRS,
  ignoredPaths = [],
  skipPaths,
  platform = process.platform,
  pathModule,
  fsModule = fs,
  fsPromises = fsp,
  mountSkipPathsFn = mountSkipPaths,
  mountSkipPathsOptions,
  concurrency = 16,
  signal,
  onProgress,
}) {
  const pathApi = pathForPlatform(platform, pathModule)
  const pathOptions = { platform, pathModule: pathApi }
  const excludes = new Set(excludeDirs.map((name) => name.toLowerCase()))
  const resolvedSkips =
    skipPaths ??
    (await mountSkipPathsFn(undefined, {
      ...mountSkipPathsOptions,
      platform,
    }))
  const blockedPaths = new Set(
    [...resolvedSkips, ...ignoredPaths].map((value) =>
      normalizeComparablePath(value, pathOptions),
    ),
  )

  // Raízes aninhadas em outra raiz são descartadas: `/` já cobre `/home`, e
  // varrer as duas geraria trabalho repetido.
  const uniqueRoots = []
  for (const root of roots.map((value) => pathApi.resolve(value))) {
    if (!fsModule.existsSync(root)) continue
    if (uniqueRoots.some((existing) => isInsidePath(root, existing, pathOptions))) {
      continue
    }
    for (let index = uniqueRoots.length - 1; index >= 0; index -= 1) {
      if (isInsidePath(uniqueRoots[index], root, pathOptions)) {
        uniqueRoots.splice(index, 1)
      }
    }
    uniqueRoots.push(root)
  }

  const pending = [...uniqueRoots]
  const found = new Set()
  let scannedDirs = 0
  let activeVisits = 0

  const isBlocked = (dirPath) =>
    blockedPaths.has(normalizeComparablePath(dirPath, pathOptions))

  async function visit(dirPath) {
    let entries

    try {
      entries = await fsPromises.readdir(dirPath, { withFileTypes: true })
    } catch {
      return // pasta sem permissão ou removida durante a varredura
    }

    scannedDirs += 1

    if (entries.some((entry) => entry.name === '.git')) {
      found.add(dirPath)
    }

    onProgress?.({ scannedDirs, foundRepos: found.size, currentPath: dirPath })

    for (const entry of entries) {
      // `isDirectory()` é falso para links simbólicos, o que evita ciclos e
      // impede que um link para outro disco duplique a varredura.
      if (!entry.isDirectory()) continue
      if (entry.name === '.git') continue
      if (excludes.has(entry.name.toLowerCase())) continue

      const childPath = pathApi.join(dirPath, entry.name)

      if (isBlocked(childPath)) continue

      pending.push(childPath)
    }
  }

  async function worker() {
    for (;;) {
      if (signal?.aborted) return

      const dirPath = pending.pop()

      if (dirPath === undefined) {
        // A pilha vazia só significa fim quando ninguém mais está listando:
        // uma listagem em andamento ainda pode empilhar subpastas.
        if (activeVisits === 0) return
        await scheduleRetry()
        continue
      }

      activeVisits += 1

      try {
        await visit(dirPath)
      } finally {
        activeVisits -= 1
      }
    }
  }

  const workerCount = Math.max(1, Math.min(Number(concurrency) || 1, 64))
  await Promise.all(Array.from({ length: workerCount }, () => worker()))

  return [...found].sort((left, right) =>
    left.toLowerCase().localeCompare(right.toLowerCase()),
  )
}

module.exports = {
  DEFAULT_EXCLUDE_DIRS,
  darwinCloudStoragePaths,
  filterIgnoredRepos,
  findGitRepos,
  isInsidePath,
  isSkippedFilesystemType,
  listLocalDrives,
  listMounts,
  localMountPoints,
  mountSkipPaths,
  normalizeComparablePath,
  parseBsdMounts,
  parseLinuxMounts,
  resolveScanRoots,
}

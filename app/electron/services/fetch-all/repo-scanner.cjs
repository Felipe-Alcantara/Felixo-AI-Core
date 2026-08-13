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
 * @returns {Promise<Array<{ mountPoint: string, filesystemType: string }>>}
 */
async function listMounts() {
  if (process.platform === 'win32') return []

  try {
    const procMounts = '/proc/mounts'

    if (fs.existsSync(procMounts)) {
      const content = await fsp.readFile(procMounts, 'utf8')
      return parseLinuxMounts(content.split(/\r?\n/))
    }

    const { stdout } = await execFileAsync('mount', [], {
      timeout: MOUNT_COMMAND_TIMEOUT_MS,
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
 * @returns {string[]}
 */
function darwinCloudStoragePaths(usersRoot = '/Users') {
  try {
    return fs
      .readdirSync(usersRoot)
      .map((entry) => path.join(usersRoot, entry, 'Library', 'CloudStorage'))
      .filter((candidate) => fs.existsSync(candidate))
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
 * @returns {Promise<string[]>}
 */
async function mountSkipPaths(mounts) {
  if (process.platform === 'win32') return []

  const resolvedMounts = mounts ?? (await listMounts())
  const skips = resolvedMounts.length
    ? resolvedMounts
        .filter((mount) => isSkippedFilesystemType(mount.filesystemType))
        .map((mount) => mount.mountPoint)
    : [...FALLBACK_SKIP_PATHS]

  if (process.platform === 'darwin') {
    skips.push(...DARWIN_SKIP_PATHS, ...darwinCloudStoragePaths())
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
 * @returns {string[]}
 */
function localMountPoints(mounts) {
  const isDarwin = process.platform === 'darwin'
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
 * @returns {Promise<string[]>}
 */
async function listLocalDrives() {
  if (process.platform !== 'win32') {
    return localMountPoints(await listMounts())
  }

  // Sem API do Windows disponível no processo principal do Electron sem
  // dependência nativa: testa cada letra de unidade, que é barato e cobre
  // fixas e removíveis. Unidades de rede não respondem como diretório local.
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

  return letters
    .map((letter) => `${letter}:\\`)
    .filter((drive) => {
      try {
        return fs.statSync(drive).isDirectory()
      } catch {
        return false
      }
    })
}

/**
 * Caminhos a varrer: os configurados ou, se não houver nenhum, todos os discos.
 *
 * @param {string[]} configuredRoots
 * @returns {Promise<string[]>}
 */
async function resolveScanRoots(configuredRoots) {
  const roots = (configuredRoots ?? []).filter(
    (root) => typeof root === 'string' && root.trim(),
  )

  return roots.length ? roots.map((root) => root.trim()) : listLocalDrives()
}

/**
 * Normaliza um caminho para comparação de prefixo entre pastas.
 *
 * @param {string} value
 * @returns {string}
 */
function normalizeComparablePath(value) {
  const resolved = path.resolve(String(value ?? ''))
  const trimmed =
    resolved.length > 1 ? resolved.replace(/[\\/]+$/, '') : resolved

  return process.platform === 'win32' ? trimmed.toLowerCase() : trimmed
}

/**
 * Indica se `candidate` é o próprio `ancestor` ou está dentro dele.
 *
 * @param {string} candidate
 * @param {string} ancestor
 * @returns {boolean}
 */
function isInsidePath(candidate, ancestor) {
  const normalizedCandidate = normalizeComparablePath(candidate)
  const normalizedAncestor = normalizeComparablePath(ancestor)

  if (normalizedCandidate === normalizedAncestor) return true

  const prefix = normalizedAncestor.endsWith(path.sep)
    ? normalizedAncestor
    : `${normalizedAncestor}${path.sep}`

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
 * @returns {string[]}
 */
function filterIgnoredRepos(repoPaths, ignoredPaths) {
  if (!ignoredPaths?.length) return [...repoPaths]

  return repoPaths.filter(
    (repoPath) => !ignoredPaths.some((ignored) => isInsidePath(repoPath, ignored)),
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
  concurrency = 16,
  signal,
  onProgress,
}) {
  const excludes = new Set(excludeDirs.map((name) => name.toLowerCase()))
  const resolvedSkips = skipPaths ?? (await mountSkipPaths())
  const blockedPaths = new Set(
    [...resolvedSkips, ...ignoredPaths].map(normalizeComparablePath),
  )

  // Raízes aninhadas em outra raiz são descartadas: `/` já cobre `/home`, e
  // varrer as duas geraria trabalho repetido.
  const uniqueRoots = []
  for (const root of roots.map((value) => path.resolve(value))) {
    if (!fs.existsSync(root)) continue
    if (uniqueRoots.some((existing) => isInsidePath(root, existing))) continue
    for (let index = uniqueRoots.length - 1; index >= 0; index -= 1) {
      if (isInsidePath(uniqueRoots[index], root)) uniqueRoots.splice(index, 1)
    }
    uniqueRoots.push(root)
  }

  const pending = [...uniqueRoots]
  const found = new Set()
  let scannedDirs = 0
  let activeVisits = 0

  const isBlocked = (dirPath) => blockedPaths.has(normalizeComparablePath(dirPath))

  async function visit(dirPath) {
    let entries

    try {
      entries = await fsp.readdir(dirPath, { withFileTypes: true })
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

      const childPath = path.join(dirPath, entry.name)

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

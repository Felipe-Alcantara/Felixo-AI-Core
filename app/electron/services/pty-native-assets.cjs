/**
 * Helpers for native files shipped with node-pty.
 *
 * node-pty's macOS implementation starts a small `spawn-helper` executable
 * with posix_spawnp. The npm tarball currently carries that file as 0644,
 * which is readable but not executable. A packaged app must fix the mode
 * during afterPack; the runtime check keeps `npm run dev` usable as well.
 */

const fs = require('node:fs')
const path = require('node:path')

const POSIX_PLATFORMS = new Set(['darwin', 'linux'])

/**
 * Make one native helper executable without changing its read/write policy.
 *
 * @param {string} filePath
 * @param {{ statSync?: Function, chmodSync?: Function }} [fileSystem]
 * @returns {{ ok: boolean, found: boolean, changed: boolean, reason?: string }}
 */
function ensureSpawnHelperExecutable(filePath, fileSystem = fs) {
  try {
    const stat = fileSystem.statSync(filePath)

    if (!stat.isFile()) {
      return { ok: false, found: false, changed: false, reason: 'not-a-file' }
    }

    const mode = stat.mode & 0o777
    if ((mode & 0o111) !== 0) {
      return { ok: true, found: true, changed: false }
    }

    fileSystem.chmodSync(filePath, mode | 0o111)
    return { ok: true, found: true, changed: true }
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return { ok: true, found: false, changed: false, reason: 'not-found' }
    }

    return {
      ok: false,
      found: true,
      changed: false,
      reason: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * The package root is one directory above node-pty's `lib/index.js`.
 *
 * @param {() => string} resolveNodePty
 * @returns {string}
 */
function resolveNodePtyPackageRoot(resolveNodePty = () => require.resolve('node-pty')) {
  return path.resolve(path.dirname(resolveNodePty()), '..')
}

/**
 * Return both the normal package path and its unpacked equivalent. The latter
 * is the only executable path that works after electron-builder puts the
 * native dependency outside `app.asar`.
 *
 * @param {string} packageRoot
 * @returns {string[]}
 */
function getPackageRoots(packageRoot) {
  const unpacked = packageRoot.replace(/\.asar(?=\/|$)/, '.asar.unpacked')

  // Electron's asar filesystem can report/stat the virtual copy, but it
  // cannot make that copy executable. Prefer the real unpacked path so the
  // runtime check never attempts chmod on app.asar first.
  const roots = unpacked === packageRoot
    ? [packageRoot]
    : [unpacked, packageRoot]

  return [...new Set(roots)]
}

/**
 * @param {object} [options]
 * @param {string} [options.platformName]
 * @param {string} [options.arch]
 * @param {string} [options.packageRoot]
 * @returns {string[]}
 */
function getNodePtySpawnHelperCandidates({
  platformName = process.platform,
  arch = process.arch,
  packageRoot,
} = {}) {
  if (!POSIX_PLATFORMS.has(platformName) || !packageRoot) {
    return []
  }

  return getPackageRoots(packageRoot).flatMap((root) => [
    path.join(root, 'prebuilds', `${platformName}-${arch}`, 'spawn-helper'),
    path.join(root, 'build', 'Release', 'spawn-helper'),
    path.join(root, 'build', 'Debug', 'spawn-helper'),
  ]).filter((candidate, index, candidates) => candidates.indexOf(candidate) === index)
}

/**
 * Check/fix the helper used by the current node-pty installation.
 *
 * @param {object} [options]
 * @param {string} [options.platformName]
 * @param {string} [options.arch]
 * @param {() => string} [options.resolveNodePty]
 * @param {{ statSync?: Function, chmodSync?: Function }} [options.fileSystem]
 * @returns {{ ok: boolean, found: boolean, changed: boolean, reason?: string }}
 */
function ensureNodePtySpawnHelperExecutable({
  platformName = process.platform,
  arch = process.arch,
  resolveNodePty = () => require.resolve('node-pty'),
  fileSystem = fs,
} = {}) {
  if (!POSIX_PLATFORMS.has(platformName)) {
    return { ok: true, found: false, changed: false, reason: 'not-needed' }
  }

  let packageRoot
  try {
    packageRoot = resolveNodePtyPackageRoot(resolveNodePty)
  } catch (error) {
    return {
      ok: false,
      found: false,
      changed: false,
      reason: error instanceof Error ? error.message : String(error),
    }
  }

  const candidates = getNodePtySpawnHelperCandidates({ platformName, arch, packageRoot })
  let sawHelper = false

  for (const candidate of candidates) {
    const result = ensureSpawnHelperExecutable(candidate, fileSystem)

    if (!result.found) {
      continue
    }

    sawHelper = true
    if (!result.ok) {
      return result
    }

    return result
  }

  return {
    ok: true,
    found: sawHelper,
    changed: false,
    reason: 'not-found',
  }
}

module.exports = {
  ensureNodePtySpawnHelperExecutable,
  ensureSpawnHelperExecutable,
  getNodePtySpawnHelperCandidates,
  resolveNodePtyPackageRoot,
}

#!/usr/bin/env node

/**
 * electron-builder afterPack hook.
 *
 * The macOS node-pty prebuild contains a real executable named spawn-helper.
 * Keep it outside app.asar (configured in package.json) and restore its
 * executable mode after electron-builder copies the npm package into the
 * unpacked application tree.
 */

const fs = require('node:fs')
const path = require('node:path')
const {
  ensureSpawnHelperExecutable,
} = require('../electron/services/pty-native-assets.cjs')

const POSIX_PLATFORMS = new Set(['darwin', 'linux'])

function resolveResourcesDir(context) {
  if (typeof context.packager?.getResourcesDir === 'function') {
    return context.packager.getResourcesDir(context.appOutDir)
  }

  const appBundle = path.join(context.appOutDir, 'Felixo AI Core.app', 'Contents', 'Resources')
  if (context.electronPlatformName === 'darwin') {
    return appBundle
  }

  return path.join(context.appOutDir, 'resources')
}

function findSpawnHelpers(resourcesDir, fileSystem = fs) {
  const packageRoot = path.join(resourcesDir, 'app.asar.unpacked', 'node_modules', 'node-pty')
  const candidates = [
    path.join(packageRoot, 'build', 'Release', 'spawn-helper'),
    path.join(packageRoot, 'build', 'Debug', 'spawn-helper'),
  ]
  const prebuildsDir = path.join(packageRoot, 'prebuilds')

  try {
    for (const directory of fileSystem.readdirSync(prebuildsDir, { withFileTypes: true })) {
      if (!directory.isDirectory()) continue
      candidates.push(path.join(prebuildsDir, directory.name, 'spawn-helper'))
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }

  return [...new Set(candidates)]
}

/**
 * @param {object} context electron-builder AfterPackContext
 * @param {{ fileSystem?: object, logger?: object }} [dependencies]
 * @returns {{ platform: string, found: number, changed: number }}
 */
function fixNativePtyPermissions(context, { fileSystem = fs, logger = console } = {}) {
  const platformName = context.electronPlatformName

  if (!POSIX_PLATFORMS.has(platformName)) {
    return { platform: platformName, found: 0, changed: 0 }
  }

  const resourcesDir = resolveResourcesDir(context)
  const helpers = findSpawnHelpers(resourcesDir, fileSystem)
  let found = 0
  let changed = 0

  for (const helper of helpers) {
    const result = ensureSpawnHelperExecutable(helper, fileSystem)

    if (!result.found) continue
    found += 1

    if (!result.ok) {
      throw new Error(`Não foi possível preparar o spawn-helper do node-pty: ${result.reason}`)
    }

    if (result.changed) {
      changed += 1
    }
  }

  // macOS always needs this helper. Failing the build here is safer than
  // publishing an installer whose every terminal opens with pty_spawn_failed.
  if (platformName === 'darwin' && found === 0) {
    throw new Error(
      'O pacote macOS não contém node-pty/prebuilds/*/spawn-helper; não é seguro publicar o instalador.',
    )
  }

  if (changed > 0) {
    logger.log?.(`[felixo] Permissão executável corrigida em ${changed} spawn-helper(s) do node-pty.`)
  }

  return { platform: platformName, found, changed }
}

module.exports = fixNativePtyPermissions
module.exports.fixNativePtyPermissions = fixNativePtyPermissions
module.exports.findSpawnHelpers = findSpawnHelpers
module.exports.resolveResourcesDir = resolveResourcesDir

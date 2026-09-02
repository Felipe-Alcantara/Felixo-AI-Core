'use strict'

/**
 * Gera um inventário do conteúdo que o electron-builder colocou no diretório
 * de release. O package-lock descreve dependências resolvidas, mas não prova
 * o que chegou ao instalador: o npm-runtime é copiado para fora do app.asar e
 * os módulos nativos podem ser desempacotados. Este relatório cobre essas duas
 * fronteiras sem incluir caminhos absolutos.
 */

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const asar = require('@electron/asar')

const APP_ROOT = path.resolve(__dirname, '..')
const DEFAULT_RELEASE_DIR = path.join(APP_ROOT, 'release')
const DEFAULT_OUTPUT = path.join(APP_ROOT, 'build', 'dependency-policy', 'package-inventory.json')
const MAX_DISCOVERY_DEPTH = 8

function parseArgs(argv = []) {
  const options = {
    help: false,
    releaseDir: DEFAULT_RELEASE_DIR,
    out: DEFAULT_OUTPUT,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]

    if (argument === '--help') {
      options.help = true
      continue
    }

    if (argument === '--release-dir' || argument === '--out') {
      const value = argv[index + 1]
      if (!value || value.startsWith('--')) {
        throw new Error(`${argument} precisa receber um caminho.`)
      }
      options[argument === '--release-dir' ? 'releaseDir' : 'out'] = path.resolve(value)
      index += 1
      continue
    }

    if (argument.startsWith('--release-dir=')) {
      options.releaseDir = resolveRequiredPath(argument.slice('--release-dir='.length), '--release-dir')
      continue
    }

    if (argument.startsWith('--out=')) {
      options.out = resolveRequiredPath(argument.slice('--out='.length), '--out')
      continue
    }

    throw new Error(`Argumento desconhecido: ${argument}`)
  }

  return options
}

function resolveRequiredPath(value, optionName) {
  const normalized = value.trim()
  if (!normalized) throw new Error(`${optionName} precisa apontar para um caminho.`)
  return path.resolve(normalized)
}

function pathExists(candidate) {
  try {
    fs.lstatSync(candidate)
    return true
  } catch {
    return false
  }
}

function isRegularFile(candidate) {
  try {
    const stat = fs.lstatSync(candidate)
    return stat.isFile() && !stat.isSymbolicLink()
  } catch {
    return false
  }
}

function isDirectory(candidate) {
  try {
    const stat = fs.lstatSync(candidate)
    return stat.isDirectory() && !stat.isSymbolicLink()
  } catch {
    return false
  }
}

/**
 * Mede uma árvore sem seguir symlinks. Seguir links de um artefato fornecido
 * externamente poderia fazer o inventário sair do diretório empacotado.
 */
function measureTree(root) {
  if (!pathExists(root)) return { files: 0, bytes: 0 }
  if (isRegularFile(root)) return { files: 1, bytes: fs.statSync(root).size }
  if (!isDirectory(root)) return { files: 0, bytes: 0 }

  return fs.readdirSync(root, { withFileTypes: true }).reduce(
    (total, entry) => {
      const child = path.join(root, entry.name)
      const measured = measureTree(child)
      return {
        files: total.files + measured.files,
        bytes: total.bytes + measured.bytes,
      }
    },
    { files: 0, bytes: 0 },
  )
}

function sha256File(filePath) {
  const hash = crypto.createHash('sha256')
  const file = fs.openSync(filePath, 'r')
  const buffer = Buffer.allocUnsafe(1024 * 1024)

  try {
    let bytesRead = 0
    do {
      bytesRead = fs.readSync(file, buffer, 0, buffer.length, null)
      if (bytesRead > 0) hash.update(buffer.subarray(0, bytesRead))
    } while (bytesRead > 0)
  } finally {
    fs.closeSync(file)
  }

  return hash.digest('hex')
}

function readJsonFile(filePath, description) {
  let content
  try {
    content = fs.readFileSync(filePath, 'utf8')
  } catch (error) {
    throw new Error(`Não foi possível ler ${description}: ${error.message}`)
  }

  try {
    const value = JSON.parse(content)
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('o JSON não contém um objeto')
    }
    return value
  } catch (error) {
    throw new Error(`JSON inválido em ${description}: ${error.message}`)
  }
}

function packageRecord(relativePath, packageJson) {
  return {
    path: relativePath.replaceAll(path.sep, '/'),
    name: typeof packageJson.name === 'string' ? packageJson.name : null,
    version: typeof packageJson.version === 'string' ? packageJson.version : null,
  }
}

function normalizeArchiveEntry(entry) {
  return entry.replaceAll('\\', '/').replace(/^\/+/, '')
}

function collectPackageRecordsFromDirectory(root) {
  if (!isDirectory(root)) return []

  const records = []

  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const filePath = path.join(directory, entry.name)
      if (entry.isSymbolicLink()) continue

      if (entry.isDirectory()) {
        visit(filePath)
        continue
      }

      if (entry.isFile() && entry.name === 'package.json') {
        const packageJson = readJsonFile(filePath, path.relative(root, filePath))
        records.push(packageRecord(path.relative(root, filePath), packageJson))
      }
    }
  }

  visit(root)
  return records.sort((left, right) => left.path.localeCompare(right.path))
}

function collectPackageRecordsFromAsar(asarPath) {
  if (!isRegularFile(asarPath)) return []

  let entries
  try {
    entries = asar.listPackage(asarPath)
  } catch (error) {
    throw new Error(`Não foi possível listar ${path.basename(asarPath)}: ${error.message}`)
  }

  const records = []
  for (const entry of entries) {
    const normalizedEntry = normalizeArchiveEntry(entry)
    if (normalizedEntry !== 'package.json' && !normalizedEntry.endsWith('/package.json')) continue

    // O asar usa o separador nativo do runner ao listar/ler. A saída pública
    // continua com `/`, mas a extração recebe o caminho original para
    // funcionar também no Windows.
    const archiveEntry = entry.replace(/^[\\/]+/, '')
    let packageJson
    try {
      packageJson = JSON.parse(asar.extractFile(asarPath, archiveEntry).toString('utf8'))
    } catch (error) {
      throw new Error(`JSON inválido em ${path.basename(asarPath)}:${entry}: ${error.message}`)
    }
    if (!packageJson || typeof packageJson !== 'object' || Array.isArray(packageJson)) {
      throw new Error(`Manifesto inválido em ${path.basename(asarPath)}:${entry}`)
    }
    records.push(packageRecord(normalizedEntry, packageJson))
  }

  return records.sort((left, right) => left.path.localeCompare(right.path))
}

function findUnpackedApps(releaseDir) {
  const apps = []
  const seen = new Set()

  function visit(directory, depth) {
    if (depth > MAX_DISCOVERY_DEPTH || !isDirectory(directory)) return

    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) continue

      const child = path.join(directory, entry.name)
      if (entry.name.toLowerCase() === 'resources') {
        const appAsar = path.join(child, 'app.asar')
        if (isRegularFile(appAsar)) {
          const key = path.resolve(directory)
          if (!seen.has(key)) {
            seen.add(key)
            apps.push({
              unpackedRoot: directory,
              resourcesPath: child,
              appAsar,
            })
          }
          continue
        }
      }

      // Não há outro diretório `resources` válido dentro do conteúdo do app.
      // Evitar essas árvores também mantém a descoberta barata em releases
      // que carregam muitos módulos nativos desempacotados.
      if (entry.name === 'app.asar.unpacked' || entry.name === 'node_modules') continue
      visit(child, depth + 1)
    }
  }

  if (!isDirectory(releaseDir)) {
    throw new Error(`Diretório de release não encontrado: ${releaseDir}`)
  }

  visit(releaseDir, 0)
  return apps.sort((left, right) => left.unpackedRoot.localeCompare(right.unpackedRoot))
}

function findNpmRuntime(resourcesPath) {
  const entry = fs.readdirSync(resourcesPath, { withFileTypes: true })
    .find((candidate) => candidate.isDirectory()
      && !candidate.isSymbolicLink()
      && candidate.name.toLowerCase() === 'npm-runtime')

  if (!entry) return null

  const root = path.join(resourcesPath, entry.name)
  const npmRoot = path.join(root, 'npm')
  if (!isDirectory(npmRoot)) return null
  if (!isRegularFile(path.join(npmRoot, 'package.json'))) return null
  if (!isRegularFile(path.join(npmRoot, 'bin', 'npm-cli.js'))) return null
  return { root, npmRoot }
}

function describeResourceContents(resourcesPath) {
  return fs.readdirSync(resourcesPath, { withFileTypes: true })
    .filter((entry) => !entry.isSymbolicLink())
    .map((entry) => {
      const candidate = path.join(resourcesPath, entry.name)
      if (entry.isDirectory()) {
        const measured = measureTree(candidate)
        return {
          path: entry.name,
          type: 'directory',
          files: measured.files,
          bytes: measured.bytes,
        }
      }

      if (entry.isFile()) {
        return {
          path: entry.name,
          type: 'file',
          files: 1,
          bytes: fs.statSync(candidate).size,
          sha256: sha256File(candidate),
        }
      }

      return null
    })
    .filter(Boolean)
    .sort((left, right) => left.path.localeCompare(right.path))
}

function buildAppInventory({ releaseDir, unpackedRoot, resourcesPath, appAsar }) {
  const runtime = findNpmRuntime(resourcesPath)
  if (!runtime) {
    throw new Error(
      `Artefato sem npm-runtime válido: ${path.relative(releaseDir, unpackedRoot) || '.'}`,
    )
  }

  const npmPackageJsonPath = path.join(runtime.npmRoot, 'package.json')
  const npmPackageJson = readJsonFile(
    npmPackageJsonPath,
    path.relative(releaseDir, npmPackageJsonPath),
  )
  const runtimeMeasured = measureTree(runtime.root)
  const asarStat = fs.statSync(appAsar)

  return {
    path: path.relative(releaseDir, unpackedRoot).replaceAll(path.sep, '/') || '.',
    resourcesPath: path.relative(releaseDir, resourcesPath).replaceAll(path.sep, '/'),
    resources: describeResourceContents(resourcesPath),
    appAsar: {
      path: path.relative(releaseDir, appAsar).replaceAll(path.sep, '/'),
      files: 1,
      bytes: asarStat.size,
      sha256: sha256File(appAsar),
      packages: collectPackageRecordsFromAsar(appAsar),
    },
    npmRuntime: {
      path: path.relative(releaseDir, runtime.root).replaceAll(path.sep, '/'),
      files: runtimeMeasured.files,
      bytes: runtimeMeasured.bytes,
      package: {
        name: typeof npmPackageJson.name === 'string' ? npmPackageJson.name : null,
        version: typeof npmPackageJson.version === 'string' ? npmPackageJson.version : null,
      },
      packages: collectPackageRecordsFromDirectory(runtime.root),
    },
  }
}

function collectTopLevelArtifacts(releaseDir, outputPath) {
  const excluded = outputPath ? path.resolve(outputPath) : null
  return fs.readdirSync(releaseDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && !entry.isSymbolicLink())
    .map((entry) => {
      const filePath = path.join(releaseDir, entry.name)
      if (excluded && path.resolve(filePath) === excluded) return null
      const stat = fs.statSync(filePath)
      return {
        path: entry.name,
        bytes: stat.size,
        sha256: sha256File(filePath),
      }
    })
    .filter(Boolean)
    .sort((left, right) => left.path.localeCompare(right.path))
}

function buildInventory(releaseDir = DEFAULT_RELEASE_DIR, options = {}) {
  const resolvedReleaseDir = path.resolve(releaseDir)
  const outputPath = options.outputPath ? path.resolve(options.outputPath) : null
  const candidates = findUnpackedApps(resolvedReleaseDir)
  if (candidates.length === 0) {
    throw new Error('Nenhum app unpacked com resources/app.asar foi encontrado no release.')
  }

  const unpackedApps = candidates.map((candidate) => buildAppInventory({
    releaseDir: resolvedReleaseDir,
    ...candidate,
  }))

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    releaseDirectory: path.basename(resolvedReleaseDir),
    artifacts: collectTopLevelArtifacts(resolvedReleaseDir, outputPath),
    unpackedApps,
  }
}

function formatHelp() {
  return [
    'Uso: node scripts/package-inventory.cjs [opções]',
    '',
    'Opções:',
    '  --release-dir <caminho>  Diretório gerado pelo electron-builder.',
    '  --out <caminho>          Arquivo JSON de saída.',
    '  --help                   Mostra esta ajuda.',
  ].join('\n')
}

function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv)
  if (options.help) {
    console.log(formatHelp())
    return
  }

  const inventory = buildInventory(options.releaseDir, { outputPath: options.out })
  fs.mkdirSync(path.dirname(options.out), { recursive: true })
  fs.writeFileSync(options.out, `${JSON.stringify(inventory, null, 2)}\n`, 'utf8')
  console.log(
    `Inventário gerado: ${inventory.unpackedApps.length} app(s), `
      + `${inventory.unpackedApps.reduce((total, app) => total + app.npmRuntime.files, 0)} arquivo(s) de npm-runtime.`,
  )
}

if (require.main === module) {
  try {
    main()
  } catch (error) {
    console.error(`[package-inventory] ${error.message}`)
    process.exitCode = 1
  }
}

module.exports = {
  buildInventory,
  collectPackageRecordsFromAsar,
  collectPackageRecordsFromDirectory,
  findNpmRuntime,
  findUnpackedApps,
  measureTree,
  normalizeArchiveEntry,
  parseArgs,
  sha256File,
}

#!/usr/bin/env node
'use strict'

/**
 * Confere o vocabulário de falha das CLIs de agente nos pacotes instalados.
 *
 * A fixture `electron/__fixtures__/cli-failure-vocabulary.json` guarda as
 * frases que cada CLI imprime quando a conta bate o limite, perde o login ou
 * fica sem crédito, e as que parecem limite mas não são (exclusões). A
 * taxonomia de falhas (`electron/services/accounts/failure-taxonomy.cjs`) é
 * testada contra ela. Este script confere, a cada atualização de CLI, se os
 * trechos (`literals`) de cada frase ainda estão no pacote, e grava a versão
 * lida.
 *
 * Só lê arquivos: nenhuma CLI é executada, nenhuma credencial é tocada. Os
 * binários são lidos em pedaços com sobreposição, para caber na memória de uma
 * máquina modesta (o binário do Codex passa de 280 MB).
 *
 * As frases e as classes são curadas à mão na fixture; o script não inventa
 * classe. Ele atualiza `version`, `scannedFiles` e `inPackage`.
 *
 * Uso: `node scripts/extract-cli-failure-vocabulary.cjs [--write] [--npm-root=<dir>] [--openia-dir=<dir>]`
 * Sem `--write`, só compara e sai com código 1 se a fixture divergir do pacote.
 */

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { redactSecrets } = require('../electron/services/official-cli-account-status.cjs')

const FIXTURE_PATH = path.join(__dirname, '..', 'electron', '__fixtures__', 'cli-failure-vocabulary.json')
const DEFAULT_CHUNK_BYTES = 16 * 1024 * 1024
const SCHEMA_VERSION = 1

const KINDS = new Set(['include', 'exclude', 'notice', 'observed'])
const FAILURE_CLASSES = new Set(['limit', 'billing', 'auth', 'network', 'provider'])
const SCOPES = new Set(['account', 'model'])
const NOTICES = new Set(['limit_reset'])
const ANCHORS = new Set(['line'])

/**
 * Formas em que um trecho pode estar gravado num pacote.
 *
 * O Claude Code é um executável Bun: parte das strings fica em Latin-1 (o "·"
 * vira o byte 0xB7) e parte fica no código-fonte escapada (`\xB7`). O Codex é
 * Rust (UTF-8). O Gemini e o Openia são texto UTF-8. Procurar só em UTF-8
 * daria "ausente" para frases que estão no Claude.
 *
 * @param {string} literal
 * @returns {Buffer[]}
 */
function encodeLiteralVariants(literal) {
  const text = String(literal)
  const variants = [Buffer.from(text, 'utf8'), Buffer.from(text, 'utf16le')]
  const codePoints = [...text].map((char) => char.codePointAt(0))

  if (codePoints.every((code) => code <= 0xff)) {
    variants.push(Buffer.from(text, 'latin1'))
  }

  if (codePoints.some((code) => code > 0x7f)) {
    for (const escape of [escapeAsHex, escapeAsUnicode]) {
      for (const upper of [true, false]) {
        variants.push(Buffer.from(escapeNonAscii(text, escape, upper), 'utf8'))
      }
    }
  }

  const unique = new Map()
  for (const variant of variants) {
    unique.set(variant.toString('hex'), variant)
  }
  return [...unique.values()]
}

function escapeNonAscii(text, escape, upper) {
  return [...text].map((char) => {
    const code = char.codePointAt(0)
    return code <= 0x7f ? char : escape(code, upper)
  }).join('')
}

function escapeAsHex(code, upper) {
  if (code > 0xff) return escapeAsUnicode(code, upper)
  const hex = code.toString(16).padStart(2, '0')
  return `\\x${upper ? hex.toUpperCase() : hex}`
}

function escapeAsUnicode(code, upper) {
  const hex = code.toString(16).padStart(4, '0')
  return `\\u${upper ? hex.toUpperCase() : hex}`
}

/**
 * @param {string[]} literals
 * @returns {{ needles: { literal: string, variants: Buffer[] }[], maxBytes: number }}
 */
function createLiteralNeedles(literals) {
  const needles = [...new Set(literals)].map((literal) => ({
    literal,
    variants: encodeLiteralVariants(literal),
  }))
  const maxBytes = needles.reduce(
    (max, needle) => Math.max(max, ...needle.variants.map((variant) => variant.length)),
    0,
  )
  return { needles, maxBytes }
}

/**
 * Trechos presentes num buffer, em qualquer das formas de codificação.
 *
 * @param {Buffer} buffer
 * @param {string[]} literals
 * @returns {Set<string>}
 */
function findLiteralsInBuffer(buffer, literals) {
  const found = new Set()
  for (const needle of createLiteralNeedles(literals).needles) {
    if (needle.variants.some((variant) => buffer.indexOf(variant) !== -1)) {
      found.add(needle.literal)
    }
  }
  return found
}

/**
 * Procura os trechos em arquivos, lidos em pedaços de `chunkBytes` com
 * sobreposição do tamanho do maior trecho: um trecho cortado na fronteira de
 * dois pedaços continua sendo achado. A sobreposição não atravessa arquivos.
 *
 * @param {string[]} files
 * @param {string[]} literals
 * @param {{ chunkBytes?: number }} [options]
 * @returns {Set<string>}
 */
function scanFilesForLiterals(files, literals, options = {}) {
  const chunkBytes = options.chunkBytes ?? DEFAULT_CHUNK_BYTES
  const { needles, maxBytes } = createLiteralNeedles(literals)
  const overlap = Math.max(0, maxBytes - 1)
  const found = new Set()
  const buffer = Buffer.alloc(chunkBytes + overlap)

  for (const file of files) {
    if (found.size === needles.length) break

    const descriptor = fs.openSync(file, 'r')
    try {
      let carried = 0
      for (;;) {
        const read = fs.readSync(descriptor, buffer, carried, chunkBytes, null)
        if (read === 0) break

        const window = buffer.subarray(0, carried + read)
        for (const needle of needles) {
          if (!found.has(needle.literal) && needle.variants.some((variant) => window.indexOf(variant) !== -1)) {
            found.add(needle.literal)
          }
        }

        carried = Math.min(overlap, window.length)
        window.copy(buffer, 0, window.length - carried, window.length)
      }
    } finally {
      fs.closeSync(descriptor)
    }
  }

  return found
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function isFile(file) {
  try {
    return fs.statSync(file).isFile()
  } catch {
    return false
  }
}

function isDirectory(dir) {
  try {
    return fs.statSync(dir).isDirectory()
  } catch {
    return false
  }
}

function listDirectory(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return []
  }
}

/** Arquivos sob `dir`, até `maxDepth` níveis, que passam em `accept`. */
function findFiles(dir, accept, maxDepth) {
  const found = []
  for (const entry of listDirectory(dir)) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (maxDepth > 0 && entry.name !== '__pycache__') {
        found.push(...findFiles(full, accept, maxDepth - 1))
      }
      continue
    }
    if (entry.isFile() && accept(entry.name, full)) {
      found.push(full)
    }
  }
  return found.sort()
}

/**
 * Pastas `node_modules` globais prováveis do npm, na ordem de tentativa.
 * `--npm-root` vence sempre.
 */
function candidateNpmRoots(options = {}) {
  if (options.npmRoot) return [path.resolve(options.npmRoot)]

  const prefix = path.dirname(process.execPath)
  const candidates = [
    path.join(prefix, '..', 'lib', 'node_modules'),
    path.join(prefix, 'node_modules'),
  ]
  if (process.env.APPDATA) {
    candidates.push(path.join(process.env.APPDATA, 'npm', 'node_modules'))
  }
  return candidates.map((candidate) => path.resolve(candidate))
}

/** Pastas `site-packages` onde o `pip install --user` costuma pôr o Openia. */
function candidateOpeniaDirs(options = {}) {
  if (options.openiaDir) return [path.resolve(options.openiaDir)]

  const home = os.homedir()
  const bases = [
    path.join(home, '.local', 'lib'),
    path.join(home, 'Library', 'Python'),
  ]
  if (process.env.APPDATA) bases.push(path.join(process.env.APPDATA, 'Python'))

  const found = []
  for (const base of bases) {
    for (const entry of listDirectory(base)) {
      const isPythonDir = /^python\s*3/i.test(entry.name) || /^3\.\d+$/.test(entry.name)
      if (!entry.isDirectory() || !isPythonDir) continue
      for (const sitePackages of [
        path.join(base, entry.name, 'site-packages'),
        path.join(base, entry.name, 'lib', 'python', 'site-packages'),
      ]) {
        if (isDirectory(path.join(sitePackages, 'openia'))) {
          found.push(path.join(sitePackages, 'openia'))
        }
      }
    }
  }
  return found
}

function readPackageVersion(packageDir) {
  try {
    return readJson(path.join(packageDir, 'package.json')).version ?? null
  } catch {
    return null
  }
}

function locateNpmPackage(packageName, options, collectFiles) {
  for (const npmRoot of candidateNpmRoots(options)) {
    const packageDir = path.join(npmRoot, ...packageName.split('/'))
    if (!isDirectory(packageDir)) continue

    const files = collectFiles(packageDir, npmRoot)
    if (files.length === 0) continue

    return { base: npmRoot, version: readPackageVersion(packageDir), files }
  }
  return null
}

function collectClaudeFiles(packageDir) {
  return ['bin/claude.exe', 'bin/claude', 'cli.js']
    .map((relative) => path.join(packageDir, relative))
    .filter(isFile)
}

function collectCodexFiles(packageDir, npmRoot) {
  // O binário nativo vem num pacote por plataforma (@openai/codex-linux-x64,
  // @openai/codex-win32-x64...), aninhado ou içado para a raiz global.
  const scopes = [path.join(packageDir, 'node_modules', '@openai'), path.join(npmRoot, '@openai')]
  const files = []
  for (const scope of scopes) {
    for (const entry of listDirectory(scope)) {
      if (!entry.isDirectory() || !entry.name.startsWith('codex-')) continue
      files.push(...findFiles(
        path.join(scope, entry.name),
        (name) => name === 'codex' || name === 'codex.exe',
        5,
      ))
    }
  }
  return [...new Set(files)]
}

function collectGeminiFiles(packageDir) {
  return findFiles(path.join(packageDir, 'bundle'), (name) => /\.(?:c|m)?js$/.test(name), 0)
}

function locateOpenia(options) {
  for (const openiaDir of candidateOpeniaDirs(options)) {
    const files = findFiles(openiaDir, (name) => name.endsWith('.py'), 2)
    if (files.length === 0) continue

    const sitePackages = path.dirname(openiaDir)
    const distInfo = listDirectory(sitePackages)
      .map((entry) => /^openia-(.+)\.dist-info$/.exec(entry.name)?.[1])
      .find(Boolean)
    return { base: sitePackages, version: distInfo ?? null, files }
  }
  return null
}

/** Onde cada provedor mora e como achar os arquivos que carregam as frases. */
const PROVIDER_LOCATORS = Object.freeze({
  claude: (options) => locateNpmPackage('@anthropic-ai/claude-code', options, collectClaudeFiles),
  codex: (options) => locateNpmPackage('@openai/codex', options, collectCodexFiles),
  gemini: (options) => locateNpmPackage('@google/gemini-cli', options, collectGeminiFiles),
  openia: (options) => locateOpenia(options),
})

/** Caminho relativo com `/`, para a fixture não carregar caminho da máquina. */
function toPortableRelative(base, file) {
  return path.relative(base, file).split(path.sep).join('/')
}

/**
 * Lê o pacote de um provedor e diz quais frases da fixture estão nele.
 *
 * @returns {{
 *   providerId: string,
 *   status: 'ok' | 'ausente',
 *   version?: string | null,
 *   scannedFiles?: string[],
 *   phrasesInPackage?: Record<string, boolean>,
 * }}
 */
function scanProvider(providerId, provider, options = {}) {
  const locate = options.locators?.[providerId] ?? PROVIDER_LOCATORS[providerId]
  const located = typeof locate === 'function' ? locate(options) : null
  if (!located) return { providerId, status: 'ausente' }

  const literals = provider.phrases.flatMap((phrase) => phrase.literals)
  const found = scanFilesForLiterals(located.files, literals, options)
  const phrasesInPackage = {}
  for (const phrase of provider.phrases) {
    phrasesInPackage[phrase.id] = phrase.literals.every((literal) => found.has(literal))
  }

  return {
    providerId,
    status: 'ok',
    version: located.version,
    scannedFiles: located.files.map((file) => toPortableRelative(located.base, file)),
    phrasesInPackage,
  }
}

/**
 * Aplica o resultado da leitura na fixture, sem tocar nos campos curados.
 * Provedor ausente fica como estava.
 */
function applyScanResults(vocabulary, results) {
  const next = structuredClone(vocabulary)
  for (const result of results) {
    if (result.status !== 'ok') continue
    const provider = next.providers[result.providerId]
    if (!provider) continue

    if (result.version) provider.version = result.version
    provider.scannedFiles = result.scannedFiles
    for (const phrase of provider.phrases) {
      phrase.inPackage = result.phrasesInPackage[phrase.id] === true
    }
  }
  return next
}

/** Diferenças entre o que a fixture registra e o que o pacote tem. */
function diffScanResults(vocabulary, results) {
  const differences = []
  for (const result of results) {
    if (result.status !== 'ok') continue
    const provider = vocabulary.providers[result.providerId]
    if (!provider) continue

    if (result.version && result.version !== provider.version) {
      differences.push(`${result.providerId}: versão registrada ${provider.version}, instalada ${result.version}`)
    }
    for (const phrase of provider.phrases) {
      const inPackage = result.phrasesInPackage[phrase.id] === true
      if (inPackage !== (phrase.inPackage === true)) {
        differences.push(
          `${phrase.id}: registrada como ${phrase.inPackage ? 'presente' : 'ausente'}, ${inPackage ? 'presente' : 'ausente'} no pacote`,
        )
      }
    }
  }
  return differences
}

/** Mesma equivalência de apóstrofo e caixa que a taxonomia aplica. */
function normalizeForComparison(text) {
  return String(text).replace(/[‘’ʼ]/g, "'").toLowerCase()
}

const ABSOLUTE_PATH_PATTERN = /(?:^|["\s(])(?:\/home\/|\/Users\/|\/root\/|[A-Za-z]:\\\\)/

/**
 * Problemas de formato da fixture; vazio quando ela está íntegra.
 *
 * @returns {string[]}
 */
function validateVocabulary(vocabulary) {
  const problems = []
  if (vocabulary?.schemaVersion !== SCHEMA_VERSION) {
    problems.push(`schemaVersion deve ser ${SCHEMA_VERSION}`)
  }
  if (!vocabulary?.providers || typeof vocabulary.providers !== 'object') {
    return [...problems, 'providers ausente']
  }

  const ids = new Set()
  for (const [providerId, provider] of Object.entries(vocabulary.providers)) {
    if (typeof provider.version !== 'string' || !provider.version) {
      problems.push(`${providerId}: version ausente`)
    }
    if (!Array.isArray(provider.phrases)) {
      problems.push(`${providerId}: phrases deve ser uma lista`)
      continue
    }

    for (const phrase of provider.phrases) {
      const label = phrase?.id ?? `${providerId}:?`
      if (typeof phrase.id !== 'string' || !phrase.id.startsWith(`${providerId}.`)) {
        problems.push(`${label}: id deve começar por "${providerId}."`)
      }
      if (ids.has(phrase.id)) problems.push(`${label}: id repetido`)
      ids.add(phrase.id)

      if (!KINDS.has(phrase.kind)) problems.push(`${label}: kind inválido`)
      if (phrase.kind === 'include') {
        if (!FAILURE_CLASSES.has(phrase.failureClass)) problems.push(`${label}: failureClass inválida`)
        if (!SCOPES.has(phrase.scope)) problems.push(`${label}: scope inválido`)
      } else if (phrase.failureClass !== undefined || phrase.scope !== undefined) {
        problems.push(`${label}: só inclusão tem failureClass e scope`)
      }
      if (phrase.kind === 'notice' && !NOTICES.has(phrase.notice)) {
        problems.push(`${label}: notice inválido`)
      }
      if (phrase.anchor !== undefined && !ANCHORS.has(phrase.anchor)) {
        problems.push(`${label}: anchor inválido`)
      }
      if (typeof phrase.terminal !== 'boolean') problems.push(`${label}: terminal deve ser booleano`)
      if (typeof phrase.inPackage !== 'boolean') problems.push(`${label}: inPackage deve ser booleano`)
      if (!Array.isArray(phrase.literals) || phrase.literals.length === 0 ||
        phrase.literals.some((literal) => typeof literal !== 'string' || !literal.trim())) {
        problems.push(`${label}: literals deve ter ao menos um trecho`)
        continue
      }
      if (typeof phrase.example !== 'string' || !phrase.example.trim()) {
        problems.push(`${label}: example ausente`)
        continue
      }
      const example = normalizeForComparison(phrase.example)
      for (const literal of phrase.literals) {
        if (!example.includes(normalizeForComparison(literal))) {
          problems.push(`${label}: o exemplo não contém o trecho "${literal}"`)
        }
      }
    }
  }

  const serialized = JSON.stringify(vocabulary)
  if (redactSecrets(serialized) !== serialized) {
    problems.push('a fixture contém algo com formato de segredo')
  }
  if (ABSOLUTE_PATH_PATTERN.test(serialized)) {
    problems.push('a fixture contém caminho absoluto da máquina')
  }

  return problems
}

function parseArgs(argv = []) {
  const options = { write: false, npmRoot: null, openiaDir: null }
  for (const argument of argv) {
    if (argument === '--write') {
      options.write = true
      continue
    }
    const match = /^--(npm-root|openia-dir)=(.+)$/.exec(argument)
    if (!match) {
      throw new Error(`Argumento desconhecido: ${argument}`)
    }
    options[match[1] === 'npm-root' ? 'npmRoot' : 'openiaDir'] = match[2]
  }
  return options
}

function formatScanReport(vocabulary, results) {
  return results.map((result) => {
    if (result.status !== 'ok') {
      return `${result.providerId}: pacote não encontrado; pulado.`
    }
    const phrases = vocabulary.providers[result.providerId].phrases
    const missing = phrases.filter((phrase) => !result.phrasesInPackage[phrase.id])
    return [
      `${result.providerId} ${result.version ?? '(versão desconhecida)'}: ${phrases.length - missing.length}/${phrases.length} frases no pacote (${result.scannedFiles.length} arquivo(s) lido(s)).`,
      ...missing.map((phrase) => `  ausente: ${phrase.id}`),
    ].join('\n')
  }).join('\n')
}

function main(argv = process.argv.slice(2), dependencies = {}) {
  const options = { ...parseArgs(argv), ...dependencies }
  const fixturePath = dependencies.fixturePath ?? FIXTURE_PATH
  const vocabulary = readJson(fixturePath)

  const problems = validateVocabulary(vocabulary)
  if (problems.length) {
    console.error(`[vocabulário] fixture inválida:\n  ${problems.join('\n  ')}`)
    process.exitCode = 1
    return { problems }
  }

  const results = Object.entries(vocabulary.providers)
    .map(([providerId, provider]) => scanProvider(providerId, provider, options))
  console.log(formatScanReport(vocabulary, results))

  if (options.write) {
    const next = applyScanResults(vocabulary, results)
    fs.writeFileSync(fixturePath, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
    console.log(`[vocabulário] fixture gravada: ${path.relative(process.cwd(), fixturePath)}`)
    return { results }
  }

  const differences = diffScanResults(vocabulary, results)
  if (differences.length) {
    console.error(`[vocabulário] a fixture diverge do pacote instalado (rode com --write depois de revisar):\n  ${differences.join('\n  ')}`)
    process.exitCode = 1
  }
  return { results, differences }
}

if (require.main === module) {
  main()
}

module.exports = {
  FIXTURE_PATH,
  applyScanResults,
  diffScanResults,
  encodeLiteralVariants,
  findLiteralsInBuffer,
  formatScanReport,
  main,
  parseArgs,
  scanFilesForLiterals,
  scanProvider,
  validateVocabulary,
}

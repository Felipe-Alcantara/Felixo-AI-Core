'use strict'

/**
 * Portable reader for the immutable context artifacts created by the app.
 *
 * The renderer must not put an absolute user-data path in an agent prompt:
 * that path belongs to the machine/profile that created it. The `felixo` shim
 * already carries the active app profile, so the agent can identify an artifact
 * by its generated name and let this process resolve the native directory.
 */

const fsp = require('node:fs/promises')
const path = require('node:path')
const { getAppPaths } = require('../core/app-paths.cjs')
const { CONTEXT_FILE_PREFIX, CONTEXT_FILE_SUFFIX } = require('../core/context-file-contract.cjs')
const { AJUDA_CONTEXT } = require('./agent-command-output.cjs')

const CONTEXT_READ_VERBS = new Set(['read', 'ler'])

/**
 * Validate the opaque filename before joining it to the context directory.
 * Both separators are rejected so a filename produced on one OS cannot become
 * traversal input when consumed on another.
 *
 * @param {unknown} value
 * @returns {string}
 */
function validarNomeDoArtefato(value) {
  const name = typeof value === 'string' ? value.trim() : ''
  if (
    !name ||
    name === '.' ||
    name === '..' ||
    name.includes('/') ||
    name.includes('\\') ||
    name.includes('\0') ||
    !name.startsWith(CONTEXT_FILE_PREFIX) ||
    !name.endsWith(CONTEXT_FILE_SUFFIX)
  ) {
    throw new Error(
      'Nome de artefato inválido. Use somente o nome retornado pelo Felixo, sem caminho.',
    )
  }
  return name
}

/**
 * Resolve one owned artifact without allowing traversal out of contextFiles.
 *
 * @param {string} contextDir
 * @param {unknown} name
 * @returns {string}
 */
function resolverCaminhoDoArtefato(contextDir, name) {
  const filename = validarNomeDoArtefato(name)
  const baseDir = path.resolve(contextDir)
  const filePath = path.resolve(baseDir, filename)
  if (!filePath.startsWith(`${baseDir}${path.sep}`)) {
    throw new Error('Nome de artefato fora da pasta de contexto.')
  }
  return filePath
}

/**
 * Read one artifact from the active Felixo profile.
 *
 * @param {string} name
 * @param {{ getContextDir?: () => string, readFile?: Function }} [dependencies]
 * @returns {Promise<string>}
 */
async function lerArtefatoDeContexto(name, dependencies = {}) {
  const contextDir = dependencies.getContextDir?.() || getAppPaths().contextFiles
  const filePath = resolverCaminhoDoArtefato(contextDir, name)
  const readFile = dependencies.readFile || fsp.readFile
  return readFile(filePath, 'utf8')
}

/**
 * Execute `felixo context read <name>` (or the Portuguese alias).
 *
 * @param {string[]} argumentos
 * @param {{ getContextDir?: () => string, readFile?: Function }} [dependencies]
 * @returns {Promise<{ saida: string, erro?: string, codigo: number }>}
 */
async function executarContexto(argumentos, dependencies = {}) {
  const verbo = argumentos[0] || ''
  const name = argumentos[1] || ''

  if (!CONTEXT_READ_VERBS.has(verbo) || argumentos.length !== 2) {
    return {
      saida: AJUDA_CONTEXT,
      codigo: verbo && verbo !== 'ajuda' && verbo !== 'help' ? 2 : 0,
    }
  }

  try {
    return { saida: await lerArtefatoDeContexto(name, dependencies), codigo: 0 }
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return {
        saida: '',
        erro: `Artefato de contexto não encontrado: ${name}. Não substitua por outro artefato; informe este nome e o erro exato.`,
        codigo: 1,
      }
    }

    return {
      saida: '',
      erro: error instanceof Error ? error.message : 'Não foi possível ler o artefato de contexto.',
      codigo: 2,
    }
  }
}

module.exports = {
  CONTEXT_FILE_SUFFIX,
  CONTEXT_READ_VERBS,
  executarContexto,
  lerArtefatoDeContexto,
  resolverCaminhoDoArtefato,
  validarNomeDoArtefato,
}

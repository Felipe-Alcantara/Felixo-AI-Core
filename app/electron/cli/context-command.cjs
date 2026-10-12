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
const { appendContextDeliveryEvent, recordContextDeliveryRead } = require('../services/context-delivery-log.cjs')
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
 * Erro para um nome válido cujo arquivo não existe mais.
 *
 * A ausência é um estado esperado, não só uma falha: o app apaga os artefatos
 * quando o terminal do agente termina (fechar o app, auto-atualização do
 * Codex, reiniciar o bloco) e os antigos na abertura. A conversa do agente,
 * por outro lado, é retomada com a instrução original ("leia antes de agir")
 * ainda no histórico. Quando esta mensagem só mandava "informar o erro", o
 * agente obedecia ao pé da letra e parava — visto em relato real (Windows +
 * Codex): três artefatos de uma execução anterior, pedido da pessoa não
 * executado, e um pedido para ela "disponibilizar novamente" arquivos que
 * ela não controla.
 *
 * A regra de não trocar por outro artefato continua: ela existe porque um
 * agente já leu um arquivo "equivalente" de outra sessão sem avisar. Sem o
 * número de horas de propósito — este módulo não carrega o Electron, e uma
 * cópia da constante do app divergiria em silêncio.
 *
 * @param {string} name
 * @returns {string}
 */
function mensagemDeArtefatoAusente(name) {
  return [
    `Artefato de contexto não encontrado: ${name}. Não substitua por outro artefato; informe este nome e o erro exato.`,
    'Esses arquivos são temporários: o Felixo os apaga quando o terminal do agente é encerrado ou reiniciado (fechar o app, atualização do agente, reinício do bloco) e limpa os antigos ao abrir o app.',
    'Se esta conversa foi retomada, o conteúdo deste artefato deve estar no histórico dela, lido no início: continue o pedido atual a partir dele, sem esperar o arquivo reaparecer e sem pedir à pessoa que o disponibilize de novo.',
    'Se o histórico não tiver o conteúdo, não invente: avise a pessoa de que o contexto expirou; iniciar uma nova conversa neste bloco do Felixo gera um contexto novo.',
  ].join('\n')
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

  const contextDir = dependencies.getContextDir?.() || getAppPaths().contextFiles
  const deliveryLogDirectory =
    dependencies.deliveryLogDirectory || path.join(path.dirname(contextDir), 'logs', 'qa')

  try {
    const saida = await lerArtefatoDeContexto(name, { ...dependencies, getContextDir: () => contextDir })
    try {
      if (typeof dependencies.recordDeliveryRead === 'function') {
        await dependencies.recordDeliveryRead(name, { contextDir, deliveryLogDirectory })
      } else {
        await recordContextDeliveryRead(deliveryLogDirectory, name)
      }
    } catch {
      // Reading context must remain reliable when a disk diagnostic cannot be
      // appended. The successful stdout is still the source of truth.
    }
    return { saida, codigo: 0 }
  } catch (error) {
    try {
      const metadata = typeof dependencies.deliveryMetadata === 'object'
        ? dependencies.deliveryMetadata
        : {}
      let safeArtifactId
      try {
        safeArtifactId = validarNomeDoArtefato(name)
      } catch {
        safeArtifactId = undefined
      }
      await appendContextDeliveryEvent(deliveryLogDirectory, {
        ...metadata,
        artifactId: safeArtifactId,
        state: 'failed',
        error: error instanceof Error ? error.message : String(error),
      })
    } catch {
      // Best effort: preserve the original read error and exit code.
    }
    if (error?.code === 'ENOENT') {
      return {
        saida: '',
        erro: mensagemDeArtefatoAusente(name),
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

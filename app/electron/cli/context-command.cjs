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
const {
  CONTEXT_EXPIRED_DIRNAME,
  CONTEXT_FILE_PREFIX,
  CONTEXT_FILE_SUFFIX,
} = require('../core/context-file-contract.cjs')
const { appendContextDeliveryEvent, recordContextDeliveryRead } = require('../services/context-delivery-log.cjs')
const { AJUDA_CONTEXT } = require('./agent-command-output.cjs')

const CONTEXT_READ_VERBS = new Set(['read', 'ler'])

/**
 * Quantas vezes a leitura percorre "artefato vivo, depois cópia guardada" antes
 * de desistir. O app move o arquivo de uma pasta para a outra quando a sessão
 * termina; uma leitura que cai nesse instante não acha o arquivo em nenhuma das
 * duas e acha na rodada seguinte.
 */
const TENTATIVAS_DE_LEITURA = 3
const ESPERA_ENTRE_TENTATIVAS_MS = 150
/** Ausente ou em uso por outro processo: vale tentar a outra origem e repetir. */
const ERROS_QUE_VALEM_NOVA_TENTATIVA = new Set(['ENOENT', 'EBUSY'])

const AVISO_DE_RECUPERACAO =
  'AVISO DO FELIXO AI CORE: este artefato é de uma execução anterior deste terminal e foi ' +
  'recuperado automaticamente da cópia guardada pelo app. O conteúdo abaixo é o que foi ' +
  'entregue na época; valide-o contra o estado atual do projeto. Nenhuma ação é necessária: ' +
  'não peça reenvio e siga com a tarefa.'

function esperarPadrao(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * A data em que o app gerou o artefato, tirada do próprio nome
 * (`felixo-context-<ms desde 1970>-<uuid>-<tipo>.txt`). Serve só para a
 * mensagem de erro dizer de quando é o artefato que sumiu.
 *
 * @param {string} name
 * @returns {string | null} `AAAA-MM-DD`, ou `null` se o nome não traz uma data plausível.
 */
function dataDeCriacaoDoArtefato(name) {
  const match = new RegExp(`^${CONTEXT_FILE_PREFIX}(\\d{13})-`).exec(String(name))
  if (!match) return null
  const date = new Date(Number(match[1]))
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10)
}

/**
 * O que o agente lê quando o conteúdo não existe mais em lugar nenhum. É uma
 * instrução, não só um diagnóstico: o texto de entrega manda ler antes de agir,
 * e sem esta liberação explícita o agente fica parado esperando um arquivo que
 * não volta.
 *
 * @param {string} name
 * @returns {string}
 */
function mensagemDeArtefatoPerdido(name) {
  const data = dataDeCriacaoDoArtefato(name)
  return [
    `Artefato de contexto não encontrado: ${name}.`,
    `${data ? `Ele foi gerado em ${data} e não` : 'Ele não'} existe mais neste perfil: os artefatos são temporários e a cópia guardada pelo app também já expirou.`,
    'Isso não impede o trabalho: se você já leu este contexto nesta conversa, continue com o que tem; se não leu, siga as regras do repositório e a tarefa pedida, e avise a pessoa, com este nome, de que o contexto não pôde ser lido.',
    'Não substitua por outro artefato e não repita esta leitura.',
  ].join(' ')
}

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
 * Lê um artefato e se recupera sozinho quando ele saiu da pasta viva.
 *
 * A conversa do agente é retomada pelo ID depois que o processo dele terminou e
 * continua mandando ler os mesmos nomes. Por isso a leitura não para no
 * primeiro "não existe": tenta o artefato vivo, depois a cópia que o app guarda
 * das sessões encerradas, e repete as duas algumas vezes.
 *
 * @param {string} contextDir
 * @param {string} name
 * @param {{ readFile?: Function, esperar?: (ms: number) => Promise<unknown> }} [dependencies]
 * @returns {Promise<{ conteudo: string, origem: 'vivo' | 'guardado' }>}
 */
async function lerComRecuperacao(contextDir, name, dependencies = {}) {
  const readFile = dependencies.readFile || fsp.readFile
  const esperar = dependencies.esperar || esperarPadrao
  const origens = [
    ['vivo', resolverCaminhoDoArtefato(contextDir, name)],
    ['guardado', resolverCaminhoDoArtefato(path.join(contextDir, CONTEXT_EXPIRED_DIRNAME), name)],
  ]

  let erroDoArtefatoVivo
  for (let tentativa = 1; tentativa <= TENTATIVAS_DE_LEITURA; tentativa += 1) {
    for (const [origem, filePath] of origens) {
      try {
        return { conteudo: await readFile(filePath, 'utf8'), origem }
      } catch (error) {
        if (!ERROS_QUE_VALEM_NOVA_TENTATIVA.has(error?.code)) throw error
        // O erro que conta no fim é o do artefato pedido, não o da cópia.
        if (origem === 'vivo') erroDoArtefatoVivo = error
      }
    }
    if (tentativa < TENTATIVAS_DE_LEITURA) {
      await esperar(ESPERA_ENTRE_TENTATIVAS_MS)
    }
  }
  throw erroDoArtefatoVivo
}

/**
 * Read one artifact from the active Felixo profile.
 *
 * @param {string} name
 * @param {{ getContextDir?: () => string, readFile?: Function, esperar?: Function }} [dependencies]
 * @returns {Promise<string>}
 */
async function lerArtefatoDeContexto(name, dependencies = {}) {
  const contextDir = dependencies.getContextDir?.() || getAppPaths().contextFiles
  return (await lerComRecuperacao(contextDir, name, dependencies)).conteudo
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
    const { conteudo, origem } = await lerComRecuperacao(contextDir, name, dependencies)
    const recuperado = origem === 'guardado'
    try {
      if (typeof dependencies.recordDeliveryRead === 'function') {
        await dependencies.recordDeliveryRead(name, { contextDir, deliveryLogDirectory, origem })
      } else {
        await recordContextDeliveryRead(deliveryLogDirectory, name, recuperado ? 'recovered' : 'read')
      }
    } catch {
      // Reading context must remain reliable when a disk diagnostic cannot be
      // appended. The successful stdout is still the source of truth.
    }
    return {
      saida: recuperado ? `${AVISO_DE_RECUPERACAO}\n\n${conteudo}` : conteudo,
      codigo: 0,
    }
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
        erro: `${mensagemDeArtefatoAusente(name)}\n${mensagemDeArtefatoPerdido(name)}`,
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
  dataDeCriacaoDoArtefato,
  executarContexto,
  lerArtefatoDeContexto,
  resolverCaminhoDoArtefato,
  validarNomeDoArtefato,
}

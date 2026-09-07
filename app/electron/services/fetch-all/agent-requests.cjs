'use strict'

/**
 * @module agent-requests
 * Intenções que um agente deixa para o app atender.
 *
 * Por que arquivo numa pasta, e não um servidor local com porta e token: o
 * agente roda num terminal do canvas, do lado de fora do processo principal, e
 * a única coisa que ele precisa fazer é **pedir**. Abrir um listener para isso
 * criaria superfície nova (porta, autenticação, ciclo de vida) para transportar
 * um JSON de três campos. A pasta fica no `userData`, que já é do usuário, e a
 * efeitos continuam acontecendo só no app, no consumidor da intenção.
 *
 * O pedido nunca carrega a ação a executar em forma de comando: carrega uma
 * *intenção* de uma lista fechada. `executar-plano` continua dependendo da
 * confirmação humana no painel; `abrir-pagina` carrega apenas URL http(s) e o
 * destino (`externo` ou `embutido`) que o app já conhece.
 */

const fs = require('node:fs')
const path = require('node:path')

/** Intenções aceitas. Lista fechada de propósito. */
const ACOES_ACEITAS = ['executar-plano', 'abrir-pagina']

const MODOS_ABERTURA_PAGINA = ['externo', 'embutido']

/** Estados possíveis de um pedido. */
const ESTADOS = {
  pendente: 'pendente',
  aceito: 'aceito',
  recusado: 'recusado',
}

/** Depois disto, um pedido é lixo de sessão antiga e não deve acender a tela. */
const VALIDADE_MS = 60 * 60 * 1000

/**
 * Valida e normaliza o que veio da linha de comando.
 *
 * Função pura: é a fronteira onde texto vindo de fora vira dado confiável.
 *
 * @param {unknown} acao
 * @param {unknown} opcoes
 * @returns {{ acao: string, comCommit: boolean, url?: string, modo?: string }}
 * @throws {Error} quando a ação não está na lista fechada.
 */
function normalizarPedido(acao, opcoes = {}) {
  const nome = typeof acao === 'string' ? acao.trim() : ''

  if (!ACOES_ACEITAS.includes(nome)) {
    throw new Error(
      `Ação não reconhecida: "${nome}". Aceita: ${ACOES_ACEITAS.join(', ')}.`,
    )
  }

  if (nome === 'abrir-pagina') {
    const url = normalizarUrlWeb(opcoes?.url)
    const modo = typeof opcoes?.modo === 'string' ? opcoes.modo.trim() : 'externo'

    if (!url) {
      throw new Error('Informe uma URL http:// ou https:// para abrir.')
    }

    if (!MODOS_ABERTURA_PAGINA.includes(modo)) {
      throw new Error(
        `Modo de abertura nao reconhecido: "${modo}". Aceitos: ${MODOS_ABERTURA_PAGINA.join(', ')}.`,
      )
    }

    return { acao: nome, comCommit: false, url, modo }
  }

  return { acao: nome, comCommit: opcoes?.comCommit === true }
}

/**
 * URL que pode atravessar o canal de pedidos.
 *
 * @param {unknown} valor
 * @returns {string}
 */
function normalizarUrlWeb(valor) {
  if (typeof valor !== 'string') return ''

  const url = valor.trim()
  try {
    const protocolo = new URL(url).protocol
    return protocolo === 'http:' || protocolo === 'https:' ? url : ''
  } catch {
    return ''
  }
}

/**
 * Um pedido só vale enquanto a sessão que o criou faz sentido.
 *
 * Sem isso, um pedido esquecido de ontem acenderia o painel hoje e a pessoa
 * confirmaria uma escrita que ninguém está esperando.
 *
 * @param {{ pedidoEm?: string }} pedido
 * @param {number} agora
 * @returns {boolean}
 */
function pedidoAindaVale(pedido, agora) {
  const instante = Date.parse(pedido?.pedidoEm ?? '')
  return Number.isFinite(instante) && agora - instante < VALIDADE_MS
}

/**
 * Cria o repositório de pedidos.
 *
 * @param {object} opcoes
 * @param {string} opcoes.pasta - onde os pedidos ficam (`appPaths.agentRequests`).
 * @param {object} [opcoes.sistemaDeArquivos] - injeção para teste.
 * @param {() => number} [opcoes.agora] - injeção para teste.
 * @returns {object}
 */
function criarRepositorioDePedidos(opcoes) {
  const { pasta, sistemaDeArquivos = fs, agora = () => Date.now() } = opcoes

  /**
   * Registra um pedido novo e devolve o registro gravado.
   *
   * @param {string} acao
   * @param {{ comCommit?: boolean, origem?: string, url?: string, modo?: string }} [detalhes]
   * @returns {{ id: string, acao: string, comCommit: boolean, estado: string, pedidoEm: string, origem: string, url?: string, modo?: string }}
   */
  function registrar(acao, detalhes = {}) {
    const normalizado = normalizarPedido(acao, detalhes)
    const instante = new Date(agora()).toISOString()
    const pedido = {
      id: `${instante.replace(/[:.]/g, '-')}-${Math.random().toString(36).slice(2, 8)}`,
      ...normalizado,
      estado: ESTADOS.pendente,
      pedidoEm: instante,
      origem: typeof detalhes.origem === 'string' ? detalhes.origem : '',
    }

    sistemaDeArquivos.mkdirSync(pasta, { recursive: true })
    sistemaDeArquivos.writeFileSync(
      path.join(pasta, `${pedido.id}.json`),
      `${JSON.stringify(pedido, null, 2)}\n`,
      'utf8',
    )
    return pedido
  }

  /**
   * Lista os pedidos pendentes que ainda valem, do mais antigo ao mais novo.
   *
   * Arquivo ilegível é ignorado em silêncio: um JSON corrompido não pode
   * impedir a pessoa de ver os pedidos legítimos ao lado dele.
   *
   * @returns {Array<object>}
   */
  function listarPendentes(filtro = {}) {
    const instante = agora()
    const acao = typeof filtro?.acao === 'string' ? filtro.acao : ''

    return lerTodos()
      .filter(
        (pedido) =>
          pedido.estado === ESTADOS.pendente &&
          pedidoAindaVale(pedido, instante) &&
          (!acao || pedido.acao === acao),
      )
      .sort((a, b) => a.pedidoEm.localeCompare(b.pedidoEm))
  }

  /**
   * Marca o desfecho de um pedido. Só o app chama isto, depois do clique.
   *
   * @param {string} id
   * @param {{ aceito: boolean, resultado?: object }} desfecho
   * @returns {object|null} o pedido atualizado, ou `null` se ele não existe.
   */
  function resolver(id, desfecho) {
    const arquivo = path.join(pasta, `${String(id).replace(/[^\w.-]/g, '')}.json`)
    const pedido = lerArquivo(arquivo)

    if (!pedido) {
      return null
    }

    const atualizado = {
      ...pedido,
      estado: desfecho?.aceito === true ? ESTADOS.aceito : ESTADOS.recusado,
      resolvidoEm: new Date(agora()).toISOString(),
      resultado: desfecho?.resultado ?? null,
    }

    sistemaDeArquivos.writeFileSync(
      arquivo,
      `${JSON.stringify(atualizado, null, 2)}\n`,
      'utf8',
    )
    return atualizado
  }

  /**
   * Lê um pedido pelo id, em qualquer estado. É como o comando descobre o
   * desfecho de um pedido que ele mesmo deixou.
   *
   * @param {string} id
   * @returns {object|null}
   */
  function ler(id) {
    return lerArquivo(path.join(pasta, `${String(id).replace(/[^\w.-]/g, '')}.json`))
  }

  /** @returns {Array<object>} */
  function lerTodos() {
    let nomes

    try {
      nomes = sistemaDeArquivos.readdirSync(pasta)
    } catch {
      return []
    }

    return nomes
      .filter((nome) => nome.endsWith('.json'))
      .map((nome) => lerArquivo(path.join(pasta, nome)))
      .filter(Boolean)
  }

  /** @returns {object|null} */
  function lerArquivo(arquivo) {
    try {
      const bruto = JSON.parse(sistemaDeArquivos.readFileSync(arquivo, 'utf8'))
      return bruto && typeof bruto === 'object' && typeof bruto.id === 'string' ? bruto : null
    } catch {
      return null
    }
  }

  return { registrar, listarPendentes, resolver, ler }
}

module.exports = {
  ACOES_ACEITAS,
  ESTADOS,
  MODOS_ABERTURA_PAGINA,
  VALIDADE_MS,
  criarRepositorioDePedidos,
  normalizarUrlWeb,
  normalizarPedido,
  pedidoAindaVale,
}

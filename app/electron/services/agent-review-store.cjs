'use strict'

/**
 * @module agent-review-store
 * Pareamento produtor × checador: o resultado do produtor fica RETIDO até o
 * checador aprovar.
 *
 * A retenção é estrutural, não uma promessa de prompt: `enviar` copia o
 * arquivo para `entrega.md` e a cópia liberada (`liberado.md`) só passa a
 * existir dentro de `aprovar`. O produtor recebe o caminho liberado apenas
 * quando o checador aprova; a recusa grava o motivo no histórico e no
 * `recusas.md` do time (que sobrevive a reinício).
 *
 * Só node:fs: o comando `felixo` roda em Node puro, sem Electron.
 */

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

/** Recusas seguidas do mesmo arquivo antes de parar e chamar a pessoa. */
const LIMITE_DE_RECUSAS = 3
const TAMANHO_MAXIMO_BYTES = 1024 * 1024
const ID_VALIDO = /^rev-[a-z0-9]+$/

/**
 * @param {{ pasta: string, agora?: () => Date }} opcoes
 */
function criarRepositorioDeRevisoes({ pasta, agora = () => new Date() }) {
  const pastaDe = (id) => path.join(pasta, id)
  const arquivoJson = (id) => path.join(pastaDe(id), 'review.json')

  function ler(id) {
    if (!ID_VALIDO.test(String(id))) return null
    try {
      return JSON.parse(fs.readFileSync(arquivoJson(id), 'utf8'))
    } catch {
      return null
    }
  }

  function salvar(revisao) {
    fs.writeFileSync(arquivoJson(revisao.id), JSON.stringify(revisao, null, 2), 'utf8')
  }

  function listar() {
    let nomes = []
    try {
      nomes = fs.readdirSync(pasta)
    } catch {
      return []
    }
    return nomes
      .map(ler)
      .filter(Boolean)
      .sort((a, b) => a.criadaEm.localeCompare(b.criadaEm))
  }

  const pendentes = () => listar().filter((revisao) => revisao.estado === 'pendente')

  /** Resolve o id opcional: sem id, vale a única pendente. */
  function resolverId(id) {
    if (id) return { ok: true, revisao: ler(id) }
    const abertas = pendentes()
    if (abertas.length === 1) return { ok: true, revisao: abertas[0] }
    return {
      ok: false,
      message: abertas.length === 0
        ? 'Não há revisão pendente.'
        : `Há ${abertas.length} revisões pendentes; informe o id: ${abertas.map((r) => r.id).join(', ')}.`,
    }
  }

  /** A cadeia de recusas do mesmo arquivo: a última revisão dele decide a rodada. */
  function ultimaDoArquivo(arquivo) {
    return listar().filter((revisao) => revisao.arquivo === arquivo).pop() ?? null
  }

  /**
   * @param {{ arquivo: string, produtor: string, reiniciar?: boolean }} dados
   */
  function enviar({ arquivo, produtor, reiniciar = false }) {
    const absoluto = path.resolve(arquivo)
    if (path.extname(absoluto).toLowerCase() !== '.md') {
      return { ok: false, message: 'Envie um arquivo .md com o resultado.' }
    }
    let stat
    try {
      stat = fs.statSync(absoluto)
    } catch {
      return { ok: false, message: `Arquivo não encontrado: ${absoluto}` }
    }
    if (!stat.isFile() || stat.size > TAMANHO_MAXIMO_BYTES) {
      return { ok: false, message: 'O resultado precisa ser um arquivo de até 1 MB.' }
    }

    const anterior = ultimaDoArquivo(absoluto)
    if (anterior?.estado === 'pendente') {
      return { ok: false, message: `Este arquivo já está em revisão (${anterior.id}).` }
    }
    if (anterior?.estado === 'escalada' && !reiniciar) {
      return {
        ok: false,
        message: `Este arquivo foi recusado ${LIMITE_DE_RECUSAS} vezes seguidas. Pare e avise a pessoa; só ela libera uma nova rodada.`,
      }
    }

    const rodada = anterior?.estado === 'recusada' ? anterior.rodada + 1 : 1
    const id = `rev-${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`
    fs.mkdirSync(pastaDe(id), { recursive: true })
    fs.copyFileSync(absoluto, path.join(pastaDe(id), 'entrega.md'))
    const revisao = {
      id,
      arquivo: absoluto,
      produtor,
      estado: 'pendente',
      rodada,
      criadaEm: agora().toISOString(),
      historico: [{ em: agora().toISOString(), evento: 'enviada' }],
    }
    salvar(revisao)
    return { ok: true, revisao }
  }

  function aprovar(id) {
    const { ok, revisao, message } = resolverId(id)
    if (!ok) return { ok, message }
    if (!revisao) return { ok: false, message: 'Revisão não encontrada.' }
    if (revisao.estado !== 'pendente') {
      return { ok: false, message: `Esta revisão já está ${revisao.estado}.` }
    }
    // O ponto de liberação: só aqui o resultado ganha um caminho "de saída".
    const liberado = path.join(pastaDe(revisao.id), 'liberado.md')
    fs.copyFileSync(path.join(pastaDe(revisao.id), 'entrega.md'), liberado)
    revisao.estado = 'aprovada'
    revisao.liberado = liberado
    revisao.historico.push({ em: agora().toISOString(), evento: 'aprovada' })
    salvar(revisao)
    return { ok: true, revisao }
  }

  function recusar(id, motivo) {
    const texto = String(motivo ?? '').trim()
    if (!texto) return { ok: false, message: 'Informe o motivo: --motivo "..."' }
    const { ok, revisao, message } = resolverId(id)
    if (!ok) return { ok, message }
    if (!revisao) return { ok: false, message: 'Revisão não encontrada.' }
    if (revisao.estado !== 'pendente') {
      return { ok: false, message: `Esta revisão já está ${revisao.estado}.` }
    }
    revisao.estado = revisao.rodada >= LIMITE_DE_RECUSAS ? 'escalada' : 'recusada'
    revisao.motivo = texto
    revisao.historico.push({ em: agora().toISOString(), evento: revisao.estado, motivo: texto })
    salvar(revisao)
    fs.appendFileSync(
      path.join(pasta, 'recusas.md'),
      `- ${agora().toISOString()} · ${revisao.arquivo} · rodada ${revisao.rodada}/${LIMITE_DE_RECUSAS} · ${revisao.id} · ${texto.replace(/\s+/g, ' ')}\n`,
      'utf8',
    )
    return { ok: true, revisao }
  }

  function lerEntrega(id) {
    const revisao = ler(id)
    if (!revisao) return null
    return fs.readFileSync(path.join(pastaDe(revisao.id), 'entrega.md'), 'utf8')
  }

  return { enviar, aprovar, recusar, ler, lerEntrega, listar, pendentes }
}

module.exports = { LIMITE_DE_RECUSAS, criarRepositorioDeRevisoes }

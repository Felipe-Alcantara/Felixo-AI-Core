'use strict'

/**
 * @module agent-command-output
 * Como o plano do Fetch All vira texto para um agente ler.
 *
 * Separado do executável de propósito: aqui não há disco, processo nem
 * `process.exit`, então o formato tem teste de verdade. O executável só junta
 * as peças.
 *
 * O texto é escrito para um leitor que decide o que fazer a seguir, não para um
 * humano admirar: primeiro o número, depois a lista, e sempre a frase que diz
 * o que o próprio agente **não** pode fazer.
 */

const { REPO_STATE_LABELS } = require('../services/fetch-all/repo-analyzer.cjs')

/** Frase que fecha toda saída de varredura. É a regra do produto, não enfeite. */
const AVISO_ESCRITA =
  'Escrita (pull/push/commit) não acontece por este comando. Use ' +
  '`felixo fetch-all pedir-execucao` para deixar um pedido; quem confirma é a ' +
  'pessoa, no painel do Fetch All.'

/**
 * Resume o plano em texto.
 *
 * @param {object} plano - o `plan` devolvido pelo serviço.
 * @param {object} [extras]
 * @param {string} [extras.modo] - como a varredura foi feita (cache ou completa).
 * @param {string} [extras.relatorio] - caminho do relatório Markdown gravado.
 * @returns {string}
 */
function formatarPlano(plano, extras = {}) {
  if (!plano || typeof plano !== 'object') {
    return 'Nenhum plano disponível. Rode `felixo fetch-all varrer` primeiro.'
  }

  const linhas = [
    `Fetch All — ${plano.total ?? 0} repositório(s) analisado(s)${
      extras.modo ? ` (varredura ${extras.modo})` : ''
    }`,
    '',
    `  em dia:        ${contar(plano.upToDate)}`,
    `  precisam pull: ${contar(plano.toPull)}`,
    `  precisam push: ${contar(plano.toPush)}`,
    `  com problema:  ${contar(plano.problems)}`,
  ]

  for (const [titulo, lista] of [
    ['Precisam de pull', plano.toPull],
    ['Precisam de push', plano.toPush],
    ['Com problema', plano.problems],
  ]) {
    const itens = Array.isArray(lista) ? lista : []

    if (itens.length === 0) {
      continue
    }

    linhas.push('', `${titulo}:`)
    for (const repositorio of itens) {
      linhas.push(`  - ${descreverRepositorio(repositorio)}`)
    }
  }

  if (extras.relatorio) {
    linhas.push('', `Relatório completo: ${extras.relatorio}`)
  }

  linhas.push('', AVISO_ESCRITA)
  return linhas.join('\n')
}

/**
 * Uma linha por repositório: caminho, estado legível e o que está pendente.
 *
 * @param {object} repositorio
 * @returns {string}
 */
function descreverRepositorio(repositorio) {
  const rotulo = REPO_STATE_LABELS[repositorio?.state] ?? repositorio?.state ?? 'desconhecido'
  const detalhes = []

  if (repositorio?.behind > 0) detalhes.push(`${repositorio.behind} atrás`)
  if (repositorio?.ahead > 0) detalhes.push(`${repositorio.ahead} à frente`)
  if (repositorio?.branch) detalhes.push(repositorio.branch)

  const sufixo = detalhes.length > 0 ? ` (${detalhes.join(', ')})` : ''
  return `${repositorio?.path ?? '?'} — ${rotulo}${sufixo}`
}

/**
 * @param {unknown} lista
 * @returns {number}
 */
function contar(lista) {
  return Array.isArray(lista) ? lista.length : 0
}

/** Texto de ajuda. É a primeira coisa que um agente lê ao descobrir o comando. */
const AJUDA = `felixo fetch-all — varre os repositórios git da máquina e reporta o que está fora de sincronia.

  felixo fetch-all varrer [--cache] [--json]
      Analisa os repositórios e imprime o plano. Só lê; não escreve em nada.
      --cache  reaproveita a lista de repositórios da última varredura completa.
      --json   imprime o plano cru, para processar em vez de ler.

  felixo fetch-all estado [--json]
      Mostra o plano da última varredura, sem varrer de novo.

  felixo fetch-all pedir-execucao [--com-commit]
      Deixa um pedido para o app aplicar o plano (pull/push). A pessoa confirma
      no painel do Fetch All; este comando nunca escreve por conta própria.
      --com-commit  inclui no pedido os repositórios cuja única pendência é commitar.

  felixo fetch-all ver-pedido <id> [--json]
      Diz se um pedido já foi confirmado, recusado ou continua esperando.

${AVISO_ESCRITA}`

module.exports = {
  AJUDA,
  AVISO_ESCRITA,
  descreverRepositorio,
  formatarPlano,
}

'use strict'

/**
 * @module review-command
 * `felixo revisao ...`: o pareamento produtor × checador.
 *
 * O produtor roda `enviar` e fica bloqueado até o checador decidir (mesmo
 * modelo de `felixo perguntar`); o resultado só ganha caminho de saída quando
 * o checador roda `aprovar`. Ver agent-review-store.cjs.
 */

const { getAppPaths } = require('../core/app-paths.cjs')
const { LIMITE_DE_RECUSAS, criarRepositorioDeRevisoes } = require('../services/agent-review-store.cjs')

const ESPERA_PADRAO_S = 600
const INTERVALO_MS = 1000

const AJUDA_REVISAO = `felixo revisao — o resultado do produtor só sai depois do checador aprovar.

Produtor:
  felixo revisao enviar <arquivo.md> [--esperar <segundos>]
      Envia o resultado ao checador e espera a decisão (padrão ${ESPERA_PADRAO_S} s).
      Aprovado: imprime o caminho liberado. Recusado: imprime o motivo; corrija e envie de novo.
      Depois de ${LIMITE_DE_RECUSAS} recusas seguidas do mesmo arquivo, pare e avise a pessoa.
Checador:
  felixo revisao pendentes            lista o que espera revisão
  felixo revisao ler [id]             mostra o resultado retido
  felixo revisao aprovar [id]         libera o resultado
  felixo revisao recusar [id] --motivo "..."   recusa e registra o motivo
Qualquer um:
  felixo revisao status [id]`

/** Separa posicionais de --motivo/--esperar (aceita "--chave valor" e "--chave=valor"). */
function interpretar(argumentos) {
  const posicionais = []
  const opcoes = {}
  for (let i = 0; i < argumentos.length; i += 1) {
    const item = argumentos[i]
    if (!item.startsWith('--')) {
      posicionais.push(item)
      continue
    }
    const igual = item.indexOf('=')
    if (igual > 2) {
      opcoes[item.slice(2, igual)] = item.slice(igual + 1)
    } else if (['motivo', 'esperar'].includes(item.slice(2))) {
      opcoes[item.slice(2)] = argumentos[i + 1] ?? ''
      i += 1
    } else {
      opcoes[item.slice(2)] = true
    }
  }
  return { posicionais, opcoes }
}

const esperarPadrao = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function descrever(revisao) {
  return `${revisao.id} · ${revisao.estado} · rodada ${revisao.rodada}/${LIMITE_DE_RECUSAS} · ${revisao.arquivo}`
}

/**
 * @param {string[]} argumentos - o que vem depois de `revisao`.
 * @param {{ criarRevisoes?: Function, diretorioAtual?: Function, esperar?: Function }} [dependencias]
 * @returns {Promise<{ saida: string, erro?: string, codigo: number }>}
 */
async function executarRevisao(argumentos, dependencias = {}) {
  const {
    criarRevisoes = () => criarRepositorioDeRevisoes({ pasta: getAppPaths().agentReviews }),
    diretorioAtual = () => process.cwd(),
    esperar = esperarPadrao,
  } = dependencias
  const { posicionais, opcoes } = interpretar(argumentos)
  const [verbo, argumento] = posicionais
  const revisoes = criarRevisoes()
  const falha = (message, codigo = 2) => ({ saida: '', erro: message, codigo })

  switch (verbo) {
    case 'enviar': {
      if (!argumento) return falha('Informe o arquivo: felixo revisao enviar <arquivo.md>')
      const segundos = opcoes.esperar === undefined ? ESPERA_PADRAO_S : Number(opcoes.esperar)
      if (!Number.isFinite(segundos) || segundos < 0) return falha('--esperar precisa ser um número de segundos.')

      const enviada = revisoes.enviar({ arquivo: argumento, produtor: diretorioAtual(), reiniciar: opcoes.reiniciar === true })
      if (!enviada.ok) return falha(enviada.message, 4)

      let atual = enviada.revisao
      for (let gasto = 0; atual.estado === 'pendente' && gasto < segundos * 1000; gasto += INTERVALO_MS) {
        await esperar(INTERVALO_MS)
        atual = revisoes.ler(atual.id) ?? atual
      }

      if (atual.estado === 'pendente') {
        return {
          saida: `Revisão ${atual.id} enviada, mas o checador ainda não decidiu. O resultado continua retido.\nPara conferir: felixo revisao status ${atual.id}`,
          codigo: 1,
        }
      }
      if (atual.estado === 'aprovada') {
        return { saida: `APROVADO. Resultado liberado em: ${atual.liberado}`, codigo: 0 }
      }
      const fim = atual.estado === 'escalada'
        ? `Foram ${LIMITE_DE_RECUSAS} recusas seguidas: pare e avise a pessoa.`
        : 'Corrija e envie de novo com felixo revisao enviar.'
      return { saida: `RECUSADO (rodada ${atual.rodada}/${LIMITE_DE_RECUSAS}): ${atual.motivo}\nO resultado NÃO foi liberado. ${fim}`, codigo: 3 }
    }
    case 'pendentes': {
      const abertas = revisoes.pendentes()
      return { saida: abertas.length ? abertas.map(descrever).join('\n') : 'Nenhuma revisão pendente.', codigo: 0 }
    }
    case 'ler': {
      const alvo = argumento ?? (revisoes.pendentes().length === 1 ? revisoes.pendentes()[0].id : '')
      const texto = alvo ? revisoes.lerEntrega(alvo) : null
      return texto === null ? falha('Informe o id da revisão (veja felixo revisao pendentes).') : { saida: texto, codigo: 0 }
    }
    case 'aprovar': {
      const resultado = revisoes.aprovar(argumento)
      return resultado.ok ? { saida: `Aprovada: ${descrever(resultado.revisao)}`, codigo: 0 } : falha(resultado.message)
    }
    case 'recusar': {
      const resultado = revisoes.recusar(argumento, opcoes.motivo)
      if (!resultado.ok) return falha(resultado.message)
      const extra = resultado.revisao.estado === 'escalada' ? `\nLimite de ${LIMITE_DE_RECUSAS} recusas atingido: a pessoa precisa decidir.` : ''
      return { saida: `Recusada: ${descrever(resultado.revisao)}\nMotivo registrado.${extra}`, codigo: 0 }
    }
    case 'status': {
      const revisao = argumento ? revisoes.ler(argumento) : revisoes.listar().pop()
      return revisao ? { saida: descrever(revisao) + (revisao.motivo ? `\nMotivo: ${revisao.motivo}` : ''), codigo: 0 } : falha('Revisão não encontrada.')
    }
    default:
      return { saida: AJUDA_REVISAO, codigo: 2 }
  }
}

module.exports = { AJUDA_REVISAO, executarRevisao }

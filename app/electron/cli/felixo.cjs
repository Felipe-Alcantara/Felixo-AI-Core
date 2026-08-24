'use strict'

/**
 * @module felixo
 * O comando `felixo`, exposto no PATH dos terminais que o canvas abre.
 *
 * Existe para que **qualquer** agente — Claude, Codex, Gemini, o que vier —
 * consiga usar as ferramentas do app sem saber nada da nossa arquitetura: ele
 * roda um comando e lê texto, como faria com `git` ou `ls`.
 *
 * Este processo é Node puro. Ele não fala com o Electron, não abre porta e não
 * carrega nada do renderer: o Fetch All inteiro (`fetch-all-service` e os
 * módulos em `fetch-all/`) não depende do Electron, e `getAppPaths()` resolve as
 * mesmas pastas do app mesmo fora dele. Então a varredura roda aqui, no
 * processo do agente, lendo a mesma configuração e gravando o mesmo relatório.
 *
 * O que **não** roda aqui é escrita. `pull`, `push` e `commit` continuam
 * existindo só dentro do app, atrás de um clique da pessoa. Este comando sabe
 * apenas deixar um pedido — e a garantia é estrutural: o código que escreve não
 * está no caminho que o agente alcança.
 */

const { getAppPaths } = require('../core/app-paths.cjs')
const { createFetchAllService } = require('../services/fetch-all-service.cjs')
const { criarRepositorioDePedidos } = require('../services/fetch-all/agent-requests.cjs')
const { AJUDA, formatarPlano } = require('./agent-command-output.cjs')

/**
 * Interpreta a linha de comando.
 *
 * Função pura, e é onde mora a regra de segurança: o verbo é procurado numa
 * lista fechada. Um verbo desconhecido vira ajuda, nunca uma tentativa.
 *
 * @param {string[]} argumentos - `process.argv.slice(2)`.
 * @returns {{ ferramenta: string, verbo: string, opcoes: Record<string, boolean> }}
 */
function interpretarArgumentos(argumentos) {
  const positivos = argumentos.filter((item) => !item.startsWith('--'))
  const opcoes = {}

  for (const item of argumentos) {
    if (item.startsWith('--')) {
      opcoes[item.slice(2)] = true
    }
  }

  return {
    ferramenta: positivos[0] ?? '',
    verbo: positivos[1] ?? '',
    argumento: positivos[2] ?? '',
    opcoes,
  }
}

/** Verbos aceitos. Lista fechada: nada de escrita mora aqui. */
const VERBOS = ['varrer', 'estado', 'pedir-execucao', 'ver-pedido']

/**
 * Executa o comando e devolve o que imprimir e com qual código de saída.
 *
 * Recebe as dependências por parâmetro para o teste não precisar de disco real
 * nem de uma varredura de verdade.
 *
 * @param {string[]} argumentos
 * @param {object} [dependencias]
 * @returns {Promise<{ saida: string, erro?: string, codigo: number }>}
 */
async function executar(argumentos, dependencias = {}) {
  const {
    criarServico = () => criarServicoPadrao(),
    criarPedidos = () => criarRepositorioDePedidos({ pasta: getAppPaths().agentRequests }),
    diretorioAtual = () => process.cwd(),
    gravarRelatorio = gravarRelatorioPadrao,
  } = dependencias

  const { ferramenta, verbo, argumento, opcoes } = interpretarArgumentos(argumentos)

  if (ferramenta !== 'fetch-all' || !VERBOS.includes(verbo)) {
    return { saida: AJUDA, codigo: ferramenta || verbo ? 2 : 0 }
  }

  if (verbo === 'pedir-execucao') {
    const pedido = criarPedidos().registrar('executar-plano', {
      comCommit: opcoes['com-commit'] === true,
      origem: diretorioAtual(),
    })

    return {
      saida: [
        `Pedido registrado: ${pedido.id}`,
        pedido.comCommit
          ? 'Inclui os repositórios cuja única pendência é commitar.'
          : 'Só pull e push; commitar não foi pedido.',
        '',
        'O pedido está esperando confirmação no painel do Fetch All. Avise a',
        'pessoa — nada acontece até ela clicar. Para acompanhar:',
        `  felixo fetch-all ver-pedido ${pedido.id}`,
      ].join('\n'),
      codigo: 0,
    }
  }

  if (verbo === 'ver-pedido') {
    const pedido = argumento ? criarPedidos().ler(argumento) : null

    if (!pedido) {
      return { saida: '', erro: `Pedido não encontrado: ${argumento || '(sem id)'}`, codigo: 1 }
    }

    return {
      saida: opcoes.json ? JSON.stringify(pedido, null, 2) : descreverPedido(pedido),
      codigo: 0,
    }
  }

  const servico = criarServico()

  if (verbo === 'estado') {
    const estado = servico.getState()
    return {
      saida: opcoes.json
        ? JSON.stringify(estado, null, 2)
        : formatarPlano(estado.plan, { modo: estado.scanMode }),
      codigo: 0,
    }
  }

  const resultado = await servico.scan({ useCache: opcoes.cache === true })

  if (!resultado?.ok) {
    return {
      saida: '',
      erro: resultado?.message || 'A varredura não pôde ser concluída.',
      codigo: 1,
    }
  }

  if (resultado.cancelled) {
    return { saida: 'Varredura cancelada.', codigo: 0 }
  }

  // O painel mostra o plano na tela e só grava relatório ao executar. Aqui não
  // há tela: se a passada do agente não deixar arquivo, ela não deixa rastro
  // nenhum — e o Fetch All existe justamente para ser auditável.
  const relatorio = await gravarRelatorio(resultado)

  return {
    saida: opcoes.json
      ? JSON.stringify({ ...resultado, reportPath: relatorio }, null, 2)
      : formatarPlano(resultado.plan, { modo: resultado.scanMode, relatorio }),
    codigo: 0,
  }
}

/**
 * Grava o relatório Markdown da varredura.
 *
 * Falha aqui não derruba o comando: o agente já tem o plano na mão, e perder o
 * arquivo de auditoria é pior do que não ter varrido? Não — então o plano é
 * entregue e o caminho volta vazio.
 *
 * @param {{ plan: object, scanMode?: string }} resultado
 * @returns {Promise<string>}
 */
async function gravarRelatorioPadrao(resultado) {
  try {
    const { writeRunReport } = require('../services/fetch-all/run-report.cjs')

    return await writeRunReport({
      reportsDir: getAppPaths().reports,
      plan: resultado.plan,
      results: [],
      executed: false,
      scanMode: resultado.scanMode || 'não informada',
      when: new Date(),
    })
  } catch {
    return ''
  }
}

/**
 * Descreve um pedido em uma linha por fato.
 *
 * @param {object} pedido
 * @returns {string}
 */
function descreverPedido(pedido) {
  const estados = {
    pendente: 'ainda esperando a confirmação da pessoa no painel',
    aceito: 'confirmado e executado pelo app',
    recusado: 'recusado — nada foi escrito',
  }

  return [
    `Pedido ${pedido.id}`,
    `  estado: ${pedido.estado} (${estados[pedido.estado] ?? 'desconhecido'})`,
    `  pedido em: ${pedido.pedidoEm}`,
    pedido.resolvidoEm ? `  resolvido em: ${pedido.resolvidoEm}` : null,
  ]
    .filter(Boolean)
    .join('\n')
}

/**
 * Monta o serviço do Fetch All apontado para as mesmas pastas do app.
 *
 * Sem `sendEvent`: não há renderer do outro lado. O progresso da varredura
 * simplesmente não é publicado; o agente recebe o resultado no fim.
 *
 * @returns {object}
 */
function criarServicoPadrao() {
  const { config, cache, reports } = getAppPaths()
  return createFetchAllService({ appPaths: { config, cache, reports } })
}

/* c8 ignore start — casca de processo; o comportamento está em `executar`. */
if (require.main === module) {
  executar(process.argv.slice(2))
    .then(({ saida, erro, codigo }) => {
      if (saida) process.stdout.write(`${saida}\n`)
      if (erro) process.stderr.write(`${erro}\n`)
      process.exitCode = codigo
    })
    .catch((error) => {
      process.stderr.write(`${error?.message ?? 'Falha inesperada.'}\n`)
      process.exitCode = 1
    })
}
/* c8 ignore stop */

module.exports = { executar, interpretarArgumentos, VERBOS }

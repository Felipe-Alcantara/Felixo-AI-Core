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
const {
  VALIDADE_MS,
  criarRepositorioDePedidos,
  pedidoAindaVale,
} = require('../services/fetch-all/agent-requests.cjs')
const { loadAgentScanState, saveAgentScanState } = require('./agent-scan-state.cjs')
const { AJUDA, formatarElementos, formatarLeitura, formatarPlano } = require('./agent-command-output.cjs')
const { executarContexto } = require('./context-command.cjs')
const { executarRevisao } = require('./review-command.cjs')

/**
 * O DevTools usa scripts de desenvolvimento que não existem no app empacotado.
 * Ele só pode ser carregado quando esse subcomando for solicitado; um import
 * no topo faria até `felixo context read` falhar antes de ser roteado.
 *
 * @returns {{ AJUDA_DEVTOOLS: string, executarDevtools: Function }}
 */
function carregarDevtools() {
  return require('./felixo-devtools.cjs')
}

const AJUDA_DEVTOOLS_FALLBACK = `felixo devtools — automação da instância de desenvolvimento.

O subcomando DevTools não está disponível nesta instalação empacotada.`

/**
 * A ajuda geral continua disponível mesmo quando os scripts opcionais de
 * desenvolvimento não foram incluídos no pacote de produção.
 *
 * @returns {string}
 */
function obterAjudaDevtools() {
  try {
    return carregarDevtools().AJUDA_DEVTOOLS
  } catch {
    return AJUDA_DEVTOOLS_FALLBACK
  }
}

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
      // `--chave=valor` guarda o valor (texto); `--chave` sozinha é uma opção
      // ligada. Só `--profile=Nome` usa o valor; o resto continua booleano.
      const igual = item.indexOf('=')
      if (igual > 2) {
        opcoes[item.slice(2, igual)] = item.slice(igual + 1)
      } else {
        opcoes[item.slice(2)] = true
      }
    }
  }

  return {
    ferramenta: positivos[0] ?? '',
    verbo: positivos[1] ?? '',
    argumento: positivos[2] ?? '',
    // Só `canvas escrever <id> <conteúdo>` usa um segundo argumento; os
    // demais verbos ignoram este campo. Contar em vez de checar verdade:
    // "" é um conteúdo válido (limpar a nota), e precisa se distinguir de
    // "o argumento nem foi passado".
    argumento2: positivos[3] ?? '',
    argumento2Fornecido: positivos.length > 3,
    // `perguntar "<pergunta>" <opção> <opção> ...`: tudo depois do verbo.
    restantes: positivos.slice(2),
    opcoes,
  }
}

/** Verbos aceitos. Lista fechada: nada de escrita mora aqui. */
const VERBOS = ['varrer', 'estado', 'pedir-execucao', 'ver-pedido']
const FERRAMENTAS_BROWSER = ['browser', 'navegador']
const FERRAMENTAS_CONTEXT = ['context', 'contexto']
const FERRAMENTAS_CANVAS = ['canvas']
const VERBOS_BROWSER_ABRIR = ['open', 'abrir']
const VERBOS_BROWSER_STATUS = ['status', 'ver-pedido']
// Olhar um bloco Página Web: só leitura, mas sempre com a permissão da pessoa.
const VERBOS_BROWSER_CAPTURA = ['capture', 'captura', 'capturar']
const VERBOS_BROWSER_DOM = ['read', 'ler']
const VERBOS_BROWSER_LOGS = ['logs', 'log']
// Agir num bloco Página Web: só dentro de uma sessão curta que a pessoa abre no app.
const VERBOS_BROWSER_CLICAR = ['click', 'clicar']
const VERBOS_BROWSER_DIGITAR = ['type', 'digitar']
const VERBOS_BROWSER_ROLAR = ['scroll', 'rolar']
const VERBOS_BROWSER_TECLA = ['key', 'tecla']
const VERBOS_CANVAS_LISTAR = ['listar']
const VERBOS_CANVAS_LER = ['ler']
const FERRAMENTAS_PERGUNTAR = ['perguntar']
// Pergunta espera um clique humano, que demora mais que uma leitura: o agente
// precisa da resposta no stdout, então este comando BLOQUEIA até responderem.
const PERGUNTAR_ESPERA_MAXIMA_MS = 5 * 60 * 1000
const PERGUNTAR_ESPERA_INTERVALO_MS = 500
const VERBOS_CANVAS_ESCREVER = ['escrever']
const VERBOS_CANVAS_STATUS = ['ver-pedido']
const VERBOS_CANVAS_ABRIR_AGENTES = ['abrir-agentes']
// Leitura é auto-resolvida pelo app (sem confirmação humana — ver
// agent-canvas-read-ipc-handlers.cjs), então uma espera curta aqui poupa o
// agente de ter que rodar "ver-pedido" ele mesmo no caso comum (app aberto).
const CANVAS_ESPERA_MAXIMA_MS = 4000
const CANVAS_ESPERA_INTERVALO_MS = 150

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
  if (argumentos[0] === 'devtools') {
    try {
      const { executarDevtools } = carregarDevtools()
      return executarDevtools(argumentos.slice(1), dependencias.devtools)
    } catch (error) {
      return {
        saida: '',
        erro: `O comando DevTools não está disponível nesta instalação. ${error?.message ?? ''}`.trim(),
        codigo: 1,
      }
    }
  }
  if (FERRAMENTAS_CONTEXT.includes(argumentos[0])) {
    return executarContexto(argumentos.slice(1), dependencias.contexto)
  }
  if (argumentos[0] === 'revisao') {
    return executarRevisao(argumentos.slice(1), dependencias.revisao)
  }
  const {
    criarServico = () => criarServicoPadrao(),
    criarPedidos = () => criarRepositorioDePedidos({ pasta: getAppPaths().agentRequests }),
    diretorioAtual = () => process.cwd(),
    gravarRelatorio = gravarRelatorioPadrao,
    gravarEstado = gravarEstadoPadrao,
    lerEstado = lerEstadoPadrao,
    agora = () => Date.now(),
  } = dependencias

  const { ferramenta, verbo, argumento, argumento2, argumento2Fornecido, restantes, opcoes } =
    interpretarArgumentos(argumentos)

  if (FERRAMENTAS_BROWSER.includes(ferramenta)) {
    if (VERBOS_BROWSER_ABRIR.includes(verbo)) {
      if (!argumento) {
        return { saida: '', erro: 'Informe a URL da página a abrir.', codigo: 2 }
      }

      try {
        const perfil = opcoes.profile ?? opcoes.perfil
        if (perfil === true) {
          return { saida: '', erro: 'Informe o perfil com --profile=<nome> (sem espaço antes do nome).', codigo: 2 }
        }
        const pedido = criarPedidos().registrar('abrir-pagina', {
          url: argumento,
          modo: opcoes.embedded === true || opcoes.embutido === true ? 'embutido' : 'externo',
          ...(typeof perfil === 'string' ? { perfil } : {}),
          origem: diretorioAtual(),
        })

        if (opcoes.json === true) {
          return { saida: JSON.stringify({ ok: true, pedido }, null, 2), codigo: 0 }
        }

        return {
          saida: [
            `Pedido registrado: ${pedido.id}`,
            `URL: ${pedido.url}`,
            `Destino: ${pedido.modo}`,
            ...(pedido.perfil ? [`Perfil: ${pedido.perfil}`] : []),
            '',
            'Nada abre sozinho: o app mostra o pedido e a pessoa escolhe entre o',
            'navegador, a Página Web ou recusar. O destino acima é só a sugestão.',
            `Para acompanhar: felixo browser status ${pedido.id}`,
          ].join('\n'),
          codigo: 0,
        }
      } catch (error) {
        return {
          saida: '',
          erro: error instanceof Error ? error.message : 'Nao foi possivel registrar o pedido.',
          codigo: 2,
        }
      }
    }

    const tipoDeInspecao = VERBOS_BROWSER_CAPTURA.includes(verbo) ? 'captura' : VERBOS_BROWSER_DOM.includes(verbo) ? 'dom' : VERBOS_BROWSER_LOGS.includes(verbo) ? 'logs' : null
    const tipoDeAcao = VERBOS_BROWSER_CLICAR.includes(verbo) ? 'clicar' : VERBOS_BROWSER_DIGITAR.includes(verbo) ? 'digitar' : VERBOS_BROWSER_ROLAR.includes(verbo) ? 'rolar' : VERBOS_BROWSER_TECLA.includes(verbo) ? 'tecla' : null
    if (tipoDeInspecao || tipoDeAcao) {
      const { esperar = esperarPadrao, esperaMaximaMs = PERGUNTAR_ESPERA_MAXIMA_MS } = dependencias
      if (!argumento) {
        return { saida: '', erro: 'Informe o id do bloco Página Web (veja "felixo canvas listar").', codigo: 2 }
      }
      let pedido
      try {
        pedido = tipoDeAcao
          ? criarPedidos().registrar('pagina-agir', {
              idDoElemento: argumento,
              tipo: tipoDeAcao,
              ...(tipoDeAcao === 'clicar'
                ? { x: argumento2, y: restantes[2] }
                : tipoDeAcao === 'rolar'
                  ? { dy: argumento2 }
                  : tipoDeAcao === 'tecla'
                    ? { tecla: argumento2 }
                    : { texto: argumento2 }),
              origem: diretorioAtual(),
            })
          : criarPedidos().registrar('pagina-inspecionar', {
              idDoElemento: argumento,
              tipo: tipoDeInspecao,
              origem: diretorioAtual(),
            })
      } catch (error) {
        return { saida: '', erro: error instanceof Error ? error.message : 'Não foi possível registrar o pedido.', codigo: 2 }
      }

      // Bloqueia até a pessoa decidir (como `perguntar`): o agente precisa do
      // resultado no stdout, e nada acontece na página sem o clique dela.
      const resolvido = await aguardarResolucao(criarPedidos(), pedido.id, esperar, {
        maximoMs: esperaMaximaMs,
        intervaloMs: PERGUNTAR_ESPERA_INTERVALO_MS,
      })
      if (!resolvido) {
        return {
          saida: [
            `Pedido registrado (${pedido.id}), mas a pessoa não respondeu a tempo.`,
            `Para conferir depois: felixo browser status ${pedido.id} --json`,
          ].join('\n'),
          codigo: 1,
        }
      }
      if (resolvido.estado !== 'aceito' || !resolvido.resultado?.ok) {
        const motivo = resolvido.resultado?.recusadoPor === 'pessoa' ? 'A pessoa recusou. Não repita o pedido sem ela pedir.' : (resolvido.resultado?.message ?? 'Pedido recusado.')
        return {
          saida: opcoes.json ? JSON.stringify({ ok: false, pedido: resolvido.id, estado: resolvido.estado, ...resolvido.resultado }, null, 2) : motivo,
          codigo: 3,
        }
      }
      return {
        saida: opcoes.json
          ? JSON.stringify(resolvido.resultado, null, 2)
          : tipoDeAcao
            ? formatarAcaoNaPagina(resolvido.resultado)
            : formatarInspecaoDePagina(resolvido.resultado),
        codigo: 0,
      }
    }

    if (VERBOS_BROWSER_STATUS.includes(verbo)) {
      const pedido = argumento ? criarPedidos().ler(argumento) : null

      if (!pedido) {
        return { saida: '', erro: `Pedido nao encontrado: ${argumento || '(sem id)'}`, codigo: 1 }
      }

      return {
        saida: opcoes.json ? JSON.stringify(pedido, null, 2) : descreverPedido(pedido, agora()),
        codigo: 0,
      }
    }

    return { saida: `${AJUDA}\n\n${obterAjudaDevtools()}`, codigo: 2 }
  }

  if (FERRAMENTAS_PERGUNTAR.includes(ferramenta)) {
    const { esperar = esperarPadrao, esperaMaximaMs = PERGUNTAR_ESPERA_MAXIMA_MS } = dependencias
    // O "verbo" posicional é a própria pergunta; as opções vêm depois dela.
    const pergunta = verbo
    if (!pergunta) {
      return { saida: '', erro: 'Informe a pergunta: felixo perguntar "<pergunta>" "<opção 1>" "<opção 2>" ...', codigo: 2 }
    }

    let pedido
    try {
      pedido = criarPedidos().registrar('perguntar', { pergunta, opcoes: restantes, origem: diretorioAtual() })
    } catch (error) {
      return { saida: '', erro: error instanceof Error ? error.message : 'Não foi possível registrar a pergunta.', codigo: 2 }
    }

    const resolvido = await aguardarResolucao(criarPedidos(), pedido.id, esperar, {
      maximoMs: esperaMaximaMs,
      intervaloMs: PERGUNTAR_ESPERA_INTERVALO_MS,
    })

    if (!resolvido) {
      return {
        saida: [
          `Pergunta registrada (${pedido.id}), mas ninguém respondeu a tempo.`,
          `Para conferir depois: felixo canvas ver-pedido ${pedido.id}`,
        ].join('\n'),
        codigo: 1,
      }
    }

    if (resolvido.estado !== 'aceito' || !resolvido.resultado?.ok) {
      return {
        saida: opcoes.json ? JSON.stringify({ ok: false, pedido: resolvido.id, estado: resolvido.estado }, null, 2) : 'A pessoa dispensou a pergunta sem escolher uma opção.',
        codigo: 3,
      }
    }

    return {
      saida: opcoes.json ? JSON.stringify(resolvido.resultado, null, 2) : resolvido.resultado.label,
      codigo: 0,
    }
  }

  if (FERRAMENTAS_CANVAS.includes(ferramenta)) {
    const { esperar = esperarPadrao } = dependencias

    // Escrita NUNCA é auto-resolvida (ver agent-canvas-write-ipc-handlers.cjs):
    // fica esperando um clique real da pessoa no painel, que pode demorar
    // minutos. Por isso este comando não espera nada — registra e devolve na
    // hora, com o id para acompanhar depois, igual a "browser abrir".
    if (VERBOS_CANVAS_ESCREVER.includes(verbo)) {
      if (!argumento) {
        return { saida: '', erro: 'Informe o id do elemento a escrever (veja "felixo canvas listar").', codigo: 2 }
      }
      if (!argumento2Fornecido) {
        return { saida: '', erro: 'Informe o conteúdo a escrever (pode ser vazio: "").', codigo: 2 }
      }

      try {
        const pedido = criarPedidos().registrar('canvas-escrever', {
          idDoElemento: argumento,
          conteudo: argumento2,
          origem: diretorioAtual(),
        })

        if (opcoes.json === true) {
          return { saida: JSON.stringify({ ok: true, pedido }, null, 2), codigo: 0 }
        }

        return {
          saida: [
            `Pedido registrado: ${pedido.id}`,
            `Elemento: ${pedido.idDoElemento}`,
            '',
            'Escrita depende de confirmação humana no painel "Pedidos de escrita" do canvas.',
            `Para acompanhar: felixo canvas ver-pedido ${pedido.id}`,
          ].join('\n'),
          codigo: 0,
        }
      } catch (error) {
        return {
          saida: '',
          erro: error instanceof Error ? error.message : 'Não foi possível registrar o pedido.',
          codigo: 2,
        }
      }
    }

    if (VERBOS_CANVAS_LISTAR.includes(verbo)) {
      const pedido = criarPedidos().registrar('canvas-listar', { origem: diretorioAtual() })
      const resolvido = await aguardarResolucao(criarPedidos(), pedido.id, esperar)

      if (!resolvido) return respostaPedidoNaoAtendido(pedido, 'canvas ver-pedido')

      return {
        saida: opcoes.json ? JSON.stringify(resolvido.resultado, null, 2) : formatarElementos(resolvido.resultado?.elementos),
        codigo: 0,
      }
    }

    if (VERBOS_CANVAS_LER.includes(verbo)) {
      if (!argumento) {
        return { saida: '', erro: 'Informe o id do elemento a ler (veja "felixo canvas listar").', codigo: 2 }
      }

      const pedido = criarPedidos().registrar('canvas-ler', { idDoElemento: argumento, origem: diretorioAtual() })
      const resolvido = await aguardarResolucao(criarPedidos(), pedido.id, esperar)

      if (!resolvido) return respostaPedidoNaoAtendido(pedido, 'canvas ver-pedido')

      return {
        saida: opcoes.json ? JSON.stringify(resolvido.resultado, null, 2) : formatarLeitura(resolvido.resultado),
        codigo: resolvido.resultado?.ok ? 0 : 1,
      }
    }

    // Coordenador pede um agente por task. Não abre nada: o pedido espera a
    // pessoa aceitar no painel de aprovações, e o app aplica os tetos do
    // orquestrador. Devolve na hora, com o id para acompanhar, como a escrita.
    if (VERBOS_CANVAS_ABRIR_AGENTES.includes(verbo)) {
      if (restantes.length === 0) {
        return {
          saida: '',
          erro: 'Informe as tasks: felixo canvas abrir-agentes "<task 1>" "<task 2>" ... (a primeira linha de cada uma é o título).',
          codigo: 2,
        }
      }

      try {
        const pedido = criarPedidos().registrar('abrir-agentes', { tarefas: restantes, origem: diretorioAtual() })

        if (opcoes.json === true) {
          return { saida: JSON.stringify({ ok: true, pedido }, null, 2), codigo: 0 }
        }

        return {
          saida: [
            `Pedido registrado: ${pedido.id}`,
            `Tasks: ${pedido.tarefas.length}`,
            ...pedido.tarefas.map((tarefa, indice) => `  ${indice + 1}. ${tarefa.titulo}`),
            '',
            'Nada abre sozinho: a pessoa aceita ou recusa no painel de aprovações do canvas,',
            'e o app respeita "Agentes por rodada" e "Agentes no total" do orquestrador.',
            'Você coordena; não execute nenhuma dessas tasks.',
            `Para acompanhar: felixo canvas ver-pedido ${pedido.id}`,
          ].join('\n'),
          codigo: 0,
        }
      } catch (error) {
        return {
          saida: '',
          erro: error instanceof Error ? error.message : 'Não foi possível registrar o pedido.',
          codigo: 2,
        }
      }
    }

    if (VERBOS_CANVAS_STATUS.includes(verbo)) {
      const pedido = argumento ? criarPedidos().ler(argumento) : null

      if (!pedido) {
        return { saida: '', erro: `Pedido nao encontrado: ${argumento || '(sem id)'}`, codigo: 1 }
      }

      return {
        saida: opcoes.json ? JSON.stringify(pedido, null, 2) : descreverPedido(pedido),
        codigo: 0,
      }
    }

    return { saida: `${AJUDA}\n\n${obterAjudaDevtools()}`, codigo: 2 }
  }

  if (ferramenta !== 'fetch-all' || !VERBOS.includes(verbo)) {
    return { saida: `${AJUDA}\n\n${obterAjudaDevtools()}`, codigo: ferramenta || verbo ? 2 : 0 }
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
    const estadoAtual = servico.getState()
    const estadoPersistido = estadoAtual.plan ? null : await lerEstado()
    const estado = estadoPersistido
      ? { ...estadoAtual, plan: estadoPersistido.plan, scanMode: estadoPersistido.scanMode }
      : estadoAtual
    return {
      saida: opcoes.json
        ? JSON.stringify(estado, null, 2)
        : formatarPlano(estado.plan, { modo: estado.scanMode }),
      codigo: 0,
    }
  }

  const scanParams = { useCache: opcoes.cache === true }

  if (opcoes['todos-discos'] === true) {
    const scope = await servico.describeScanScope?.()
    scanParams.confirmUnconfiguredScope = true
    scanParams.scopeKey = scope?.scopeKey
  }

  const resultado = await servico.scan(scanParams)

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

  await gravarEstado(resultado)

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
 * Persiste o plano para que uma chamada posterior de `estado` consiga lê-lo.
 * Falha de cache não esconde o resultado que já está na saída do agente.
 *
 * @param {{ plan: object, scanMode?: string }} resultado
 * @returns {Promise<string>}
 */
async function gravarEstadoPadrao(resultado) {
  try {
    const { reports } = getAppPaths()

    return await saveAgentScanState({
      reportsDir: reports,
      plan: resultado.plan,
      scanMode: resultado.scanMode || '',
    })
  } catch {
    return ''
  }
}

/** @returns {Promise<void>} */
function esperarPadrao(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Espera curta e limitada até o app resolver um pedido de leitura — leitura
 * não precisa de clique humano (ver agent-canvas-read-ipc-handlers.cjs), só
 * do app estar aberto e de um instante pra processar a fila. Sem essa
 * espera, o agente teria que rodar "canvas ver-pedido" manualmente pro caso
 * comum (app já aberto), o que é pior experiência sem ganhar nada.
 *
 * @param {ReturnType<typeof criarRepositorioDePedidos>} pedidos
 * @param {string} id
 * @param {(ms: number) => Promise<void>} esperar
 * @returns {Promise<object|null>} o pedido resolvido, ou `null` se o prazo estourou.
 */
async function aguardarResolucao(pedidos, id, esperar, { maximoMs = CANVAS_ESPERA_MAXIMA_MS, intervaloMs = CANVAS_ESPERA_INTERVALO_MS } = {}) {
  const tentativas = Math.ceil(maximoMs / intervaloMs)
  for (let tentativa = 0; tentativa < tentativas; tentativa += 1) {
    const pedido = pedidos.ler(id)
    if (pedido && pedido.estado !== 'pendente') return pedido
    await esperar(intervaloMs)
  }
  return null
}

/**
 * @param {{ id: string }} pedido
 * @param {string} comandoStatus
 * @returns {{ saida: string, codigo: number }}
 */
function formatarAcaoNaPagina(resultado) {
  const feito =
    resultado.tipo === 'clicar'
      ? `Clique em (${resultado.x},${resultado.y})`
      : resultado.tipo === 'rolar'
        ? `Rolagem de ${resultado.dy}px (posição agora ${resultado.rolagem?.x},${resultado.rolagem?.y})`
        : resultado.tipo === 'tecla'
          ? `Tecla ${resultado.tecla}${resultado.campoSensivel ? ` (campo ${resultado.campoSensivel}, confirmado pela pessoa)` : ''}`
          : `${resultado.caracteres} caractere(s) digitado(s)${resultado.campoSensivel ? ` (campo ${resultado.campoSensivel}, confirmado pela pessoa)` : ''}`
  return [`${feito} na página ${resultado.url}.`, 'Confira o resultado com "felixo browser capture" ou "read".'].join('\n')
}

function formatarInspecaoDePagina(resultado) {
  if (resultado.tipo === 'logs') {
    return [
      `Página: ${resultado.url}`,
      `Entradas: ${resultado.entradas.length} (de ${resultado.total} desde que o bloco abriu; guarda as últimas ${resultado.limite})`,
      ...resultado.entradas.map((entrada) =>
        [entrada.em, entrada.tipo, entrada.nivel ?? (entrada.tipo === 'rede' ? `${entrada.metodo} ${entrada.status}` : ''), entrada.tipo === 'rede' ? entrada.url : (entrada.texto ?? entrada.url), entrada.tipo === 'console' && entrada.origem ? `(${entrada.origem}:${entrada.linha})` : '']
          .filter(Boolean)
          .join(' '),
      ),
    ].join('\n')
  }
  if (resultado.tipo === 'captura') {
    return [
      `Captura: ${resultado.arquivo}`,
      `Página: ${resultado.url}`,
      `Imagem: ${resultado.imagem.largura}x${resultado.imagem.altura} px`,
      `Viewport: ${resultado.viewport.largura}x${resultado.viewport.altura} (devicePixelRatio ${resultado.viewport.devicePixelRatio})`,
    ].join('\n')
  }
  const { viewport } = resultado
  return [
    `Página: ${resultado.url}`,
    `Título: ${resultado.titulo}`,
    `Viewport: ${viewport.largura}x${viewport.altura} (devicePixelRatio ${viewport.devicePixelRatio}, rolagem ${viewport.rolagemX},${viewport.rolagemY})`,
    '',
    'Elementos interativos (x,y,largura,altura em pixels CSS da página):',
    ...resultado.elementos.map((item) => {
      const { x, y, largura, altura } = item.retangulo
      const rotulo = [item.papel || item.tag, item.tipo, item.sensivel ? 'campo sensível' : '', item.desativado ? 'desativado' : '']
        .filter(Boolean)
        .join(' ')
      return `  [${x},${y},${largura},${altura}] ${rotulo}${item.nome ? ` "${item.nome}"` : ''}${item.href ? ` -> ${item.href}` : ''}`
    }),
    '',
    'Texto visível:',
    resultado.texto,
  ].join('\n')
}

function respostaPedidoNaoAtendido(pedido, comandoStatus) {
  return {
    saida: [
      `Pedido registrado (${pedido.id}), mas o app não respondeu a tempo.`,
      'Verifique se o Felixo está aberto e tente de novo, ou confira depois:',
      `  felixo ${comandoStatus} ${pedido.id}`,
    ].join('\n'),
    codigo: 1,
  }
}

/**
 * @returns {Promise<{ plan: object, scanMode: string, scannedAt: string }|null>}
 */
async function lerEstadoPadrao() {
  try {
    return await loadAgentScanState({ reportsDir: getAppPaths().reports })
  } catch {
    return null
  }
}

/**
 * Descreve um pedido em uma linha por fato.
 *
 * @param {object} pedido
 * @param {number} [agora] - para dizer que um pendente de abertura já venceu.
 * @returns {string}
 */
function descreverPedido(pedido, agora = Date.now()) {
  if (pedido.acao === 'abrir-agentes') return descreverPedidoDeAgentes(pedido, agora)
  const pagina = pedido.acao === 'abrir-pagina'
  const estados = pagina
    ? {
        pendente: 'esperando a pessoa escolher no app: navegador, Página Web ou recusar',
        aceito: 'aberto pelo app',
        recusado: 'não abriu',
      }
    : {
        pendente: 'ainda esperando a confirmação da pessoa no painel',
        aceito: 'confirmado e executado pelo app',
        recusado: 'recusado — nada foi escrito',
      }
  const abertoEm = pedido.resultado?.modo === 'embutido' ? 'Página Web (canvas)' : 'navegador'
  const desfecho = (pagina && explicarDesfechoDaPagina(pedido, agora)) || estados[pedido.estado] || 'desconhecido'
  // Recusa gravada antes de `recusadoPor` existir: o motivo em linha própria, como sempre.
  const recusaSemAutor = pagina && pedido.estado === 'recusado' && !pedido.resultado?.recusadoPor

  return [
    `Pedido ${pedido.id}`,
    pedido.acao ? `  ação: ${pedido.acao}` : null,
    pagina ? `  url: ${pedido.url}` : null,
    pagina ? `  destino sugerido: ${pedido.modo}` : null,
    pagina && pedido.perfil ? `  perfil: ${pedido.perfil}` : null,
    `  estado: ${pedido.estado} (${desfecho})`,
    pagina && pedido.estado === 'aceito' ? `  aberto em: ${abertoEm}` : null,
    recusaSemAutor && pedido.resultado?.message ? `  motivo: ${pedido.resultado.message}` : null,
    `  pedido em: ${pedido.pedidoEm}`,
    pedido.resolvidoEm ? `  resolvido em: ${pedido.resolvidoEm}` : null,
  ]
    .filter(Boolean)
    .join('\n')
}

/**
 * Pedido de agentes: o coordenador precisa saber quantos abriram, quais o app
 * recusou pelos tetos (para pedir de novo na rodada seguinte) e se a pessoa
 * recusou (então não repete o pedido sem ela pedir).
 *
 * @param {object} pedido
 * @param {number} agora
 * @returns {string}
 */
function descreverPedidoDeAgentes(pedido, agora) {
  const resultado = pedido.resultado ?? {}
  const vencido = pedido.estado === 'pendente' && !pedidoAindaVale(pedido, agora)
  let desfecho = 'esperando a pessoa aceitar no painel de aprovações do canvas'
  if (vencido) desfecho = `expirou: ninguém respondeu em ${VALIDADE_TEXTO}; o app não mostra mais esse pedido`
  else if (pedido.estado === 'aceito') desfecho = `aceito: ${resultado.abertas ?? 0} agente(s) aberto(s) no canvas`
  else if (pedido.estado === 'recusado') {
    desfecho = resultado.recusadoPor === 'pessoa' ? 'recusado pela pessoa' : 'recusado pelo app'
  }
  const recusadas = Array.isArray(resultado.recusadas) ? resultado.recusadas : []

  return [
    `Pedido ${pedido.id}`,
    '  ação: abrir-agentes',
    `  tasks: ${(pedido.tarefas ?? []).map((tarefa) => tarefa.titulo).join(' | ')}`,
    `  estado: ${pedido.estado} (${desfecho})`,
    pedido.estado === 'recusado' && resultado.message ? `  motivo: ${resultado.message}` : null,
    ...recusadas.map((item) => `  recusada: ${item.titulo} — ${item.motivo}`),
    `  pedido em: ${pedido.pedidoEm}`,
    pedido.resolvidoEm ? `  resolvido em: ${pedido.resolvidoEm}` : null,
  ]
    .filter(Boolean)
    .join('\n')
}

/** A validade da fila como a ajuda e a skill dizem ("1 h"). */
const VALIDADE_TEXTO = `${VALIDADE_MS / (60 * 60 * 1000)} h`

/**
 * Quem decidiu um pedido de abertura, em uma frase — o agente age diferente
 * em cada caso. Só a recusa da pessoa é resposta dela (não se repete o pedido
 * sem ela pedir); a do app traz o motivo, que o agente pode corrigir; e a
 * expiração diz que ninguém respondeu. '' = a frase de sempre do estado.
 *
 * @param {object} pedido
 * @param {number} agora
 * @returns {string}
 */
function explicarDesfechoDaPagina(pedido, agora) {
  // O app resolve o vencido quando está aberto; com ele fechado, o arquivo
  // continua "pendente", mas não vai mais aparecer para a pessoa.
  if (pedido.estado === 'pendente' && !pedidoAindaVale(pedido, agora)) {
    return `expirou: ninguém respondeu em ${VALIDADE_TEXTO}; o app não mostra mais esse pedido`
  }
  if (pedido.estado !== 'recusado') return ''

  const resultado = pedido.resultado ?? {}
  if (resultado.recusadoPor === 'pessoa') return 'recusado pela pessoa'
  if (resultado.recusadoPor !== 'app') return ''
  if (resultado.expirou === true) return `expirou: ninguém respondeu em ${VALIDADE_TEXTO}`
  return `recusado pelo app: ${typeof resultado.message === 'string' ? resultado.message : 'motivo não informado'}`
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

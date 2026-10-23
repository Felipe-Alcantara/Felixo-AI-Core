'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const {
  EXIT,
  RODADAS,
  VEREDITOS,
  buildReport,
  createInstallRecorder,
  createLatestPinner,
  evaluateCycle,
  formatSummary,
  buildPackagedChildEnv,
  isolateEnvironmentForThisProcessOnly,
  launchPackaged,
  main,
  parseArgs,
  planPackagedLaunch,
  runCycle,
  samePath,
} = require('./cli-auto-install-real-repro.cjs')
const { getManagedCliLayout } = require('../electron/core/managed-cli-paths.cjs')
const { getManagedCliManifestEntry } = require('../electron/core/managed-cli-manifest.cjs')
const { getOfficialAiCli } = require('../electron/core/official-cli-catalog.cjs')
const { hasManagedBinary } = require('../electron/services/cli-diagnostics.cjs')

const CLI = 'gemini'
const INTEGRIDADE = `sha512-${'A'.repeat(86)}==`
/** Saídas reais do npm 11.6.2 medidas em 22/10/2026 (ver install-retry.test.cjs). */
const SAIDA_DE_REDE = 'npm error code ENOTFOUND\nnpm error network This is a problem related to network connectivity.'
const SAIDA_QUEBRADA = 'npm error code E404\nnpm error 404 Not Found - GET https://registry.npmjs.org/@google%2fgemini-cli'

// ---------------------------------------------------------------------------
// Ambiente falso: o módulo de produção decide com arquivos de verdade

function criarAmbiente() {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-ciclo-teste-'))
  const layout = getManagedCliLayout({ userData })
  return { userData, layout, limpar: () => fs.rmSync(userData, { recursive: true, force: true }) }
}

/**
 * Instalador que grava o que o npm gravaria (o `package.json` da versão e os
 * executáveis) e que segue um roteiro: cada chamada consome um comportamento
 * (`'ok'`, `'rede'` ou `'quebrada'`); acabado o roteiro, instala normalmente.
 */
function instaladorFalso(layout, roteiro = []) {
  const chamadas = []
  const cli = getOfficialAiCli(CLI)
  const pacote = getManagedCliManifestEntry(CLI).npmPackage

  return {
    chamadas,
    async installPackage(options) {
      chamadas.push(options.npmPackage)
      const comportamento = roteiro.shift() ?? 'ok'
      if (comportamento === 'rede') {
        return { ok: false, message: `Nao foi possivel instalar ${options.npmPackage}.`, output: SAIDA_DE_REDE }
      }
      if (comportamento === 'quebrada') {
        return { ok: false, message: `Nao foi possivel instalar ${options.npmPackage}.`, output: SAIDA_QUEBRADA }
      }
      const arroba = options.npmPackage.lastIndexOf('@')
      const versao = arroba > 0 ? options.npmPackage.slice(arroba + 1) : '1.0.0'
      const pasta = path.join(layout.root, 'node_modules', ...pacote.split('/'))
      fs.mkdirSync(pasta, { recursive: true })
      fs.writeFileSync(path.join(pasta, 'package.json'), JSON.stringify({ name: pacote, version: versao }))
      fs.mkdirSync(layout.packagesBin, { recursive: true })
      for (const nome of new Set([cli.command, ...(cli.windowsAliases ?? []), `${cli.command}.cmd`])) {
        fs.writeFileSync(path.join(layout.packagesBin, nome), 'binario falso')
      }
      return { ok: true, message: `${options.npmPackage} instalado.`, output: '' }
    },
  }
}

function registryFalso(versao = '9.9.9') {
  const consultas = []
  return {
    consultas,
    async resolveLatestPackage({ npmPackage }) {
      consultas.push(npmPackage)
      const atual = typeof versao === 'function' ? versao(consultas.length) : versao
      return { ok: true, npmPackage, version: atual, integrity: INTEGRIDADE, tag: 'latest', message: 'fixture', output: '' }
    },
  }
}

function detectorFalso(layout) {
  return async (cli) => ({
    detected: hasManagedBinary({ layout, cli, fileSystem: fs }),
    version: '1.0.0',
    path: null,
    reason: null,
    attempts: [],
  })
}

async function rodarCiclo({ roteiro, versao, controlRegression = false } = {}) {
  const ambiente = criarAmbiente()
  const instalador = instaladorFalso(ambiente.layout, roteiro)
  const registry = registryFalso(versao)
  try {
    const ciclo = await runCycle({
      cliId: CLI,
      userData: ambiente.userData,
      controlRegression,
      installPackage: instalador.installPackage,
      resolveLatestPackage: registry.resolveLatestPackage,
      detect: detectorFalso(ambiente.layout),
      networkRetry: { delaysMs: [0, 0], sleep: async () => {} },
    })
    return { ciclo, instalador, registry, userData: ambiente.userData }
  } finally {
    ambiente.limpar()
  }
}

// ---------------------------------------------------------------------------
// Rodadas sintéticas para o julgamento puro

const instalacao = (extra = {}) => ({ pacote: '@google/gemini-cli', ok: true, redeTransitoria: false, duracaoMs: 10, ...extra })
const falha = (extra = {}) => instalacao({ ok: false, saida: 'npm error', ...extra })

function rodada(chave, extra = {}) {
  const spec = RODADAS.find((item) => item.chave === chave)
  return {
    chave,
    titulo: spec.titulo,
    appVersion: spec.appVersion,
    esperado: spec.esperado,
    executada: true,
    estado: 'idle',
    mensagem: 'Todas as CLIs de IA estao prontas.',
    duracaoMs: 1000,
    binarioPresente: true,
    instalacoes: [],
    ...extra,
  }
}

function cicloSintetico(sobras = {}) {
  return {
    cli: CLI,
    alvo: { pacote: '@google/gemini-cli', versao: '0.65.0', origem: 'registry' },
    rodadas: [
      rodada('primeira-abertura', { estado: 'done', instalacoes: [instalacao()], ...sobras.r1 }),
      rodada('segunda-abertura', sobras.r2),
      rodada('upgrade-binario-intacto', sobras.r3),
      rodada('upgrade-binario-apagado', { estado: 'done', instalacoes: [instalacao()], ...sobras.r4 }),
    ].filter((item) => !(item.chave in (sobras.ausentes ?? {}))),
  }
}

// ---------------------------------------------------------------------------

describe('parseArgs', () => {
  it('sem argumentos, instala o gemini do código-fonte e não grava nada', () => {
    assert.deepEqual(parseArgs([]), {
      cli: 'gemini',
      report: null,
      summary: null,
      controlRegression: false,
      packaged: null,
      controlNpm: false,
      help: false,
    })
  })

  it('lê a CLI, os arquivos de saída e o controle', () => {
    const args = parseArgs(['--cli', 'claude', '--report', 'r.json', '--summary', 's.md', '--control-regressao'])

    assert.deepEqual(args, {
      cli: 'claude',
      report: 'r.json',
      summary: 's.md',
      controlRegression: true,
      packaged: null,
      controlNpm: false,
      help: false,
    })
  })

  it('lê o app instalado e o controle do caminho do npm', () => {
    const args = parseArgs(['--packaged', 'C:/Felixo/Felixo AI Core.exe', '--control-npm'])

    assert.equal(args.packaged, 'C:/Felixo/Felixo AI Core.exe')
    assert.equal(args.controlNpm, true)
  })

  it('recusa opção desconhecida e valor ausente, em vez de ignorar em silêncio', () => {
    assert.throws(() => parseArgs(['--clii', 'x']), /opção desconhecida: --clii/)
    assert.throws(() => parseArgs(['--cli']), /--cli precisa de um valor/)
    assert.throws(() => parseArgs(['--report', '--summary', 'x']), /--report precisa de um valor/)
  })
})

describe('evaluateCycle', () => {
  it('as 4 rodadas como esperado: ok, código 0', () => {
    const avaliacao = evaluateCycle(cicloSintetico())

    assert.equal(avaliacao.veredito, VEREDITOS.OK)
    assert.equal(avaliacao.codigoDeSaida, EXIT.OK)
    assert.deepEqual(avaliacao.problemas, [])
  })

  for (const [nome, sobras, rodadaEsperada] of [
    ['a segunda abertura reinstala', { r2: { estado: 'done', instalacoes: [instalacao()] } }, 2],
    ['o upgrade com binário intacto reinstala', { r3: { estado: 'done', instalacoes: [instalacao()] } }, 3],
    ['o upgrade tenta reinstalar mas a instalação falha', { r3: { estado: 'error', instalacoes: [falha()] } }, 3],
  ]) {
    it(`regressão (código 1): ${nome}`, () => {
      const avaliacao = evaluateCycle(cicloSintetico(sobras))

      assert.equal(avaliacao.veredito, VEREDITOS.REGRESSAO)
      assert.equal(avaliacao.codigoDeSaida, EXIT.REGRESSAO)
      assert.equal(avaliacao.problemas[0].rodada, rodadaEsperada)
    })
  }

  it('regressão (código 1): a rodada termina "idle" mas chamou o instalador (reinstalação adiada por arquivo travado)', () => {
    // `summarizeAutoInstall` devolve `idle` quando nada foi instalado nem falhou, e uma reinstalação
    // adiada por EBUSY/EPERM é exatamente isso: o estado esconde que o ciclo quis reinstalar.
    const avaliacao = evaluateCycle(cicloSintetico({ r2: { estado: 'idle', instalacoes: [falha()] } }))

    assert.equal(avaliacao.veredito, VEREDITOS.REGRESSAO)
    assert.match(avaliacao.problemas[0].detalhe, /1 chamada\(s\) ao instalador/)
  })

  it('regressão (código 1): o binário apagado não foi reinstalado', () => {
    const avaliacao = evaluateCycle(cicloSintetico({ r4: { estado: 'idle', instalacoes: [], binarioPresente: false } }))

    assert.equal(avaliacao.veredito, VEREDITOS.REGRESSAO)
    assert.match(avaliacao.problemas[0].detalhe, /não foi reinstalado/)
  })

  it('infra (código 2): a primeira instalação falhou só com assinatura de rede', () => {
    const avaliacao = evaluateCycle(
      cicloSintetico({
        r1: { estado: 'error', binarioPresente: false, instalacoes: [falha({ redeTransitoria: true }), falha({ redeTransitoria: true })] },
      }),
    )

    assert.equal(avaliacao.veredito, VEREDITOS.INFRA)
    assert.equal(avaliacao.codigoDeSaida, EXIT.INFRA)
  })

  it('falha de instalação (código 3): a primeira falhou sem sinal de rede', () => {
    const avaliacao = evaluateCycle(
      cicloSintetico({ r1: { estado: 'error', binarioPresente: false, instalacoes: [falha()] } }),
    )

    assert.equal(avaliacao.veredito, VEREDITOS.FALHA_DE_INSTALACAO)
    assert.equal(avaliacao.codigoDeSaida, EXIT.FALHA_DE_INSTALACAO)
  })

  it('uma falha de rede MISTURADA com uma de outro tipo conta como falha de instalação, não como infra', () => {
    const avaliacao = evaluateCycle(
      cicloSintetico({
        r1: { estado: 'error', binarioPresente: false, instalacoes: [falha({ redeTransitoria: true }), falha()] },
      }),
    )

    assert.equal(avaliacao.veredito, VEREDITOS.FALHA_DE_INSTALACAO)
  })

  it('infra na reinstalação da rodada 4, depois de 3 rodadas corretas', () => {
    const avaliacao = evaluateCycle(
      cicloSintetico({
        r4: { estado: 'error', binarioPresente: false, instalacoes: [falha({ redeTransitoria: true })] },
      }),
    )

    assert.equal(avaliacao.veredito, VEREDITOS.INFRA)
    assert.equal(avaliacao.problemas[0].rodada, 4)
  })

  it('erro do runner (código 4): a primeira abertura "terminou" sem instalar, ambiente não isolado', () => {
    const avaliacao = evaluateCycle(
      cicloSintetico({ r1: { estado: 'idle', instalacoes: [], binarioPresente: false } }),
    )

    assert.equal(avaliacao.veredito, VEREDITOS.ERRO_DO_RUNNER)
    assert.equal(avaliacao.codigoDeSaida, EXIT.ERRO_DO_RUNNER)
    assert.match(avaliacao.problemas[0].detalhe, /ambiente isolado não estava limpo/)
  })

  it('erro do runner: instalação automática desligada na primeira abertura', () => {
    const avaliacao = evaluateCycle(
      cicloSintetico({ r1: { estado: 'disabled', instalacoes: [], binarioPresente: false } }),
    )

    assert.equal(avaliacao.veredito, VEREDITOS.ERRO_DO_RUNNER)
  })

  it('erro do runner: uma rodada termina em erro sem nem chegar ao instalador (não é regressão)', () => {
    const avaliacao = evaluateCycle(cicloSintetico({ r2: { estado: 'error', mensagem: 'O instalador de CLIs nao veio junto', instalacoes: [] } }))

    assert.equal(avaliacao.veredito, VEREDITOS.ERRO_DO_RUNNER)
  })

  it('a regressão vale mais que a infra: se a rodada 2 reinstalou e a 4 caiu na rede, o aviso é de regressão', () => {
    const avaliacao = evaluateCycle(
      cicloSintetico({
        r2: { estado: 'done', instalacoes: [instalacao()] },
        r4: { estado: 'error', binarioPresente: false, instalacoes: [falha({ redeTransitoria: true })] },
      }),
    )

    assert.equal(avaliacao.veredito, VEREDITOS.REGRESSAO)
    assert.equal(avaliacao.problemas.length, 2, 'os dois problemas continuam listados')
  })

  it('sem a primeira rodada não há o que julgar: erro do runner', () => {
    const avaliacao = evaluateCycle({ cli: CLI, alvo: null, rodadas: [] })

    assert.equal(avaliacao.veredito, VEREDITOS.ERRO_DO_RUNNER)
  })
})

describe('createInstallRecorder', () => {
  it('guarda o resultado CRU: sinal de rede, prazo e a saída só da falha', async () => {
    const respostas = [
      { ok: true, message: 'instalado', output: 'added 1 package' },
      { ok: false, message: 'falhou', output: SAIDA_DE_REDE },
      { ok: false, message: 'passou do tempo', output: '', timedOut: true },
    ]
    const gravador = createInstallRecorder(async () => respostas.shift(), () => 0)
    gravador.startRound()
    for (const pacote of ['a', 'b', 'c']) await gravador.installPackage({ npmPackage: pacote })
    const [ok, rede, prazo] = gravador.endRound()

    assert.deepEqual([ok.ok, ok.redeTransitoria, ok.saida], [true, false, undefined])
    assert.deepEqual([rede.ok, rede.redeTransitoria], [false, true])
    assert.match(rede.saida, /ENOTFOUND/)
    assert.equal(prazo.prazoVencido, true)
    assert.equal(prazo.redeTransitoria, false, 'prazo vencido nunca é tratado como rede')
  })

  it('começar uma rodada zera o registro, e um instalador que lança é registrado e relançado', async () => {
    const gravador = createInstallRecorder(async () => {
      throw new Error('boom')
    })
    gravador.startRound()
    await assert.rejects(() => gravador.installPackage({ npmPackage: 'x' }), /boom/)
    assert.equal(gravador.endRound().length, 1)
    assert.match(gravador.endRound()[0].saida, /boom/)

    gravador.startRound()
    assert.equal(gravador.endRound().length, 0)
  })
})

describe('saída do npm no relatório', () => {
  it('uma saída longa guarda o começo (o código do erro) e o fim (o log completo), e diz quanto omitiu', async () => {
    const pilha = 'npm error     at pilha de chamadas\n'.repeat(200)
    const longa = `npm error code E404\n${pilha}npm error FIM-DA-SAIDA`
    const gravador = createInstallRecorder(async () => ({ ok: false, message: 'falhou', output: longa }), () => 0)
    gravador.startRound()
    await gravador.installPackage({ npmPackage: 'a' })
    const [falha] = gravador.endRound()

    assert.ok(falha.saida.startsWith('npm error code E404'))
    assert.ok(falha.saida.endsWith('npm error FIM-DA-SAIDA'))
    assert.match(falha.saida, /\[… \d+ caracteres omitidos …\]/)
    assert.ok(falha.saida.length < 1700)
  })

  it('o que vai para o relatório sai redigido: token de registry e URL com credencial não passam', async () => {
    const segredo = 'npm_SEGREDO_MUITO_SECRETO_123'
    const saida = `//registry.exemplo/:_authToken=${segredo}\nFetchError: https://usuario:${segredo}@registry.exemplo/pkg?token=${segredo}\nnpm error code E401`
    const gravador = createInstallRecorder(async () => ({ ok: false, message: 'falhou', output: saida }), () => 0)
    gravador.startRound()
    await gravador.installPackage({ npmPackage: 'a' })
    const [falha] = gravador.endRound()

    assert.equal(falha.saida.includes(segredo), false, 'o segredo vazou')
    assert.equal(falha.saida.includes('registry.exemplo/pkg'), false, 'a URL vazou')
    assert.match(falha.saida, /npm error code E401/, 'o resto da saída continua legível')
  })

  it('uma saída curta passa inteira, sem marca de corte', async () => {
    const gravador = createInstallRecorder(async () => ({ ok: false, message: 'falhou', output: SAIDA_QUEBRADA }), () => 0)
    gravador.startRound()
    await gravador.installPackage({ npmPackage: 'a' })

    // A redação do diagnóstico troca a URL por [url]: o registry pode ter credencial nela.
    assert.equal(gravador.endRound()[0].saida, 'npm error code E404\nnpm error 404 Not Found - GET [url]')
  })
})

describe('createLatestPinner', () => {
  it('consulta o registry uma vez por pacote e reaproveita a resposta', async () => {
    let consultas = 0
    const fixador = createLatestPinner(async ({ npmPackage }) => ({ ok: true, npmPackage, version: `1.0.${++consultas}` }))

    const primeira = await fixador.resolve({ npmPackage: '@google/gemini-cli' })
    const segunda = await fixador.resolve({ npmPackage: '@google/gemini-cli' })

    assert.equal(primeira.version, '1.0.1')
    assert.equal(segunda.version, '1.0.1')
    assert.equal(consultas, 1)
    assert.deepEqual(fixador.describe(), { pacote: '@google/gemini-cli', versao: '1.0.1', origem: 'registry' })
  })

  it('uma consulta que falhou também fica fixada e é descrita como fallback', async () => {
    const fixador = createLatestPinner(async () => ({ ok: false, message: 'registry fora do ar' }))
    await fixador.resolve({ npmPackage: '@google/gemini-cli' })

    assert.deepEqual(fixador.describe(), { pacote: '@google/gemini-cli', versao: null, origem: 'manifesto-de-fallback' })
  })

  it('sem nenhuma consulta, não descreve alvo', () => {
    assert.equal(createLatestPinner(async () => ({})).describe(), null)
  })
})

describe('runCycle: o ciclo de produção contra um instalador falso que grava arquivos reais', () => {
  it('as 4 rodadas se comportam como esperado: instala, não reinstala, não reinstala, reinstala', async () => {
    const { ciclo, instalador } = await rodarCiclo()
    const avaliacao = evaluateCycle(ciclo)

    assert.equal(avaliacao.veredito, VEREDITOS.OK, JSON.stringify(avaliacao.problemas))
    assert.deepEqual(
      ciclo.rodadas.map((item) => [item.chave, item.estado, item.instalacoes.length, item.binarioPresente]),
      [
        ['primeira-abertura', 'done', 1, true],
        ['segunda-abertura', 'idle', 0, true],
        ['upgrade-binario-intacto', 'idle', 0, true],
        ['upgrade-binario-apagado', 'done', 1, true],
      ],
    )
    assert.equal(instalador.chamadas.length, 2)
    assert.deepEqual(ciclo.alvo, { pacote: '@google/gemini-cli', versao: '9.9.9', origem: 'registry' })
  })

  it('controle de regressão: apagar o binário antes da rodada 2 faz o runner acusar a regressão', async () => {
    const { ciclo } = await rodarCiclo({ controlRegression: true })
    const avaliacao = evaluateCycle(ciclo)

    assert.equal(avaliacao.veredito, VEREDITOS.REGRESSAO)
    assert.equal(avaliacao.codigoDeSaida, EXIT.REGRESSAO)
    assert.equal(avaliacao.problemas[0].rodada, 2)
    assert.equal(ciclo.rodadas[1].instalacoes.length, 1, 'a rodada 2 reinstalou, que é o que o controle provoca')
  })

  it('um `latest` novo publicado no meio do script não vira falso positivo: o alvo fica fixado', async () => {
    // A cada consulta o registry "publica" uma versão nova. Sem fixar o alvo, a rodada 2
    // veria uma atualização disponível, reinstalaria (com razão) e o runner acusaria regressão.
    const { ciclo, registry } = await rodarCiclo({ versao: (consulta) => `1.0.${consulta}` })

    assert.equal(evaluateCycle(ciclo).veredito, VEREDITOS.OK)
    assert.equal(registry.consultas.length, 1, 'o registry foi consultado uma única vez')
    assert.equal(ciclo.alvo.versao, '1.0.1')
  })

  it('rede fora na primeira instalação: o app repete, o runner vê só falhas de rede e para: infra', async () => {
    const { ciclo, instalador } = await rodarCiclo({ roteiro: ['rede', 'rede', 'rede'] })
    const avaliacao = evaluateCycle(ciclo)

    assert.equal(avaliacao.veredito, VEREDITOS.INFRA)
    assert.equal(avaliacao.codigoDeSaida, EXIT.INFRA)
    assert.equal(instalador.chamadas.length, 3, 'a primeira tentativa e as duas repetições de rede do app')
    assert.equal(ciclo.rodadas.length, 1, 'sem a primeira instalação as demais rodadas nem rodam')
  })

  it('uma queda de rede que o app repete e vence não atrapalha o ciclo', async () => {
    const { ciclo, instalador } = await rodarCiclo({ roteiro: ['rede'] })

    assert.equal(evaluateCycle(ciclo).veredito, VEREDITOS.OK)
    assert.equal(instalador.chamadas.length, 3, '1 falha de rede + 1 repetição na rodada 1, mais a reinstalação da rodada 4')
    assert.equal(ciclo.rodadas[0].instalacoes.length, 2)
    assert.equal(ciclo.rodadas[0].instalacoes[0].redeTransitoria, true)
  })

  it('pacote que não instala por motivo que não é rede: falha de instalação, não infra', async () => {
    const { ciclo } = await rodarCiclo({ roteiro: ['quebrada'] })
    const avaliacao = evaluateCycle(ciclo)

    assert.equal(avaliacao.veredito, VEREDITOS.FALHA_DE_INSTALACAO)
    assert.equal(avaliacao.codigoDeSaida, EXIT.FALHA_DE_INSTALACAO)
    assert.equal(ciclo.rodadas[0].instalacoes[0].redeTransitoria, false)
  })

  it('a rede cai só na reinstalação da rodada 4: infra, com as 3 rodadas anteriores corretas', async () => {
    const { ciclo } = await rodarCiclo({ roteiro: ['ok', 'rede', 'rede', 'rede'] })
    const avaliacao = evaluateCycle(ciclo)

    assert.equal(avaliacao.veredito, VEREDITOS.INFRA)
    assert.equal(avaliacao.problemas[0].rodada, 4)
    assert.deepEqual(ciclo.rodadas.slice(0, 3).map((item) => item.estado), ['done', 'idle', 'idle'])
  })

  it('não vaza para o resto do processo: o catálogo volta inteiro e o módulo não fica filtrado no cache', async () => {
    await rodarCiclo()

    // Pelo módulo, no momento da asserção: o `listOfficialAiClis` importado no topo deste arquivo
    // guarda a função original e nunca enxergaria um catálogo que ficou remendado.
    const catalogo = require('../electron/core/official-cli-catalog.cjs')
    assert.deepEqual(
      catalogo.listOfficialAiClis().map((cli) => cli.id),
      ['codex', 'claude', 'gemini', 'openia'],
    )
    const caminho = require.resolve('../electron/services/cli-auto-install.cjs')
    assert.equal(require.cache[caminho], undefined)
  })
})

describe('relatório e resumo', () => {
  async function relatorioDe(opcoes) {
    const { ciclo, userData } = await rodarCiclo(opcoes)
    const avaliacao = evaluateCycle(ciclo)
    return { userData, relatorio: buildReport({ ciclo, avaliacao, controlRegression: Boolean(opcoes?.controlRegression), duracaoTotalMs: 12345 }) }
  }

  it('o relatório traz veredito, código, alvo e as 4 rodadas, sem o caminho da pasta temporária', async () => {
    const { relatorio, userData } = await relatorioDe()

    assert.equal(relatorio.veredito, 'ok')
    assert.equal(relatorio.codigoDeSaida, 0)
    assert.equal(relatorio.rodadas.length, 4)
    assert.ok(relatorio.rodadas.every((item) => item.executada))
    assert.equal(JSON.stringify(relatorio).includes(userData), false)
  })

  it('rodadas que não rodaram aparecem como não executadas, na ordem do ciclo', async () => {
    const { relatorio } = await relatorioDe({ roteiro: ['rede', 'rede', 'rede'] })

    assert.deepEqual(relatorio.rodadas.map((item) => item.executada), [true, false, false, false])
    assert.deepEqual(relatorio.rodadas.map((item) => item.chave), RODADAS.map((item) => item.chave))
  })

  it('o resumo abre pelo veredito, com a frase que separa infra de regressão', async () => {
    const infra = formatSummary((await relatorioDe({ roteiro: ['rede', 'rede', 'rede'] })).relatorio)
    const regressao = formatSummary((await relatorioDe({ controlRegression: true })).relatorio)
    const ok = formatSummary((await relatorioDe()).relatorio)

    assert.match(infra, /^### Ciclo de instalação: gemini/)
    assert.match(infra, /\*\*INFRA \(rede ou registry do npm\).*NÃO é regressão do Felixo/)
    assert.match(regressao, /\*\*REGRESSÃO DO CICLO.*defeito do Felixo, não da rede/)
    assert.match(regressao, /Execução de CONTROLE/)
    assert.match(ok, /\*\*OK: o ciclo se comportou/)
    assert.doesNotMatch(ok, /CONTROLE/)
  })

  it('o resumo lista a tabela das rodadas e a saída do npm só das tentativas que falharam', async () => {
    const resumo = formatSummary((await relatorioDe({ roteiro: ['rede', 'rede', 'rede'] })).relatorio)

    assert.match(resumo, /\| 1 \| instala \| error \| 3 \| ausente \|/)
    assert.match(resumo, /\| 2 \| não reinstala \| não executada \|/)
    assert.match(resumo, /npm error network This is a problem related to network connectivity/)
    // As 3 tentativas falharam do mesmo jeito: um bloco só, com a contagem, não 3 blocos iguais.
    assert.match(resumo, /3 tentativa\(s\) falharam \(todas com assinatura de rede\)\. Saída da última:/)
    assert.equal(resumo.match(/```text/g).length, 1)

    const ok = formatSummary((await relatorioDe()).relatorio)
    assert.doesNotMatch(ok, /Saída do npm/)
  })

  it('o resumo não deixa uma barra vertical da mensagem quebrar a tabela', () => {
    const resumo = formatSummary({
      cli: CLI,
      ambiente: { plataforma: 'win32' },
      controleDeRegressao: false,
      alvo: null,
      explicacao: 'x',
      problemas: [{ tipo: 'regressao', rodada: 2, detalhe: 'a | b' }],
      duracaoTotalMs: 1000,
      rodadas: [{ chave: 'segunda-abertura', esperado: 'nao-reinstala', executada: true, estado: 'a|b', instalacoes: [], binarioPresente: true, duracaoMs: 1000 }],
    })

    assert.match(resumo, /a \\\| b/)
    assert.match(resumo, /\| a\\\|b \|/)
  })
})

describe('isolateEnvironmentForThisProcessOnly', () => {
  it('aponta HOME e APPDATA para a pasta falsa e desliga o que desviaria o ciclo', () => {
    const casa = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-casa-teste-'))
    const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-userdata-teste-'))
    const chaveDoPath = process.platform === 'win32' ? 'Path' : 'PATH'
    const env = {
      HOME: '/real',
      APPDATA: '/real/roaming',
      FELIXO_MANAGED_CLI_ROOT: '/real/clis',
      FELIXO_AUTO_INSTALL_CLIS: '0',
      [chaveDoPath]: ['/usr/bin', path.join('x', 'felixo-ai-core', 'clis'), path.join('y', 'npm')].join(path.delimiter),
    }

    try {
      isolateEnvironmentForThisProcessOnly(casa, userData, env)

      assert.equal(env.HOME, casa)
      assert.equal(env.USERPROFILE, casa)
      assert.equal(env.FELIXO_USER_DATA_DIR, userData)
      assert.ok(env.APPDATA.startsWith(casa) && env.LOCALAPPDATA.startsWith(casa))
      assert.equal('FELIXO_MANAGED_CLI_ROOT' in env, false)
      assert.equal('FELIXO_AUTO_INSTALL_CLIS' in env, false)
      assert.equal(env[chaveDoPath], '/usr/bin', 'saem do PATH a pasta gerenciada real e o npm global')
    } finally {
      fs.rmSync(casa, { recursive: true, force: true })
      fs.rmSync(userData, { recursive: true, force: true })
    }
  })

  // A detecção do app resolve o PRIMEIRO caminho do PATH. Medido em 22/10/2026 nesta máquina: o
  // `codex.cmd` do Openia estava antes da pasta gerenciada, a detecção o escolhia e ele quebrava.
  describe('pasta que já tem o executável da CLI sob teste', () => {
    function montar() {
      const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-path-teste-'))
      const comAtalho = path.join(raiz, 'com-atalho')
      const semAtalho = path.join(raiz, 'sem-atalho')
      fs.mkdirSync(comAtalho)
      fs.mkdirSync(semAtalho)
      fs.writeFileSync(path.join(comAtalho, process.platform === 'win32' ? 'gemini.cmd' : 'gemini'), 'atalho de fora')
      fs.writeFileSync(path.join(semAtalho, 'outra-ferramenta'), 'x')
      const chaveDoPath = process.platform === 'win32' ? 'Path' : 'PATH'
      const env = { [chaveDoPath]: [comAtalho, semAtalho].join(path.delimiter) }
      return { raiz, comAtalho, semAtalho, chaveDoPath, env }
    }

    it('sai do PATH quando a CLI sob teste é o que a pasta tem; a outra pasta continua', () => {
      const { raiz, semAtalho, chaveDoPath, env } = montar()
      const casa = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-casa-teste-'))
      try {
        isolateEnvironmentForThisProcessOnly(casa, casa, env, getOfficialAiCli('gemini'))

        assert.equal(env[chaveDoPath], semAtalho)
      } finally {
        fs.rmSync(raiz, { recursive: true, force: true })
        fs.rmSync(casa, { recursive: true, force: true })
      }
    })

    it('só vale para a CLI sob teste: o atalho de OUTRA CLI não tira a pasta do PATH', () => {
      const { raiz, comAtalho, semAtalho, chaveDoPath, env } = montar()
      const casa = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-casa-teste-'))
      try {
        isolateEnvironmentForThisProcessOnly(casa, casa, env, getOfficialAiCli('claude'))

        assert.equal(env[chaveDoPath], [comAtalho, semAtalho].join(path.delimiter))
      } finally {
        fs.rmSync(raiz, { recursive: true, force: true })
        fs.rmSync(casa, { recursive: true, force: true })
      }
    })

    it('sem CLI informada o PATH só perde o que já perdia (compatível com quem chama sem o quarto argumento)', () => {
      const { raiz, comAtalho, semAtalho, chaveDoPath, env } = montar()
      const casa = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-casa-teste-'))
      try {
        isolateEnvironmentForThisProcessOnly(casa, casa, env)

        assert.equal(env[chaveDoPath], [comAtalho, semAtalho].join(path.delimiter))
      } finally {
        fs.rmSync(raiz, { recursive: true, force: true })
        fs.rmSync(casa, { recursive: true, force: true })
      }
    })
  })
})

describe('main', () => {
  it('--help imprime o uso e sai com 0, sem tocar em nada', async (t) => {
    const log = t.mock.method(console, 'log', () => {})

    assert.equal(await main(['--help']), EXIT.OK)
    assert.match(String(log.mock.calls[0].arguments[0]), /Códigos de saída: 0 ok/)
  })

  it('opção desconhecida e CLI que a instalação automática não cobre saem com 4 e explicam', async (t) => {
    const erro = t.mock.method(console, 'error', () => {})

    assert.equal(await main(['--bogus']), EXIT.ERRO_DO_RUNNER)
    assert.equal(await main(['--cli', 'openia']), EXIT.ERRO_DO_RUNNER)
    assert.equal(await main(['--cli', 'nao-existe']), EXIT.ERRO_DO_RUNNER)
    assert.match(String(erro.mock.calls[0].arguments[0]), /opção desconhecida: --bogus/)
    assert.match(String(erro.mock.calls[1].arguments[0]), /"openia" não é instalada pela instalação automática/)
  })
})

// ---------------------------------------------------------------------------
// O app instalado: o ciclo roda DENTRO do executável do app, e o que ele usa para instalar
// (o npm de resources/npm-runtime e o próprio executável como Node) entra no julgamento.

describe('samePath', () => {
  it('no Windows ignora separador e maiúscula; fora dele a maiúscula conta', () => {
    assert.equal(samePath('C:\\Apps\\Felixo\\npm-cli.js', 'c:/apps/felixo/NPM-CLI.js', 'win32'), true)
    assert.equal(samePath('C:\\Apps\\Felixo\\npm-cli.js', 'C:\\Apps\\Outro\\npm-cli.js', 'win32'), false)
    assert.equal(samePath('/opt/Felixo/npm-cli.js', '/opt/felixo/npm-cli.js', 'linux'), false)
    assert.equal(samePath('/opt/Felixo/./npm-cli.js', '/opt/Felixo/npm-cli.js', 'linux'), true)
  })

  it('caminho vazio nunca é igual a nada, nem a outro vazio', () => {
    assert.equal(samePath('', '', 'win32'), false)
    assert.equal(samePath(undefined, '/x', 'linux'), false)
  })
})

describe('planPackagedLaunch', () => {
  const raiz = path.join(os.tmpdir(), 'Felixo instalado')
  const exe = path.join(raiz, 'Felixo AI Core.exe')
  const existe = (...presentes) => (candidato) => presentes.includes(candidato)

  it('acha o app.asar ao lado do executável e diz qual npm a instalação precisa usar', () => {
    const resources = path.join(raiz, 'resources')
    const plano = planPackagedLaunch(exe, { exists: existe(exe, path.join(resources, 'app.asar')) })

    assert.equal(plano.resourcesPath, resources)
    assert.equal(plano.electronDir, path.join(resources, 'app.asar', 'electron'))
    assert.equal(plano.npmCliPath, path.join(resources, 'npm-runtime', 'npm', 'bin', 'npm-cli.js'))
    assert.equal(plano.nodeExecutable, exe)
  })

  it('cai na pasta app quando o pacote não é um asar (win-unpacked de depuração)', () => {
    const resources = path.join(raiz, 'resources')
    const plano = planPackagedLaunch(exe, { exists: existe(exe, path.join(resources, 'app')) })

    assert.equal(plano.electronDir, path.join(resources, 'app', 'electron'))
  })

  it('no macOS os recursos ficam em Contents/Resources, não ao lado do executável', () => {
    const macExe = path.join(raiz, 'Felixo.app', 'Contents', 'MacOS', 'Felixo AI Core')
    const resources = path.join(raiz, 'Felixo.app', 'Contents', 'Resources')
    const plano = planPackagedLaunch(macExe, { exists: existe(macExe, path.join(resources, 'app.asar')) })

    assert.equal(plano.resourcesPath, resources)
  })

  it('executável inexistente ou sem recursos do app: erro que diz o que faltou, nunca um caminho chutado', () => {
    assert.throws(() => planPackagedLaunch(exe, { exists: existe() }), /executável do app não existe/)
    assert.throws(() => planPackagedLaunch(exe, { exists: existe(exe) }), /não achei app\.asar nem a pasta app/)
  })
})

describe('buildPackagedChildEnv', () => {
  it('liga o modo Node, aponta o código do app e tira o que faria o processo sem janela procurar a tela', () => {
    const base = { PATH: 'x', ELECTRON_NO_ATTACH_CONSOLE: '1', ELECTRON_FORCE_WINDOW_MENU_BAR: '1' }
    const env = buildPackagedChildEnv(base, '/app/resources/app.asar/electron')

    assert.equal(env.ELECTRON_RUN_AS_NODE, '1')
    assert.equal(env.FELIXO_REPRO_ELECTRON_DIR, '/app/resources/app.asar/electron')
    assert.equal(env.PATH, 'x')
    assert.equal('ELECTRON_NO_ATTACH_CONSOLE' in env, false)
    assert.equal('ELECTRON_FORCE_WINDOW_MENU_BAR' in env, false)
    assert.equal('ELECTRON_RUN_AS_NODE' in base, false, 'não altera o ambiente de quem chamou')
  })
})

describe('launchPackaged', () => {
  const raiz = path.join(os.tmpdir(), 'Felixo instalado')
  const exe = path.join(raiz, 'Felixo AI Core.exe')
  const exists = (candidato) => [exe, path.join(raiz, 'resources', 'app.asar')].includes(candidato)

  function espiao(resultado) {
    const chamadas = []
    return {
      chamadas,
      spawnSync(comando, argumentos, opcoes) {
        chamadas.push({ comando, argumentos, opcoes })
        return resultado
      },
    }
  }

  it('reexecuta o runner dentro do executável do app, sem o --packaged, e devolve o código do filho', () => {
    const { chamadas, spawnSync } = espiao({ status: 1 })
    const codigo = launchPackaged(
      ['--cli', 'claude', '--packaged', exe, '--report', 'r.json'],
      { spawnSync, exists, env: { PATH: 'p' }, script: '/repo/app/scripts/cli-auto-install-real-repro.cjs' },
    )

    assert.equal(codigo, 1, 'o veredito do filho é o código do pai (1 = regressão)')
    assert.equal(chamadas[0].comando, exe)
    assert.deepEqual(chamadas[0].argumentos, ['/repo/app/scripts/cli-auto-install-real-repro.cjs', '--cli', 'claude', '--report', 'r.json'])
    assert.equal(chamadas[0].opcoes.env.ELECTRON_RUN_AS_NODE, '1')
    assert.equal(chamadas[0].opcoes.env.FELIXO_REPRO_ELECTRON_DIR, path.join(raiz, 'resources', 'app.asar', 'electron'))
    assert.equal(chamadas[0].opcoes.stdio, 'inherit')
  })

  it('o filho que não termina com código (sinal, falha ao abrir) é erro do runner, não sucesso', () => {
    for (const resultado of [{ status: null, signal: 'SIGKILL' }, { status: null, error: new Error('spawn EACCES') }]) {
      assert.equal(launchPackaged(['--packaged', exe], { spawnSync: espiao(resultado).spawnSync, exists }), EXIT.ERRO_DO_RUNNER)
    }
  })

  it('o executável que não existe é erro do runner e o filho nem chega a abrir', () => {
    const { chamadas, spawnSync } = espiao({ status: 0 })

    assert.equal(launchPackaged(['--packaged', exe], { spawnSync, exists: () => false }), EXIT.ERRO_DO_RUNNER)
    assert.equal(chamadas.length, 0)
  })
})

describe('createInstallRecorder: o runtime que o app usou', () => {
  it('guarda o npm e o Node de cada chamada, também quando o instalador lança', async () => {
    const gravador = createInstallRecorder(async () => ({ ok: true }), () => 0)
    gravador.startRound()
    await gravador.installPackage({ npmPackage: 'a', npmCliPath: '/r/npm-cli.js', nodeExecutable: '/r/app.exe' })

    assert.equal(gravador.endRound()[0].npmCliPath, '/r/npm-cli.js')
    assert.equal(gravador.endRound()[0].nodeExecutable, '/r/app.exe')

    const quebrado = createInstallRecorder(async () => {
      throw new Error('boom')
    })
    quebrado.startRound()
    await assert.rejects(() => quebrado.installPackage({ npmPackage: 'b', npmCliPath: '/r/npm-cli.js', nodeExecutable: '/r/app.exe' }))
    assert.equal(quebrado.endRound()[0].npmCliPath, '/r/npm-cli.js')
  })
})

describe('evaluateCycle: o app instalado usa o npm e o Node que vão no pacote', () => {
  const pasta = path.join(os.tmpdir(), 'Felixo instalado')
  const NPM = path.join(pasta, 'resources', 'npm-runtime', 'npm', 'bin', 'npm-cli.js')
  const NODE = path.join(pasta, 'Felixo AI Core.exe')
  const DO_ASAR = path.join(pasta, 'resources', 'app.asar', 'node_modules', 'npm', 'bin', 'npm-cli.js')
  const usa = (npm = NPM, node = NODE) => instalacao({ npmCliPath: npm, nodeExecutable: node })
  const cicloInstalado = (sobras = {}) => ({
    ...cicloSintetico({ r1: { instalacoes: [usa()] }, r4: { instalacoes: [usa()] }, ...sobras }),
    runtimeEsperado: { npmCliPath: NPM, nodeExecutable: NODE },
  })

  it('tudo no pacote: ok', () => {
    assert.equal(evaluateCycle(cicloInstalado()).veredito, VEREDITOS.OK)
  })

  it('regressão (código 1): o npm veio do node_modules de dentro do asar, e não do npm-runtime', () => {
    const avaliacao = evaluateCycle(cicloInstalado({ r1: { instalacoes: [usa(DO_ASAR)] } }))

    assert.equal(avaliacao.veredito, VEREDITOS.REGRESSAO)
    assert.equal(avaliacao.codigoDeSaida, EXIT.REGRESSAO)
    assert.equal(avaliacao.problemas[0].rodada, 1)
    assert.match(avaliacao.problemas[0].detalhe, /npm-runtime/)
  })

  it('regressão (código 1): o Node usado não é o executável do app instalado', () => {
    const avaliacao = evaluateCycle(cicloInstalado({ r4: { instalacoes: [usa(NPM, path.join(os.tmpdir(), 'node.exe'))] } }))

    assert.equal(avaliacao.veredito, VEREDITOS.REGRESSAO)
    assert.equal(avaliacao.problemas[0].rodada, 4)
    assert.match(avaliacao.problemas[0].detalhe, /Node/)
  })

  it('regressão (código 1): uma instalação que não disse qual npm usou não prova o caminho', () => {
    const avaliacao = evaluateCycle(cicloInstalado({ r1: { instalacoes: [instalacao()] } }))

    assert.equal(avaliacao.veredito, VEREDITOS.REGRESSAO)
    assert.match(avaliacao.problemas[0].detalhe, /não informou/)
  })

  it('o caminho errado vale mais que a infra: a regressão passa na frente do aviso de rede', () => {
    const avaliacao = evaluateCycle(cicloInstalado({
      r1: { instalacoes: [usa(DO_ASAR)] },
      r4: { estado: 'error', instalacoes: [falha({ redeTransitoria: true, npmCliPath: NPM, nodeExecutable: NODE })] },
    }))

    assert.equal(avaliacao.veredito, VEREDITOS.REGRESSAO)
  })

  it('rodando do código-fonte (sem runtime esperado) o caminho não é julgado', () => {
    const ciclo = cicloSintetico({ r1: { instalacoes: [usa('/qualquer/npm-cli.js', '/qualquer/node')] } })

    assert.equal(evaluateCycle(ciclo).veredito, VEREDITOS.OK)
  })
})

describe('relatório do app instalado', () => {
  const empacotado = {
    executavel: 'Felixo AI Core.exe',
    versaoDoApp: '0.1.486',
    npmVersao: '11.21.1',
    npmRelativo: 'resources/npm-runtime/npm/bin/npm-cli.js',
  }
  const montar = (extra = {}) => {
    const ciclo = cicloSintetico()
    return buildReport({ ciclo, avaliacao: evaluateCycle(ciclo), controlRegression: false, duracaoTotalMs: 1000, empacotado, ...extra })
  }

  it('o relatório diz qual app e qual npm foram exercitados, sem caminho absoluto', () => {
    const relatorio = montar()

    assert.deepEqual(relatorio.empacotado, empacotado)
    assert.equal(JSON.stringify(relatorio).includes(os.tmpdir()), false)
  })

  it('o resumo abre dizendo que o ciclo rodou dentro do app instalado, com a versão e o npm do pacote', () => {
    const resumo = formatSummary(montar())

    assert.match(resumo, /App instalado: `Felixo AI Core\.exe` \(0\.1\.486\)/)
    assert.match(resumo, /npm 11\.21\.1 em `resources\/npm-runtime\/npm\/bin\/npm-cli\.js`/)
  })

  it('o controle do caminho do npm aparece como execução de controle esperando a regressão', () => {
    const resumo = formatSummary(montar({ controlNpm: true }))

    assert.match(resumo, /CONTROLE do caminho do npm/)
    assert.match(resumo, /`regressao`/)
  })

  it('sem app instalado o relatório não ganha o campo', () => {
    const ciclo = cicloSintetico()
    const relatorio = buildReport({ ciclo, avaliacao: evaluateCycle(ciclo), controlRegression: false, duracaoTotalMs: 1 })

    assert.equal('empacotado' in relatorio, false)
  })
})

describe('main: o app instalado', () => {
  it('--control-npm sem --packaged é erro do runner: o controle só existe contra o app instalado', async (t) => {
    const erro = t.mock.method(console, 'error', () => {})

    assert.equal(await main(['--control-npm']), EXIT.ERRO_DO_RUNNER)
    assert.match(String(erro.mock.calls[0].arguments[0]), /--control-npm só vale com --packaged/)
  })

  it('--packaged com um executável que não existe sai com 4 e explica', async (t) => {
    const erro = t.mock.method(console, 'error', () => {})

    assert.equal(await main(['--packaged', path.join(os.tmpdir(), 'nao-existe', 'Felixo.exe')]), EXIT.ERRO_DO_RUNNER)
    assert.match(String(erro.mock.calls[0].arguments[0]), /executável do app não existe/)
  })
})

describe('app instalado mais antigo que o runner', () => {
  it('um módulo que falta no pacote sai com 4 (erro do runner), nunca com 1 (regressão)', (t) => {
    const semModulos = fs.mkdtempSync(path.join(os.tmpdir(), 'repro-sem-modulos-'))
    t.after(() => fs.rmSync(semModulos, { recursive: true, force: true }))

    const filho = require('node:child_process').spawnSync(process.execPath, [require.resolve('./cli-auto-install-real-repro.cjs')], {
      env: { ...process.env, FELIXO_REPRO_ELECTRON_DIR: semModulos },
      encoding: 'utf8',
    })

    assert.equal(filho.status, EXIT.ERRO_DO_RUNNER)
    assert.match(filho.stderr, /o app instalado não tem um módulo que o runner usa \(core\/install-retry\.cjs\)/)
  })
})

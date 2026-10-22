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
  isolateEnvironmentForThisProcessOnly,
  main,
  parseArgs,
  runCycle,
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
  it('sem argumentos, instala o gemini e não grava nada', () => {
    assert.deepEqual(parseArgs([]), { cli: 'gemini', report: null, summary: null, controlRegression: false, help: false })
  })

  it('lê a CLI, os arquivos de saída e o controle', () => {
    const args = parseArgs(['--cli', 'claude', '--report', 'r.json', '--summary', 's.md', '--control-regressao'])

    assert.deepEqual(args, { cli: 'claude', report: 'r.json', summary: 's.md', controlRegression: true, help: false })
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
    assert.match(resumo, /\(assinatura de rede\)/)

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

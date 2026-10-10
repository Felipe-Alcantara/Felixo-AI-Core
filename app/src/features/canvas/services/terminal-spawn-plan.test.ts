import { describe, expect, it } from 'vitest'
import type { CanvasNodeData } from '../types'
import type { AgentSessionReference } from './agent-session'
import { createNodeDataReuse, type NodeDataCacheEntry } from './node-data-cache'
import {
  resolveTerminalSpawnPlan,
  terminalSpawnCacheDeps,
  terminalSpawnData,
  type RestoredAgentTerminals,
  type TerminalSpawnContext,
} from './terminal-spawn-plan'

/**
 * Estes testes fixam o comportamento ATUAL da decisão de subida de um bloco de
 * terminal, como ela era dentro do `useMemo` de `renderedNodes` do CanvasView.
 * Os casos marcados como "achado" parecem estranhos, mas é assim que o app
 * funciona hoje; estão registrados no IA.md e não foram corrigidos aqui.
 *
 * ── Tabela 1: o que cada bloco recebe ao subir ─────────────────────────────
 * | Bloco                                           | Texto inicial          | Retoma pelo ID | Faixa |
 * | shell (sem comando), novo ou restaurado         | nenhum                 | não            | não   |
 * | lançador opaco (mesmo com CLI conhecida)        | nenhum                 | não            | não   |
 * | agente novo, lembrete ligado                    | lembrete + canvas      | não            | não   |
 * | agente novo, lembrete desligado, sem texto      | nenhum                 | não            | não   |
 * | agente com texto gravado                        | o gravado + canvas     | não            | não   |
 * | passagem de responsabilidade                    | o pedido + canvas      | não            | não   |
 * | restaurado sem conversa gravada                 | /resume                | não            | não   |
 * | restaurado, conversa compatível                 | nada (undefined)       | sim            | não   |
 * | restaurado, conversa de outra pasta             | nada (undefined)       | não            | sim   |
 * | idem, depois de escolher "conversa nova"        | aviso de conversa nova | não            | não   |
 * | criado nesta execução, com conversa (Reiniciar) | como o restaurado      | idem           | idem  |
 *
 * ── Tabela 2: as três esperas (o cartão só sobe com `initialTextReady`) ────
 * | Espera                  | Quando                                                            |
 * | escolha na faixa (hold) | retomada pendente E o bloco ainda não tem processo nesta execução |
 * | versão da CLI           | versões ainda não chegaram, bloco sem processo, conversa gravada, |
 * |                         | e a CLI retoma de um jeito que depende da versão (Gemini)         |
 * | guias do projeto        | agente novo com pasta, lembrete ligado, sem texto gravado nem     |
 * |                         | passagem, e os guias da pasta ainda não assentaram                |
 *
 * Combinações: a espera pelos guias exige um agente SEM conversa; as outras
 * duas exigem conversa gravada. Das 8 combinações só 5 acontecem:
 * nenhuma · só faixa · faixa + versão · só versão · só guias.
 *
 * ── Tabela 3: cache de dados do bloco ──────────────────────────────────────
 * A chave é `[node.data, ...terminalSpawnCacheDeps(plano), índice, total]`,
 * comparada item a item por identidade. Invalida: versão da CLI que chega,
 * guias que assentam, arquivo ligado que ganha caminho, captura dos
 * restaurados, arestas hidratadas, lembrete que muda. Não invalida: o que não
 * muda nenhum desses valores (guias de outra pasta, versão de outra CLI). O
 * objeto `resumePlan` é novo a cada cálculo e por isso fica fora da chave.
 */

const LEMBRETE = 'LEMBRETE-DE-QUALIDADE'
const ID = 't1'

type Provedor = AgentSessionReference['provider']

const conversa = (provider: Provedor, cwd = '/repo'): AgentSessionReference => ({
  version: 1,
  provider,
  sessionId: 'conversa-0123456789',
  cwd,
  capturedAt: 1,
})

const nenhumRestaurado: RestoredAgentTerminals = { captured: true, ids: new Set(), holdable: new Set() }
/** Veio do disco e ainda não tem processo nesta execução. */
const restauradoSemProcesso: RestoredAgentTerminals = { captured: true, ids: new Set([ID]), holdable: new Set([ID]) }
/** Veio do disco, mas o processo já subiu (ida ao chat, reload da interface). */
const restauradoComProcesso: RestoredAgentTerminals = { captured: true, ids: new Set([ID]), holdable: new Set() }

const guiasAssentados = { projects: {}, settled: { '/repo': true as const, '/outro': true as const } }
const semGuias = { projects: {}, settled: {} }

const contextoBase: TerminalSpawnContext = {
  nodeId: ID,
  qualityStandard: { prompt: LEMBRETE, enabled: true },
  qualityInputs: { stored: null, source: null },
  projectGuides: guiasAssentados,
  connectedFileNames: [],
  canvasFilePaths: [],
  restoredAgentTerminals: nenhumRestaurado,
  edgesHydrated: true,
  agentCliVersions: {},
}

type Dados = Partial<CanvasNodeData>
type Contexto = Partial<TerminalSpawnContext>
/** Os campos do plano; `initialText` só existe em parte dos casos. */
type Campos = ReturnType<typeof terminalSpawnData> & { initialText?: string }

function bloco(dados: Dados): CanvasNodeData {
  return { label: 'Agente', ...dados } as CanvasNodeData
}

function decidir(dados: Dados, contexto: Contexto = {}) {
  const data = bloco(dados)
  const plano = resolveTerminalSpawnPlan(data, { ...contextoBase, ...contexto })
  const campos: Campos = terminalSpawnData(data, plano)
  return { data, plano, campos }
}

describe('Tabela 1: o que cada bloco recebe ao subir', () => {
  const semContexto: Array<[string, Dados, RestoredAgentTerminals]> = [
    ['shell novo', {}, nenhumRestaurado],
    ['shell restaurado', {}, restauradoSemProcesso],
    ['lançador opaco', { command: 'meu-launcher', launchMode: 'launcher', cwd: '/repo' }, nenhumRestaurado],
    ['lançador com CLI de agente conhecida', { command: 'claude', launchMode: 'launcher', cwd: '/repo' }, nenhumRestaurado],
    ['lançador restaurado com CLI conhecida', { command: 'claude', launchMode: 'launcher', cwd: '/repo' }, restauradoSemProcesso],
  ]

  it.each(semContexto)('%s: sem texto, sem retomada, sem faixa, e sobe na hora', (_nome, dados, restaurados) => {
    const { plano, campos } = decidir(dados, { restoredAgentTerminals: restaurados })

    expect(plano.followsResumePlan).toBe(false)
    expect(plano.resumePlan).toBeUndefined()
    expect(campos).not.toHaveProperty('initialText')
    expect(campos).toMatchObject({
      initialTextIsHandoff: false,
      initialTextReady: true,
      resumeAgentSession: false,
      resumeBanner: null,
    })
  })

  it('agente novo recebe o lembrete e o contexto do canvas, digitados e não submetidos', () => {
    const { campos } = decidir({ command: 'claude', cwd: '/repo' })

    expect(campos.initialText).toContain(LEMBRETE)
    expect(campos.initialText).toContain('Contexto do canvas')
    expect(campos.initialText?.endsWith('\r')).toBe(false)
    expect(campos).toMatchObject({
      initialTextIsHandoff: false,
      initialTextReady: true,
      resumeAgentSession: false,
      resumeBanner: null,
    })
  })

  it('com o lembrete desligado e sem texto gravado, o agente novo sobe sem texto nenhum', () => {
    const { campos } = decidir(
      { command: 'claude', cwd: '/repo' },
      { qualityStandard: { prompt: LEMBRETE, enabled: false } },
    )

    expect(campos).not.toHaveProperty('initialText')
    expect(campos.initialTextReady).toBe(true)
  })

  it('texto gravado no bloco é mantido (sem o Enter de versões antigas) e ganha o contexto do canvas', () => {
    const limpo = decidir({ command: 'claude', cwd: '/repo', initialText: 'TEXTO GRAVADO' }).campos.initialText
    const comEnter = decidir({ command: 'claude', cwd: '/repo', initialText: 'TEXTO GRAVADO\r' }).campos.initialText

    expect(limpo?.startsWith('TEXTO GRAVADO')).toBe(true)
    expect(limpo).toContain('Contexto do canvas')
    expect(limpo).not.toContain(LEMBRETE)
    expect(comEnter).toBe(limpo)
  })

  it('passagem de responsabilidade vira o texto inicial e é marcada como tal', () => {
    const { campos } = decidir({ command: 'claude', cwd: '/repo', handoffText: 'PEDIDO DA PASSAGEM\r' })

    expect(campos.initialText?.startsWith('PEDIDO DA PASSAGEM')).toBe(true)
    expect(campos.initialTextIsHandoff).toBe(true)
  })

  it('restaurado sem conversa gravada digita /resume e não mostra faixa', () => {
    const { plano, campos } = decidir(
      { command: 'claude', cwd: '/repo' },
      { restoredAgentTerminals: restauradoSemProcesso },
    )

    expect(plano.resumePlan?.outcome).toBe('picker')
    expect(campos).toMatchObject({
      initialText: '/resume\r',
      initialTextReady: true,
      resumeAgentSession: false,
      resumeBanner: null,
    })
  })

  it('restaurado com conversa compatível retoma pelo ID e não digita nada', () => {
    const { plano, campos } = decidir(
      { command: 'codex', cwd: '/repo', agentSession: conversa('codex') },
      { restoredAgentTerminals: restauradoSemProcesso },
    )

    expect(plano.resumePlan?.outcome).toBe('exact')
    // A chave existe com `undefined`: é o que apaga um texto gravado no bloco.
    expect('initialText' in campos).toBe(true)
    expect(campos.initialText).toBeUndefined()
    expect(campos).toMatchObject({ resumeAgentSession: true, initialTextReady: true, resumeBanner: null })
  })

  it('retomada exata apaga o texto gravado e desmarca a passagem', () => {
    const { campos } = decidir(
      {
        command: 'codex',
        cwd: '/repo',
        agentSession: conversa('codex'),
        initialText: 'TEXTO GRAVADO',
        handoffText: 'PEDIDO\r',
      },
      { restoredAgentTerminals: restauradoSemProcesso },
    )

    expect('initialText' in campos).toBe(true)
    expect(campos.initialText).toBeUndefined()
    expect(campos.initialTextIsHandoff).toBe(false)
  })

  it('conversa de outra pasta: fica pendente, com a faixa das duas saídas, e sem texto', () => {
    const { plano, campos } = decidir(
      { command: 'codex', cwd: '/outro', agentSession: conversa('codex', '/repo') },
      { restoredAgentTerminals: restauradoSemProcesso },
    )

    expect(plano.resumePlan).toMatchObject({ outcome: 'pending', reasons: ['cwd-mismatch'] })
    expect('initialText' in campos).toBe(true)
    expect(campos.initialText).toBeUndefined()
    expect(campos.resumeAgentSession).toBe(false)
    expect(campos.resumeBanner?.actions.map((action) => action.id)).toEqual(['picker', 'new'])
  })

  it('escolher "conversa nova" na faixa libera o bloco com o aviso de conversa nova', () => {
    const { plano, campos } = decidir(
      { command: 'codex', cwd: '/outro', agentSession: conversa('codex', '/repo'), resumeChoice: 'new' },
      { restoredAgentTerminals: restauradoSemProcesso },
    )

    expect(plano.resumePlan?.outcome).toBe('new')
    expect(campos.initialText).toContain('esta é uma conversa nova')
    expect(campos).toMatchObject({ initialTextReady: true, resumeAgentSession: false })
  })

  it('bloco criado nesta execução que já tem conversa segue o mesmo plano (é o Reiniciar)', () => {
    const exato = decidir({ command: 'codex', cwd: '/repo', agentSession: conversa('codex') })
    const pendente = decidir({ command: 'codex', cwd: '/outro', agentSession: conversa('codex', '/repo') })

    expect(exato.plano.followsResumePlan).toBe(true)
    expect(exato.campos.resumeAgentSession).toBe(true)
    expect(pendente.plano.resumePlan?.outcome).toBe('pending')
    // Não é segurado: o processo dele já existe; a faixa vale para o próximo Reiniciar.
    expect(pendente.campos.initialTextReady).toBe(true)
    expect(pendente.campos.resumeBanner).not.toBeNull()
  })
})

describe('Tabela 2: as três esperas', () => {
  const esperas = (dados: Dados, contexto: Contexto = {}) => {
    const { plano, campos } = decidir(dados, contexto)
    return {
      faixa: plano.holdForResumeChoice,
      versao: plano.waitsForCliVersion,
      guias: plano.waitsForProjectGuides,
      pronto: campos.initialTextReady,
    }
  }

  it('nenhuma espera: o bloco sobe', () => {
    expect(esperas({ command: 'claude', cwd: '/repo' })).toEqual({
      faixa: false,
      versao: false,
      guias: false,
      pronto: true,
    })
  })

  it('só a faixa: retomada pendente num bloco ainda sem processo', () => {
    expect(
      esperas(
        { command: 'codex', cwd: '/outro', agentSession: conversa('codex', '/repo') },
        { restoredAgentTerminals: restauradoSemProcesso },
      ),
    ).toEqual({ faixa: true, versao: false, guias: false, pronto: false })
  })

  it('a faixa não segura quando o processo do bloco já subiu nesta execução', () => {
    expect(
      esperas(
        { command: 'codex', cwd: '/outro', agentSession: conversa('codex', '/repo') },
        { restoredAgentTerminals: restauradoComProcesso },
      ),
    ).toEqual({ faixa: false, versao: false, guias: false, pronto: true })
  })

  it('faixa + versão: Gemini restaurado enquanto as versões não chegam, com a faixa escondida', () => {
    const dados: Dados = { command: 'gemini', cwd: '/repo', agentSession: conversa('gemini') }
    const contexto: Contexto = { restoredAgentTerminals: restauradoSemProcesso, agentCliVersions: null }

    expect(esperas(dados, contexto)).toEqual({ faixa: true, versao: true, guias: false, pronto: false })
    expect(decidir(dados, contexto).campos.resumeBanner).toBeNull()
  })

  it('quando as versões chegam, a espera pela versão acaba e a faixa aparece', () => {
    const { plano, campos } = decidir(
      { command: 'gemini', cwd: '/repo', agentSession: conversa('gemini') },
      { restoredAgentTerminals: restauradoSemProcesso, agentCliVersions: {} },
    )

    expect(plano.waitsForCliVersion).toBe(false)
    expect(plano.holdForResumeChoice).toBe(true)
    expect(campos.resumeBanner).not.toBeNull()
  })

  it('só a versão: a escolha já foi feita, mas a versão ainda não chegou', () => {
    expect(
      esperas(
        { command: 'gemini', cwd: '/repo', agentSession: conversa('gemini'), resumeChoice: 'new' },
        { restoredAgentTerminals: restauradoSemProcesso, agentCliVersions: null },
      ),
    ).toEqual({ faixa: false, versao: true, guias: false, pronto: false })
  })

  it('Claude e Codex não esperam a versão: retomam pelo ID em qualquer versão conhecida', () => {
    for (const command of ['claude', 'codex'] as const) {
      expect(
        esperas(
          { command, cwd: '/repo', agentSession: conversa(command) },
          { restoredAgentTerminals: restauradoSemProcesso, agentCliVersions: null },
        ),
      ).toEqual({ faixa: false, versao: false, guias: false, pronto: true })
    }
  })

  it('só os guias: agente novo com pasta cujos guias ainda não assentaram', () => {
    expect(esperas({ command: 'claude', cwd: '/repo' }, { projectGuides: semGuias })).toEqual({
      faixa: false,
      versao: false,
      guias: true,
      pronto: false,
    })
  })

  const naoEsperaGuias: Array<[string, Dados, Contexto]> = [
    ['lembrete desligado', { command: 'claude', cwd: '/repo' }, { qualityStandard: { prompt: LEMBRETE, enabled: false } }],
    ['sem pasta', { command: 'claude' }, {}],
    ['texto já gravado no bloco', { command: 'claude', cwd: '/repo', initialText: 'TEXTO' }, {}],
    ['passagem de responsabilidade', { command: 'claude', cwd: '/repo', handoffText: 'PEDIDO\r' }, {}],
    ['shell', { cwd: '/repo' }, {}],
    ['restaurado (segue o plano de retomada)', { command: 'claude', cwd: '/repo' }, { restoredAgentTerminals: restauradoSemProcesso }],
  ]

  it.each(naoEsperaGuias)('não espera os guias: %s', (_nome, dados, contexto) => {
    expect(esperas(dados, { projectGuides: semGuias, ...contexto }).guias).toBe(false)
  })

  it('a base do "pronto": captura dos restaurados, arestas hidratadas e arquivos ligados com caminho', () => {
    const dados: Dados = { command: 'claude', cwd: '/repo' }

    expect(esperas(dados, { restoredAgentTerminals: { ...nenhumRestaurado, captured: false } }).pronto).toBe(false)
    expect(esperas(dados, { edgesHydrated: false }).pronto).toBe(false)
    expect(esperas(dados, { connectedFileNames: ['a.md'], canvasFilePaths: [] }).pronto).toBe(false)
    expect(esperas(dados, { connectedFileNames: ['a.md'], canvasFilePaths: ['/x/a.md'] }).pronto).toBe(true)
  })

  it('em toda a grade de cenários, a espera pelos guias nunca coincide com as outras duas', () => {
    const vistas = new Set<string>()
    for (const { dados, contexto } of grade()) {
      const { faixa, versao, guias, pronto } = esperas(dados, contexto)
      vistas.add(`${faixa ? 'faixa' : '-'} ${versao ? 'versao' : '-'} ${guias ? 'guias' : '-'}`)
      expect(guias && (faixa || versao)).toBe(false)
      // Qualquer espera segura o bloco.
      if (faixa || versao || guias) expect(pronto).toBe(false)
    }

    expect([...vistas].sort()).toEqual(['- - -', '- - guias', '- versao -', 'faixa - -', 'faixa versao -'])
  })
})

describe('Tabela 3: cache de dados do bloco', () => {
  const chave = (data: CanvasNodeData, contexto: Contexto = {}) => {
    const plano = resolveTerminalSpawnPlan(data, { ...contextoBase, ...contexto })
    return { plano, deps: [data, ...terminalSpawnCacheDeps(plano), 0, 1] }
  }
  /** Reproduz duas renders seguidas sobre o mesmo cache e diz se a segunda reconstruiu. */
  const reconstroi = (data: CanvasNodeData, antes: Contexto, depois: Contexto) => {
    const cache = new Map<string, NodeDataCacheEntry>()
    let construcoes = 0
    for (const contexto of [antes, depois]) {
      const passagem = createNodeDataReuse(cache)
      passagem.reuseData(ID, chave(data, contexto).deps, () => {
        construcoes += 1
        return {}
      })
      passagem.commit()
    }
    return construcoes === 2
  }

  it('a parte do plano na chave são oito valores primitivos, nesta ordem', () => {
    const { plano } = chave(bloco({ command: 'gemini', cwd: '/repo', agentSession: conversa('gemini') }), {
      restoredAgentTerminals: restauradoSemProcesso,
      agentCliVersions: { gemini: '0.9.0' },
    })

    expect(terminalSpawnCacheDeps(plano)).toEqual([
      plano.fallbackInitialText,
      plano.initialTextReady,
      plano.waitsForProjectGuides,
      plano.followsResumePlan,
      plano.holdForResumeChoice,
      plano.cliVersion,
      plano.waitsForCliVersion,
      plano.isDirectOpenia,
    ])
    for (const valor of terminalSpawnCacheDeps(plano)) {
      expect(['string', 'boolean', 'undefined']).toContain(typeof valor)
    }
  })

  it('o objeto do plano é novo a cada cálculo: por isso ele não entra na chave', () => {
    const data = bloco({ command: 'codex', cwd: '/outro', agentSession: conversa('codex', '/repo') })
    const contexto: Contexto = { restoredAgentTerminals: restauradoSemProcesso }
    const primeira = chave(data, contexto)
    const segunda = chave(data, contexto)

    expect(segunda.plano.resumePlan).toEqual(primeira.plano.resumePlan)
    expect(segunda.plano.resumePlan).not.toBe(primeira.plano.resumePlan)
    expect(reconstroi(data, contexto, contexto)).toBe(false)
  })

  const invalida: Array<[string, Dados, Contexto, Contexto]> = [
    [
      'as versões das CLIs chegam',
      { command: 'gemini', cwd: '/repo', agentSession: conversa('gemini') },
      { restoredAgentTerminals: restauradoSemProcesso, agentCliVersions: null },
      { restoredAgentTerminals: restauradoSemProcesso, agentCliVersions: { gemini: '0.9.0' } },
    ],
    ['os guias da pasta assentam', { command: 'claude', cwd: '/repo' }, { projectGuides: semGuias }, {}],
    [
      'o arquivo ligado ganha caminho',
      { command: 'claude', cwd: '/repo' },
      { connectedFileNames: ['a.md'], canvasFilePaths: [] },
      { connectedFileNames: ['a.md'], canvasFilePaths: ['/x/a.md'] },
    ],
    [
      'a captura dos restaurados termina',
      { command: 'claude', cwd: '/repo' },
      { restoredAgentTerminals: { ...nenhumRestaurado, captured: false } },
      {},
    ],
    ['as arestas hidratam', { command: 'claude', cwd: '/repo' }, { edgesHydrated: false }, {}],
    [
      'o lembrete muda de texto',
      { command: 'claude', cwd: '/repo' },
      {},
      { qualityStandard: { prompt: 'OUTRO LEMBRETE', enabled: true } },
    ],
    [
      'o lembrete é desligado',
      { command: 'claude', cwd: '/repo' },
      {},
      { qualityStandard: { prompt: LEMBRETE, enabled: false } },
    ],
    [
      'o bloco passa a ser um restaurado sem processo',
      { command: 'codex', cwd: '/outro', agentSession: conversa('codex', '/repo') },
      { restoredAgentTerminals: restauradoComProcesso },
      { restoredAgentTerminals: restauradoSemProcesso },
    ],
  ]

  it.each(invalida)('reconstrói os dados quando %s', (_nome, dados, antes, depois) => {
    expect(reconstroi(bloco(dados), antes, depois)).toBe(true)
  })

  const reaproveita: Array<[string, Dados, Contexto, Contexto]> = [
    [
      'assentam os guias de OUTRA pasta',
      { command: 'claude', cwd: '/repo' },
      {},
      { projectGuides: { projects: {}, settled: { ...guiasAssentados.settled, '/terceira': true } } },
    ],
    [
      'chega a versão de OUTRA CLI',
      { command: 'claude', cwd: '/repo' },
      { agentCliVersions: {} },
      { agentCliVersions: { gemini: '0.9.0' } },
    ],
    [
      'OUTRO bloco entra nos restaurados',
      { command: 'claude', cwd: '/repo' },
      {},
      { restoredAgentTerminals: { captured: true, ids: new Set(['t2']), holdable: new Set(['t2']) } },
    ],
    ['o lembrete muda de texto para um shell', {}, {}, { qualityStandard: { prompt: 'OUTRO', enabled: true } }],
  ]

  it.each(reaproveita)('reaproveita os dados quando %s', (_nome, dados, antes, depois) => {
    expect(reconstroi(bloco(dados), antes, depois)).toBe(false)
  })

  it('em toda a grade: chave igual implica dados iguais (o cache nunca serve um bloco desatualizado)', () => {
    const porChave = new Map<string, string>()
    for (const { nome, dados, contexto } of grade()) {
      const { plano, campos } = decidir(dados, contexto)
      // `node.data` entra na chave pela identidade; aqui, pelo nome do cenário de dados.
      const id = JSON.stringify([nome, ...terminalSpawnCacheDeps(plano).map((valor) => (valor === undefined ? 'indefinido' : valor))])
      const valor = JSON.stringify({
        ...campos,
        initialText: 'initialText' in campos ? campos.initialText ?? 'indefinido' : 'ausente',
      })
      const anterior = porChave.get(id)
      if (anterior !== undefined) expect(valor).toBe(anterior)
      porChave.set(id, valor)
    }

    expect(porChave.size).toBeGreaterThan(20)
  })
})

describe('Achados: casos estranhos fixados como estão', () => {
  it('achado 1: Gemini com o processo de pé já sai com a faixa montada antes de a versão chegar', () => {
    // A espera pela versão vale só para o bloco ainda sem processo. Com o
    // processo de pé e as versões ainda carregando, o plano é calculado sem
    // versão e a faixa já sai montada.
    const { plano, campos } = decidir(
      { command: 'gemini', cwd: '/repo', agentSession: conversa('gemini') },
      { restoredAgentTerminals: restauradoComProcesso, agentCliVersions: null },
    )

    expect(plano.waitsForCliVersion).toBe(false)
    expect(plano.cliVersion).toBeUndefined()
    expect(campos.resumeBanner).not.toBeNull()
    expect(campos.initialTextReady).toBe(true)
  })

  it('achado 2: lançador opaco com conversa do Gemini espera a versão sem seguir o plano de retomada', () => {
    // `waitsForCliVersion` não olha se o bloco segue o plano: um lançador (que
    // não recebe contexto nem retomada) com conversa gravada e comando gemini
    // fica segurado até as versões chegarem, sem faixa para explicar.
    const { plano, campos } = decidir(
      { command: 'gemini', launchMode: 'launcher', cwd: '/repo', agentSession: conversa('gemini') },
      { restoredAgentTerminals: restauradoSemProcesso, agentCliVersions: null },
    )

    expect(plano.followsResumePlan).toBe(false)
    expect(plano.waitsForCliVersion).toBe(true)
    expect(campos.initialTextReady).toBe(false)
    expect(campos.resumeBanner).toBeNull()
  })

  it('achado 3: bloco "sem processo" que não está entre os restaurados ainda é segurado pela versão', () => {
    // `holdable` deveria ser um subconjunto de `ids`; a decisão não confere.
    const { plano } = decidir(
      { command: 'gemini', cwd: '/repo', agentSession: conversa('gemini') },
      { restoredAgentTerminals: { captured: true, ids: new Set(), holdable: new Set([ID]) }, agentCliVersions: null },
    )

    expect(plano.waitsForCliVersion).toBe(true)
  })
})

/** Grade de cenários: tipos de bloco × estado do canvas, para os invariantes. */
function grade() {
  const blocos: Array<[string, Dados]> = [
    ['shell', {}],
    ['lançador', { command: 'gemini', launchMode: 'launcher', cwd: '/repo', agentSession: conversa('gemini') }],
    ['agente novo', { command: 'claude', cwd: '/repo' }],
    ['agente sem pasta', { command: 'claude' }],
    ['texto gravado', { command: 'claude', cwd: '/repo', initialText: 'TEXTO' }],
    ['passagem', { command: 'claude', cwd: '/repo', handoffText: 'PEDIDO\r' }],
    ['codex exato', { command: 'codex', cwd: '/repo', agentSession: conversa('codex') }],
    ['codex outra pasta', { command: 'codex', cwd: '/outro', agentSession: conversa('codex', '/repo') }],
    [
      'codex outra pasta, conversa nova',
      { command: 'codex', cwd: '/outro', agentSession: conversa('codex', '/repo'), resumeChoice: 'new' },
    ],
    ['gemini', { command: 'gemini', cwd: '/repo', agentSession: conversa('gemini') }],
    ['gemini, conversa nova', { command: 'gemini', cwd: '/repo', agentSession: conversa('gemini'), resumeChoice: 'new' }],
  ]
  const restaurados = [nenhumRestaurado, restauradoSemProcesso, restauradoComProcesso]
  const versoes: Array<TerminalSpawnContext['agentCliVersions']> = [
    null,
    {},
    { gemini: '0.9.0', codex: '1.0.0', claude: '2.0.0' },
  ]
  const guias = [guiasAssentados, semGuias]
  const lembretes = [true, false]

  const cenarios: Array<{ nome: string; dados: Dados; contexto: Contexto }> = []
  for (const [nome, dados] of blocos) {
    for (const restoredAgentTerminals of restaurados) {
      for (const agentCliVersions of versoes) {
        for (const projectGuides of guias) {
          for (const enabled of lembretes) {
            cenarios.push({
              nome,
              dados,
              contexto: {
                restoredAgentTerminals,
                agentCliVersions,
                projectGuides,
                qualityStandard: { prompt: LEMBRETE, enabled },
              },
            })
          }
        }
      }
    }
  }
  return cenarios
}
